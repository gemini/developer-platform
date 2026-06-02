# Bot CLI Roadmap

## Purpose

Track the highest-value follow-on work for making Gemini Markets CLI a
world-class bot/operator trading CLI.

This roadmap is intentionally biased toward:
- autonomous strategy safety
- operator clarity
- recovery after failure
- standard machine-readable contracts

## Current State

Already strong:

- structured JSON output by default
- explicit auth lifecycle: `auth login`, `auth status`, `auth test`, `auth logout`
- operator preflight: `doctor`
- bot-safe readiness contract:
  - `readyForTrading`
  - `readyForTradingReason`
  - `blockingChecks`
- shell completions
- manpage generation
- custom machine-readable surfaces:
  - `spec`
  - `agent`
- WS-first execution with REST fallback

## Priority 1: Build Next

### 1. Reconcile Command Family

Status:
- proposed in [reconcile-feature.md](./reconcile-feature.md)

Why:
- state correctness gate for bots
- crash recovery
- restart safety
- drift detection

Command family:

```bash
gemini-markets reconcile orders
gemini-markets reconcile balances
gemini-markets reconcile positions
gemini-markets reconcile all
```

### 2. Profiles

Goal:
- support named runtime/auth contexts without env-var juggling

Examples:

```bash
gemini-markets profile create maker-prod
gemini-markets profile create sandbox-dev
gemini-markets profile use maker-prod
gemini-markets auth status --profile maker-prod
```

Why:
- multiple bots on one machine
- cleaner ops workflows
- clearer environment separation
- easier sub-strategy management

Suggested scope:
- named profile config
- environment selection
- auth selection
- optional output defaults
- explicit `--profile` flag on commands

### 3. Expand Doctor

Current `doctor` is already useful. Next version should expose more explicit
machine signals for supervisors and bot launch gates.

Add fields like:
- `rateLimitHeadroom`
- `streamHealthy`
- `streamStale`
- `authRefreshHealthy`
- `latencyBudgetOk`
- `clockSkewMs`

Add flags like:
- `--strict`
- `--json-schema`

Why:
- easier supervisor gating
- clearer incident diagnosis
- less guesswork for operators

## Priority 2: Strong Competitive Features

### 4. Stream Integrity and Recovery

Current state:
- heartbeats exist

Missing pieces:
- sequence-gap detection
- stale-stream detection
- explicit resync guidance
- machine-readable stream health contract

Why:
- bot correctness depends on trustworthy streams
- parity with stronger market-data/operator surfaces from Coinbase and Polymarket

Possible outputs:
- reconnect count
- last message age
- heartbeat lag
- stale reason
- gap detected boolean

### 5. OpenAPI + AsyncAPI Export

Current state:
- custom `spec`
- custom `agent`

Add:
- standard OpenAPI export
- standard AsyncAPI export for streaming surfaces

Why:
- easier integration with external tooling
- better ecosystem interoperability
- more competitive with Kalshi’s documentation surface

## Priority 3: Operator and Recovery Tooling

### 6. Execution Journal Export

Goal:
- append-only machine-readable event log for operators and bots

Useful events:
- order intent
- order accepted
- fill
- cancel
- reject
- auth transition
- reconnect
- reconcile drift

Why:
- incident review
- restart assistance
- better observability

### 7. Export Actual State

Goal:
- let bots bootstrap local state from exchange truth

Examples:

```bash
gemini-markets export state --resource orders -q
gemini-markets export state --resource balances -q
gemini-markets export state --resource all -q > state.json
```

Why:
- easier startup
- useful companion to `reconcile`

### 8. Dry-Run Expansion

Goal:
- every risky or multi-step operation should support `--dry-run` consistently

Why:
- safer automation
- easier testing
- more predictable operator workflows

## Only Build If Gemini API Supports It

### 9. Batch Order Create

Why:
- more efficient bot placement
- lower round-trip overhead

### 10. Amend / Replace Order

Why:
- better market-making ergonomics
- fewer cancel/recreate races

### 11. Subaccounts / Account Partitions

Why:
- stronger multi-strategy isolation
- clearer account-level operations

### 12. Venue-Native Execution Controls

Examples:
- self-trade prevention options
- order grouping / kill groups
- stronger account risk controls

## Proposed Build Order

1. `reconcile`
2. `profiles`
3. `doctor` expansion
4. stream integrity / stale detection
5. OpenAPI + AsyncAPI export
6. execution journal
7. export actual state
8. batch/amend/subaccounts if Gemini supports them

## Success Criteria

This CLI should eventually make it easy for a bot operator to answer:

1. Am I authenticated correctly?
2. Is the process safe to trade right now?
3. Does my local state still match exchange truth?
4. Is my stream healthy enough to trust?
5. Can I switch between multiple bot/runtime contexts safely?
6. Can I integrate this CLI into external tooling using standard schemas?

## Notes

- `reconcile` should remain stateless by default
- the CLI should not become the source of truth for strategy state
- mutation/remediation features should come after strong compare-only flows
