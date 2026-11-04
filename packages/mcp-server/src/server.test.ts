import test from 'node:test';
import assert from 'node:assert/strict';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createServer } from './server.js';
import type { SdkClient } from './client/sdk.js';

// createServer() previously took no arguments; PREDICT-8816 added the sdkClient
// parameter with no other behavior change. Neither this bootstrap nor the alerts
// daemon's had any test coverage before this ticket — this closes that gap for the MCP
// server entry point specifically, so a wiring mistake here (e.g. a missing/mistyped
// parameter) fails a test instead of only surfacing at runtime.
const fakeSdkClient = {} as SdkClient;

test('createServer constructs without throwing and returns a Server instance', () => {
  const server = createServer(fakeSdkClient);
  assert.ok(server instanceof Server);
});
