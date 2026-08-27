import {
  isBoundaryBigInt,
  isBoundaryNumber,
  isBoundaryObject,
  isBoundaryString,
  type BoundaryRecord,
  type BoundaryValue,
} from "../utils/boundary-value.js";
import { isPlainDecimal } from "../utils/decimal.js";

/** Shared shape and scalar checks for public and authenticated WebSocket frames. */
export function record(frame: BoundaryValue): BoundaryRecord | undefined {
  return isBoundaryObject(frame) ? frame : undefined;
}

export function isUpdateId(value: BoundaryValue): value is number | bigint {
  return isBoundaryBigInt(value) ? value >= 0n : isBoundaryNumber(value) && Number.isSafeInteger(value) && value >= 0;
}

export function isNonEmptyString(value: BoundaryValue): value is string {
  return isBoundaryString(value) && value.length > 0;
}

export function isOptionalNonEmptyString(value: BoundaryValue): boolean {
  return value === undefined || isNonEmptyString(value);
}

export function isOptionalString(value: BoundaryValue): boolean {
  return value === undefined || isBoundaryString(value);
}

export function isOptionalDecimal(value: BoundaryValue): boolean {
  return value === undefined || isPlainDecimal(value);
}

export function isOptionalUpdateId(value: BoundaryValue): boolean {
  return value === undefined || isUpdateId(value);
}

export function isOneOf(value: BoundaryValue, allowed: readonly string[]): value is string {
  return isBoundaryString(value) && allowed.includes(value);
}

export function isOneOfOptional(value: BoundaryValue, allowed: readonly string[]): boolean {
  return value === undefined || isOneOf(value, allowed);
}

export function isRfqLeg(value: BoundaryValue): boolean {
  const leg = record(value);
  return !!leg && isNonEmptyString(leg.c) &&
    isNonEmptyString(leg.s) && isOneOf(leg.o, ["YES", "NO"]);
}
