import test from 'node:test';
import assert from 'node:assert/strict';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { SdkClient } from '../../client/sdk.js';
import { createPredictionComboTools } from './combos.js';
import { annotationsFor, requiresConfirmation } from '../index.js';

type ToolDefinition = ReturnType<typeof createPredictionComboTools>[number];

function toolNamed(tools: ToolDefinition[], name: string): ToolDefinition {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return t;
}

function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error(`expected a text content block, got: ${block?.type ?? 'none'}`);
  }
  return block.text;
}

// Requests never leave this test — every call is intercepted by the fake SDK client
// before it would reach the real @gemini-markets/sdk transport.
function fakeClient(
  createComboResponse: unknown = {
    alreadyExisted: false,
    combo: { id: 1n, instrumentRegistered: false, legCount: 0, canonicalLegKey: 'k', legs: [] },
  }
) {
  return {
    predictions: {
      listCombos: async () => ({ combos: [], pagination: { limit: 50, offset: 0 } }),
      getComboByInstrumentSymbol: async () => ({ contract: {}, legs: [] }),
      createCombo: async () => createComboResponse,
    },
  } as unknown as SdkClient;
}

const tools = createPredictionComboTools(fakeClient());

// ----------------------------------------------------------------------------
// gemini_create_prediction_combo — schema validation
// ----------------------------------------------------------------------------

const createCombo = toolNamed(tools, 'gemini_create_prediction_combo');

test('gemini_create_prediction_combo rejects a 1-leg array', () => {
  const result = createCombo.inputSchema.safeParse({
    legs: [{ contractId: '111', requiredOutcome: 'Yes' }],
  });
  assert.strictEqual(result.success, false);
});

test('gemini_create_prediction_combo rejects a 7-leg array', () => {
  const legs = Array.from({ length: 7 }, (_, i) => ({
    contractId: String(i + 1),
    requiredOutcome: 'Yes' as const,
  }));
  const result = createCombo.inputSchema.safeParse({ legs });
  assert.strictEqual(result.success, false);
});

test('gemini_create_prediction_combo accepts 2 and 6 leg arrays', () => {
  const two = createCombo.inputSchema.safeParse({
    legs: [
      { contractId: '111', requiredOutcome: 'Yes' },
      { contractId: '222', requiredOutcome: 'No' },
    ],
  });
  assert.strictEqual(two.success, true);

  const six = createCombo.inputSchema.safeParse({
    legs: Array.from({ length: 6 }, (_, i) => ({
      contractId: String(i + 1),
      requiredOutcome: 'Yes' as const,
    })),
  });
  assert.strictEqual(six.success, true);
});

test('gemini_create_prediction_combo rejects a legs array with a duplicate contractId', () => {
  const result = createCombo.inputSchema.safeParse({
    legs: [
      { contractId: '111', requiredOutcome: 'Yes' },
      { contractId: '111', requiredOutcome: 'No' },
    ],
  });
  assert.strictEqual(result.success, false);
});

test("gemini_create_prediction_combo rejects lowercase 'yes' — the capitalization regression guard", () => {
  // The gotcha: combo leg outcomes are capitalized 'Yes'/'No' on the wire,
  // unlike every other outcome field in this codebase ('yes'/'no' lowercase).
  // A lowercase value must fail validation here, not be silently coerced.
  const result = createCombo.inputSchema.safeParse({
    legs: [
      { contractId: '111', requiredOutcome: 'yes' },
      { contractId: '222', requiredOutcome: 'No' },
    ],
  });
  assert.strictEqual(result.success, false);
});

test("gemini_create_prediction_combo rejects lowercase 'no' too", () => {
  const result = createCombo.inputSchema.safeParse({
    legs: [
      { contractId: '111', requiredOutcome: 'Yes' },
      { contractId: '222', requiredOutcome: 'no' },
    ],
  });
  assert.strictEqual(result.success, false);
});

// ----------------------------------------------------------------------------
// mutates annotations — regression guard for the ticket-vs-code discrepancy:
// createCombo stays 'write'/no-confirm, it is NOT reclassified 'destructive'
// ----------------------------------------------------------------------------

test("gemini_create_prediction_combo has mutates === 'write' and no confirm field", () => {
  assert.strictEqual(createCombo.mutates, 'write');
  assert.notStrictEqual(createCombo.mutates, 'destructive');
  assert.notStrictEqual(createCombo.mutates, undefined);

  const annotations = annotationsFor(createCombo);
  assert.strictEqual(annotations.readOnlyHint, false);
  assert.strictEqual(annotations.destructiveHint, false);
  assert.strictEqual(requiresConfirmation(createCombo), false);

  const shape = (createCombo.inputSchema as unknown as { shape?: Record<string, unknown> }).shape;
  assert.ok(shape, 'expected inputSchema to be a ZodObject with a shape');
  assert.ok(!('confirm' in shape!), 'gemini_create_prediction_combo must not have a confirm field');
});

test('gemini_list_prediction_combos and gemini_get_prediction_combo are plain read-only tools', () => {
  const list = toolNamed(tools, 'gemini_list_prediction_combos');
  const get = toolNamed(tools, 'gemini_get_prediction_combo');

  assert.strictEqual(list.mutates, undefined);
  assert.strictEqual(get.mutates, undefined);

  assert.strictEqual(annotationsFor(list).readOnlyHint, true);
  assert.strictEqual(annotationsFor(get).readOnlyHint, true);
});

// ----------------------------------------------------------------------------
// Precision fixture — a comboId at 17-18 digits must survive as an exact
// string through the tool's output. The SDK hands this back as a real bigint
// (a bigint literal is exact in JS source, unlike a plain numeric literal past
// MAX_SAFE_INTEGER), and the datasource's mapper must stringify it rather than
// let it reach wrapHandler's JSON.stringify, which cannot serialize bigint at all.
// ----------------------------------------------------------------------------

test('a large comboId in combo.legs[0].comboId survives as an exact string through the tool output', async () => {
  const response = {
    alreadyExisted: false,
    combo: {
      canonicalLegKey: 'k',
      id: 1n,
      instrumentRegistered: false,
      legCount: 2,
      legs: [
        { comboId: 145828833218573125n, legIndex: 0, contractId: '111', requiredOutcome: 'Yes' },
        { comboId: 145828833218573125n, legIndex: 1, contractId: '222', requiredOutcome: 'No' },
      ],
    },
  };
  const toolsWithFixture = createPredictionComboTools(fakeClient(response));
  const combo = toolNamed(toolsWithFixture, 'gemini_create_prediction_combo');

  const parsed = combo.inputSchema.parse({
    legs: [
      { contractId: '111', requiredOutcome: 'Yes' },
      { contractId: '222', requiredOutcome: 'No' },
    ],
  });
  const result = await combo.handler(parsed);
  const text = textOf(result);

  assert.ok(!result.isError, `expected success, got: ${text}`);
  assert.match(text, /"comboId": "145828833218573125"/);
  assert.doesNotMatch(text, /145828833218573120/, 'comboId must not be silently truncated to a rounded value');
});

// ----------------------------------------------------------------------------
// Idempotency-shape fixture — alreadyExisted must be preserved distinguishably.
// ----------------------------------------------------------------------------

test('alreadyExisted: true is preserved in the tool output, not dropped or fabricated', async () => {
  const response = {
    alreadyExisted: true,
    combo: {
      canonicalLegKey: 'k',
      id: 42n,
      instrumentRegistered: true,
      instrumentSymbol: 'GEMI-COMBO-XYZ',
      legCount: 2,
      legs: [
        { comboId: 42n, legIndex: 0, contractId: '111', requiredOutcome: 'Yes' },
        { comboId: 42n, legIndex: 1, contractId: '222', requiredOutcome: 'No' },
      ],
    },
  };
  const toolsWithFixture = createPredictionComboTools(fakeClient(response));
  const combo = toolNamed(toolsWithFixture, 'gemini_create_prediction_combo');

  const parsed = combo.inputSchema.parse({
    legs: [
      { contractId: '111', requiredOutcome: 'Yes' },
      { contractId: '222', requiredOutcome: 'No' },
    ],
  });
  const result = await combo.handler(parsed);
  const text = textOf(result);

  assert.ok(!result.isError, `expected success, got: ${text}`);
  assert.match(text, /"alreadyExisted": true/);
  assert.doesNotMatch(text, /"alreadyExisted": false/);
});
