import type { HttpMethod, HttpTransport, RestQueryParameter, RestResponseMode } from "./http.js";
import type { RequestOptions } from "./deadline.js";
import { SdkError } from "../errors.js";
import { validateInt64RequestPaths, type Int64Path, type RequestInt64Path } from "../json.js";
import { validateRequestBody } from "./request-validation.js";

type OperationCallTypes = {
  path: unknown;
  query: unknown;
  headers?: unknown;
  body: unknown;
  response: unknown;
};

type RestOperation = {
  operation?: string;
  method: string;
  path: string;
  access: string;
  parameters: readonly RestQueryParameter[];
  headers?: readonly { name: string; required: boolean }[];
  requestBody: boolean;
  requestBodyRequired: boolean;
  successStatuses: readonly number[];
  responseMode: RestResponseMode;
  responseContentTypes: readonly string[];
  responseInt64Paths: readonly Int64Path[];
  requestInt64Paths?: {
    body: readonly RequestInt64Path[];
    path: readonly RequestInt64Path[];
    query: readonly RequestInt64Path[];
  };
  retryable?: boolean;
};

const PCHAR_ESCAPE = /%(?:21|24|26|27|28|29|2A|2B|2C|3A|3B|3D|40)/gi;

function encodePathSegment(value: unknown): string {
  return encodeURIComponent(String(value)).replace(PCHAR_ESCAPE, decodeURIComponent);
}

function renderPath(operation: RestOperation, pathInput: unknown): string {
  let path = operation.path;
  const pathValues = (pathInput ?? {}) as Record<string, unknown>;
  for (const parameter of operation.parameters) {
    if (parameter.in !== "path") continue;
    if (parameter.style !== "simple" || parameter.explode) {
      throw new SdkError(`unsupported path parameter serialization for ${parameter.name} in ${operation.path}`);
    }
    const parameterValue = pathValues[parameter.name];
    if (parameterValue === undefined) {
      throw new SdkError(`missing path parameter ${parameter.name} for ${operation.path}`);
    }
    if (parameterValue !== null && typeof parameterValue === "object") {
      throw new SdkError(`path parameter ${parameter.name} must be a scalar for ${operation.path}`);
    }
    path = path.replaceAll(`{${parameter.name}}`, encodePathSegment(parameterValue));
  }
  if (/{[^}]+}/.test(path)) {
    throw new SdkError(`unresolved path parameter in ${operation.path}`);
  }
  return path;
}

function isScalar(value: unknown): boolean {
  return value === undefined || (value !== null && typeof value !== "object");
}

function validateQueryValue(parameter: RestQueryParameter, value: unknown, path: string): void {
  if (value === null) {
    throw new SdkError(`query parameter ${parameter.name} cannot be null for ${path}`);
  }
  if (!parameter.shape) {
    throw new SdkError(`query parameter ${parameter.name} is missing generated shape metadata for ${path}`);
  }
  if (parameter.style === "form") {
    const valid = parameter.shape === "scalar"
      ? isScalar(value)
      : parameter.shape === "array"
        ? Array.isArray(value) && value.every((item) => isScalar(item))
        : value !== null && typeof value === "object" && !Array.isArray(value) &&
          Object.values(value).every((item) => isScalar(item));
    if (!valid) throw new SdkError(`query parameter ${parameter.name} must match its generated ${parameter.shape} shape for ${path}`);
    return;
  }
  if (parameter.style === "spaceDelimited" || parameter.style === "pipeDelimited") {
    if (parameter.shape !== "array" || !Array.isArray(value) || !value.every((item) => isScalar(item))) {
      throw new SdkError(`query parameter ${parameter.name} must be an array of scalars for ${path}`);
    }
    return;
  }
  if (parameter.style === "deepObject") {
    if (parameter.shape !== "object" || value === null || typeof value !== "object" || Array.isArray(value) ||
      !Object.values(value).every((item) => isScalar(item))) {
      throw new SdkError(`query parameter ${parameter.name} must be a shallow scalar object for ${path}`);
    }
    return;
  }
  throw new SdkError(`unsupported query parameter serialization for ${parameter.name} in ${path}`);
}

function renderQuery(operation: RestOperation, queryInput: unknown): Record<string, unknown> | undefined {
  const queryParameters = operation.parameters.filter((parameter) => parameter.in === "query");
  if (queryInput === undefined) {
    if (queryParameters.some((parameter) => parameter.required)) {
      const parameter = queryParameters.find((candidate) => candidate.required);
      throw new SdkError(`missing query parameter ${parameter?.name} for ${operation.path}`);
    }
    return queryParameters.length === 0 ? undefined : {};
  }
  if (queryInput === null || typeof queryInput !== "object" || Array.isArray(queryInput)) {
    throw new SdkError(`query input must be an object for ${operation.path}`);
  }
  const queryValues = queryInput as Record<string, unknown>;
  const declared = new Set(queryParameters.map((parameter) => parameter.name));
  for (const name of Object.keys(queryValues)) {
    if (!declared.has(name)) throw new SdkError(`unexpected query parameter ${name} for ${operation.path}`);
  }
  for (const parameter of queryParameters) {
    const parameterValue = queryValues[parameter.name];
    if (parameter.required && parameterValue === undefined) {
      throw new SdkError(`missing query parameter ${parameter.name} for ${operation.path}`);
    }
    if (parameterValue !== undefined) validateQueryValue(parameter, parameterValue, operation.path);
  }
  return queryValues;
}

function renderHeaders(operation: RestOperation, headersInput: unknown): Record<string, string> | undefined {
  const declared = operation.headers ?? [];
  if (headersInput === undefined) {
    const required = declared.find((header) => header.required);
    if (required) throw new SdkError(`missing header ${required.name} for ${operation.path}`);
    return undefined;
  }
  if (headersInput === null || typeof headersInput !== "object" || Array.isArray(headersInput)) {
    throw new SdkError(`headers input must be an object for ${operation.path}`);
  }
  const headerValues = headersInput as Record<string, unknown>;
  const byName = new Map(declared.map((header) => [header.name.toLowerCase(), header]));
  for (const name of Object.keys(headerValues)) {
    if (!byName.has(name.toLowerCase())) throw new SdkError(`unexpected header ${name} for ${operation.path}`);
    if (headerValues[name] === null) throw new SdkError(`header ${name} cannot be null for ${operation.path}`);
  }
  for (const header of declared) {
    const suppliedName = Object.keys(headerValues).find((name) => name.toLowerCase() === header.name.toLowerCase());
    const headerValue = suppliedName === undefined ? undefined : headerValues[suppliedName];
    if (header.required && headerValue === undefined) throw new SdkError(`missing header ${header.name} for ${operation.path}`);
  }
  return Object.fromEntries(Object.entries(headerValues).filter(([, value]) => value !== undefined)) as Record<string, string>;
}

function methodFor(operation: RestOperation): HttpMethod {
  const method = operation.method.toUpperCase();
  if (method === "GET" || method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    return method;
  }
  throw new SdkError(`unsupported REST method ${operation.method} for ${operation.path}`);
}

function operationContextFor(operation: RestOperation, body: unknown): {
  operation: string;
  clientOrderId?: string;
  clientOrderIds?: readonly string[];
} {
  const context: {
    operation: string;
    clientOrderId?: string;
    clientOrderIds?: readonly string[];
  } = { operation: operation.operation ?? operation.path };
  if (body === null || typeof body !== "object" || Array.isArray(body)) return context;
  const request = body as Record<string, unknown>;
  const clientOrderId = typeof request.clientOrderId === "string"
    ? request.clientOrderId
    : typeof request.client_order_id === "string"
      ? request.client_order_id
      : undefined;
  if (clientOrderId !== undefined) {
    context.clientOrderId = clientOrderId;
  }
  if (Array.isArray(request.orders)) {
    const clientOrderIds = request.orders
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item))
      .map((item) => typeof item.clientOrderId === "string" ? item.clientOrderId : item.client_order_id)
      .filter((value): value is string => typeof value === "string");
    if (clientOrderIds.length > 0) context.clientOrderIds = clientOrderIds;
  }
  return context;
}

export async function executeRestOperation<T extends OperationCallTypes>(
  transport: HttpTransport,
  operation: RestOperation,
  input: { path?: T["path"]; query?: T["query"]; headers?: T["headers"]; body?: T["body"] } = {},
  requestOptions: RequestOptions = {},
): Promise<T["response"]> {
  if (operation.responseMode !== "json" && operation.responseMode !== "file") {
    throw new SdkError(`unsupported REST response mode ${operation.responseMode} for ${operation.path}`);
  }
  if (operation.requestBodyRequired && input.body === undefined) {
    throw new SdkError(`request body is required for ${operation.path}`);
  }
  validateRequestBody(operation.operation, input.body);
  if (operation.requestInt64Paths) {
    const operationName = operation.operation ?? operation.path;
    validateInt64RequestPaths(input.path, operation.requestInt64Paths.path, operationName);
    validateInt64RequestPaths(input.query, operation.requestInt64Paths.query, operationName);
    validateInt64RequestPaths(input.body, operation.requestInt64Paths.body, operationName);
  }
  if (operation.access === "public" && operation.requestBody) {
    throw new SdkError(`public REST operation cannot send a body for ${operation.path}`);
  }
  const suppliedHeaders = input.headers as Record<string, unknown> | undefined;
  if (Object.keys(suppliedHeaders ?? {}).some((name) => name.toLowerCase() === "accept")) {
    throw new SdkError(`Accept is reserved by the REST operation contract for ${operation.path}`);
  }
  const reservedHeader = Object.keys(suppliedHeaders ?? {}).find((name) => {
    const normalized = name.toLowerCase();
    return normalized.startsWith("x-gemini-") ||
      ["authorization", "content-length", "content-type", "cache-control"].includes(normalized);
  });
  if (reservedHeader) {
    throw new SdkError(`header ${reservedHeader} is reserved by the REST operation contract for ${operation.path}`);
  }
  const headers = renderHeaders(operation, suppliedHeaders);
  const query = renderQuery(operation, input.query);
  const request = {
    method: methodFor(operation),
    path: renderPath(operation, input.path),
    query,
    queryParameters: operation.parameters.filter((parameter) => parameter.in === "query"),
    headers,
    responseInt64Paths: operation.responseInt64Paths,
    responseMode: operation.responseMode,
    responseContract: {
      successStatuses: operation.successStatuses,
      responseContentTypes: operation.responseContentTypes,
    },
    operationContext: operationContextFor(operation, input.body),
    retryable: operation.retryable === true,
    ...requestOptions,
  };
  if (operation.access === "public") {
    return transport.requestPublic(request) as T["response"];
  }
  if (operation.access === "authenticated") {
    return transport.request({
      ...request,
      params: operation.requestBody ? input.body as Record<string, unknown> | undefined : undefined,
    }) as T["response"];
  }
  throw new SdkError(`unsupported REST access mode ${operation.access} for ${operation.path}`);
}
