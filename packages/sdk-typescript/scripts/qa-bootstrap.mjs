import { rewriteRestUrl, rewriteWebSocketUrl } from "./qa-routing.mjs";

const qaRestUrl = process.env.GEMINI_QA_REST_URL;
const qaWebSocketUrl = process.env.GEMINI_QA_WEBSOCKET_URL;
const environment = process.env.GEMINI_QA_PROTOCOL ?? "production";
if (!qaRestUrl || !qaWebSocketUrl) {
  throw new Error("GEMINI_QA_REST_URL and GEMINI_QA_WEBSOCKET_URL are required");
}
if (environment !== "production" && environment !== "sandbox") {
  throw new Error("GEMINI_QA_PROTOCOL must be production or sandbox");
}
process.env.GEMINI_SMOKE_ENV = environment;
process.env.GEMINI_SMOKE_LABEL = "QA";

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (url, init) => nativeFetch(rewriteRestUrl(url, qaRestUrl, environment), init);

const NativeWebSocket = globalThis.WebSocket;
globalThis.WebSocket = new Proxy(NativeWebSocket, {
  construct(Target, args) {
    return Reflect.construct(Target, [rewriteWebSocketUrl(args[0], qaWebSocketUrl, environment), ...args.slice(1)]);
  },
});
