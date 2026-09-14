import test from 'node:test';
import assert from 'node:assert/strict';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// config.ts snapshots process.env when the module is first imported, so the
// credentials have to be in place before the module graph loads — hence the
// dynamic imports below (same technique as client/http.request.test.ts).
// node:test runs each test file in its own process, so this cannot leak into
// other suites.
process.env.GEMINI_API_KEY = 'test-api-key';
process.env.GEMINI_API_SECRET = 'test-api-secret';
process.env.GEMINI_API_BASE_URL = 'https://api.gemini.invalid';
delete process.env.GEMINI_ACCOUNT;

const { GeminiHttpClient } = await import('../client/http.js');
const { createPredictionTools } = await import('./predictions.js');
const { annotationsFor, requiresConfirmation } = await import('./index.js');
type ToolDefinition = ReturnType<typeof createPredictionTools>[number];

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

function stubFetch(body: string, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(body, { status })) as unknown as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const client = new GeminiHttpClient();
const tools = createPredictionTools(client);

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
// mutates annotations
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
// string through the tool's output, same technique as
// client/http.request.test.ts's int64-precision test.
// ----------------------------------------------------------------------------

test('a large comboId in combo.legs[0].comboId survives as an exact string through the tool output', async () => {
  // Raw JSON text, not JSON.stringify of an object literal: an 18-digit
  // literal in JS source is already truncated before the parser runs.
  const raw =
    '{"alreadyExisted":false,"combo":{"canonicalLegKey":"k","id":1,' +
    '"instrumentRegistered":false,"legCount":2,' +
    '"legs":[{"comboId":145828833218573125,"contractId":"111","requiredOutcome":"Yes"},' +
    '{"comboId":145828833218573125,"contractId":"222","requiredOutcome":"No"}]}}';
  const f = stubFetch(raw);
  try {
    const parsed = createCombo.inputSchema.parse({
      legs: [
        { contractId: '111', requiredOutcome: 'Yes' },
        { contractId: '222', requiredOutcome: 'No' },
      ],
    });
    const result = await createCombo.handler(parsed);
    const text = textOf(result);

    assert.ok(!result.isError, `expected success, got: ${text}`);
    assert.match(text, /"comboId": "145828833218573125"/);
    assert.doesNotMatch(text, /145828833218573120/, 'comboId must not be silently truncated to a rounded value');
  } finally {
    f.restore();
  }
});

// ----------------------------------------------------------------------------
// Idempotency-shape fixture — alreadyExisted must be preserved distinguishably.
// ----------------------------------------------------------------------------

test('alreadyExisted: true is preserved in the tool output, not dropped or fabricated', async () => {
  const raw =
    '{"alreadyExisted":true,"combo":{"canonicalLegKey":"k","id":42,' +
    '"instrumentRegistered":true,"instrumentSymbol":"GEMI-COMBO-XYZ","legCount":2,' +
    '"legs":[{"contractId":"111","requiredOutcome":"Yes"},{"contractId":"222","requiredOutcome":"No"}]}}';
  const f = stubFetch(raw);
  try {
    const parsed = createCombo.inputSchema.parse({
      legs: [
        { contractId: '111', requiredOutcome: 'Yes' },
        { contractId: '222', requiredOutcome: 'No' },
      ],
    });
    const result = await createCombo.handler(parsed);
    const text = textOf(result);

    assert.ok(!result.isError, `expected success, got: ${text}`);
    assert.match(text, /"alreadyExisted": true/);
    assert.doesNotMatch(text, /"alreadyExisted": false/);
  } finally {
    f.restore();
  }
});

