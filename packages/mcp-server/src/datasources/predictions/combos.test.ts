import test from 'node:test';
import assert from 'node:assert/strict';
import type { SdkClient } from '../../client/sdk.js';
import { listCombos, getCombo, createCombo } from './combos.js';

interface Call {
  fn: 'listCombos' | 'getComboByInstrumentSymbol' | 'createCombo';
  input: unknown;
}

function fakeClient(
  listCombosResponse: unknown = { combos: [], pagination: { limit: 50, offset: 0 } },
  getComboResponse: unknown = { contract: {}, legs: [] },
  createComboResponse: unknown = {
    alreadyExisted: false,
    combo: { id: 1n, instrumentRegistered: false, legCount: 0, canonicalLegKey: 'k', legs: [] },
  }
) {
  const calls: Call[] = [];
  const client = {
    predictions: {
      listCombos: async (input?: unknown) => {
        calls.push({ fn: 'listCombos', input });
        return listCombosResponse;
      },
      getComboByInstrumentSymbol: async (input?: unknown) => {
        calls.push({ fn: 'getComboByInstrumentSymbol', input });
        return getComboResponse;
      },
      createCombo: async (input?: unknown) => {
        calls.push({ fn: 'createCombo', input });
        return createComboResponse;
      },
    },
  } as unknown as SdkClient;
  return { client, calls };
}

// ----------------------------------------------------------------------------
// listCombos — forwards options to the SDK (contractId converted string→bigint),
// maps the response back onto the existing ListCombosResponse/ComboResponse shape
// ----------------------------------------------------------------------------

test('listCombos with no opts calls the SDK with every field present but undefined', async () => {
  const { client, calls } = fakeClient();

  await listCombos(client);

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0]!.fn, 'listCombos');
  assert.deepStrictEqual(calls[0]!.input, {
    status: undefined,
    contractId: undefined,
    instrumentRegistered: undefined,
    limit: undefined,
    offset: undefined,
  });
});

test('listCombos converts a large contractId string to bigint, never Number() (precision)', async () => {
  const { client, calls } = fakeClient();

  await listCombos(client, {
    status: 'Active',
    contractId: '123456789012345678',
    instrumentRegistered: true,
    limit: 10,
    offset: 5,
  });

  assert.deepStrictEqual(calls[0]!.input, {
    status: 'Active',
    contractId: 123456789012345678n,
    instrumentRegistered: true,
    limit: 10,
    offset: 5,
  });
});

test('listCombos forwards instrumentRegistered: false, not treated as absent', async () => {
  const { client, calls } = fakeClient();

  await listCombos(client, { instrumentRegistered: false });

  assert.strictEqual((calls[0]!.input as { instrumentRegistered?: boolean }).instrumentRegistered, false);
});

test('listCombos maps a bigint comboId on each leg to an exact string, and drops extra contract fields', async () => {
  const { client } = fakeClient({
    combos: [
      {
        contract: {
          contractId: 'c1',
          contractName: 'Contract One',
          eventTicker: 'FEDJAN26',
          eventName: 'Fed January',
          category: 'Politics',
          // Extra SDK-only field — must not leak into the mapped output.
          contractStatus: 'active',
        },
        legs: [
          {
            comboId: 123456789012345678n,
            legIndex: 0,
            contractId: '111',
            requiredOutcome: 'Yes',
          },
        ],
      },
    ],
    pagination: { limit: 50, offset: 0, total: 1 },
  });

  const result = await listCombos(client);

  assert.deepStrictEqual(result, {
    combos: [
      {
        contract: {
          contractId: 'c1',
          contractName: 'Contract One',
          eventTicker: 'FEDJAN26',
          eventName: 'Fed January',
          category: 'Politics',
        },
        legs: [
          {
            comboId: '123456789012345678',
            contract: undefined,
            contractId: '111',
            legIndex: 0,
            requiredOutcome: 'Yes',
            legOutcome: undefined,
            resolvedAt: undefined,
          },
        ],
      },
    ],
    pagination: { limit: 50, offset: 0, total: 1 },
  });
});

// ----------------------------------------------------------------------------
// getCombo — now calls getComboByInstrumentSymbol under the hood
// ----------------------------------------------------------------------------

test('getCombo calls the SDK with { instrumentSymbol }', async () => {
  const { client, calls } = fakeClient(undefined, { contract: {}, legs: [] });

  await getCombo(client, 'GEMI-COMBO-ABC123');

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0]!.fn, 'getComboByInstrumentSymbol');
  assert.deepStrictEqual(calls[0]!.input, { instrumentSymbol: 'GEMI-COMBO-ABC123' });
});

test('getCombo maps a bigint comboId to an exact string', async () => {
  const { client } = fakeClient(undefined, {
    contract: { contractId: 'c1', contractName: 'C1', eventTicker: 'E', eventName: 'E', category: 'Cat' },
    legs: [{ comboId: 987654321098765432n, legIndex: 0, contractId: '111', requiredOutcome: 'No' }],
  });

  const result = await getCombo(client, 'GEMI-COMBO-ABC123');

  assert.strictEqual(result.legs[0]!.comboId, '987654321098765432');
});

// ----------------------------------------------------------------------------
// createCombo — legs pass through verbatim (capitalized Yes/No preserved),
// response mapped through mapComboSummary
// ----------------------------------------------------------------------------

test('createCombo calls the SDK with { legs } and the exact legs array, capitalization intact', async () => {
  const { client, calls } = fakeClient();
  const legs: Array<{ contractId: string; requiredOutcome: 'Yes' | 'No' }> = [
    { contractId: '111', requiredOutcome: 'Yes' },
    { contractId: '222', requiredOutcome: 'No' },
  ];

  await createCombo(client, legs);

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0]!.fn, 'createCombo');
  assert.deepStrictEqual(calls[0]!.input, { legs });
});

test('createCombo maps a bigint combo.id and instrumentId to exact strings, preserves alreadyExisted', async () => {
  const { client } = fakeClient(undefined, undefined, {
    alreadyExisted: true,
    combo: {
      canonicalLegKey: 'k',
      id: 145828833218573125n,
      instrumentId: 999999999999999999n,
      instrumentRegistered: true,
      instrumentSymbol: 'GEMI-COMBO-XYZ',
      legCount: 2,
      legs: [
        { comboId: 145828833218573125n, legIndex: 0, contractId: '111', requiredOutcome: 'Yes' },
        { comboId: 145828833218573125n, legIndex: 1, contractId: '222', requiredOutcome: 'No' },
      ],
    },
  });

  const result = await createCombo(client, [
    { contractId: '111', requiredOutcome: 'Yes' },
    { contractId: '222', requiredOutcome: 'No' },
  ]);

  assert.strictEqual(result.alreadyExisted, true);
  assert.strictEqual(result.combo.id, '145828833218573125');
  assert.strictEqual(result.combo.instrumentId, '999999999999999999');
});
