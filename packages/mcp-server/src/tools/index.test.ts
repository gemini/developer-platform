import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { annotationsFor, requiresConfirmation, sanitizeForLLM, wrapHandler } from './index.js';
import type { ToolDefinition, ToolMutation } from './index.js';

const MARKER_OPEN = '<tool-output server="gemini-mcp">';
const MARKER_CLOSE = '</tool-output>';

function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error(`expected a text content block, got: ${block?.type ?? 'none'}`);
  }
  return block.text;
}

test('wrapHandler wraps successful results in <tool-output> markers', async () => {
  const handler = wrapHandler(async () => ({ ok: true, value: 42 }));
  const result = await handler({} as z.infer<z.ZodAny>);
  const text = textOf(result);
  assert.ok(text.startsWith(MARKER_OPEN));
  assert.ok(text.endsWith(MARKER_CLOSE));
  assert.match(text, /"ok": true/);
  assert.match(text, /"value": 42/);
});

test('wrapHandler wraps errors in <tool-output> markers and sets isError', async () => {
  const handler = wrapHandler(async () => {
    throw new Error('boom');
  });
  const result = await handler({} as z.infer<z.ZodAny>);
  const text = textOf(result);
  assert.ok(text.startsWith(MARKER_OPEN));
  assert.ok(text.endsWith(MARKER_CLOSE));
  assert.match(text, /Error: boom/);
  assert.strictEqual((result as { isError?: boolean }).isError, true);
});

test('sanitizeForLLM strips ANSI escape sequences from strings', () => {
  const dirty = 'before\x1B[31mRED\x1B[0mafter';
  assert.strictEqual(sanitizeForLLM(dirty), 'beforeREDafter');
});

test('sanitizeForLLM strips C0/C1 control bytes but keeps tab/newline/CR', () => {
  const dirty = 'a\x00b\x07c\nd\te\rf\x7Fg';
  assert.strictEqual(sanitizeForLLM(dirty), 'abc\nd\te\rfg');
});

test('sanitizeForLLM strips Unicode bidi overrides (Trojan-Source)', () => {
  // U+202E RIGHT-TO-LEFT OVERRIDE used in Trojan-Source attacks
  const dirty = 'admin‮evil';
  assert.strictEqual(sanitizeForLLM(dirty), 'adminevil');
});

test('sanitizeForLLM caps long strings with a truncation marker', () => {
  const long = 'x'.repeat(5000);
  const out = sanitizeForLLM(long) as string;
  assert.ok(out.length < long.length);
  assert.match(out, /…\[truncated, \d+ chars omitted\]$/);
  // Cap is 2000 chars + suffix
  assert.ok(out.startsWith('x'.repeat(2000)));
});

test('sanitizeForLLM walks nested objects and arrays', () => {
  const input = {
    list: [{ msg: 'a\x00b' }, { msg: 'c\x07d' }],
    nested: { deep: { val: 'e\x1B[1mf' } },
    untouched: { n: 1, b: true, nil: null },
  };
  const out = sanitizeForLLM(input) as typeof input;
  assert.strictEqual(out.list[0]?.msg, 'ab');
  assert.strictEqual(out.list[1]?.msg, 'cd');
  assert.strictEqual(out.nested.deep.val, 'ef');
  assert.deepStrictEqual(out.untouched, { n: 1, b: true, nil: null });
});

test('sanitizeForLLM preserves numbers, booleans, null, undefined', () => {
  assert.strictEqual(sanitizeForLLM(42), 42);
  assert.strictEqual(sanitizeForLLM(true), true);
  assert.strictEqual(sanitizeForLLM(null), null);
  assert.strictEqual(sanitizeForLLM(undefined), undefined);
});

test('wrapHandler sanitizes nested response strings before serialization', async () => {
  const handler = wrapHandler(async () => ({
    transfer: { purpose: 'normal\x1B[31m red\x1B[0m text\x00\x07' },
  }));
  const result = await handler({} as z.infer<z.ZodAny>);
  const text = textOf(result);
  assert.doesNotMatch(text, /\x1B/);
  assert.doesNotMatch(text, /\x00/);
  assert.doesNotMatch(text, /\x07/);
  assert.match(text, /"purpose": "normal red text"/);
});

// ----------------------------------------------------------------------------
// Per-tool string cap override
// ----------------------------------------------------------------------------

test('wrapHandler truncates long strings at the default cap', async () => {
  const handler = wrapHandler(async () => ({ content: 'y'.repeat(5000) }));
  const text = textOf(await handler({} as z.infer<z.ZodAny>));
  assert.match(text, /…\[truncated, \d+ chars omitted\]/);
});

test('wrapHandler stringCap preserves legitimately long prose', async () => {
  // A terms-of-service document is the motivating case: truncating it at the
  // 2000 char default would leave the agent showing a partial agreement to
  // the user before they accept it.
  const terms = 'A'.repeat(30_000);
  const handler = wrapHandler(async () => ({ content: terms, version: 3 }), {
    stringCap: 40_000,
  });
  const text = textOf(await handler({} as z.infer<z.ZodAny>));

  assert.doesNotMatch(text, /truncated/);
  assert.ok(text.includes(terms));
});

test('a raised stringCap still strips control characters and bidi overrides', async () => {
  const dirty = `intro\x1B[31m\x00${'B'.repeat(3000)}‮evil`;
  const handler = wrapHandler(async () => ({ content: dirty }), { stringCap: 40_000 });
  const text = textOf(await handler({} as z.infer<z.ZodAny>));

  assert.doesNotMatch(text, /\x1B/);
  assert.doesNotMatch(text, /‮/);
  assert.ok(text.includes('B'.repeat(3000)), 'long content is kept under the raised cap');
  assert.ok(text.includes('introevil'.slice(0, 5)));
});

test('the cap override does not leak into error messages', async () => {
  const handler = wrapHandler(
    async () => {
      throw new Error('x'.repeat(5000));
    },
    { stringCap: 40_000 }
  );
  const result = await handler({} as z.infer<z.ZodAny>);
  assert.strictEqual((result as { isError?: boolean }).isError, true);
  assert.match(textOf(result), /…\[truncated, \d+ chars omitted\]/);
});

// ----------------------------------------------------------------------------
// Mutation kind -> annotations / confirmation gate
// ----------------------------------------------------------------------------

function toolWith(mutates?: ToolMutation): ToolDefinition {
  return {
    name: 'gemini_example',
    description: 'example',
    inputSchema: z.object({}),
    handler: wrapHandler(async () => ({})),
    ...(mutates ? { mutates } : {}),
  };
}

test('a read-only tool is annotated readOnly and is not confirm-gated', () => {
  const tool = toolWith();
  assert.deepStrictEqual(annotationsFor(tool), {
    title: 'gemini_example',
    readOnlyHint: true,
    destructiveHint: false,
  });
  assert.strictEqual(requiresConfirmation(tool), false);
});

test("a 'write' tool is neither readOnly nor destructive, and is not confirm-gated", () => {
  // Registering a canonical combo contract: changes state, moves no funds,
  // idempotent. Annotating it readOnly would be false; annotating it
  // destructive would prompt the user for a harmless call.
  const tool = toolWith('write');
  assert.deepStrictEqual(annotationsFor(tool), {
    title: 'gemini_example',
    readOnlyHint: false,
    destructiveHint: false,
  });
  assert.strictEqual(requiresConfirmation(tool), false);
});

test("a 'destructive' tool is annotated destructive and is confirm-gated", () => {
  const tool = toolWith('destructive');
  assert.deepStrictEqual(annotationsFor(tool), {
    title: 'gemini_example',
    readOnlyHint: false,
    destructiveHint: true,
  });
  assert.strictEqual(requiresConfirmation(tool), true);
});
