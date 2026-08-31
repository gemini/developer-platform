# Gemini Markets CLI

`gemini-markets` is a small command-line client for the Gemini exchange. It
uses the official [Go SDK](../sdk-go/README.md) for authentication, REST and
WebSocket transport, generated API models, and protocol behavior. The CLI owns
command-line parsing, validation, and table/JSON rendering; it does not copy
SDK protocol code.

## Status and command shape

The root command registers all groups shown below. Check
`gemini-markets --help` for the available commands.

```text
gemini-markets
├── version
├── completion
├── help
├── auth
│   ├── login
│   ├── logout
│   └── status
├── markets
│   ├── symbols
│   ├── ticker SYMBOL
│   ├── book SYMBOL
│   └── candles SYMBOL TIMEFRAME
├── prediction-markets
│   ├── list
│   ├── get EVENT_TICKER
│   └── terms
│       ├── show
│       ├── status
│       └── accept
├── stream
│   ├── trades SYMBOL
│   ├── ticker SYMBOL
│   ├── depth SYMBOL
│   ├── orders
│   ├── balances
│   └── positions
├── account
│   └── balances
└── orders
    ├── spot {place,list,get,cancel}
    └── prediction {place,list,cancel}
```

Global options are `--environment production|sandbox` (default
`production`), `--profile` (default `default`), and `--output table|json`
(default `table`). Public discovery commands can use an empty credential set;
terms status/acceptance, account and order commands, plus private streams,
require credentials accepted by the selected SDK service. Stream commands emit
NDJSON (one JSON event per line); the global `--output` flag does not apply to
streams.

`markets candles` accepts `1m`, `5m`, `15m`, `30m`, `1h`, `6h`, and `1d`.
The canonical API spellings `1hr`, `6hr`, and `1day` are also accepted; the CLI
normalizes the shorter forms before calling the SDK.
Spot orders are limit orders (or limit orders with `--option immediate-or-cancel`
for IOC); direct `exchange market` orders are not supported by this CLI.
Prediction-market terms are never accepted automatically: check
`prediction-markets terms status`, read `prediction-markets terms show`, and
invoke `prediction-markets terms accept --yes` explicitly when required before
placing an order.

Order placement supports `--dry-run`, which validates and renders the exact
request without loading credentials or contacting Gemini. In table mode, the
preview includes execution options such as IOC and maker-or-cancel. Stop-limit
orders are also checked locally against the side-specific trigger/limit price
relationship before either a preview or submission proceeds.

## Credentials

API commands resolve one complete credential family from the process
environment first, then the selected operating-system keyring profile. The
`auth` command group is the secure persistence boundary: its login and logout
flows use the operating-system keyring. Public requests work without
credentials. Never put secrets in source control or command-line arguments.

| Variable | Use |
| --- | --- |
| `GEMINI_API_KEY` | HMAC API key, with `GEMINI_API_SECRET` |
| `GEMINI_API_SECRET` | HMAC API secret, with `GEMINI_API_KEY` |
| `GEMINI_ACCESS_TOKEN` | OAuth/bearer access token |
| `GEMINI_BEARER_TOKEN` | Alias for `GEMINI_ACCESS_TOKEN` when the latter is unset |
| `GEMINI_REFRESH_TOKEN` | OAuth refresh token |
| `GEMINI_OAUTH_CLIENT_ID` | OAuth client ID; required with a refresh token |
| `GEMINI_OAUTH_CLIENT_SECRET` | Confidential OAuth client secret |

When both HMAC and token material are present, token authentication takes
precedence in the SDK session. A public request does not require credentials;
private requests should be run against the intended environment explicitly.
For private commands, set an access token alone or use `auth login`: refresh
tokens supplied through environment variables are rejected because a rotated
token cannot be persisted safely back to that source.

## Build and validate locally

Requirements: a checkout of the full repository and the Go version declared by
`packages/sdk-go/scripts/go.mod` (currently 1.25.13). The CLI module itself
uses the Go 1.23 language baseline, but the checked-in root `go.work` also
includes the SDK generator module and therefore sets the toolchain for
monorepo development.

The CLI's `go.mod` contains ordinary `v0.1.0` SDK requirements and no local
`replace` directives. Within this repository, the root workspace intentionally
resolves those imports to the sibling `packages/sdk-go` modules at the same
checkout. That keeps the CLI on the current monorepo SDK while preserving valid
module metadata. Run CLI development and release builds from the full checkout;
standalone `go install` is not a supported installation path yet.

From this directory:

```bash
make test
make race
make vet
make docs
make build                 # writes bin/gemini-markets
make check                 # all of the above, including gofmt and mod verify
```

Equivalent direct commands are:

```bash
go mod verify
go test ./...
go test -race ./...
go vet ./...
mkdir -p bin
go build -o bin/gemini-markets ./cmd/gemini-markets
```

`go doc ./internal/cli` is the documentation check used by CI. Network access
or a populated Go module cache may be needed on the first run to resolve the
SDK's dependencies.

## Release status

The CLI is pre-release: it is not available from the Go proxy, has no
published binary release, and is not ready for `go install`. There is no CLI
release workflow yet.

Both SDK modules are publicly available from `proxy.golang.org` at signed
`v0.1.0` tags:

```text
packages/sdk-go/v0.1.0
packages/sdk-go/websocket/gorilla/v0.1.0
```

This CLI also depends on newer SDK changes in the current checkout, including
OAuth token-update persistence and corrected service behavior. Those SDK
changes should be split into an SDK-first commit/PR and merged before the CLI,
so the SDK remains independently releasable. The CLI will continue to consume
the sibling SDK through `go.work`; publishing another SDK tag is only required
before supporting standalone module consumers outside the monorepo.

After the SDK prerequisite lands, design the CLI release workflow around
module-prefixed tags (for example,
`packages/gemini-markets-cli/v0.1.0`). Use a new signed, annotated tag on a
commit merged to `main`; never move a published version tag.

`.goreleaser.yml` is an OSS-compatible snapshot-build draft for Linux, macOS,
and Windows (`amd64` and `arm64`). Run it from this module directory; its
artifacts are written to the ignored `dist/` directory:

```bash
goreleaser release --config .goreleaser.yml --snapshot --clean
```

This snapshot uses the repository workspace and does not publish or imply
release readiness.
