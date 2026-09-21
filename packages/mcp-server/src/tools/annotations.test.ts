import test from 'node:test';
import assert from 'node:assert/strict';
import type { GeminiHttpClient } from '../client/http.js';
import type { SdkClient } from '../client/sdk.js';
import { annotationsFor, requiresConfirmation } from './index.js';
import type { ToolDefinition } from './index.js';
import { createMarketTools } from './market.js';
import { createOrderTools } from './orders.js';
import { createFundTools } from './funds.js';
import { createAccountTools } from './account.js';
import { createMarginTools } from './margin.js';
import { createStakingTools } from './staking.js';
import { createPredictionMarketDataTools } from './predictions/market-data.js';
import { createPredictionOrderTools } from './predictions/orders.js';
import { createPredictionPositionTools } from './predictions/positions.js';
import { createPredictionComboTools } from './predictions/combos.js';
import { createAlertTools } from './alerts.js';

// Tool construction only closes over the client; nothing calls it, so a stub
// is enough and no network or credentials are involved.
const client = {} as GeminiHttpClient;
const sdkClient = {} as SdkClient;

const allTools: ToolDefinition[] = [
  ...createMarketTools(client),
  ...createOrderTools(client),
  ...createFundTools(client),
  ...createAccountTools(client),
  ...createMarginTools(client),
  ...createStakingTools(client),
  ...createPredictionMarketDataTools(sdkClient),
  ...createPredictionOrderTools(client),
  ...createPredictionPositionTools(client),
  ...createPredictionComboTools(client),
  ...createAlertTools(),
];

// Every prediction-market tool, across all four PREDICT-8815 split factories.
// Without this exhaustive list, a read-only prediction tool silently dropped
// from one of the new factories (e.g. during a future edit to the split)
// would leave every other test in this suite green, since only
// destructive/write tools are separately enumerated below.
const EXPECTED_PREDICTION_TOOLS = [
  'gemini_list_prediction_events',
  'gemini_get_prediction_event',
  'gemini_get_prediction_event_strike',
  'gemini_list_newly_listed_prediction_events',
  'gemini_list_recently_settled_prediction_events',
  'gemini_list_upcoming_prediction_events',
  'gemini_list_prediction_categories',
  'gemini_get_prediction_volume_metrics',
  'gemini_place_prediction_order',
  'gemini_cancel_prediction_order',
  'gemini_place_prediction_order_batch',
  'gemini_cancel_prediction_order_batch',
  'gemini_get_prediction_active_orders',
  'gemini_get_prediction_order_history',
  'gemini_get_prediction_positions',
  'gemini_get_prediction_settled_positions',
  'gemini_list_prediction_combos',
  'gemini_get_prediction_combo',
  'gemini_create_prediction_combo',
].sort();

test('exactly the expected 19 prediction-market tools are present, across all four split factories', () => {
  const predictionTools = [
    ...createPredictionMarketDataTools(sdkClient),
    ...createPredictionOrderTools(client),
    ...createPredictionPositionTools(client),
    ...createPredictionComboTools(client),
  ]
    .map((t) => t.name)
    .sort();
  assert.deepStrictEqual(predictionTools, EXPECTED_PREDICTION_TOOLS);
});

// Every tool that moves funds or places/cancels an order on the exchange.
// This list is the regression guard for the `destructive: boolean` ->
// `mutates` migration: dropping a tool from it would silently publish a
// money-moving call as read-only and skip its confirmation prompt.
const EXPECTED_DESTRUCTIVE = [
  'gemini_cancel_all_active_orders',
  'gemini_cancel_all_session_orders',
  'gemini_cancel_order',
  'gemini_cancel_prediction_order',
  'gemini_cancel_prediction_order_batch',
  'gemini_clearing_broker_new_order',
  'gemini_clearing_new_order',
  'gemini_fiat_withdrawal',
  'gemini_internal_transfer',
  'gemini_new_order',
  'gemini_place_prediction_order',
  'gemini_place_prediction_order_batch',
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

// Tools that change real state but move no funds and aren't gated behind
// confirm. Mirrors EXPECTED_DESTRUCTIVE above: without this exhaustive list,
// a tool losing its `mutates: 'write'` field (e.g. gemini_add_bank, which
// registers a real bank account) would silently start publishing
// `readOnlyHint: true` with every other test in this suite still green.
const EXPECTED_WRITE = ['gemini_add_bank', 'gemini_create_prediction_combo'];

test('exactly the state-changing-but-not-destructive tools are annotated write', () => {
  const write = allTools
    .filter((t) => t.mutates === 'write')
    .map((t) => t.name)
    .sort();
  assert.deepStrictEqual(write, EXPECTED_WRITE);
});

test('every write tool publishes readOnlyHint: false and destructiveHint: false, and is not confirm-gated', () => {
  for (const name of EXPECTED_WRITE) {
    const tool = allTools.find((t) => t.name === name);
    assert.ok(tool, `${name} is missing from the tool list`);
    const a = annotationsFor(tool);
    assert.strictEqual(a.readOnlyHint, false, `${name} must not be annotated read-only`);
    assert.strictEqual(a.destructiveHint, false, `${name} must not be annotated destructive`);
    assert.strictEqual(requiresConfirmation(tool), false, `${name} must not require confirm`);
  }
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
