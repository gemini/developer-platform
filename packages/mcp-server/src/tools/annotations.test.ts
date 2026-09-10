import test from 'node:test';
import assert from 'node:assert/strict';
import type { GeminiHttpClient } from '../client/http.js';
import { annotationsFor, requiresConfirmation } from './index.js';
import type { ToolDefinition } from './index.js';
import { createMarketTools } from './market.js';
import { createOrderTools } from './orders.js';
import { createFundTools } from './funds.js';
import { createAccountTools } from './account.js';
import { createMarginTools } from './margin.js';
import { createStakingTools } from './staking.js';
import { createPredictionTools } from './predictions.js';
import { createAlertTools } from './alerts.js';

// Tool construction only closes over the client; nothing calls it, so a stub
// is enough and no network or credentials are involved.
const client = {} as GeminiHttpClient;

const allTools: ToolDefinition[] = [
  ...createMarketTools(client),
  ...createOrderTools(client),
  ...createFundTools(client),
  ...createAccountTools(client),
  ...createMarginTools(client),
  ...createStakingTools(client),
  ...createPredictionTools(client),
  ...createAlertTools(),
];

// Every tool that moves funds or places/cancels an order on the exchange.
// This list is the regression guard for the `destructive: boolean` ->
// `mutates` migration: dropping a tool from it would silently publish a
// money-moving call as read-only and skip its confirmation prompt.
const EXPECTED_DESTRUCTIVE = [
  'gemini_cancel_all_active_orders',
  'gemini_cancel_order',
  'gemini_clearing_broker_new_order',
  'gemini_clearing_new_order',
  'gemini_fiat_withdrawal',
  'gemini_internal_transfer',
  'gemini_new_order',
  'gemini_place_prediction_order',
  'gemini_stake',
  'gemini_unstake',
  'gemini_withdraw',
];

test('exactly the money-moving tools are annotated destructive', () => {
  const destructive = allTools
    .filter((t) => annotationsFor(t).destructiveHint)
    .map((t) => t.name)
    .sort();
  assert.deepStrictEqual(destructive, EXPECTED_DESTRUCTIVE);
});

test('every destructive tool is confirm-gated and every other tool is not', () => {
  for (const tool of allTools) {
    assert.strictEqual(
      requiresConfirmation(tool),
      EXPECTED_DESTRUCTIVE.includes(tool.name),
      `${tool.name} confirmation gate does not match its destructive annotation`
    );
  }
});

test('every destructive tool exposes a confirm field so the gate is satisfiable', () => {
  for (const name of EXPECTED_DESTRUCTIVE) {
    const tool = allTools.find((t) => t.name === name);
    assert.ok(tool, `${name} is missing from the tool list`);
    const shape = (tool.inputSchema as unknown as { shape?: Record<string, unknown> }).shape;
    assert.ok(shape && 'confirm' in shape, `${name} has no confirm field in its input schema`);
  }
});

test('readOnlyHint and destructiveHint are never both true', () => {
  for (const tool of allTools) {
    const a = annotationsFor(tool);
    assert.ok(
      !(a.readOnlyHint && a.destructiveHint),
      `${tool.name} is annotated both read-only and destructive`
    );
    assert.strictEqual(a.title, tool.name);
  }
});

test('tool names are unique and namespaced', () => {
  const names = allTools.map((t) => t.name);
  assert.strictEqual(new Set(names).size, names.length, 'duplicate tool name');
  for (const name of names) {
    assert.match(name, /^gemini_[a-z0-9_]+$/);
  }
});
