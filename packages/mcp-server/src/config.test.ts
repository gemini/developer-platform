import test from 'node:test';
import assert from 'node:assert/strict';

// config.ts snapshots process.env when the module is first imported, so the env vars
// have to be in place before the module graph loads — same reason client/sdk.test.ts
// and client/http.request.test.ts use dynamic imports here. node:test runs each test
// file in its own process, so this assignment cannot leak into other suites.
process.env.GEMINI_API_BASE_URL = 'https://api.sandbox.gemini.com';
delete process.env.GEMINI_SDK_ENV;

const { config } = await import('./config.js');

test('sdkEnv derives from GEMINI_API_BASE_URL when GEMINI_SDK_ENV is unset, so the two selectors cannot diverge', () => {
  // Regression guard: an operator who sets only the documented sandbox base URL (and
  // never learns about the separate, SDK-only GEMINI_SDK_ENV variable) must not have
  // prediction-market SDK calls silently fall back to sdkEnv's old hardcoded
  // "production" default while every other tool correctly targets sandbox.
  assert.strictEqual(config.baseUrl, 'https://api.sandbox.gemini.com');
  assert.strictEqual(config.sdkEnv, 'sandbox');
});
