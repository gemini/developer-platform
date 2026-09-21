import test from 'node:test';
import assert from 'node:assert/strict';
import type { SdkClient } from '../../client/sdk.js';
import { config } from '../../config.js';
import * as predictions from './market-data.js';

// Regression coverage for PREDICT-8871: `category`/`status` were sent as
// `category[]`/`status[]`, a key shape the live API silently ignores (it
// falls back to unfiltered results instead of erroring). Now that these calls
// go through the SDK, the assertion shifts from "the raw query string has no
// []" to "the input object handed to the SDK method has the plain key" — the
// SDK owns query serialization from here, but a regression that re-introduces
// a bracketed key name in this file would still slip the filter silently.
type PredictionsMethod = keyof SdkClient['predictions'];

interface Call {
  method: PredictionsMethod;
  input: unknown;
}

function fakeClient(response: unknown = {}) {
  const calls: Call[] = [];
  const record =
    (method: PredictionsMethod) =>
    async (input?: unknown) => {
      calls.push({ method, input });
      return response;
    };
  const client = {
    predictions: {
      listEvents: record('listEvents'),
      getEvent: record('getEvent'),
      getEventStrike: record('getEventStrike'),
      listNewlyListedEvents: record('listNewlyListedEvents'),
      listRecentlySettledEvents: record('listRecentlySettledEvents'),
      listUpcomingEvents: record('listUpcomingEvents'),
      getCategories: record('getCategories'),
      getVolumeMetrics: record('getVolumeMetrics'),
    },
  } as unknown as SdkClient;
  return { client, calls };
}

test('listEvents sends category/status as plain (unbracketed) input keys', async () => {
  const { client, calls } = fakeClient({ data: [], pagination: { limit: 50, offset: 0 } });

  await predictions.listEvents(client, { status: ['active'], category: ['Sports', 'Crypto'] });

  const call = calls[0]!;
  assert.strictEqual(call.method, 'listEvents');
  assert.deepStrictEqual(call.input, { status: ['active'], category: ['Sports', 'Crypto'] });
});

test('listUpcoming sends category as a plain (unbracketed) input key', async () => {
  const { client, calls } = fakeClient({ data: [] });

  await predictions.listUpcoming(client, { category: ['Sports'] });

  assert.strictEqual(calls[0]!.method, 'listUpcomingEvents');
  assert.deepStrictEqual(calls[0]!.input, { category: ['Sports'] });
});

test('listNewlyListed sends category as a plain (unbracketed) input key', async () => {
  const { client, calls } = fakeClient({ data: [] });

  await predictions.listNewlyListed(client, { category: ['Sports'] });

  assert.strictEqual(calls[0]!.method, 'listNewlyListedEvents');
  assert.deepStrictEqual(calls[0]!.input, { category: ['Sports'] });
});

test('listRecentlySettled sends category as a plain (unbracketed) input key', async () => {
  const { client, calls } = fakeClient({ data: [] });

  await predictions.listRecentlySettled(client, { category: ['Sports'] });

  assert.strictEqual(calls[0]!.method, 'listRecentlySettledEvents');
  assert.deepStrictEqual(calls[0]!.input, { category: ['Sports'] });
});

test('listCategories sends status as a plain (unbracketed) input key', async () => {
  const { client, calls } = fakeClient({ categories: [] });

  await predictions.listCategories(client, ['active']);

  assert.strictEqual(calls[0]!.method, 'getCategories');
  assert.deepStrictEqual(calls[0]!.input, { status: ['active'] });
});

test('getEvent passes the event ticker through as the path input', async () => {
  const { client, calls } = fakeClient({ id: 'evt-1', ticker: 'BTC100K2028' });

  const result = await predictions.getEvent(client, 'BTC100K2028');

  assert.strictEqual(calls[0]!.method, 'getEvent');
  assert.deepStrictEqual(calls[0]!.input, { eventTicker: 'BTC100K2028' });
  assert.deepStrictEqual(result, { id: 'evt-1', ticker: 'BTC100K2028' });
});

test('getEventStrike passes the event ticker through as the path input', async () => {
  const { client, calls } = fakeClient({ value: '87500.00', type: 'reference', availableAt: null });

  await predictions.getEventStrike(client, 'BTC05M2603271950');

  assert.strictEqual(calls[0]!.method, 'getEventStrike');
  assert.deepStrictEqual(calls[0]!.input, { eventTicker: 'BTC05M2603271950' });
});

test('getVolumeMetrics sends eventTicker plus any provided time range, without account when unset', async () => {
  const savedAccount = config.account;
  config.account = '';
  try {
    const { client, calls } = fakeClient({ eventTicker: 'FED260318', contracts: [] });

    await predictions.getVolumeMetrics(client, 'FED260318', { startTime: 1, endTime: 2 });

    assert.strictEqual(calls[0]!.method, 'getVolumeMetrics');
    assert.deepStrictEqual(calls[0]!.input, { eventTicker: 'FED260318', startTime: 1, endTime: 2 });
  } finally {
    config.account = savedAccount;
  }
});

test('getVolumeMetrics injects config.account into the request body, matching the legacy authenticatedPost behavior', async () => {
  const savedAccount = config.account;
  config.account = 'sub-account-1';
  try {
    const { client, calls } = fakeClient({ eventTicker: 'FED260318', contracts: [] });

    await predictions.getVolumeMetrics(client, 'FED260318');

    assert.deepStrictEqual(calls[0]!.input, { eventTicker: 'FED260318', account: 'sub-account-1' });
  } finally {
    config.account = savedAccount;
  }
});
