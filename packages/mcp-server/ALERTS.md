# Alerts

The alerts subsystem lets a user say "notify me when BTC drops 1%" and get a
native OS notification — even when no chat session is active. Rules persist to
disk and are evaluated by a long-running daemon registered with the OS service
supervisor (launchd / systemd --user / Task Scheduler).

This doc covers setup and the rule reference. For the internals (daemon,
supervisor, IPC, evaluator) read the source under [src/alerts/](src/alerts/).

## Quick start

```text
1.  gemini_alert_setup            # probe OS notifications, install macOS sender
2.  gemini_alert_daemon_install   # register the daemon with launchd/systemd/etc.
3.  gemini_alert_categories       # discover rule shapes (only needed once)
4.  gemini_alert_create           # create a rule
5.  gemini_alert_test             # fire a synthetic notification to verify
```

After step 2, the daemon runs in the background and survives reboots. Rules
created via `gemini_alert_create` are picked up by the daemon without a
restart — the tool sends a reload signal via IPC.

## Example queries

What a user might say to the assistant, and which tools get called. The
assistant is expected to ask `gemini_alert_categories` whenever it does not
already know the `params` shape for a category.

### First-time setup

> "Set up native alerts on this machine."

`gemini_alert_setup` → `gemini_alert_daemon_install`. After install,
`gemini_alert_daemon_status` confirms the supervisor unit is loaded and the
daemon is running.

> "Did the alerts daemon come up?"

`gemini_alert_daemon_status`.

> "I just rotated my API key — pick up the new one."

`gemini_alert_daemon_reload_config`. Re-bakes the whitelisted env vars into
the supervisor unit and restarts the daemon.

> "Turn off background alerts."

`gemini_alert_daemon_uninstall`. Rules remain on disk; reinstall to resume.

### Creating rules

> "Notify me when BTC drops below $50,000."

`gemini_alert_create` with `category: "price.threshold"`,
`params: { symbol: "BTCUSD", direction: "below", threshold: "50000" }`.

> "Alert me if ETH moves more than 2% in 10 minutes."

`gemini_alert_create` with `category: "price.percent_change"`,
`params: { symbol: "ETHUSD", direction: "either", pct: 2, windowMs: 600000 }`.
(If `direction: "either"` is not yet supported for percent_change, the
assistant creates two rules — one `above`, one `below`.)

> "Tell me if BTC moves $500 in either direction in the next minute."

`gemini_alert_create` with `category: "price.absolute_change"`,
`params: { symbol: "BTCUSD", direction: "either", delta: "500", windowMs: 60000 }`.

> "Ping me if my USD balance falls by more than $1,000."

`gemini_alert_create` with `category: "balance.change"`,
`params: { currency: "USD", direction: "below", delta: "1000" }`.

> "Let me know when order 12345 fills."

`gemini_alert_create` with `category: "order.filled"`,
`params: { orderId: "12345" }`, typically with `oneShot: true` so the rule
auto-disables after firing.

> "Wake me up if my BTC perp position is within 20% of liquidation."

`gemini_alert_create` with `category: "position.liquidation_risk"`,
`params: { symbol: "BTCPERP", marginPctRemaining: 20 }`.

> "Tell me when my BTC deposit confirms."

`gemini_alert_create` with `category: "transfer.deposit_confirmed"`,
`params: { currency: "BTC" }`, usually `oneShot: true`.

> "Alert me when the BTCPERP funding rate goes above 1%."

`gemini_alert_create` with `category: "funding_rate.threshold"`,
`params: { symbol: "BTCPERP", direction: "above", threshold: "0.01" }`.

> "Notify me when any prediction market settles."

`gemini_alert_create` with `category: "prediction.settled"`, `params: {}`.
Add `eventTicker` to scope to a specific event.

### Managing existing rules

> "Show me my active alerts."

`gemini_alert_list`. Returns each rule with its `lastFiredAt` timestamp.

> "What is alert ‘btc-floor’ configured to do?"

`gemini_alert_get` with the rule id.

> "Pause the BTC floor alert."

`gemini_alert_update` with `{ enabled: false }`.

> "Change the BTC floor alert to $45,000."

`gemini_alert_update` with `params: { ..., threshold: "45000" }`.

> "Stop alerting me about ETH price."

`gemini_alert_delete` (or `gemini_alert_update` with `enabled: false` if the
user wants to keep the rule for later).

### Diagnostics

> "Send a test notification to make sure alerts are working."

`gemini_alert_test` against any rule id — fires the notifier path without
waiting for the trigger condition.

> "What alerts have fired today?"

`gemini_alert_history` with a reasonable `limit`. Reads the tail of
`~/.gemini-mcp/alerts.log`.

> "Why hasn't my BTC alert fired?"

The assistant typically combines `gemini_alert_get` (confirm rule is enabled
and `params` are right), `gemini_alert_daemon_status` (confirm the daemon is
running and the symbol is subscribed), and `gemini_alert_history` (check for
recent fires that were suppressed by cooldown).

## Tool reference

The MCP server exposes 13 alert tools, all prefixed `gemini_alert_`.

### Setup / lifecycle

| Tool | Purpose |
|---|---|
| `gemini_alert_setup` | Probe OS notification health, install the macOS sender app bundle (so toasts show the Gemini icon), send one test toast. Call before `gemini_alert_daemon_install`. |
| `gemini_alert_daemon_install` | Register the daemon as an OS-supervised service. Bakes the current shell's `GEMINI_*` env vars into the unit. |
| `gemini_alert_daemon_uninstall` | Stop and remove the service. On macOS also removes the sender app bundle. |
| `gemini_alert_daemon_status` | Supervisor state (installed/running/PID) plus the daemon's own uptime / fired count / subscribed symbols. |
| `gemini_alert_daemon_reload_config` | Re-bake env vars into the unit and restart. Run after rotating `GEMINI_API_KEY`. |

### Rule CRUD

| Tool | Purpose |
|---|---|
| `gemini_alert_categories` | List supported rule categories with their `params` JSON schema, a working example, the upstream datasource, and default poll cadence. |
| `gemini_alert_create` | Create a rule. `params` is validated against the category-specific schema. |
| `gemini_alert_list` | List all rules with their `lastFiredAt` timestamps. |
| `gemini_alert_get` | Get one rule by id. |
| `gemini_alert_update` | Update name / enabled / params / cooldown / oneShot. |
| `gemini_alert_delete` | Delete a rule. |

### Diagnostics

| Tool | Purpose |
|---|---|
| `gemini_alert_test` | Fire a synthetic notification for a given rule, bypassing the trigger condition. Verifies the rule → notifier → OS path end-to-end. |
| `gemini_alert_history` | Read the last N fired events from the audit log. |

## Rule reference

Each rule has a `category` plus a category-specific `params` object. Call
`gemini_alert_categories` for the canonical JSON schemas; the table below is
the human-readable summary.

| Category | Datasource | Default poll | What it does |
|---|---|---|---|
| `price.threshold` | WebSocket | push | Symbol crosses a fixed price threshold. |
| `price.percent_change` | WebSocket | push | Symbol moves by `pct` percent within `windowMs`. Rolling baseline re-arms after each fire. |
| `price.absolute_change` | WebSocket | push | Symbol moves by absolute `delta` (price units) within `windowMs`. `direction: "either"` fires on any move. |
| `balance.change` | REST | 60s | Account balance for `currency` rises or falls by absolute `delta` or relative `pct`. |
| `order.filled` | REST | 10s | A matching order transitions to fully-filled. Match by orderId, clientOrderId, or symbol. |
| `order.stop_triggered` | REST | 10s | A stop order leaves the book with `executed_amount > 0`. |
| `funding_rate.threshold` | REST | 5m | Perpetual funding rate for `symbol` crosses a threshold. |
| `transfer.deposit_confirmed` | REST | 60s | A deposit reaches confirmed status. Optional `currency` filter. |
| `position.liquidation_risk` | REST | 30s | Remaining margin for `symbol` drops at or below `marginPctRemaining` percent. |
| `prediction.settled` | REST | 5m | A prediction market event settles. Optional `eventTicker` filter. |

### Example params (one per category)

```jsonc
// price.threshold
{ "symbol": "BTCUSD", "direction": "below", "threshold": "50000" }

// price.percent_change — 0.1% over 10 minutes
{ "symbol": "BTCUSD", "direction": "below", "pct": 0.1, "windowMs": 600000 }

// price.absolute_change — $500 move in either direction over 60s
{ "symbol": "BTCUSD", "direction": "either", "delta": "500", "windowMs": 60000 }

// balance.change — USD balance falls by $1,000
{ "currency": "USD", "direction": "below", "delta": "1000" }

// order.filled — any BTCUSD order
{ "symbol": "BTCUSD" }

// order.stop_triggered
{ "symbol": "BTCUSD" }

// funding_rate.threshold
{ "symbol": "BTCPERP", "direction": "above", "threshold": "0.01" }

// transfer.deposit_confirmed — BTC only
{ "currency": "BTC" }

// position.liquidation_risk — fire when <= 20% margin remaining
{ "symbol": "BTCPERP", "marginPctRemaining": 20 }

// prediction.settled — any settled event
{}
```

## Rule shape

Beyond `category` and `params`, `gemini_alert_create` accepts:

| Field | Default | Meaning |
|---|---|---|
| `name` | required | Human label shown in notifications and the audit log. |
| `enabled` | `true` | Set `false` to keep the rule but pause evaluation. |
| `oneShot` | `false` | Auto-disable the rule after it fires once. |
| `cooldownMs` | 5 minutes (`300_000`) | Minimum time between consecutive fires of the same rule. |

## File locations

| Path | Contents |
|---|---|
| `~/.gemini-mcp/alerts.json` | Persisted rules. Hand-edit at your own risk; the daemon picks up changes on reload. |
| `~/.gemini-mcp/alerts.log` | Append-only audit log of fired events. Source for `gemini_alert_history`. |

The supervisor unit (launchd plist / systemd unit / Task Scheduler entry) is
written to the platform's standard per-user location. `gemini_alert_daemon_status`
reports the concrete path.

## Credentials

The supervisor bakes a whitelisted set of env vars into the unit at install time:

- `GEMINI_API_KEY`
- `GEMINI_API_SECRET`
- `GEMINI_ACCOUNT`
- `GEMINI_API_BASE_URL`
- `GEMINI_WS_URL`
- `PATH`

Other env vars from the install-time shell are intentionally not inherited.
After rotating `GEMINI_API_KEY`, run `gemini_alert_daemon_reload_config` to
re-bake and restart — the daemon does not pick up env changes otherwise.
