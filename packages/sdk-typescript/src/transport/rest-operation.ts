import { validateInt64RequestPaths, type HttpMethod, type HttpTransport, type RestQueryParameter, type RestResponseMode, type Int64Path, type RequestInt64Path } from "./http.js";
import type { RequestOptions } from "../utils/deadline.js";
import { SdkError } from "../errors.js";
import { validateRequestBody } from "./request-validation.js";
import { createRestPromise, type RestPromise } from "./rest-promise.js";
import {
  formatBoundaryValue,
  isBoundaryBigInt,
  isBoundaryBoolean,
  isBoundaryNumber,
  isBoundaryObject,
  isBoundaryString,
  type BoundaryRecord,
  type BoundaryValue,
} from "../utils/boundary-value.js";

type OperationCallTypes = {
  path?: unknown;
  query?: unknown;
  headers?: unknown;
  body?: unknown;
  input?: unknown;
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
  responseMode: string;
  responseContentTypes: readonly string[];
  responseInt64Paths: readonly Int64Path[];
  queryInRequest?: boolean;
  requestInt64Paths?: {
    body: readonly RequestInt64Path[];
    path: readonly RequestInt64Path[];
    query: readonly RequestInt64Path[];
  };
  retryable?: boolean;
};

type RequestOperationContext = {
  operation: string;
  clientOrderId?: string;
  clientOrderIds?: readonly string[];
};

const PCHAR_ESCAPE = /%(?:21|24|26|27|28|29|2A|2B|2C|3A|3B|3D|40)/gi;

function encodePathSegment(value: BoundaryValue): string {
  return encodeURIComponent(formatBoundaryValue(value)).replace(PCHAR_ESCAPE, decodeURIComponent);
}

function matchesPrimitiveType(
  value: BoundaryValue,
  type: RestQueryParameter["valueType"],
  types?: RestQueryParameter["valueTypes"],
): boolean {
  if (types !== undefined) return types.some((candidate) => matchesPrimitiveType(value, candidate));
  if (type === undefined) return isScalar(value);
  if (type === "string") return isBoundaryString(value);
  if (type === "boolean") return isBoundaryBoolean(value);
  if (type === "integer") return (isBoundaryNumber(value) && Number.isSafeInteger(value)) || isBoundaryBigInt(value);
  return isBoundaryNumber(value) && Number.isFinite(value);
}

function assertPrimitiveType(
  parameter: RestQueryParameter,
  value: BoundaryValue,
  path: string,
  type = parameter.valueType,
  types = parameter.valueTypes,
): void {
  if (!matchesPrimitiveType(value, type, types)) {
    const expected = types?.join(" or ") ?? type ?? "scalar";
    throw new SdkError(`${parameter.in} parameter ${parameter.name} must be a ${expected} for ${path}`);
  }
}

function renderPath(operation: RestOperation, input: BoundaryValue): string {
  let path = operation.path;
  const pathValues = isBoundaryObject(input) ? input : {};
  for (const parameter of operation.parameters) {
    if (parameter.in !== "path") continue;
    if (parameter.style !== "simple" || parameter.explode) {
      throw new SdkError(`unsupported path parameter serialization for ${parameter.name} in ${operation.path}`);
    }
    const parameterValue = pathValues[parameter.name];
    if (parameterValue === undefined) {
      throw new SdkError(`missing path parameter ${parameter.name} for ${operation.path}`);
    }
    assertPrimitiveType(parameter, parameterValue, operation.path);
    path = path.replaceAll(`{${parameter.name}}`, encodePathSegment(parameterValue));
  }
  if (/{[^}]+}/.test(path)) {
    throw new SdkError(`unresolved path parameter in ${operation.path}`);
  }
  return path;
}

function isScalar(value: BoundaryValue): boolean {
  return value === undefined || (value !== null && !isBoundaryObject(value) && !Array.isArray(value));
}

function validateQueryValue(parameter: RestQueryParameter, value: BoundaryValue, path: string): void {
  if (value === null) {
    throw new SdkError(`query parameter ${parameter.name} cannot be null for ${path}`);
  }
  if (!parameter["shape"]) {
    throw new SdkError(`query parameter ${parameter.name} is missing generated shape metadata for ${path}`);
  }
  if (parameter.style === "form") {
    if (parameter["shape"] === "scalar") {
      assertPrimitiveType(parameter, value, path);
      return;
    }
    if (parameter["shape"] === "array") {
      if (!Array.isArray(value) || (parameter.itemType === undefined && !value.every((item) => isScalar(item)))) {
        throw new SdkError(`query parameter ${parameter.name} must match its generated array shape for ${path}`);
      }
      if (parameter.itemType !== undefined || parameter.itemTypes !== undefined) {
        for (const item of value) assertPrimitiveType(parameter, item, path, parameter.itemType, parameter.itemTypes);
      }
      return;
    }
    const valid = isBoundaryObject(value) && Object.values(value).every((item) => isScalar(item));
    if (!valid) throw new SdkError(`query parameter ${parameter.name} must match its generated ${parameter["shape"]} shape for ${path}`);
    return;
  }
  if (parameter.style === "spaceDelimited" || parameter.style === "pipeDelimited") {
    if (parameter["shape"] !== "array" || !Array.isArray(value)) {
      throw new SdkError(`query parameter ${parameter.name} must be an array of scalars for ${path}`);
    }
    if (parameter.itemType === undefined && !value.every((item) => isScalar(item))) {
      throw new SdkError(`query parameter ${parameter.name} must be an array of scalars for ${path}`);
    }
    if (parameter.itemType !== undefined || parameter.itemTypes !== undefined) {
      for (const item of value) assertPrimitiveType(parameter, item, path, parameter.itemType, parameter.itemTypes);
    }
    return;
  }
  if (parameter.style === "deepObject") {
    if (parameter["shape"] !== "object" || !isBoundaryObject(value) ||
      !Object.values(value).every((item) => isScalar(item))) {
      throw new SdkError(`query parameter ${parameter.name} must be a shallow scalar object for ${path}`);
    }
    return;
  }
  throw new SdkError(`unsupported query parameter serialization for ${parameter.name} in ${path}`);
}

function renderQuery(operation: RestOperation, input: BoundaryValue): BoundaryRecord | undefined {
  const queryParameters = operation.parameters.filter((parameter) => parameter.in === "query");
  if (queryParameters.length === 0) return undefined;

  if (input === undefined) {
    if (queryParameters.some((parameter) => parameter.required)) {
      const parameter = queryParameters.find((candidate) => candidate.required);
      throw new SdkError(`missing query parameter ${parameter?.name} for ${operation.path}`);
    }
    return undefined;
  }
  if (!isBoundaryObject(input)) {
    throw new SdkError(`input must be an object for ${operation.path}`);
  }
  const inputValues = input;
  const queryValues: BoundaryRecord = {};
  for (const parameter of queryParameters) {
    const parameterValue = inputValues[parameter.name];
    if (parameter.required && parameterValue === undefined) {
      throw new SdkError(`missing query parameter ${parameter.name} for ${operation.path}`);
    }
    if (parameterValue !== undefined) {
      validateQueryValue(parameter, parameterValue, operation.path);
      queryValues[parameter.name] = parameterValue;
    }
  }
  return Object.keys(queryValues).length === 0 ? undefined : queryValues;
}

function renderHeaders(operation: RestOperation, input: BoundaryValue): Record<string, string> | undefined {
  const declared = operation.headers ?? [];
  if (declared.length === 0) return undefined;
  if (input === undefined) {
    const required = declared.find((header) => header.required);
    if (required) throw new SdkError(`missing header ${required.name} for ${operation.path}`);
    return undefined;
  }
  if (!isBoundaryObject(input)) {
    throw new SdkError(`input must be an object for ${operation.path}`);
  }
  const inputValues = input;
  const headerValues: Record<string, string> = {};
  for (const header of declared) {
    const suppliedName = Object.keys(inputValues).find((name) => name.toLowerCase() === header.name.toLowerCase());
    const headerValue = suppliedName === undefined ? undefined : inputValues[suppliedName];
    if (header.required && headerValue === undefined) throw new SdkError(`missing header ${header.name} for ${operation.path}`);
    if (headerValue !== undefined) {
      if (headerValue === null) throw new SdkError(`header ${header.name} cannot be null for ${operation.path}`);
      headerValues[header.name] = formatBoundaryValue(headerValue);
    }
  }
  return Object.keys(headerValues).length === 0 ? undefined : headerValues;
}

function renderBody(operation: RestOperation, input: BoundaryValue): BoundaryRecord | undefined {
  if (!operation.requestBody) return undefined;
  if (input === undefined) {
    return undefined;
  }
  if (!isBoundaryObject(input)) {
    if (operation.operation) {
      validateRequestBody(operation.operation, input);
    }
    throw new SdkError(`request body must be an object for ${operation.path}`);
  }
  const pathParamNames = new Set(operation.parameters.filter((p) => p.in === "path").map((p) => p.name));
  const queryParamNames = new Set(operation.parameters.filter((p) => p.in === "query").map((p) => p.name));
  const headerParamNames = new Set((operation.headers ?? []).map((h) => h.name.toLowerCase()));

  const body: BoundaryRecord = {};
  for (const [key, value] of Object.entries(input)) {
    if (!pathParamNames.has(key) && !queryParamNames.has(key) && !headerParamNames.has(key.toLowerCase())) {
      body[key] = value;
    }
  }
  return body;
}

function methodFor(operation: RestOperation): HttpMethod {
  const method = operation.method.toUpperCase();
  if (method === "GET" || method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    return method;
  }
  throw new SdkError(`unsupported REST method ${operation.method} for ${operation.path}`);
}

function operationContextFor(operation: RestOperation, body: BoundaryValue): RequestOperationContext {
  const context: RequestOperationContext = { operation: operation.operation ?? operation.path };
  if (!isBoundaryObject(body)) return context;
  const request = body;
  const clientOrderId = isBoundaryString(request.clientOrderId)
    ? request.clientOrderId
    : isBoundaryString(request.client_order_id)
      ? request.client_order_id
      : undefined;
  if (clientOrderId !== undefined) {
    context.clientOrderId = clientOrderId;
  }
  if (Array.isArray(request.orders)) {
    const clientOrderIds = request.orders
      .filter(isBoundaryObject)
      .map((item) => isBoundaryString(item.clientOrderId) ? item.clientOrderId : item.client_order_id)
      .filter(isBoundaryString);
    if (clientOrderIds.length > 0) context.clientOrderIds = clientOrderIds;
  }
  return context;
}

export function executeRestOperation<T extends OperationCallTypes>(
  transport: HttpTransport,
  operation: RestOperation,
  input?: BoundaryValue,
  requestOptions: RequestOptions = {},
): RestPromise<T["response"]> {
  const responsePromise = (async () => {
    if (operation.responseMode !== "json" && operation.responseMode !== "file") {
      throw new SdkError(`unsupported REST response mode ${operation.responseMode} for ${operation.path}`);
    }
    const responseMode: RestResponseMode = operation.responseMode;
    const body = renderBody(operation, input);
    if (operation.requestBodyRequired && (input === undefined || body === undefined)) {
      throw new SdkError(`request body is required for ${operation.path}`);
    }
    if (body !== undefined) {
      validateRequestBody(operation.operation, body);
    }
    if (operation.requestInt64Paths) {
      const operationName = operation.operation ?? operation.path;
      validateInt64RequestPaths(input, operation.requestInt64Paths.path, operationName);
      validateInt64RequestPaths(input, operation.requestInt64Paths.query, operationName);
      validateInt64RequestPaths(body, operation.requestInt64Paths.body, operationName);
    }
    if (operation.access === "public" && operation.requestBody) {
      throw new SdkError(`public REST operation cannot send a body for ${operation.path}`);
    }
    const declaredHeaderNames = new Set((operation.headers ?? []).map((h) => h.name.toLowerCase()));
    if (declaredHeaderNames.has("accept")) {
      throw new SdkError(`Accept is reserved by the REST operation contract for ${operation.path}`);
    }
    for (const name of declaredHeaderNames) {
      if (name.startsWith("x-gemini-") ||
        ["authorization", "content-length", "content-type", "cache-control"].includes(name)) {
        throw new SdkError(`header ${name} is reserved by the REST operation contract for ${operation.path}`);
      }
    }
    if (requestOptions.headers) {
      if (Object.keys(requestOptions.headers).some((name) => name.toLowerCase() === "accept")) {
        throw new SdkError(`Accept is reserved by the REST operation contract for ${operation.path}`);
      }
      const reservedHeader = Object.keys(requestOptions.headers).find((name) => {
        const normalized = name.toLowerCase();
        return normalized.startsWith("x-gemini-") ||
          ["authorization", "content-length", "content-type", "cache-control"].includes(normalized);
      });
      if (reservedHeader) {
        throw new SdkError(`header ${reservedHeader} is reserved by the REST operation contract for ${operation.path}`);
      }
    }
    const headers = renderHeaders(operation, input);
    const query = renderQuery(operation, input);
    const { headers: callerHeaders, signal, timeoutMs } = requestOptions;
    const request = {
      method: methodFor(operation),
      path: renderPath(operation, input),
      query,
      queryParameters: operation.parameters.filter((parameter) => parameter.in === "query"),
      queryInRequest: operation.queryInRequest,
      responseInt64Paths: operation.responseInt64Paths,
      responseMode,
      responseContract: {
        successStatuses: operation.successStatuses,
        responseContentTypes: operation.responseContentTypes,
      },
      operationContext: operationContextFor(operation, body),
      retryable: operation.retryable === true,
      headers: {
        ...headers,
        ...callerHeaders,
      },
      signal,
      timeoutMs,
    };
    if (operation.access === "public") {
      return transport.requestPublicWithResponse<T["response"]>(request);
    }
    if (operation.access === "authenticated") {
      return transport.requestWithResponse<T["response"]>({
        ...request,
        params: operation.requestBody ? (body ?? {}) : undefined,
      });
    }
    throw new SdkError(`unsupported REST access mode ${operation.access} for ${operation.path}`);
  })();
  return createRestPromise(responsePromise);
}
