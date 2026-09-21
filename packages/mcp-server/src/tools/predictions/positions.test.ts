import test from 'node:test';
import assert from 'node:assert/strict';
import type { SdkClient } from '../../client/sdk.js';
import { createPredictionPositionTools } from './positions.js';

// Requests never leave this test — every call in these tests is intercepted by the
// fake SDK client before it would reach the real @gemini-markets/sdk transport.
function fakeClient(getPositionsResponse: unknown = {}, getSettledPositionsResponse: unknown = {}) {
  return {
    predictions: {
      getPositions: async () => getPositionsResponse,
      getSettledPositions: async () => getSettledPositionsResponse,
    },
  } as unknown as SdkClient;
}

// Unlike fakeClient above, this records the input object of each settled-positions
// call — needed to prove the handler actually reaches the SDK with the parsed
// filters, not just that it returns whatever the fixture hands back.
function recordingClient(response: unknown = {}) {
  const calls: { input?: unknown }[] = [];
  const client = {
    predictions: {
      getPositions: async () => response,
      getSettledPositions: async (input?: unknown) => {
        calls.push({ input });
        return response;
      },
    },
  } as unknown as SdkClient;
  return { client, calls };
}

function toolNamed(client: SdkClient, name: string) {
  const tool = createPredictionPositionTools(client).find((t) => t.name === name);
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

  const tool = toolNamed(fakeClient(undefined, response), 'gemini_get_prediction_settled_positions');
  const result = await tool.handler(tool.inputSchema.parse({}));
  const parsed = parsedOutput(result) as Record<string, unknown>;

  assert.strictEqual('totalPayout' in parsed, false, 'must not fabricate totalPayout');
  assert.strictEqual('totalCostBasis' in parsed, false, 'must not fabricate totalCostBasis');
  assert.strictEqual('totalNetProfit' in parsed, false, 'must not fabricate totalNetProfit');
  assert.strictEqual(parsed['total'], 1);
});

// ----------------------------------------------------------------------------
// withCashOuts=true — sibling fields survive passthrough (mapped, since
// accountId/instrumentId arrive as bigint and must come out as strings)
// ----------------------------------------------------------------------------

test('gemini_get_prediction_settled_positions passes through cashOuts and totalCashOut* fields', async () => {
  const response = {
    positions: [{ instrumentSymbol: 'GEMI-A', payout: '100.00' }],
    cashOuts: [
      {
        accountId: 123n,
        costBasis: '20.00',
        filledQuantity: '5',
        instrumentId: 456n,
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

  const tool = toolNamed(fakeClient(undefined, response), 'gemini_get_prediction_settled_positions');
  const result = await tool.handler(tool.inputSchema.parse({ withCashOuts: true }));
  const parsed = parsedOutput(result) as Record<string, unknown>;

  assert.deepStrictEqual(parsed['cashOuts'], [
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
  ]);
  assert.strictEqual(parsed['totalCashOutProceeds'], '25.00');
  assert.strictEqual(parsed['totalCashOutCostBasis'], '20.00');
  assert.strictEqual(parsed['totalCashOutNetProfit'], '5.00');
});

// ----------------------------------------------------------------------------
// Wiring — the handler must actually reach the SDK with the parsed filters,
// not just relay whatever the fixture hands back
// ----------------------------------------------------------------------------

test('gemini_get_prediction_settled_positions calls the SDK with the parsed filters, unchanged', async () => {
  const { client, calls } = recordingClient({ positions: [] });
  const tool = toolNamed(client, 'gemini_get_prediction_settled_positions');

  await tool.handler(
    tool.inputSchema.parse({
      eventTicker: 'FEDJAN26',
      limit: 25,
      offset: 0,
      sort: '-payout',
      search: 'fed',
      category: 'Politics',
      withCashOuts: true,
    })
  );

  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0]!.input, {
    eventTicker: 'FEDJAN26',
    limit: 25,
    offset: 0,
    sort: '-payout',
    search: 'fed',
    category: 'Politics',
    withCashOuts: true,
  });
});

// ----------------------------------------------------------------------------
// Int64 precision — an 18-digit accountId/instrumentId must survive verbatim.
// The SDK hands these back as real bigint values (a bigint literal is exact
// in JS source, unlike a plain numeric literal past MAX_SAFE_INTEGER), and
// the datasource's mapper must stringify them rather than let them reach
// wrapHandler's JSON.stringify, which cannot serialize bigint at all.
// ----------------------------------------------------------------------------

test('gemini_get_prediction_settled_positions preserves 18-digit accountId/instrumentId precision', async () => {
  const response = {
    positions: [
      {
        accountId: 123456789012345678n,
        instrumentId: 987654321098765432n,
        instrumentSymbol: 'GEMI-A',
        payout: '100.00',
        outcome: 'yes',
      },
    ],
  };

  const tool = toolNamed(fakeClient(undefined, response), 'gemini_get_prediction_settled_positions');
  const result = await tool.handler(tool.inputSchema.parse({}));
  const text = textOf(result);

  assert.ok(text.includes('123456789012345678'), 'accountId must survive as the exact string');
  assert.ok(text.includes('987654321098765432'), 'instrumentId must survive as the exact string');
  assert.doesNotMatch(text, /123456789012345680/, 'must not silently round accountId to a nearby value');
});
