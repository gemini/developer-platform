const REST_ORIGIN = {
  production: "https://api.gemini.com",
  sandbox: "https://api.sandbox.gemini.com",
};
const WEBSOCKET_ORIGIN = {
  production: "wss://ws.gemini.com",
  sandbox: "wss://ws.sandbox.gemini.com",
};

function qaUrl(value, protocol, label) {
  const url = new URL(value);
  if (url.protocol !== protocol) throw new Error(`${label} must use ${protocol.slice(0, -1)}`);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials`);
  if (url.search || url.hash) throw new Error(`${label} must not contain a query or fragment`);
  return url;
}

export function rewriteRestUrl(requestUrl, qaRestUrl, environment = "sandbox") {
  const request = new URL(requestUrl);
  if (request.origin !== REST_ORIGIN[environment]) {
    throw new Error(`refusing to reroute unexpected REST origin ${request.origin}`);
  }
  const target = qaUrl(qaRestUrl, "https:", "QA REST URL");
  if (target.pathname !== "/") throw new Error("QA REST URL must be an origin without a path");
  return `${target.origin}${request.pathname}${request.search}`;
}

export function rewriteWebSocketUrl(requestUrl, qaWebSocketUrl, environment = "sandbox") {
  const request = new URL(requestUrl);
  if (request.origin !== WEBSOCKET_ORIGIN[environment]) {
    throw new Error(`refusing to reroute unexpected WebSocket origin ${request.origin}`);
  }
  const target = qaUrl(qaWebSocketUrl, "wss:", "QA WebSocket URL");
  target.search = request.search;
  return target.href;
}
