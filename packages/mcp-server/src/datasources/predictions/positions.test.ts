import test from 'node:test';
import assert from 'node:assert/strict';
import type { SdkClient } from '../../client/sdk.js';
import * as predictions from './positions.js';

// A fake SDK client that records exactly what input object each datasource function
// forwarded to it, without touching the network. Unlike the legacy GeminiHttpClient
// fake this replaces, there's no query-param stringification to verify here — the SDK
// takes the parsed options object as-is and handles wire serialization itself.
interface Call {
  fn: 'getPositions' | 'getSettledPositions';
  input: unknown;
}

function fakeClient(getPositionsResponse: unknown = {}, getSettledPositionsResponse: unknown = {}) {
  const calls: Call[] = [];
  const client = {
    predictions: {
      getPositions: async (input?: unknown) => {
        calls.push({ fn: 'getPositions', input });
        return getPositionsResponse;
      },
      getSettledPositions: async (input?: unknown) => {
        calls.push({ fn: 'getSettledPositions', input });
        return getSettledPositionsResponse;
      },
    },
  } as unknown as SdkClient;
  return { client, calls };
}

// ----------------------------------------------------------------------------
// getPositions — forwards options straight through to the SDK, maps the
// response back onto the existing PositionsResponse/PredictionPosition shape
// ----------------------------------------------------------------------------

test('getPositions with no opts calls the SDK with an empty options object', async () => {
  const { client, calls } = fakeClient({ positions: [] });

  await predictions.getPositions(client);

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0]!.fn, 'getPositions');
  assert.deepStrictEqual(calls[0]!.input, {});
});

test('getPositions forwards eventTicker/limit/offset/sort unchanged — no stringification, that is the SDK\'s job now', async () => {
  const { client, calls } = fakeClient({ positions: [] });

  await predictions.getPositions(client, {
    eventTicker: 'FEDJAN26',
    limit: 25,
    offset: 10,
    sort: '-unrealizedPnl',
  });

  assert.deepStrictEqual(calls[0]!.input, {
    eventTicker: 'FEDJAN26',
    limit: 25,
    offset: 10,
    sort: '-unrealizedPnl',
  });
});

test('getPositions with offset: 0 forwards it, not treated as absent', async () => {
  const { client, calls } = fakeClient({ positions: [] });

  await predictions.getPositions(client, { offset: 0 });

  assert.deepStrictEqual(calls[0]!.input, { offset: 0 });
});

test('getPositions maps the SDK response onto the existing PositionsResponse shape', async () => {
  const { client } = fakeClient({
    positions: [
      {
        symbol: 'GEMI-A',
        instrumentId: 42n,
        totalQuantity: '10',
        avgPrice: '0.55',
        outcome: 'yes',
        contractMetadata: {
          contractId: 'c1',
          contractName: 'Contract One',
          eventTicker: 'FEDJAN26',
          eventName: 'Fed January',
          category: 'Politics',
        },
        // Extra fields the SDK exposes but the existing tool contract doesn't —
        // must be dropped, not passed through, to preserve today's output shape.
        quantityOnHold: '0',
        prices: { buy: { yes: '0.55' }, sell: { yes: '0.53' } },
      },
    ],
    total: 1,
  });

  const result = await predictions.getPositions(client);

  assert.deepStrictEqual(result, {
    positions: [
      {
        symbol: 'GEMI-A',
        instrumentId: '42',
        totalQuantity: '10',
        avgPrice: '0.55',
        outcome: 'yes',
        contractMetadata: {
          contractId: 'c1',
          contractName: 'Contract One',
          eventTicker: 'FEDJAN26',
          eventName: 'Fed January',
          category: 'Politics',
        },
      },
    ],
  });
});

test('getPositions converts an 18-digit bigint instrumentId to the exact string, not a rounded number', async () => {
  const { client } = fakeClient({
    positions: [
      {
        symbol: 'GEMI-A',
        instrumentId: 123456789012345678n,
        totalQuantity: '1',
        avgPrice: '0.5',
        outcome: 'yes',
      },
    ],
  });

  const result = await predictions.getPositions(client);

  assert.strictEqual(result.positions[0]!.instrumentId, '123456789012345678');
});

// ----------------------------------------------------------------------------
// getSettledPositions — same forwarding/mapping pattern, plus cashOuts and
// the roll-up totals
// ----------------------------------------------------------------------------

test('getSettledPositions with no opts calls the SDK with an empty options object', async () => {
  const { client, calls } = fakeClient(undefined, { positions: [] });

  await predictions.getSettledPositions(client);

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0]!.fn, 'getSettledPositions');
  assert.deepStrictEqual(calls[0]!.input, {});
});

test('getSettledPositions forwards all 7 opts unchanged, including withCashOuts as a real boolean', async () => {
  const { client, calls } = fakeClient(undefined, { positions: [] });

  await predictions.getSettledPositions(client, {
    eventTicker: 'FEDJAN26',
    limit: 50,
    offset: 5,
    sort: '-payout',
    search: 'fed',
    category: 'Politics',
    withCashOuts: true,
  });

  assert.deepStrictEqual(calls[0]!.input, {
    eventTicker: 'FEDJAN26',
    limit: 50,
    offset: 5,
    sort: '-payout',
    search: 'fed',
    category: 'Politics',
    withCashOuts: true,
  });
});

test('getSettledPositions with withCashOuts: false forwards the literal boolean false, not omitted', async () => {
  const { client, calls } = fakeClient(undefined, { positions: [] });

  await predictions.getSettledPositions(client, { withCashOuts: false });

  assert.deepStrictEqual(calls[0]!.input, { withCashOuts: false });
});

test('getSettledPositions with offset: 0 forwards it, not treated as absent', async () => {
  const { client, calls } = fakeClient(undefined, { positions: [] });

  await predictions.getSettledPositions(client, { offset: 0 });

  assert.deepStrictEqual(calls[0]!.input, { offset: 0 });
});

test('getSettledPositions does not fabricate absent roll-up totals', async () => {
  const { client } = fakeClient(undefined, {
    positions: [{ instrumentSymbol: 'GEMI-A', payout: '100.00' }],
    total: 1,
    // totalPayout/totalCostBasis/totalNetProfit deliberately absent, matching
    // how the real API omits fields it cannot compute rather than sending null.
  });

  const result = await predictions.getSettledPositions(client);

  // At this layer the mapper's return object always has these keys present with an
  // `undefined` value — it's wrapHandler's later JSON.stringify (tested at the tool
  // layer) that actually drops undefined-valued keys from the wire output. Checking
  // the value here is the correct assertion for a plain JS object.
  assert.strictEqual(result.totalPayout, undefined);
  assert.strictEqual(result.totalCostBasis, undefined);
  assert.strictEqual(result.totalNetProfit, undefined);
  assert.strictEqual(result.total, 1);
});

test('getSettledPositions converts 18-digit bigint accountId/instrumentId on both positions and cashOuts to exact strings', async () => {
  const { client } = fakeClient(undefined, {
    positions: [
      {
        accountId: 123456789012345678n,
        instrumentId: 987654321098765432n,
        instrumentSymbol: 'GEMI-A',
        payout: '100.00',
        outcome: 'yes',
      },
    ],
    cashOuts: [
      {
        accountId: 111111111111111111n,
        instrumentId: 222222222222222222n,
        instrumentSymbol: 'GEMI-B',
        timestamp: '2026-01-01T00:00:00Z',
        filledQuantity: '5',
        side: 'sell',
        proceeds: '25.00',
        costBasis: '20.00',
        netProfit: '5.00',
      },
    ],
  });

  const result = await predictions.getSettledPositions(client, { withCashOuts: true });

  assert.strictEqual(result.positions![0]!.accountId, '123456789012345678');
  assert.strictEqual(result.positions![0]!.instrumentId, '987654321098765432');
  assert.strictEqual(result.cashOuts![0]!.accountId, '111111111111111111');
  assert.strictEqual(result.cashOuts![0]!.instrumentId, '222222222222222222');
});
