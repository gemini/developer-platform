import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  HmacAuth,
  createClient,
  type SocketFactoryOptions,
} from "../../../server/index.js";
import { boundaryValueKind } from "../../../utils/boundary-value.js";
import { FakeSocket } from "../../support/fake-socket.js";

function auth(): HmacAuth {
  return new HmacAuth({ apiKey: "test-key", apiSecret: "test-secret" });
}

test("server createClient supports REST-only auth without WebSocket bootstrap", async (t) => {
  const client = await createClient({
    env: "sandbox",
    auth: auth(),
    skipWsInit: true,
  });
  t.after(() => client.close());

  assert.ok(client.marketData);
  assert.ok(client.websocket);
  assert.equal("privateConnection" in client.websocket, false);
  assert.equal("publicConnection" in client.websocket, false);
});

test("server createClient preserves a custom socket factory and session auth boundaries", async (t) => {
  const sockets: FakeSocket[] = [];
  const receivedOptions: SocketFactoryOptions[] = [];
  let resolvePrivateSocketCreated: () => void = () => {};
  const privateSocketCreated = new Promise<void>((resolve) => {
    resolvePrivateSocketCreated = resolve;
  });
  const client = await createClient({
    env: "sandbox",
    auth: auth(),
    webSocketFactory: (_url, options) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      receivedOptions.push(options);
      if (sockets.length === 2) resolvePrivateSocketCreated();
      return socket;
    },
  });
  t.after(() => client.close());

  const publicStream = client.websocket.public.trades("btcusd");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(receivedOptions[0]?.headers, undefined);
  sockets[0].fire("open");
  await Promise.resolve();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await publicStream.ready;

  const privateStream = client.websocket.private.orders({ scope: "account" });
  await privateSocketCreated;
  assert.equal(receivedOptions[1]?.headers?.["X-GEMINI-APIKEY"], "test-key");
  assert.equal(boundaryValueKind(receivedOptions[1]?.headers?.["X-GEMINI-SIGNATURE"]), "string");
  sockets[1].fire("open");
  await Promise.resolve();
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await privateStream.ready;
});

test("server createClient honors eager and skipped optional ws loading", () => {
  const packageDirectory = fileURLToPath(new URL("../../../..", import.meta.url));
  const fakeWs = encodeURIComponent("globalThis.__geminiWsLoaded = true; export default class FakeWs {}");
  const loader = `data:text/javascript,${encodeURIComponent(`
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === "ws") return { url: "data:text/javascript,${fakeWs}", shortCircuit: true };
      return nextResolve(specifier, context);
    }
  `)}`;

  for (const skipWsInit of [false, true]) {
    const option = skipWsInit ? "skipWsInit: true," : "";
    const script = `
      import { createClient, HmacAuth } from "./src/server/index.ts";
      const client = await createClient({
        env: "sandbox",
        auth: new HmacAuth({ apiKey: "test-key", apiSecret: "test-secret" }),
        ${option}
      });
      if ((globalThis.__geminiWsLoaded === true) !== ${!skipWsInit}) {
        throw new Error("unexpected ws preload state");
      }
      client.close();
    `;
    execFileSync(process.execPath, [
      "--import", "tsx",
      "--experimental-loader", loader,
      "--input-type=module", "--eval", script,
    ], { cwd: packageDirectory, stdio: "pipe" });
  }
});

test("serverSocketFactory loads ws on demand", async () => {
  const packageDirectory = fileURLToPath(new URL("../../../..", import.meta.url));
  const script = `
    import { serverSocketFactory } from "./src/server/ws-factory.ts";
    const socket = await serverSocketFactory("wss://example.test", {});
    if (!socket || typeof socket.close !== "function") process.exit(1);
    socket.addEventListener("error", () => {});
    socket.close();
  `;

  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: packageDirectory,
    stdio: "pipe",
  });
});
