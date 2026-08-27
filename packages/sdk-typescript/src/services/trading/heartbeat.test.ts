import test from "node:test";
import assert from "node:assert/strict";

import { ManagedHeartbeat } from "./heartbeat.js";

test("managed heartbeat does not run until start and stops future beats", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const heartbeat = new ManagedHeartbeat({
    intervalMs: 100,
    beat: async () => { calls++; },
  });

  assert.equal(calls, 0);
  heartbeat.start();
  await Promise.resolve();
  assert.equal(calls, 1);

  heartbeat.stop();
  t.mock.timers.tick(500);
  assert.equal(calls, 1);
});

test("managed heartbeat reports failed beats without creating unhandled rejections", async () => {
  const errors: unknown[] = [];
  const heartbeat = new ManagedHeartbeat({
    intervalMs: 100,
    beat: async () => { throw new Error("heartbeat failed"); },
    onError: (error) => errors.push(error),
  });

  heartbeat.start();
  await Promise.resolve();
// SAFETY: This test fixture intentionally exercises the runtime boundary contract.
  assert.equal((errors[0] as Error).message, "heartbeat failed");
  heartbeat.stop();
});

test("stopping a heartbeat aborts its in-flight beat", async () => {
  let aborted = false;
  const heartbeat = new ManagedHeartbeat({
    intervalMs: 100,
    beat: ({ signal }) => new Promise<void>((resolve) => {
      signal?.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true });
    }),
  });

  heartbeat.start();
  await Promise.resolve();
  heartbeat.stop();
  assert.equal(aborted, true);
});

test("managed heartbeat preserves the caller abort signal", async () => {
  const external = new AbortController();
  let aborted = false;
  const heartbeat = new ManagedHeartbeat({
    intervalMs: 100,
    requestOptions: { signal: external.signal },
    beat: ({ signal }) => new Promise<void>((resolve) => {
      signal?.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true });
    }),
  });

  heartbeat.start();
  await Promise.resolve();
  external.abort();
  await Promise.resolve();
  assert.equal(aborted, true);
  heartbeat.stop();
});
