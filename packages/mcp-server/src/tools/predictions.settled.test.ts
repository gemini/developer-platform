import test from 'node:test';
import assert from 'node:assert/strict';
import JSONBig from 'json-bigint';
import type { GeminiHttpClient } from '../client/http.js';
import { createPredictionTools } from './predictions.js';

// Requests never leave this test — every call in these tests is intercepted
// by the fake client before it reaches GeminiHttpClient's real networking
// code.
function fakeClient(response: unknown = {}) {
  return {
    publicGet: async () => response,
    authenticatedGet: async () => response,
    authenticatedPost: async () => response,
  } as unknown as GeminiHttpClient;
}

function toolNamed(client: GeminiHttpClient, name: string) {
  const tool = createPredictionTools(client).find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

function textOf(result: { content: { type: string; text?: string }[] }): string {
  const block = result.content[0];
  if (!block || block.type !== 'text' || block.text === undefined) {
    throw new Error('expected a text content block');
  }
  return block.text;
}

function parsedOutput(result: { content: { type: string; text?: string }[] }): unknown {
  const text = textOf(result);
  const inner = text.replace(/^<tool-output[^>]*>\n/, '').replace(/\n<\/tool-output>$/, '');
  return JSON.parse(inner);
}

// Same precision-preserving parser the real GeminiHttpClient uses
// (src/client/http.ts). Used here to turn hand-written raw JSON text — with
// a 17-18 digit accountId/instrumentId as a bare JSON number, exactly as the
// API sends it — into the object a real client call would hand to the
// datasource layer. Building the fixture via JSON.stringify of a JS object
// literal would not prove anything: an 18-digit numeric literal in JS source
// is already truncated before any parser sees it.
const jsonParse = JSONBig({ storeAsString: true });

// ----------------------------------------------------------------------------
// Sort enums — client-side zod constraint, independent of API validation
// ----------------------------------------------------------------------------

test('gemini_get_prediction_positions rejects a sort value outside the 9-item enum', () => {
  const tool = toolNamed(fakeClient(), 'gemini_get_prediction_positions');
  assert.strictEqual(tool.inputSchema.safeParse({ sort: 'symbol' }).success, false);
  assert.strictEqual(tool.inputSchema.safeParse({ sort: '+unknownfield' }).success, false);
  assert.strictEqual(tool.inputSchema.safeParse({ sort: '-positionValue' }).success, true);
});

test('gemini_get_prediction_settled_positions rejects a sort value outside the 6-item enum', () => {
  const tool = toolNamed(fakeClient(), 'gemini_get_prediction_settled_positions');
  assert.strictEqual(tool.inputSchema.safeParse({ sort: 'symbol' }).success, false);
  assert.strictEqual(tool.inputSchema.safeParse({ sort: '+unknownfield' }).success, false);
  assert.strictEqual(tool.inputSchema.safeParse({ sort: '-payout' }).success, true);
  // +date is syntactically valid client-side even though the API silently
  // falls back to the default for it — the enum only rejects nonsense, not
  // documented-but-ineffective values.
  assert.strictEqual(tool.inputSchema.safeParse({ sort: '+date' }).success, true);
});

// ----------------------------------------------------------------------------
// Both position tools are read-only
// ----------------------------------------------------------------------------

test('gemini_get_prediction_positions has no mutates field (read-only)', () => {
  const tool = toolNamed(fakeClient(), 'gemini_get_prediction_positions');
  assert.strictEqual(tool.mutates, undefined);
});

test('gemini_get_prediction_settled_positions has no mutates field (read-only)', () => {
  const tool = toolNamed(fakeClient(), 'gemini_get_prediction_settled_positions');
  assert.strictEqual(tool.mutates, undefined);
});

// ----------------------------------------------------------------------------
// Absent roll-up totals — pure passthrough, no fabrication
// ----------------------------------------------------------------------------

test('gemini_get_prediction_settled_positions does not fabricate absent roll-up totals', async () => {
  // totalPayout, totalCostBasis, and totalNetProfit are omitted entirely,
  // matching how the real API omits fields it cannot compute rather than
  // sending null.
  const response = {
    positions: [{ instrumentSymbol: 'GEMI-A', payout: '100.00', costBasis: '50.00', netProfit: '50.00' }],
    total: 1,
  };

  const tool = toolNamed(fakeClient(response), 'gemini_get_prediction_settled_positions');
  const result = await tool.handler(tool.inputSchema.parse({}));
  const parsed = parsedOutput(result) as Record<string, unknown>;

  assert.strictEqual('totalPayout' in parsed, false, 'must not fabricate totalPayout');
  assert.strictEqual('totalCostBasis' in parsed, false, 'must not fabricate totalCostBasis');
  assert.strictEqual('totalNetProfit' in parsed, false, 'must not fabricate totalNetProfit');
  assert.strictEqual(parsed['total'], 1);
});

// ----------------------------------------------------------------------------
// withCashOuts=true — sibling fields survive passthrough
// ----------------------------------------------------------------------------

test('gemini_get_prediction_settled_positions passes through cashOuts and totalCashOut* fields', async () => {
  const response = {
    positions: [{ instrumentSymbol: 'GEMI-A', payout: '100.00' }],
    cashOuts: [
      {
        accountId: '123',
        costBasis: '20.00',
        filledQuantity: '5',
        instrumentId: '456',
        instrumentSymbol: 'GEMI-B',
        netProfit: '5.00',
        proceeds: '25.00',
        side: 'sell',
        timestamp: '2026-01-01T00:00:00Z',
      },
    ],
    totalCashOutProceeds: '25.00',
    totalCashOutCostBasis: '20.00',
    totalCashOutNetProfit: '5.00',
  };

  const tool = toolNamed(fakeClient(response), 'gemini_get_prediction_settled_positions');
  const result = await tool.handler(tool.inputSchema.parse({ withCashOuts: true }));
  const parsed = parsedOutput(result) as Record<string, unknown>;

  assert.deepStrictEqual(parsed['cashOuts'], response.cashOuts);
  assert.strictEqual(parsed['totalCashOutProceeds'], '25.00');
  assert.strictEqual(parsed['totalCashOutCostBasis'], '20.00');
  assert.strictEqual(parsed['totalCashOutNetProfit'], '5.00');
});

// ----------------------------------------------------------------------------
// Int64 precision — a 17-18 digit accountId/instrumentId must survive
// verbatim, as it would arrive over the wire as a bare JSON number
// ----------------------------------------------------------------------------

test('gemini_get_prediction_settled_positions preserves 18-digit accountId/instrumentId precision', async () => {
  const raw =
    '{"positions":[{"accountId":123456789012345678,"instrumentId":987654321098765432,' +
    '"instrumentSymbol":"GEMI-A","payout":"100.00","outcome":"yes"}]}';
  const response = jsonParse.parse(raw);

  const tool = toolNamed(fakeClient(response), 'gemini_get_prediction_settled_positions');
  const result = await tool.handler(tool.inputSchema.parse({}));
  const text = textOf(result);

  assert.ok(text.includes('123456789012345678'), 'accountId must survive as the exact string');
  assert.ok(text.includes('987654321098765432'), 'instrumentId must survive as the exact string');
  assert.doesNotMatch(text, /123456789012345680/, 'must not silently round accountId to a nearby value');
});
