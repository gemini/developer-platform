import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { sanitizeForLLM, wrapHandler } from './index.js';

const MARKER_OPEN = '<tool-output server="gemini-mcp">';
const MARKER_CLOSE = '</tool-output>';

function textOf(result: { content: { type: string; text: string }[] }): string {
  return result.content[0]!.text;
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
