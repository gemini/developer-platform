export * from "../generated/websocket/index.js";
export type { GenericSuccessResponse as SuccessResponse } from "../generated/websocket/index.js";

/** A JSON value returned by the lossless WebSocket parser. */
export type WebSocketJsonValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | WebSocketJsonValue[]
  | { [key: string]: WebSocketJsonValue };

/** An open JSON object returned by a WebSocket utility method. */
export type WebSocketJsonObject = { [key: string]: WebSocketJsonValue };
