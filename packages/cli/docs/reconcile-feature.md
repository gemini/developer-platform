# Reconcile Feature Proposal

## Summary

Add a stateless `reconcile` command family that compares **bot-provided expected state**
with **live exchange state** and returns a machine-readable diff.

This is aimed at crash recovery, restart safety, drift detection, and pre-trade
state validation for autonomous strategies.

## Problem

Today the CLI can:
- authenticate
- inspect auth state
- run connectivity and readiness checks
- place, cancel, and inspect orders

But it cannot answer a critical bot question:

> Does my local trading state still match exchange truth?

Without that check, a strategy runner can:
- double-place orders after restart
- continue quoting after missed fills
- assume incorrect balances or positions
- resume execution with stale local state

## Goals

- Stateless by default
- JSON-first and bot-safe
- Works with `stdin`, files, or a directory of snapshots
- Returns explicit diffs for orders, balances, and positions
- Supports strict nonzero-exit mode for automation
- Does not require prior CLI-managed state

## Non-Goals

- No mandatory local database
- No hidden CLI-owned source of truth
- No automatic mutation in v1
- No requirement that the CLI originally placed the orders

## Command Surface

Top-level family:

```bash
gemini-markets reconcile orders
gemini-markets reconcile balances
gemini-markets reconcile positions
gemini-markets reconcile all
```

Primary inputs:

```bash
gemini-markets reconcile orders --stdin -q
gemini-markets reconcile balances --file expected-balances.json -q
gemini-markets reconcile positions --file expected-positions.json -q
gemini-markets reconcile all --dir state/ --strict -q
```

Recommended flags:

- `--stdin`
- `--file <path>`
- `--dir <path>` for `reconcile all`
- `--strict` exit nonzero on drift
- `--symbol <symbol>` narrow scope
- `--abs-tolerance <value>` for balances and positions
- `--pct-tolerance <value>` for balances and positions

Future flags, not v1:

- `--write-actual-out <path>`
- `--cancel-unexpected-orders`
- `--accept-partial-fills`

## Expected Input Model

The bot owns expected state. The CLI only verifies it.

Examples:

```text
state/
  orders.json
  balances.json
  positions.json
```

### Orders Input

Suggested fields:

```json
[
  {
    "clientOrderId": "mm-buy-101",
    "orderId": "12345",
    "symbol": "BTCUSD",
    "side": "buy",
    "price": "50000",
    "quantity": "0.01",
    "remaining": "0.01",
    "status": "open"
  }
]
```

Matching priority:

1. `clientOrderId`
2. `orderId`
3. stable composite fallback only if needed

### Balances Input

Suggested fields:

```json
[
  {
    "currency": "USD",
    "available": "4250.00",
    "total": "4250.00"
  }
]
```

### Positions Input

Suggested fields:

```json
[
  {
    "symbol": "GEMI-OSCARBP26-OSBP26ONEB",
    "quantity": "300",
    "side": "yes"
  }
]
```

## Output Contract

### Orders

Example:

```json
{
  "status": "drifted",
  "resource": "orders",
  "environment": "production",
  "summary": {
    "expected": 4,
    "actual": 5,
    "missing": 1,
    "unexpected": 2,
    "mismatched": 1
  },
  "missing": [
    {
      "clientOrderId": "mm-buy-101",
      "reason": "expected open order not found"
    }
  ],
  "unexpected": [
    {
      "orderId": "987",
      "symbol": "BTCUSD",
      "reason": "open on exchange but not in expected set"
    }
  ],
  "mismatched": [
    {
      "clientOrderId": "mm-sell-102",
      "fields": {
        "remaining": {
          "expected": "100",
          "actual": "40"
        }
      }
    }
  ]
}
```

### Balances / Positions

Same top-level shape, with per-field diffs and optional tolerance application.

### Reconcile All

Example:

```json
{
  "status": "drifted",
  "readyForNextAction": false,
  "environment": "production",
  "resources": {
    "orders": {
      "status": "drifted"
    },
    "balances": {
      "status": "ok"
    },
    "positions": {
      "status": "ok"
    }
  }
}
```

## Exit Behavior

Recommended:

- `0` when all compared resources are `ok`
- `1` on drift when `--strict` is set
- `1` on invalid input
- `1` on auth/network/exchange failure

Default non-strict mode should still emit drift in JSON while allowing operators
to inspect the result without treating it as a hard failure.

## Bot Usage Pattern

Recovery flow after restart:

```bash
gemini-markets auth test -q
gemini-markets doctor -q
gemini-markets reconcile all --dir state/ --strict -q
```

If `reconcile all` reports drift:

1. Stop execution
2. Read live exchange truth from the response
3. Update local strategy state
4. Recompute inventory and open-order intent
5. Resume trading only after state is consistent

## Architecture

Suggested packages:

- `internal/app/reconcile`
- `internal/contracts/reconcile.go`
- `internal/cmd/reconcile.go`

Suggested files:

```text
internal/app/reconcile/
  service.go
  orders.go
  balances.go
  positions.go
  diff.go
```

Responsibilities:

- `internal/cmd/reconcile.go`
  - Cobra wiring
  - input loading from stdin/file/dir
  - output rendering

- `internal/app/reconcile`
  - fetch live exchange truth
  - match expected vs actual
  - compute diffs
  - apply tolerance rules

- `internal/contracts/reconcile.go`
  - public request/response structs
  - machine-readable diff shapes

## Phased Rollout

### Phase 1

Read-only reconciliation:

- `reconcile orders`
- `reconcile balances`
- `reconcile positions`
- `reconcile all`
- `--stdin`, `--file`, `--dir`, `--strict`

### Phase 2

Operator convenience:

- `--write-actual-out`
- richer tolerances
- better summary/output for table mode

### Phase 3

Optional remediation helpers:

- `--cancel-unexpected-orders`
- `--refresh-local-state-out`

Mutation should remain opt-in and separate from the default compare-only flow.

## Open Questions

- Should `reconcile orders` compare only open orders, or support historical reconciliation too?
- Should partial fills be treated as mismatch by default, or separately classified?
- Should balances compare `available`, `total`, or both by default?
- Should `reconcile all` emit a flattened machine summary for easier CI gating?

## Recommendation

Implement Phase 1 first.

This feature has high leverage for bot safety because it adds a deterministic
state-correctness gate without forcing the CLI to own strategy state.
