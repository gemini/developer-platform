import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRule } from './evaluator.js';
import type { AlertRule, AlertCategory } from './types.js';

const NOW = Date.parse('2026-05-07T12:00:00.000Z');

function rule<T extends Record<string, unknown>>(
  category: AlertCategory,
  params: T,
  overrides: Partial<AlertRule> = {},
): AlertRule {
  return {
    id: `r-${category}`,
    name: `${category} rule`,
    category,
    enabled: true,
    oneShot: false,
    cooldownMs: 60_000,
    params,
    createdAt: '2026-05-07T11:00:00.000Z',
    lastFiredAt: null,
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Gating: enabled, cooldown, oneShot, invalid params
// ----------------------------------------------------------------------------

test('gating: disabled rule never triggers', () => {
  const r = rule('price.threshold', { symbol: 'BTCUSD', direction: 'above', threshold: '1' }, {
    enabled: false,
  });
  const out = evaluateRule({
    rule: r,
    snapshot: { price: '99', timestamp: NOW },
    now: NOW,
  });
  assert.strictEqual(out.triggered, false);
  assert.strictEqual(out.skip, 'disabled');
});

test('gating: within cooldown is suppressed', () => {
  const lastFired = new Date(NOW - 30_000).toISOString();
  const r = rule(
    'price.threshold',
    { symbol: 'BTCUSD', direction: 'above', threshold: '1' },
    { lastFiredAt: lastFired },
  );
  const out = evaluateRule({
    rule: r,
    snapshot: { price: '99', timestamp: NOW },
    now: NOW,
  });
  assert.strictEqual(out.triggered, false);
  assert.strictEqual(out.skip, 'cooldown');
});

test('gating: cooldown elapsed allows re-fire', () => {
  const lastFired = new Date(NOW - 70_000).toISOString();
  const r = rule(
    'price.threshold',
    { symbol: 'BTCUSD', direction: 'above', threshold: '50' },
    { lastFiredAt: lastFired },
  );
  const out = evaluateRule({
    rule: r,
    snapshot: { price: '99', timestamp: NOW },
    now: NOW,
  });
  assert.strictEqual(out.triggered, true);
});

test('gating: oneShot already fired blocks regardless of cooldown', () => {
  const r = rule(
    'price.threshold',
    { symbol: 'BTCUSD', direction: 'above', threshold: '1' },
    { oneShot: true, lastFiredAt: new Date(NOW - 86_400_000).toISOString() },
  );
  const out = evaluateRule({ rule: r, snapshot: { price: '99', timestamp: NOW }, now: NOW });
  assert.strictEqual(out.skip, 'oneShot');
});

test('gating: invalid params returns invalid_params skip', () => {
  const r = rule('price.threshold', { symbol: 'BTCUSD' } as unknown as Record<string, unknown>);
  const out = evaluateRule({ rule: r, snapshot: { price: '99', timestamp: NOW }, now: NOW });
  assert.strictEqual(out.triggered, false);
  assert.strictEqual(out.skip, 'invalid_params');
});

// ----------------------------------------------------------------------------
// price.threshold
// ----------------------------------------------------------------------------

test('price.threshold above: triggers when price >= threshold', () => {
  const r = rule('price.threshold', { symbol: 'BTCUSD', direction: 'above', threshold: '50000' });
  assert.strictEqual(
    evaluateRule({ rule: r, snapshot: { price: '50000', timestamp: NOW }, now: NOW }).triggered,
    true,
  );
  assert.strictEqual(
    evaluateRule({ rule: r, snapshot: { price: '49999.99', timestamp: NOW }, now: NOW }).triggered,
    false,
  );
});

test('price.threshold below: triggers when price <= threshold', () => {
  const r = rule('price.threshold', { symbol: 'BTCUSD', direction: 'below', threshold: '50000' });
  assert.strictEqual(
    evaluateRule({ rule: r, snapshot: { price: '49999', timestamp: NOW }, now: NOW }).triggered,
    true,
  );
  assert.strictEqual(
    evaluateRule({ rule: r, snapshot: { price: '50000.01', timestamp: NOW }, now: NOW }).triggered,
    false,
  );
});

// ----------------------------------------------------------------------------
// price.percent_change
// ----------------------------------------------------------------------------

test('price.percent_change below: triggers on drop past threshold', () => {
  const r = rule('price.percent_change', {
    symbol: 'BTCUSD',
    direction: 'below',
    pct: 0.10,
    windowMs: 600_000,
  });
  // baseline 50000 → 49945 = -0.11%
  const triggered = evaluateRule({
    rule: r,
    snapshot: { price: '49945', baselinePrice: '50000', baselineAt: NOW - 600_000 },
    now: NOW,
  });
  assert.strictEqual(triggered.triggered, true);

  const notYet = evaluateRule({
    rule: r,
    snapshot: { price: '49975', baselinePrice: '50000', baselineAt: NOW - 600_000 },
    now: NOW,
  });
  assert.strictEqual(notYet.triggered, false);
});

test('price.percent_change above: triggers on rise past threshold', () => {
  const r = rule('price.percent_change', {
    symbol: 'BTCUSD',
    direction: 'above',
    pct: 1,
    windowMs: 600_000,
  });
  const triggered = evaluateRule({
    rule: r,
    snapshot: { price: '50500', baselinePrice: '50000', baselineAt: NOW - 600_000 },
    now: NOW,
  });
  assert.strictEqual(triggered.triggered, true);
});

test('price.absolute_change either: triggers on a move >= delta in any direction', () => {
  const r = rule('price.absolute_change', {
    symbol: 'BTCUSD',
    direction: 'either',
    delta: '10',
    windowMs: 60_000,
  });
  // Up move
  assert.strictEqual(
    evaluateRule({
      rule: r,
      snapshot: { price: '50015', baselinePrice: '50000', baselineAt: NOW - 60_000 },
      now: NOW,
    }).triggered,
    true,
  );
  // Down move
  assert.strictEqual(
    evaluateRule({
      rule: r,
      snapshot: { price: '49985', baselinePrice: '50000', baselineAt: NOW - 60_000 },
      now: NOW,
    }).triggered,
    true,
  );
  // Below threshold
  assert.strictEqual(
    evaluateRule({
      rule: r,
      snapshot: { price: '50005', baselinePrice: '50000', baselineAt: NOW - 60_000 },
      now: NOW,
    }).triggered,
    false,
  );
});

test('price.absolute_change above: only triggers on upward move >= delta', () => {
  const r = rule('price.absolute_change', {
    symbol: 'BTCUSD',
    direction: 'above',
    delta: '10',
    windowMs: 60_000,
  });
  assert.strictEqual(
    evaluateRule({
      rule: r,
      snapshot: { price: '50015', baselinePrice: '50000', baselineAt: NOW - 60_000 },
      now: NOW,
    }).triggered,
    true,
  );
  // 15-down: would trigger 'either' but not 'above'
  assert.strictEqual(
    evaluateRule({
      rule: r,
      snapshot: { price: '49985', baselinePrice: '50000', baselineAt: NOW - 60_000 },
      now: NOW,
    }).triggered,
    false,
  );
});

test('price.absolute_change below: only triggers on downward move >= delta', () => {
  const r = rule('price.absolute_change', {
    symbol: 'BTCUSD',
    direction: 'below',
    delta: '10',
    windowMs: 60_000,
  });
  assert.strictEqual(
    evaluateRule({
      rule: r,
      snapshot: { price: '49985', baselinePrice: '50000', baselineAt: NOW - 60_000 },
      now: NOW,
    }).triggered,
    true,
  );
  assert.strictEqual(
    evaluateRule({
      rule: r,
      snapshot: { price: '50015', baselinePrice: '50000', baselineAt: NOW - 60_000 },
      now: NOW,
    }).triggered,
    false,
  );
});

test('price.percent_change ignores zero baseline (avoid div-by-zero)', () => {
  const r = rule('price.percent_change', {
    symbol: 'BTCUSD',
    direction: 'above',
    pct: 0.1,
    windowMs: 60_000,
  });
  const out = evaluateRule({
    rule: r,
    snapshot: { price: '1', baselinePrice: '0', baselineAt: NOW - 60_000 },
    now: NOW,
  });
  assert.strictEqual(out.triggered, false);
});

// ----------------------------------------------------------------------------
// balance.change
// ----------------------------------------------------------------------------

test('balance.change delta above: triggers when balance rose by >= delta', () => {
  const r = rule('balance.change', { currency: 'USD', direction: 'above', delta: '1000' });
  const out = evaluateRule({
    rule: r,
    snapshot: { currency: 'USD', balance: '11000' },
    prev: { currency: 'USD', balance: '10000' },
    now: NOW,
  });
  assert.strictEqual(out.triggered, true);
});

test('balance.change delta below: triggers when balance fell by >= delta', () => {
  const r = rule('balance.change', { currency: 'USD', direction: 'below', delta: '500' });
  const out = evaluateRule({
    rule: r,
    snapshot: { currency: 'USD', balance: '9000' },
    prev: { currency: 'USD', balance: '10000' },
    now: NOW,
  });
  assert.strictEqual(out.triggered, true);
});

test('balance.change pct: triggers when relative move exceeds threshold', () => {
  const r = rule('balance.change', { currency: 'BTC', direction: 'above', pct: 5 });
  const out = evaluateRule({
    rule: r,
    snapshot: { currency: 'BTC', balance: '1.06' },
    prev: { currency: 'BTC', balance: '1.0' },
    now: NOW,
  });
  assert.strictEqual(out.triggered, true);
});

test('balance.change ignores wrong currency', () => {
  const r = rule('balance.change', { currency: 'USD', direction: 'above', delta: '1' });
  const out = evaluateRule({
    rule: r,
    snapshot: { currency: 'EUR', balance: '11000' },
    prev: { currency: 'EUR', balance: '10000' },
    now: NOW,
  });
  assert.strictEqual(out.triggered, false);
});

test('balance.change without prev does not trigger', () => {
  const r = rule('balance.change', { currency: 'USD', direction: 'above', delta: '1' });
  const out = evaluateRule({
    rule: r,
    snapshot: { currency: 'USD', balance: '11000' },
    now: NOW,
  });
  assert.strictEqual(out.triggered, false);
});

// ----------------------------------------------------------------------------
// order.filled
// ----------------------------------------------------------------------------

const liveOrder = {
  order_id: 'O1',
  symbol: 'BTCUSD',
  is_live: true,
  is_cancelled: false,
  executed_amount: '0.5',
  remaining_amount: '0.5',
  original_amount: '1.0',
};

const filledOrder = {
  ...liveOrder,
  is_live: false,
  executed_amount: '1.0',
  remaining_amount: '0',
};

test('order.filled triggers on transition from live to filled', () => {
  const r = rule('order.filled', { orderId: 'O1' });
  const out = evaluateRule({
    rule: r,
    snapshot: { orders: [filledOrder] },
    prev: { orders: [liveOrder] },
    now: NOW,
  });
  assert.strictEqual(out.triggered, true);
});

test('order.filled does not double-fire when prev already filled', () => {
  const r = rule('order.filled', { orderId: 'O1' });
  const out = evaluateRule({
    rule: r,
    snapshot: { orders: [filledOrder] },
    prev: { orders: [filledOrder] },
    now: NOW,
  });
  assert.strictEqual(out.triggered, false);
});

test('order.filled by symbol matches any matching order', () => {
  const r = rule('order.filled', { symbol: 'BTCUSD' });
  const out = evaluateRule({
    rule: r,
    snapshot: { orders: [filledOrder] },
    now: NOW,
  });
  assert.strictEqual(out.triggered, true);
});

test('order.filled ignores cancelled orders', () => {
  const r = rule('order.filled', { orderId: 'O1' });
  const out = evaluateRule({
    rule: r,
    snapshot: {
      orders: [{ ...filledOrder, is_cancelled: true, executed_amount: '0', remaining_amount: '0' }],
    },
    now: NOW,
  });
  assert.strictEqual(out.triggered, false);
});

// ----------------------------------------------------------------------------
// order.stop_triggered
// ----------------------------------------------------------------------------

test('order.stop_triggered fires on partially-filled stop that left book', () => {
  const r = rule('order.stop_triggered', { orderId: 'S1' });
  const stop = {
    order_id: 'S1',
    symbol: 'BTCUSD',
    is_live: false,
    is_cancelled: false,
    executed_amount: '0.3',
    remaining_amount: '0.7',
    original_amount: '1.0',
    stop_price: '49000',
  };
  const out = evaluateRule({
    rule: r,
    snapshot: { orders: [stop] },
    prev: { orders: [{ ...stop, is_live: true, executed_amount: '0' }] },
    now: NOW,
  });
  assert.strictEqual(out.triggered, true);
});

test('order.stop_triggered ignores non-stop orders', () => {
  const r = rule('order.stop_triggered', { orderId: 'O1' });
  const out = evaluateRule({
    rule: r,
    snapshot: { orders: [filledOrder] },
    prev: { orders: [liveOrder] },
    now: NOW,
  });
  assert.strictEqual(out.triggered, false);
});

// ----------------------------------------------------------------------------
// funding_rate.threshold
// ----------------------------------------------------------------------------

test('funding_rate.threshold triggers when rate breaches threshold', () => {
  const r = rule('funding_rate.threshold', {
    symbol: 'BTCPERP',
    direction: 'above',
    threshold: '0.01',
  });
  assert.strictEqual(
    evaluateRule({
      rule: r,
      snapshot: { symbol: 'BTCPERP', fundingRate: '0.012' },
      now: NOW,
    }).triggered,
    true,
  );
  assert.strictEqual(
    evaluateRule({
      rule: r,
      snapshot: { symbol: 'BTCPERP', fundingRate: '0.005' },
      now: NOW,
    }).triggered,
    false,
  );
});

// ----------------------------------------------------------------------------
// transfer.deposit_confirmed
// ----------------------------------------------------------------------------

const baseTransfer = {
  type: 'Deposit',
  status: 'Complete',
  currency: 'BTC',
  amount: '0.5',
  eid: 1001,
  timestampms: NOW - 1000,
};

test('transfer.deposit_confirmed fires for newly-confirmed deposit', () => {
  const r = rule('transfer.deposit_confirmed', { currency: 'BTC' });
  const out = evaluateRule({
    rule: r,
    snapshot: { transfers: [baseTransfer] },
    prev: { transfers: [] },
    now: NOW,
  });
  assert.strictEqual(out.triggered, true);
});

test('transfer.deposit_confirmed does not re-fire on already-seen eid', () => {
  const r = rule('transfer.deposit_confirmed', { currency: 'BTC' });
  const out = evaluateRule({
    rule: r,
    snapshot: { transfers: [baseTransfer] },
    prev: { transfers: [baseTransfer] },
    now: NOW,
  });
  assert.strictEqual(out.triggered, false);
});

test('transfer.deposit_confirmed without currency matches any deposit', () => {
  const r = rule('transfer.deposit_confirmed', {});
  const out = evaluateRule({
    rule: r,
    snapshot: { transfers: [{ ...baseTransfer, currency: 'ETH', eid: 2002 }] },
    prev: { transfers: [] },
    now: NOW,
  });
  assert.strictEqual(out.triggered, true);
});

test('transfer.deposit_confirmed ignores withdrawals', () => {
  const r = rule('transfer.deposit_confirmed', {});
  const out = evaluateRule({
    rule: r,
    snapshot: { transfers: [{ ...baseTransfer, type: 'Withdrawal' }] },
    prev: { transfers: [] },
    now: NOW,
  });
  assert.strictEqual(out.triggered, false);
});

// ----------------------------------------------------------------------------
// position.liquidation_risk
// ----------------------------------------------------------------------------

test('position.liquidation_risk triggers when remaining margin drops below threshold', () => {
  const r = rule('position.liquidation_risk', {
    symbol: 'BTCPERP',
    marginPctRemaining: 20,
  });
  assert.strictEqual(
    evaluateRule({
      rule: r,
      snapshot: { symbol: 'BTCPERP', marginPctRemaining: 15 },
      now: NOW,
    }).triggered,
    true,
  );
  assert.strictEqual(
    evaluateRule({
      rule: r,
      snapshot: { symbol: 'BTCPERP', marginPctRemaining: 25 },
      now: NOW,
    }).triggered,
    false,
  );
});

// ----------------------------------------------------------------------------
// prediction.settled
// ----------------------------------------------------------------------------

test('prediction.settled triggers on newly-settled event', () => {
  const r = rule('prediction.settled', { eventTicker: 'GEMI-BTCUSD-100K' });
  const out = evaluateRule({
    rule: r,
    snapshot: {
      events: [
        {
          id: 'e1',
          ticker: 'GEMI-BTCUSD-100K',
          status: 'settled',
          settlementValue: '0',
        },
      ],
    },
    prev: { events: [] },
    now: NOW,
  });
  assert.strictEqual(out.triggered, true);
});

test('prediction.settled does not re-fire on already-settled event', () => {
  const r = rule('prediction.settled', {});
  const settled = {
    id: 'e1',
    ticker: 'GEMI-BTCUSD-100K',
    status: 'settled',
    settlementValue: '0',
  };
  const out = evaluateRule({
    rule: r,
    snapshot: { events: [settled] },
    prev: { events: [settled] },
    now: NOW,
  });
  assert.strictEqual(out.triggered, false);
});

// ----------------------------------------------------------------------------
// Sanity: every category has a registry entry
// ----------------------------------------------------------------------------

test('every category in ALERT_CATEGORIES has a registered evaluator', async () => {
  const { ALERT_CATEGORIES } = await import('./types.js');
  const { getCategoryDef } = await import('./categories/index.js');
  for (const c of ALERT_CATEGORIES) {
    const def = getCategoryDef(c);
    assert.ok(def, `missing registry entry for ${c}`);
    assert.strictEqual(def.category, c);
  }
});
