# API contract conformance fixtures

This directory is the language-neutral wire contract for the Gemini SDKs. The
fixtures are deterministic, contain no credentials that grant access, and do
not call the network. A runner loads `manifest.json`, executes every case in
its listed suite, and asserts the observable request, response, decoded value,
or WebSocket frame described by that case.

## Manifest and layout

`manifest.json` is the single case enumeration. Each suite has an `id`, a
`kind`, and a list of case file names. A case is stored at
`conformance/<suite id>/<case>.json`; for example,
`http/errors/not-found-404-empty-body.json`. The top-level `exceptions` array
is the authoritative list of reviewed cross-SDK tolerances. It must contain
the same IDs as `specs/overlays/gemini-wire-exceptions.yaml`.

Runners enforce the contract in both directions: every manifest entry must
have exactly one JSON file, and every fixture JSON file (other than the
manifest itself) must be listed. They also reject a manifest that silently
shrinks coverage. Case-level `exceptions` references must be declared in the
wire-exceptions overlay, and overlay IDs must be represented in the manifest
(the overlay may intentionally declare an ID with no cases).

All files are UTF-8 JSON with LF line endings. Values that are significant on
the wire are represented as strings or raw JSON numbers in the fixture; a
runner must preserve number text rather than passing unsafe integers through a
platform-sized floating-point value.

## Case schemas

The five `kind` values are described below. Fields not marked optional are
required. `id` is always the full path `<suite id>/<case id>` and `kind` must
match its manifest suite.

### `hmacRequest`

```json
{
  "id": "http/hmac-requests/example",
  "kind": "hmacRequest",
  "credentials": { "apiKey": "...", "apiSecret": "..." },
  "nonce": { "mode": "monotonic", "value": "1700000000000" },
  "request": { "method": "POST", "path": "/v1/order/new", "body": {} },
  "expect": {
    "headers": ["X-GEMINI-APIKEY", "X-GEMINI-PAYLOAD", "X-GEMINI-SIGNATURE"],
    "apiKeyHeader": "...",
    "payload": { "request": "/v1/order/new", "nonce": "...", "fields": {} },
    "signature": { "algorithm": "HMAC-SHA384", "over": "payloadBase64", "encoding": "hex-lower" }
  },
  "exceptions": ["rest-nonce-json-type"]
}
```

`nonce.mode` is `monotonic` (the exact decimal `value` is supplied) or
`websocket` (no exact value is supplied). For a monotonic request, the runner
sends the request through the SDK's HTTP signing seam. Every expected header
must be present and non-empty; the API-key header must equal `apiKeyHeader`.
Base64-decode `X-GEMINI-PAYLOAD`, parse it losslessly, and assert `request`,
nonce decimal text (allowing optional JSON string quotes), and every declared
field's raw JSON value. The payload may contain only `request`, `nonce`, and
the declared fields. Recompute HMAC-SHA384 over the base64 payload text and
compare the lowercase hexadecimal signature. For `websocket` nonce cases,
assert that `X-GEMINI-PAYLOAD` decodes to the `X-GEMINI-NONCE` value, that the
nonce is ten decimal epoch-second digits, and that the signature verifies.

### `unsignedRequest`

```json
{
  "id": "http/unsigned-requests/example",
  "kind": "unsignedRequest",
  "operation": "marketData.getTicker",
  "input": { "symbol": "BTCUSD" },
  "expect": {
    "method": "GET",
    "path": "/v1/pubticker/BTCUSD",
    "query": {},
    "authHeaders": []
  }
}
```

`operation` identifies the SDK service wrapper. The runner invokes it with
`input` through a capturing HTTP transport and asserts method, path, query
values, and absence of authentication headers. Array query values are
repeated plain keys (not comma-joined); query object ordering is not
significant.

### `errorMapping`

```json
{
  "id": "http/errors/example",
  "kind": "errorMapping",
  "response": {
    "status": 403,
    "headers": { "content-type": "application/json" },
    "body": "{\"result\":\"error\",\"reason\":\"MissingRole\"}"
  },
  "expect": { "kind": "missing_role", "reason": "MissingRole" }
}
```

`response.body` is verbatim response text. Runners feed the status, headers,
and body through their SDK transport and map the canonical expected kinds:
`invalid_nonce`, `missing_nonce`, `invalid_signature`, `missing_role`,
`terms_required`, `insufficient_funds`, `rate_limited`, `order_not_found`,
`market_closed`, `not_found`, `service_error`, and `invalid_request`.
Observed status must match. If `reason` is present, it must be preserved on
the resulting error. The rate-limit case also has
`retryAfterSeconds` and requires the SDK's retry-after metadata to equal that
number (three seconds in the checked-in fixture).

### `jsonDecoding`

```json
{
  "id": "json/example",
  "kind": "jsonDecoding",
  "raw": "{\"v\":9007199254740993}",
  "field": "v",
  "expect": { "valueKind": "integer", "text": "9007199254740993" }
}
```

`raw` is the exact JSON input and `field` identifies the decoded value.
`valueKind` is `integer` or `decimal`. The runner decodes with its lossless
JSON path, or with the language's exact integer/decimal type, and renders the
value as the expected decimal text. Unsafe integers must never be rounded;
decimal strings and decimal JSON numbers must retain their exact value.

### `wsSubscription`

```json
{
  "id": "websocket/subscriptions/example",
  "kind": "wsSubscription",
  "stream": "trades",
  "symbol": "BTCUSD",
  "options": {},
  "expect": { "method": "SUBSCRIBE", "params": ["btcusd@trade"] },
  "exceptions": ["ws-subscription-id-scope"]
}
```

`stream` is one of `trades`, `bookTicker`, `depthUpdates`, `partialDepth`,
`contractStatus`, `orders`, `balances`, or `positions`. `symbol` is required
for symbol streams and omitted for global/private streams. `options` may
contain `intervalMs` (100 or 1000 as applicable), `levels` (5, 10, or 20), or
private `scope` (`account` or `session`). The runner maps the stream to the
SDK's typed call, captures the single wire frame, and asserts `method`, exact
`params`, and a positive integer `id`. It must acknowledge the request locally;
no network or wall-clock value is needed for this assertion.

### `wsEvent`

```json
{
  "id": "websocket/events/example",
  "kind": "wsEvent",
  "stream": "trades",
  "symbol": "BTCUSD",
  "frame": "{\"e\":\"trade\",\"s\":\"btcusd\"}",
  "expect": {
    "fields": {
      "s": { "text": "BTCUSD", "compare": "caseInsensitive" }
    }
  },
  "exceptions": ["ws-inbound-symbol-case"]
}
```

`frame` is verbatim inbound WebSocket JSON. `stream` selects the typed SDK
subscription and `expect.fields` names decoded wire fields. Each field has
expected rendered `text` and `compare` of `exact` or `caseInsensitive`.
Runners assert that events are delivered to the selected subscription; the
case-insensitive comparison is used only for the reviewed symbol-case
exception. Wide update IDs are compared by decimal text.

## Implementing another runner

A new SDK runner should iterate suites from `manifest.json` rather than
hard-code case names, load each case from its suite directory, and implement
all five schemas above. It should use an in-memory HTTP/WebSocket double,
perform independent signature verification, preserve raw numeric text, and
fail on missing, extra, or unlisted fixtures. It must also compare the
manifest exception IDs and every case exception reference with the reviewed
wire-exceptions overlay before executing behavioral cases.
