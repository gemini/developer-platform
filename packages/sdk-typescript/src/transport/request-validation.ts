import { ValidationError } from "../errors.js";
import {
  isBoundaryBigInt,
  isBoundaryBoolean,
  isBoundaryNumber,
  isBoundaryObject,
  isBoundaryString,
  type BoundaryValue,
} from "../utils/boundary-value.js";

type RequestBody = Record<string, BoundaryValue>;

const DECIMAL = /^(?:\d+\.?\d*|\.\d+)$/u;
const INTEGER_ID = /^\d+$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const hasField = (body: RequestBody, field: string): boolean => Object.prototype.hasOwnProperty.call(body, field);
const isBoolean = (value: BoundaryValue): boolean => isBoundaryBoolean(value);
const isFiniteNumber = (value: BoundaryValue): value is number => isBoundaryNumber(value) && Number.isFinite(value);
const isString = isBoundaryString;

function fail(operation: string, field: string, rule: string, message: string): never {
  throw new ValidationError({ operation, field, rule, message });
}

function objectBody(operation: string, value: BoundaryValue): RequestBody {
  if (!isBoundaryObject(value)) {
    return fail(operation, "body", "type", "request body must be a non-null JSON object");
  }
  return value;
}

function required(body: RequestBody, operation: string, field: string): BoundaryValue {
  if (!hasField(body, field) || body[field] === undefined || body[field] === null) {
    return fail(operation, field, "required", `${field} is required`);
  }
  return body[field];
}

function optional(body: RequestBody, operation: string, field: string, check: (value: BoundaryValue) => boolean): void {
  if (hasField(body, field) && body[field] !== undefined && !check(body[field])) {
    fail(operation, field, "type", `${field} has an invalid type or format`);
  }
}

function stringField(body: RequestBody, operation: string, field: string, requiredField = false): void {
  const value = requiredField ? required(body, operation, field) : body[field];
  if ((requiredField || hasField(body, field)) && !isString(value)) {
    fail(operation, field, "type", `${field} must be a string`);
  }
}

function decimal(value: BoundaryValue): boolean {
  return isBoundaryString(value) && DECIMAL.test(value);
}

function decimalField(body: RequestBody, operation: string, field: string, requiredField = false): void {
  const value = requiredField ? required(body, operation, field) : body[field];
  if ((requiredField || hasField(body, field)) && !decimal(value)) {
    fail(operation, field, "format", `${field} must be a quoted decimal string`);
  }
}

function booleanField(body: RequestBody, operation: string, field: string): void {
  optional(body, operation, field, isBoolean);
}

function enumField(body: RequestBody, operation: string, field: string, values: readonly string[], requiredField = false): void {
  const value = requiredField ? required(body, operation, field) : body[field];
  if ((requiredField || hasField(body, field)) && (!isString(value) || !values.includes(value))) {
    fail(operation, field, "enum", `${field} must be one of: ${values.join(", ")}`);
  }
}

function identifier(value: BoundaryValue): boolean {
  return (isBoundaryBigInt(value) && value >= 0n) ||
    (isBoundaryNumber(value) && Number.isSafeInteger(value) && value >= 0) ||
    (isBoundaryString(value) && INTEGER_ID.test(value));
}

function identifierField(body: RequestBody, operation: string, field: string): void {
  if (!identifier(required(body, operation, field))) {
    fail(operation, field, "format", `${field} must be a non-negative safe integer, bigint, or numeric string`);
  }
}

function uuidField(body: RequestBody, operation: string, field: string, version4 = false): void {
  const pattern = version4 ? UUID_V4 : UUID;
  const value = body[field];
  if (hasField(body, field) && value !== undefined && !(isString(value) && pattern.test(value))) {
    fail(operation, field, "format", `${field} must be a ${version4 ? "UUIDv4" : "UUID"} string`);
  }
}

function arrayField(body: RequestBody, operation: string, field: string, min: number, max: number, validateItem: (value: BoundaryValue, path: string) => void): void {
  const value = required(body, operation, field);
  if (!Array.isArray(value)) fail(operation, field, "type", `${field} must be an array`);
  if (value.length < min || value.length > max) fail(operation, field, "bounds", `${field} must contain ${min}-${max} items`);
  value.forEach((entry, index) => validateItem(entry, `${field}[${index}]`));
}

function nestedObject(operation: string, value: BoundaryValue, field: string): RequestBody {
  if (!isBoundaryObject(value)) {
    return fail(operation, field, "type", `${field} must be an object`);
  }
  // SAFETY: isBoundaryObject excludes arrays and primitives, which are not valid request bodies.
  return value;
}

function atMostOne(value: BoundaryValue): boolean {
  if (!isBoundaryString(value) || !DECIMAL.test(value)) return false;
  const [whole, fraction = ""] = value.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/u, "");
  return normalizedWhole === "0" || (normalizedWhole === "1" && /^0*$/u.test(fraction));
}

function normalizeComparableDecimal(value: string) {
  const [whole = "0", fraction = ""] = value.split(".");
  return {
    whole: whole.replace(/^0+(?=\d)/u, "") || "0",
    fraction: fraction.replace(/0+$/u, ""),
  };
}

function compareDecimals(left: string, right: string): number {
  const a = normalizeComparableDecimal(left);
  const b = normalizeComparableDecimal(right);
  if (a.whole.length !== b.whole.length) return a.whole.length < b.whole.length ? -1 : 1;
  if (a.whole !== b.whole) return a.whole < b.whole ? -1 : 1;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const aFraction = a.fraction.padEnd(width, "0");
  const bFraction = b.fraction.padEnd(width, "0");
  return aFraction === bFraction ? 0 : aFraction < bFraction ? -1 : 1;
}

function tradingOrder(operation: string, body: RequestBody): void {
  stringField(body, operation, "symbol", true);
  decimalField(body, operation, "amount", true);
  decimalField(body, operation, "price", true);
  enumField(body, operation, "side", ["buy", "sell"], true);
  enumField(body, operation, "type", ["exchange limit", "exchange stop limit", "exchange market"], true);
  optional(body, operation, "client_order_id", isString);
  optional(body, operation, "account", isString);
  optional(body, operation, "stop_price", decimal);
  booleanField(body, operation, "margin_order");
  if (hasField(body, "options")) {
    const options = body.options;
    if (!Array.isArray(options) || options.length > 1 || options.some((value) =>
      !isBoundaryString(value) || !["maker-or-cancel", "immediate-or-cancel", "fill-or-kill"].includes(value))) {
      fail(operation, "options", "bounds", "options must contain at most one supported execution option");
    }
  }
  const stop = body.type === "exchange stop limit";
  if (stop && (!hasField(body, "stop_price") || body.stop_price === undefined || body.stop_price === null)) fail(operation, "stop_price", "conditional", "stop_price is required for stop-limit orders");
  if (!stop && hasField(body, "stop_price")) fail(operation, "stop_price", "conditional", "stop_price is only valid for stop-limit orders");
  if (stop && Array.isArray(body.options) && body.options.length > 0) fail(operation, "options", "exclusive", "options cannot be used with stop-limit orders");
  if (stop && body.side === "buy" && isString(body.stop_price) && isString(body.price) && compareDecimals(body.stop_price, body.price) >= 0) {
    fail(operation, "stop_price", "relationship", "stop_price must be less than price for buy stop-limit orders");
  }
  if (stop && body.side === "sell" && isString(body.stop_price) && isString(body.price) && compareDecimals(body.stop_price, body.price) <= 0) {
    fail(operation, "stop_price", "relationship", "stop_price must be greater than price for sell stop-limit orders");
  }
}

function predictionOrder(operation: string, body: RequestBody, prefix = ""): void {
  try {
    stringField(body, operation, "symbol", true);
    enumField(body, operation, "orderType", ["limit", "stop-limit"], true);
    enumField(body, operation, "side", ["buy", "sell"], true);
    decimalField(body, operation, "quantity", true);
    decimalField(body, operation, "price", true);
    enumField(body, operation, "outcome", ["yes", "no"], true);
    optional(body, operation, "stopPrice", decimal);
    enumField(body, operation, "timeInForce", ["good-til-cancel", "immediate-or-cancel", "fill-or-kill"]);
    booleanField(body, operation, "makerOrCancel");
    if (body.orderType === "stop-limit" && !hasField(body, "stopPrice")) fail(operation, "stopPrice", "conditional", "stopPrice is required for stop-limit orders");
    if (body.orderType !== "stop-limit" && hasField(body, "stopPrice")) fail(operation, "stopPrice", "conditional", "stopPrice is only valid for stop-limit orders");
    if (!atMostOne(body.price)) fail(operation, "price", "bounds", "price must be between 0 and 1");
    if (hasField(body, "stopPrice") && !atMostOne(body.stopPrice)) fail(operation, "stopPrice", "bounds", "stopPrice must be between 0 and 1");
  } catch (error) {
    if (prefix && error instanceof ValidationError) {
      throw new ValidationError({ operation: error.operation, field: `${prefix}${error.field}`, rule: error.rule, message: `${prefix}${error.message}` });
    }
    throw error;
  }
}

function validateFields(operation: string, body: RequestBody, fields: Record<string, (value: BoundaryValue) => boolean>): void {
  for (const [field, check] of Object.entries(fields)) {
    if (hasField(body, field) && !check(body[field])) fail(operation, field, "type", `${field} has an invalid type or format`);
  }
}

function requiredStrings(body: RequestBody, operation: string, fields: readonly string[]): void {
  for (const field of fields) stringField(body, operation, field, true);
}

function requiredDecimals(body: RequestBody, operation: string, fields: readonly string[]): void {
  for (const field of fields) decimalField(body, operation, field, true);
}

type Validator = (operation: string, body: RequestBody) => void;

const validators = {
  "trading.createNewOrder": tradingOrder,
  "trading.getOrderStatus": (operation, body) => {
    const hasOrderId = hasField(body, "order_id") && body.order_id !== undefined;
    const hasClientOrderId = hasField(body, "client_order_id") && body.client_order_id !== undefined;
    if (hasOrderId === hasClientOrderId) {
      fail(
        operation,
        "order_id",
        hasOrderId ? "exclusive" : "required",
        "exactly one of order_id or client_order_id is required",
      );
    }
    if (hasOrderId) identifierField(body, operation, "order_id");
    else stringField(body, operation, "client_order_id", true);
    booleanField(body, operation, "include_trades");
    optional(body, operation, "account", isString);
  },
  "trading.cancelOrder": (operation, body) => identifierField(body, operation, "order_id"),
  "trading.cancelAllActiveOrders": () => undefined,
  "trading.cancelAllSessionOrders": () => undefined,
  "trading.wrapOrder": (operation, body) => {
    decimalField(body, operation, "amount", true);
    enumField(body, operation, "side", ["buy", "sell"]);
    validateFields(operation, body, { client_order_id: isString, account: isString });
  },
  "account.createNewDepositAddress": (operation, body) => validateFields(operation, body, {
    label: isString,
    legacy: isBoolean,
    account: isString,
  }),
  "transfers.withdrawCryptoFunds": (operation, body) => {
    stringField(body, operation, "address", true);
    decimalField(body, operation, "amount", true);
    validateFields(operation, body, { memo: isString });
    uuidField(body, operation, "clientTransferId");
  },
  "clearing.createNewClearingOrder": (operation, body) => {
    requiredStrings(body, operation, ["symbol"]);
    requiredDecimals(body, operation, ["amount", "price"]);
    enumField(body, operation, "side", ["buy", "sell"], true);
    validateFields(operation, body, {
      counterparty_id: isString,
      expires_in_hrs: isFiniteNumber,
      account: isString,
    });
  },
  "clearing.cancelClearingOrder": (operation, body) => stringField(body, operation, "clearing_id", true),
  "clearing.confirmClearingOrder": (operation, body) => {
    requiredStrings(body, operation, ["clearing_id", "symbol"]);
    requiredDecimals(body, operation, ["amount", "price"]);
    enumField(body, operation, "side", ["buy", "sell"], true);
  },
  "clearing.createNewBrokerOrder": (operation, body) => {
    requiredStrings(body, operation, ["source_counterparty_id", "target_counterparty_id", "symbol"]);
    requiredDecimals(body, operation, ["amount", "price"]);
    enumField(body, operation, "side", ["buy", "sell"], true);
    const expires = required(body, operation, "expires_in_hrs");
    if (!isFiniteNumber(expires)) fail(operation, "expires_in_hrs", "type", "expires_in_hrs must be a finite number");
  },
  "instant.executeInstantOrder": (operation, body) => {
    requiredStrings(body, operation, ["symbol", "quantity", "price", "fee"]);
    enumField(body, operation, "side", ["buy", "sell"], true);
    const quoteId = required(body, operation, "quoteId");
    if (!identifier(quoteId)) fail(operation, "quoteId", "format", "quoteId must be a safe integer, bigint, or numeric string");
  },
  "account.addBank": (operation, body) => {
    requiredStrings(body, operation, ["accountnumber", "routing", "name"]);
    enumField(body, operation, "type", ["checking", "savings"], true);
  },
  "account.addBankCAD": (operation, body) => {
    for (const field of ["swiftcode", "accountNumber", "name"]) stringField(body, operation, field, true);
    enumField(body, operation, "type", ["checking", "savings"], true);
    validateFields(operation, body, { institutionNumber: isString, branchnnumber: isString });
  },
  "account.createNewApprovedAddress": (operation, body) => requiredStrings(body, operation, ["address", "label"]),
  "account.removeApprovedAddress": (operation, body) => stringField(body, operation, "address", true),
  "account.createNewAccount": (operation, body) => {
    stringField(body, operation, "name", true);
    enumField(body, operation, "type", ["exchange", "custody"]);
  },
  "account.renameAccount": (operation, body) => validateFields(operation, body, {
    account: isString,
    newName: isString,
    newAccount: isString,
  }),
  "transfers.transferBetweenAccounts": (operation, body) => {
    stringField(body, operation, "sourceAccount", true);
    stringField(body, operation, "targetAccount", true);
    decimalField(body, operation, "amount", true);
    uuidField(body, operation, "clientTransferId", true);
    validateFields(operation, body, { withdrawalId: isString });
  },
  "account.revokeOAuthToken": () => undefined,
  "staking.stakeCryptoFunds": (operation, body) => {
    requiredStrings(body, operation, ["providerId", "currency"]);
    decimalField(body, operation, "amount", true);
  },
  "staking.unstakeCryptoFunds": (operation, body) => {
    requiredStrings(body, operation, ["providerId", "currency"]);
    decimalField(body, operation, "amount", true);
  },
  "predictionMarkets.placeOrder": predictionOrder,
  "predictionMarkets.placeOrderBatch": (operation, body) => arrayField(
    body,
    operation,
    "orders",
    1,
    20,
    (value, path) => predictionOrder(operation, nestedObject(operation, value, path), `${path}.`),
  ),
  "predictionMarkets.cancelOrder": (operation, body) => identifierField(body, operation, "orderId"),
  "predictionMarkets.cancelOrderBatch": (operation, body) => arrayField(
    body,
    operation,
    "orderIds",
    1,
    20,
    (value, path) => {
      if (!identifier(value)) fail(operation, path, "format", `${path} must be a non-negative order identifier`);
    },
  ),
  "predictionMarkets.createCombo": (operation, body) => arrayField(
    body,
    operation,
    "legs",
    2,
    6,
    (value, path) => {
      const leg = nestedObject(operation, value, path);
      stringField(leg, operation, "contractId", true);
      enumField(leg, operation, "requiredOutcome", ["Yes", "No"], true);
    },
  ),
} satisfies Record<string, Validator>;

function isValidatorName(operation: string): operation is keyof typeof validators {
  return Object.hasOwn(validators, operation);
}

export function validateRequestBody(operation: string | undefined, body: BoundaryValue): void {
  if (!operation || !isValidatorName(operation)) return;
  validators[operation](operation, objectBody(operation, body));
}
