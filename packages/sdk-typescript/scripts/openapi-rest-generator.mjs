import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import openapiTS, { astToString } from "openapi-typescript";
import ts from "typescript";
import { parse } from "yaml";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
const RESERVED_HEADERS = new Set(["accept", "authorization", "content-length", "content-type", "cache-control"]);

export async function loadOpenApiDocument(specPathOrUrl) {
  if (specPathOrUrl.startsWith("http://") || specPathOrUrl.startsWith("https://")) {
    console.log(`Fetching spec from ${specPathOrUrl}`);
    const response = await fetch(specPathOrUrl);
    if (!response.ok) throw new Error(`Failed to fetch spec: ${response.status}`);
    return parse(await response.text());
  }
  return parse(await readFile(specPathOrUrl, "utf8"));
}

function createResolver(document) {
  function resolveRef(ref) {
    if (!ref.startsWith("#/")) throw new Error(`Only local references are supported: ${ref}`);
    const resolved = ref
      .slice(2)
      .split("/")
      .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
      .reduce((current, part) => current?.[part], document);
    if (resolved === undefined) throw new Error(`Reference not found: ${ref}`);
    return resolved;
  }

  return {
    resolveRef,
    dereference(candidate) {
      return candidate?.$ref ? resolveRef(candidate.$ref) : candidate;
    },
  };
}

function operationAccess(security) {
  if (!security || security.length === 0) return "public";
  return security.some((requirement) => Object.keys(requirement).length === 0)
    ? "public"
    : "authenticated";
}

function parameterShape(schema, dereference, activeRefs = new Set()) {
  if (!schema) return undefined;
  if (schema.$ref) {
    if (activeRefs.has(schema.$ref)) return undefined;
    return parameterShape(
      dereference(schema),
      dereference,
      new Set(activeRefs).add(schema.$ref),
    );
  }
  if (["boolean", "integer", "number", "string"].includes(schema.type)) return "scalar";
  if (schema.type === "array") {
    return parameterShape(schema.items, dereference, activeRefs) === "scalar" ? "array" : undefined;
  }
  if (schema.type === "object") {
    const properties = Object.values(schema.properties ?? {});
    const additionalProperties = schema.additionalProperties;
    const hasScalarProperties = properties.length > 0 && properties.every((property) =>
      parameterShape(property, dereference, activeRefs) === "scalar");
    const hasScalarAdditionalProperties = additionalProperties && additionalProperties !== true &&
      parameterShape(additionalProperties, dereference, activeRefs) === "scalar";
    return hasScalarProperties || hasScalarAdditionalProperties ? "object" : undefined;
  }
  const branches = [...(schema.oneOf ?? []), ...(schema.anyOf ?? []), ...(schema.allOf ?? [])];
  const shapes = branches.map((branch) => parameterShape(branch, dereference, activeRefs));
  return shapes.length > 0 && shapes.every((shape) => shape === shapes[0]) ? shapes[0] : undefined;
}

function operationParameters(pathItem, operation, dereference) {
  const parameters = new Map();
  for (const candidate of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
    const parameter = dereference(candidate);
    if (parameter.in !== "path" && parameter.in !== "query") continue;
    if (parameter.content) {
      throw new Error(`${parameter.in} parameter ${parameter.name} uses unsupported content serialization`);
    }
    const style = parameter.style ?? (parameter.in === "query" ? "form" : "simple");
    const explode = parameter.explode ?? style === "form";
    const shape = parameterShape(parameter.schema, dereference);
    const allowedShapes = parameter.in === "path"
      ? style === "simple" && !explode ? ["scalar"] : []
      : style === "form" ? ["scalar", "array", "object"]
        : (style === "spaceDelimited" || style === "pipeDelimited") && !explode ? ["array"]
          : style === "deepObject" && explode ? ["object"] : [];
    if (allowedShapes.length === 0) {
      throw new Error(`${parameter.in} parameter ${parameter.name} uses unsupported style ${style} with explode=${explode}`);
    }
    if (!allowedShapes.includes(shape)) {
      throw new Error(`${parameter.in} parameter ${parameter.name} has an unsupported schema for ${style} serialization`);
    }
    const metadata = {
      name: parameter.name,
      in: parameter.in,
      required: parameter.in === "path" ? true : Boolean(parameter.required),
      style,
      explode,
    };
    if (parameter.in === "query") {
      metadata.shape = shape;
      metadata.allowReserved = Boolean(parameter.allowReserved);
    }
    parameters.set(`${parameter.in}:${parameter.name}`, metadata);
  }
  return [...parameters.values()];
}

function operationHeaders(pathItem, operation, dereference) {
  const headers = new Map();
  for (const candidate of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
    const parameter = dereference(candidate);
    if (parameter.in !== "header") continue;
    const normalized = parameter.name.toLowerCase();
    if (normalized.startsWith("x-gemini-") || RESERVED_HEADERS.has(normalized)) continue;
    headers.set(normalized, {
      name: parameter.name,
      in: "header",
      required: Boolean(parameter.required),
      explode: false,
    });
  }
  return [...headers.values()];
}

function int64Paths(schema, resolveRef, initialPath = [], isRequest = false) {
  const paths = new Map();

  function isStringSchema(candidate, activeRefs) {
    if (!candidate) return false;
    if (candidate.$ref) {
      if (activeRefs.has(candidate.$ref)) return false;
      return isStringSchema(resolveRef(candidate.$ref), new Set(activeRefs).add(candidate.$ref));
    }
    return candidate.type === "string";
  }

  function walk(candidate, path, activeRefs, allowString = false) {
    if (!candidate) return;
    if (candidate.$ref) {
      if (activeRefs.has(candidate.$ref)) return;
      const nextRefs = new Set(activeRefs).add(candidate.$ref);
      walk(resolveRef(candidate.$ref), path, nextRefs, allowString);
      return;
    }
    if (candidate.type === "integer" && candidate.format === "int64" && (isRequest || !allowString)) {
      const key = JSON.stringify(path);
      const current = paths.get(key) ?? { path, allowString: false, unsigned: false };
      current.allowString ||= allowString;
      current.unsigned ||= isRequest && candidate["x-unsigned-int64"] === true;
      paths.set(key, current);
    }
    if (candidate.type === "array") walk(candidate.items, [...path, "*"], activeRefs, allowString);
    for (const [name, property] of Object.entries(candidate.properties ?? {})) {
      walk(property, [...path, name], activeRefs, allowString);
    }
    const branches = [
      ...(candidate.oneOf ?? []),
      ...(candidate.anyOf ?? []),
      ...(candidate.allOf ?? []),
    ];
    const branchAllowsString = branches.some((branch) => isStringSchema(branch, activeRefs));
    for (const branch of branches) {
      walk(branch, path, activeRefs, allowString || branchAllowsString);
    }
  }

  walk(schema, initialPath, new Set());
  return [...paths.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([, descriptor]) => isRequest
      ? {
        path: descriptor.path,
        ...(descriptor.allowString ? { allowString: true } : {}),
        ...(descriptor.unsigned ? { unsigned: true } : {}),
      }
      : descriptor.path);
}

function requestInt64Paths(pathItem, operation, resolveRef) {
  const paths = { body: [], path: [], query: [] };
  const bodySchema = operation.requestBody?.content?.["application/json"]?.schema;
  if (bodySchema) paths.body = int64Paths(bodySchema, resolveRef, [], true);
  for (const candidate of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
    const parameter = candidate.$ref ? resolveRef(candidate.$ref) : candidate;
    if (parameter.in !== "path" && parameter.in !== "query") continue;
    paths[parameter.in].push(...int64Paths(parameter.schema, resolveRef, [parameter.name], true));
  }
  for (const location of ["body", "path", "query"]) {
    paths[location].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  return paths;
}

function successResponses(operation, dereference) {
  return Object.entries(operation.responses ?? {}).flatMap(([status, response]) => {
    if (!/^2\d\d$/.test(status)) return [];
    const resolved = dereference(response);
    return [{
      status: Number(status),
      content: Object.fromEntries(Object.entries(resolved.content ?? {}).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0)),
    }];
  });
}

function successResponse(operation, operationId, dereference, responseMode = "json") {
  const responses = successResponses(operation, dereference);
  if (responseMode === "json") {
    if (responses.length === 0) {
      throw new Error(`${operationId} must have exactly one 2xx application/json response`);
    }
    const jsonResponses = responses.map((response) => {
      const contentTypes = Object.keys(response.content);
      const json = response.content["application/json"];
      if (contentTypes.length !== 1 || !json) {
        throw new Error(`${operationId} must have only application/json 2xx responses`);
      }
      if (!json.schema) {
        throw new Error(`${operationId} 2xx application/json response must define a schema`);
      }
      return { ...response, schema: json.schema };
    });
    const [response, ...alternatives] = jsonResponses;
    if (!alternatives.every(({ schema }) => JSON.stringify(schema) === JSON.stringify(response.schema))) {
      throw new Error(`${operationId} 2xx application/json responses must use the same schema`);
    }
    return { statuses: responses.map(({ status }) => status), contentTypes: ["application/json"], schema: response.schema };
  }
  if (responses.length === 0) {
    throw new Error(`${operationId} must have at least one 2xx file response`);
  }
  const fileContentTypes = new Set();
  for (const response of responses) {
    const contentTypes = Object.keys(response.content);
    const responseFileTypes = contentTypes.filter((contentType) => contentType !== "application/json");
    if (responseFileTypes.length === 0 || responseFileTypes.length !== contentTypes.length) {
      throw new Error(`${operationId} must have only file 2xx responses`);
    }
    for (const contentType of responseFileTypes) fileContentTypes.add(contentType);
  }
  return { statuses: responses.map(({ status }) => status), contentTypes: [...fileContentTypes], schema: undefined };
}

function inferResponseMode(operation, dereference) {
  const responses = successResponses(operation, dereference);
  if (responses.length > 0 && responses.every((response) => {
    const contentTypes = Object.keys(response.content);
    return contentTypes.length === 1 && contentTypes[0] === "application/json";
  })) return "json";
  if (responses.length > 0 && responses.every((response) => {
    const contentTypes = Object.keys(response.content);
    return contentTypes.length > 0 && contentTypes.every((contentType) => contentType !== "application/json");
  })) return "file";
  return undefined;
}

function responseModeFor(operation, operationId, dereference, options) {
  if (options.operationResponseModes?.[operationId] &&
    options.operationResponseModes[operationId] !== "json" &&
    options.operationResponseModes[operationId] !== "file") {
    throw new Error(`${operationId} responseMode must be json or file`);
  }
  const responseMode = options.operationResponseModes?.[operationId] ?? inferResponseMode(operation, dereference);
  if (responseMode !== "json" && responseMode !== "file") {
    throw new Error(`${operationId} response contract is unsupported or ambiguous`);
  }
  return responseMode;
}

function assertJsonSchema(response, operationId) {
  if (!response.schema) {
    throw new Error(`${operationId} 2xx application/json response must define a schema`);
  }
}

function shouldInclude(operation, operationId, options) {
  if (options.excludeOperationIds?.includes(operationId)) return false;
  const byId = options.includeOperationIds?.includes(operationId) ?? false;
  const byTag = operation.tags?.some((tag) => options.includeTags?.includes(tag)) ?? false;
  return options.includeOperationIds || options.includeTags ? byId || byTag : true;
}

export function discoverOperationInventory(document, { spec }) {
  const { dereference } = createResolver(document);
  const seen = new Set();
  const operations = [];
  for (const [path, rawPathItem] of Object.entries(document.paths ?? {})) {
    const pathItem = dereference(rawPathItem);
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] && dereference(pathItem[method]);
      if (!operation) continue;
      const operationId = operation.operationId;
      if (!operationId) throw new Error(`${method.toUpperCase()} ${path} is missing operationId`);
      if (seen.has(operationId)) throw new Error(`Repeated operationId: ${operationId}`);
      seen.add(operationId);
      operations.push({
        spec,
        operationId,
        method,
        path,
        tags: operation.tags ?? [],
        successResponses: Object.entries(operation.responses ?? {}).flatMap(([status, response]) => {
          if (!/^2\d\d$/.test(status)) return [];
          return [{ status: Number(status), contentTypes: Object.keys(dereference(response).content ?? {}).sort() }];
        }),
      });
    }
  }
  return operations.sort((left, right) =>
    left.operationId < right.operationId ? -1 : left.operationId > right.operationId ? 1 : 0);
}

export function discoverOperations(document, options = {}) {
  const { resolveRef, dereference } = createResolver(document);
  const requestedTags = new Set(options.includeTags ?? []);
  const matchedTags = new Set();
  const seen = new Set();
  const found = new Set();
  const operations = [];
  for (const [path, rawPathItem] of Object.entries(document.paths ?? {})) {
    const pathItem = dereference(rawPathItem);
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] && dereference(pathItem[method]);
      if (!operation) continue;
      const operationId = operation.operationId;
      if (!operationId) throw new Error(`${method.toUpperCase()} ${path} is missing operationId`);
      if (seen.has(operationId)) throw new Error(`Repeated operationId: ${operationId}`);
      seen.add(operationId);
      for (const tag of operation.tags ?? []) {
        if (requestedTags.has(tag)) matchedTags.add(tag);
      }
      if (!shouldInclude(operation, operationId, options)) continue;
      found.add(operationId);
      const responseMode = responseModeFor(operation, operationId, dereference, options);
      const response = successResponse(operation, operationId, dereference, responseMode);
      if (responseMode === "json") assertJsonSchema(response, operationId);
      operations.push({
        operationId,
        metadata: {
          responseMode,
          ...(options.operationNamespace ? { operation: `${options.operationNamespace}.${operationId}` } : {}),
          method,
          path,
          access: operationAccess(operation.security ?? document.security),
          parameters: operationParameters(pathItem, operation, dereference),
          headers: operationHeaders(pathItem, operation, dereference),
          requestBody: Boolean(operation.requestBody),
          requestBodyRequired: Boolean(operation.requestBody?.required),
          successStatuses: response.statuses,
          responseContentTypes: response.contentTypes,
          responseInt64Paths: responseMode === "json" ? int64Paths(response.schema, resolveRef) : [],
          requestInt64Paths: requestInt64Paths(pathItem, operation, resolveRef),
          // GET is the generated SDK's explicit safe-read policy; every mutation is false.
          retryable: method === "get",
        },
      });
    }
  }
  for (const tag of requestedTags) {
    if (!matchedTags.has(tag)) throw new Error(`REST tag not found: ${tag}`);
  }
  for (const operationId of options.includeOperationIds ?? []) {
    if (!found.has(operationId) && !options.excludeOperationIds?.includes(operationId)) {
      throw new Error(`REST operation not found: ${operationId}`);
    }
  }
  return operations.sort((left, right) =>
    left.operationId < right.operationId ? -1 : left.operationId > right.operationId ? 1 : 0);
}

export function renderOperations(operations, options) {
  const registry = operations
    .map(({ operationId, metadata }) => `  ${JSON.stringify(operationId)}: ${JSON.stringify(metadata)},`)
    .join("\n");
  const usesCallerJsonBody = operations.some(({ metadata }) =>
    metadata.access === "authenticated" && metadata.requestBody);
  const headersType = (operationId, metadata) => {
    if (metadata.headers.length === 0) return "never";
    const names = metadata.headers.map((header) => JSON.stringify(header.name)).join(" | ");
    return `Pick<NonNullable<ParameterAt<OpenApiOperations[${JSON.stringify(operationId)}], "header">>, ${names}>`;
  };
  const inputType = (type) => `Int64Input<${type}>`;
  const bodyType = (operationId, metadata) => {
    if (!metadata.requestBody) return "never";
    const jsonBody = inputType(`JsonBody<OpenApiOperations[${JSON.stringify(operationId)}], ${metadata.requestBodyRequired}>`);
    return metadata.access === "authenticated" ? `CallerJsonBody<${jsonBody}>` : jsonBody;
  };
  const typeMap = operations
    .map(({ operationId, metadata }) => `  ${JSON.stringify(operationId)}: {\n` +
      `    path: ${inputType(`ParameterAt<OpenApiOperations[${JSON.stringify(operationId)}], "path">`)};\n` +
      `    query: ${inputType(`ParameterAt<OpenApiOperations[${JSON.stringify(operationId)}], "query">`)};\n` +
      `    headers: ${headersType(operationId, metadata)};\n` +
      `    body: ${bodyType(operationId, metadata)};\n` +
      `    response: ${metadata.responseMode === "file"
        ? "RestFileResponse"
        : `JsonResponse<OpenApiOperations[${JSON.stringify(operationId)}], ${metadata.successStatuses.join(" | ")}>`};\n` +
      "  };")
    .join("\n");
  const fileImport = operations.some(({ metadata }) => metadata.responseMode === "file")
    ? `import type { RestFileResponse } from ${JSON.stringify(options.fileResponseImportPath ?? "../core/http.js")};\n`
    : "";
  const callerJsonBodyTypes = usesCallerJsonBody
    ? `type StripTransportFields<T> = T extends object ? Omit<T, "request" | "nonce"> : T;\n\n` +
      `type CallerJsonBody<T> = StripTransportFields<T>;\n\n`
    : "";

  return `${options.banner}${fileImport}import type { operations as OpenApiOperations } from ${JSON.stringify(options.modelsImportPath ?? "./models.js")};\n\n` +
    `type ParameterAt<O, Location extends PropertyKey> =\n` +
    `  O extends { parameters: infer P }\n` +
    `    ? Location extends keyof P ? P[Location] : never\n` +
    `    : never;\n\n` +
    `type Int64Input<T> =\n` +
    `  T extends bigint ? bigint | number :\n` +
    `  T extends readonly (infer Item)[] ? Int64Input<Item>[] :\n` +
    `  T extends object ? { [K in keyof T]: Int64Input<T[K]> } : T;\n\n` +
    `type JsonBody<O, Required extends boolean> =\n` +
    `  NonNullable<O extends { requestBody?: infer B } ? B : never> extends\n` +
    `  { content: { "application/json": infer Body } }\n` +
    `    ? Required extends true ? Body : Body | undefined\n` +
    `    : never;\n\n` +
    callerJsonBodyTypes +
    `type JsonResponse<O, Status extends PropertyKey> =\n` +
    `  O extends { responses: infer R }\n` +
    `    ? Status extends keyof R\n` +
    `      ? R[Status] extends { content: { "application/json": infer Body } } ? Body : never\n` +
    `      : never\n` +
    `    : never;\n\n` +
    `export const ${options.operationsConstName} = {\n${registry}\n} as const;\n\n` +
    `export type ${options.operationIdTypeName} = keyof typeof ${options.operationsConstName};\n\n` +
    `export type ${options.operationTypesName} = {\n${typeMap}\n};\n`;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

function inputBuckets(metadata, operationTypesName, operationId) {
  const pathParameters = metadata.parameters.filter((parameter) => parameter.in === "path");
  const queryParameters = metadata.parameters.filter((parameter) => parameter.in === "query");
  const queryRequired = queryParameters.some((parameter) => parameter.required);
  const headersRequired = metadata.headers.some((header) => header.required);
  return [
    pathParameters.length > 0 && {
      name: "path",
      required: true,
      type: `${operationTypesName}[${JSON.stringify(operationId)}]["path"]`,
    },
    queryParameters.length > 0 && {
      name: "query",
      required: queryRequired,
      type: `${operationTypesName}[${JSON.stringify(operationId)}]["query"]`,
    },
    metadata.headers.length > 0 && {
      name: "headers",
      required: headersRequired,
      type: `${operationTypesName}[${JSON.stringify(operationId)}]["headers"]`,
    },
    metadata.requestBody && {
      name: "body",
      required: metadata.requestBodyRequired,
      type: `${operationTypesName}[${JSON.stringify(operationId)}]["body"]`,
    },
  ].filter(Boolean);
}

function usesPositionalBuckets(buckets) {
  if (buckets.length <= 1) return true;
  const bucketNames = buckets.map((bucket) => bucket.name).sort().join(",");
  return bucketNames === "headers,path" ||
    bucketNames === "headers,query" ||
    bucketNames === "path,query";
}

function renderMethodInput(buckets, positional) {
  if (buckets.length === 0) return "";
  if (positional) {
    return buckets
      .map((bucket) => `${bucket.name}${bucket.required ? "" : "?"}: ${bucket.type}`)
      .join(", ");
  }
  const optional = buckets.every((bucket) => !bucket.required);
  const fields = buckets
    .map((bucket) => `    ${bucket.name}${bucket.required ? "" : "?"}: ${bucket.type};`)
    .join("\n");
  return `input${optional ? "?" : ""}: {\n${fields}\n  }`;
}

function renderOperationInput(buckets, positional) {
  if (buckets.length === 0) return "";
  const optionalInput = !positional && buckets.every((bucket) => !bucket.required);
  const lines = buckets.map((bucket) => {
    if (positional) return `${bucket.name},`;
    return `${bucket.name}: input${optionalInput ? "?." : "."}${bucket.name},`;
  });
  return `, {\n      ${lines.join("\n      ")}\n    }`;
}

export function renderRestClient(operations, options) {
  const deadlineImportPath = options.deadlineImportPath ?? "../core/deadline.js";
  const seen = new Set();
  const methods = operations.map(({ operationId, methodName = operationId, metadata }) => {
    if (!IDENTIFIER.test(methodName)) throw new Error(`Invalid methodName in ${options.className}: ${methodName}`);
    if (seen.has(methodName)) throw new Error(`Duplicate methodName in ${options.className}: ${methodName}`);
    seen.add(methodName);
    const buckets = inputBuckets(metadata, options.operationTypesName, operationId);
    const positional = usesPositionalBuckets(buckets);
    const methodInput = renderMethodInput(buckets, positional);
    const operationInput = renderOperationInput(buckets, positional);
    const operationCall = operationInput ? `${operationInput}, requestOptions` : `, {}, requestOptions`;
    const returnType = `Promise<${options.operationTypesName}[${JSON.stringify(operationId)}]["response"]>`;
    const withOptions = `${methodName}(${methodInput}${methodInput ? ", " : ""}requestOptions?: RequestOptions)`;
    const original = `${methodName}(${methodInput})`;
    return `  ${withOptions}: ${returnType};\n` +
      `  ${original}: ${returnType};\n` +
      `  ${withOptions}: ${returnType} {\n` +
      `    const operation = ${options.operationsConstName}[${JSON.stringify(operationId)}];\n` +
      `    return executeRestOperation<${options.operationTypesName}[${JSON.stringify(operationId)}]>(this.transport, operation${operationCall});\n` +
      `  }`;
  }).join("\n\n");

  return `${options.banner}import type { HttpTransport } from ${JSON.stringify(options.transportImportPath)};\n` +
    `import type { RequestOptions } from ${JSON.stringify(deadlineImportPath)};\n` +
    `import { executeRestOperation } from ${JSON.stringify(options.executorImportPath)};\n\n` +
    `import {\n` +
    `  ${options.operationsConstName},\n` +
    `  type ${options.operationTypesName},\n` +
    `} from ${JSON.stringify(options.operationsImportPath)};\n\n` +
    `export class ${options.className} {\n` +
    `  constructor(private readonly transport: HttpTransport) {}\n\n` +
    `${methods}\n` +
    `}\n`;
}

export async function renderModels(document, banner) {
  const BIGINT = ts.factory.createKeywordTypeNode(ts.SyntaxKind.BigIntKeyword);
  const NULL = ts.factory.createLiteralTypeNode(ts.factory.createNull());
  const ast = await openapiTS(document, {
    silent: true,
    transform(schema) {
      if (schema.type === "integer" && schema.format === "int64") {
        return schema.nullable ? ts.factory.createUnionTypeNode([BIGINT, NULL]) : BIGINT;
      }
    },
  });
  return `${banner}${astToString(ast).trimEnd()}\n`;
}

export async function generateOpenApiRestTypes(options) {
  const specPath = options.specPath.startsWith("http://") || options.specPath.startsWith("https://")
    ? options.specPath
    : resolve(options.specPath);
  const outputDir = resolve(options.outputDir);
  const document = await loadOpenApiDocument(specPath);
  const operations = discoverOperations(document, options);
  await mkdir(outputDir, { recursive: true });
  const writes = [
    writeFile(resolve(outputDir, "operations.ts"), renderOperations(operations, options)),
  ];
  if (options.writeModels !== false) {
    writes.push(writeFile(resolve(outputDir, "models.ts"), await renderModels(document, options.banner)));
  }
  await Promise.all(writes);
  return { document, operations };
}
