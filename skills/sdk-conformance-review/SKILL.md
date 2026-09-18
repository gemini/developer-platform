---
name: sdk-conformance-review
description: Review a Gemini SDK against checked-in OpenAPI and AsyncAPI contracts plus language-neutral conformance fixtures
argument-hint: "[sdk path] [language]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Review SDK conformance

Use this skill after changing an SDK, its generator, a transport/authentication path,
`specs/`, or `conformance/`. Use it before adding a new SDK so the new runner
implements the same behavioral contract instead of inventing a parallel fixture set.

The review produces an evidence-backed result: contract revision and digests, SDK
and language reviewed, commands run, fixture coverage, intentional exceptions, and
remaining findings. Do not report conformance from source inspection alone.

## Source precedence

Use these sources in this order:

1. `specs/SOURCES.json` and the verbatim files under `specs/` for structured REST,
   Prediction Markets, and WebSocket definitions.
2. `conformance/README.md`, `conformance/manifest.json`, and every fixture for the
   shared observable behavior.
3. `specs/overlays/numeric-types.yaml` for language-specific numeric policy and
   `specs/overlays/gemini-wire-exceptions.yaml` for reviewed divergences.
4. Package tests, generated output, and implementation comments.
5. Live developer documentation for narrative context only.

Never fetch a published specification during a review. `specs/refresh.mjs` is the
only command allowed to update contract bytes, and should run only when an explicit
contract refresh is part of the change. Dependency installation may use the package
registry when `node_modules` is absent; it is not a substitute for a spec refresh.
Never use real credentials or make live API/WebSocket calls for conformance.

## Workflow

### 1. Establish the review scope

1. Locate repository guidance (`AGENTS.md` or equivalent) and read the SDK package
   manifest, test commands, and generator entry points.
2. Identify the SDK path and language. Record the base revision and changed files.
3. Classify each changed file as contract, overlay, fixture, generated output,
   handwritten transport/service code, test runner, or documentation.
4. Treat generated files as outputs. Review the generator and its checked-in drift
   gate, not only the generated diff.

### 2. Verify the checked-in contract and fixture index

1. Read `specs/SOURCES.json`; confirm every listed path exists and the local bytes
   hash to its recorded `sha256`. A mismatch is a contract-integrity failure.
2. Confirm spec files keep verbatim bytes. The repository must pin spec line endings
   with `specs/** -text`; JSON fixtures and runner sources use LF.
3. Read `conformance/manifest.json` and `conformance/README.md`. There are six
   fixture kinds: `hmacRequest`, `unsignedRequest`, `errorMapping`, `jsonDecoding`,
   `wsSubscription`, and `wsEvent`.
4. Check both directions: every manifest case has exactly one JSON file, and every
   fixture JSON file is listed. Case `id` and `kind` must match the suite.
5. Compare manifest exception IDs with the wire-exceptions overlay. Every case
   exception reference must be declared, and every overlay case mapping must match
   the case references. Empty `cases` entries are intentional reviewed exceptions.
6. Do not relax a fixture to make a failing SDK pass. Fix the SDK, update the
   contract deliberately, or record a reviewed exception with concrete evidence.

### 3. Run the SDK's conformance gates

For the TypeScript SDK, from `packages/sdk-typescript`:

```bash
npm ci --ignore-scripts                 # only when dependencies are absent
npm test                                # includes drift, overlay, manifest, and six runners
npm run typecheck
npm run build
npm rebuild esbuild workerd --foreground-scripts
npm run verify:package
npm run verify:runtimes
```

`verify:runtimes` may report Deno skipped when Deno is not installed; record that
limitation. Run the focused suites while iterating, but report the complete suite
before declaring the review complete:

```bash
npx tsx --test src/tests/conformance/**/*.test.ts
npx tsx --test scripts/generated-drift.test.mjs scripts/numeric-overlay.test.mjs
```

For Go, from `packages/sdk-go`, use the repository's Make targets when the local
environment permits. Otherwise run their direct equivalents with the module's
required environment, including the conformance package, generator drift check,
`go vet`, the 32-bit compile, and release smoke test. For another language, use its
native formatter/typecheck/test/package commands and implement the same fixture
matrix; do not silently skip a kind.

### 4. Compare generated SDK surfaces with the specs

1. Build operation inventories from both OpenAPI documents. Compare operation IDs,
   HTTP methods, paths, access mode, parameters, query serialization, response
   modes/statuses/content types, and int64 paths with the generated registries.
2. Validate operation ownership. Every spec operation must be owned exactly once;
   no generated registry may contain an extra or missing operation.
3. Run the generated-drift gate from vendored spec IDs. A byte mismatch is a finding
   even when the runtime tests pass.
4. Compare generated model types with `numeric-types.yaml`: decimal string/number
   representations, exact integer handling, unsigned extensions, and language
   compatibility constraints. TypeScript must preserve unsafe JSON integers at the
   boundary without widening public declarations in an unreviewed breaking change.
5. Check public entry points, declaration output, package exports, and API snapshots.
   An intentional public change needs an explicit compatibility decision and a
   corresponding consumer-facing check.

### 5. Exercise the six behavioral fixture contracts

Use `conformance/README.md` as the assertion authority:

- **HMAC requests:** capture the HTTP/upgrade seam; require headers, decode the
  payload, preserve nonce and numeric text, reject undeclared fields, and independently
  recompute HMAC-SHA384 over the base64 payload.
- **Unsigned requests:** call the typed service wrapper through an in-memory HTTP
  transport; assert method, path, repeated/encoded query values, no request body when
  forbidden, and the exact authentication-header set.
- **Error mapping:** feed verbatim status/headers/body; assert status preservation,
  canonical error class/code, reason preservation, retry-after metadata, and safe
  serialized body behavior.
- **JSON decoding:** use the SDK's boundary parser or exact numeric type; prove unsafe
  integers are not rounded and decimal strings/numbers retain their contract value.
- **WebSocket subscriptions:** use an in-memory socket; capture one SUBSCRIBE frame,
  assert method/params and a positive integer ID, and locally acknowledge the frame.
- **WebSocket events:** inject verbatim frames into the selected typed stream; assert
  routing, decoded fields, exact wide IDs, and only the documented case-insensitive
  comparison exceptions.

A runner must derive its case list from the manifest, use deterministic in-memory
HTTP/WebSocket doubles, and independently verify signatures. Hard-coded case lists,
exact session IDs, or permissive comparisons that the fixture does not authorize are
runner defects.

### 6. Review transport and protocol code manually

Trace at least one representative path for each changed area:

- REST path/query rendering follows the OpenAPI style, explode, allowReserved, and
  repeated-array rules.
- Private payloads contain the endpoint request path, one auth-owned nonce, only
  declared caller fields, and signatures over the exact base64 text.
- Public requests do not accidentally receive private headers or bodies.
- Success response status/content type and file-vs-JSON mode follow the generated
  operation contract.
- Error parsing preserves documented reason/status metadata without logging secrets.
- WebSocket channel names, symbol normalization, upgrade authentication, subscribe
  acknowledgements, typed event routing, reconnect behavior, and wide numeric fields
  match the AsyncAPI wire names.
- Handwritten compatibility aliases are additive, idempotent, and covered by a
  consumer-observable test; never hand-edit generated output to hide drift.

### 7. Classify findings and choose the next action

For each discrepancy, record file/symbol, observed behavior, expected source or
fixture, severity, and a minimal reproduction.

- **Defect:** fix the SDK or runner, add a regression test when the bug is plausible,
  regenerate outputs, and rerun the affected plus complete gates.
- **Contract drift:** refresh only through `specs/refresh.mjs`, inspect operation,
  schema, and API-surface diffs, then regenerate all affected SDKs.
- **Reviewed exception:** keep it explicit in the wire-exceptions overlay and point
  to the fixture(s) and source lines; never hide it in a broad tolerance.
- **Coverage gap:** add a fixture for an important observable boundary or record a
  concrete follow-up. Do not claim full conformance from untested operations.
- **Environment limitation:** state the exact command and missing capability. Do not
  convert an unrun check into a pass.

### 8. Onboard a new SDK

A new SDK must add a test-only runner that:

1. Locates `conformance/manifest.json` by walking upward from the runner, so copied
   release trees work without checkout-depth assumptions.
2. Loads the manifest and overlay IDs, validates manifest/disk agreement in both
   directions, and iterates all six kinds without duplicating fixture files.
3. Uses in-memory HTTP/WebSocket doubles, no credentials with access, no network,
   independent signature verification, and exact numeric-text handling.
4. Exposes a package-specific command in CI and runs the same contract-integrity,
   conformance, generated-surface, typecheck, and packaging checks appropriate to
   that language.
5. Documents any deliberate language difference in the overlay and ties it to a
   fixture or an explicit empty-case exception.

## Review report format

Return a compact report with:

```text
SDK/language: ...
Contract manifest/digests: ...
Commands: ...
Fixture coverage: six kinds, N cases, all listed/unlisted checks ...
Generated surface: operation counts, drift result, API snapshot result ...
Reviewed exceptions: ...
Findings: severity | file/symbol | expected | observed | fixture/reproduction
Limitations: ...
```

Do not call the SDK conformant if a required command, fixture kind, generated drift
check, or contract-integrity check was skipped or failed.
