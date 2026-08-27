/* global console, process */

// Generates TypeScript types for the WebSocket API.
//
// Usage: node scripts/generate-ws-types.mjs [outputDir] [specPath]
//   outputDir defaults to src/generated/websocket
//   specPath defaults to fetching from https://developer.gemini.com/specs/asyncapi/websocket.yaml
//
// Why a script instead of `asyncapi generate models`: the Gemini WS protocol
// uses case-distinct single-letter keys (e vs E, u vs U). Modelina's default
// camelCase naming convention lowercases them, collapsing e/E and u/U into one
// property and silently dropping a field. We override the property-key naming
// formatter to identity so keys are emitted verbatim. The CLI can't pass that
// override, so we drive Modelina as a library here.

import {
  TypeScriptGenerator,
  typeScriptDefaultPropertyKeyConstraints,
} from "@asyncapi/modelina";
import { parse } from "yaml";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { loadPublishedSpecText } from "./spec-sources.mjs";

const PUBLISHED_SPEC_URL = "https://developer.gemini.com/specs/asyncapi/websocket.yaml";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDirs = [process.argv[2] ?? join(root, "src", "generated", "websocket")].map(d => resolve(root, d));

async function loadSpec() {
  const specPath = process.argv[3];
  if (specPath?.startsWith("http://") || specPath?.startsWith("https://")) {
    return parse(await loadPublishedSpecText(specPath));
  }
  if (specPath) {
    return parse(readFileSync(resolve(specPath), "utf8"));
  }
  console.log(`Fetching spec from ${PUBLISHED_SPEC_URL}`);
  return parse(await loadPublishedSpecText(PUBLISHED_SPEC_URL));
}

// JSON Schema's default is `additionalProperties: true`. Modelina renders an
// explicit `additionalProperties: true` marker as a literal nested property,
// even when the object already declares its wire fields. Normalize only those
// redundant markers before generation; genuinely dictionary-shaped objects
// (objects without declared properties) retain their record type.
function normalizeOpenObjectMarkers(value) {
  if (Array.isArray(value)) return value.map(normalizeOpenObjectMarkers);
  if (value === null || typeof value !== "object") return value;

  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, normalizeOpenObjectMarkers(nested)]),
  );
  if (
    normalized.type === "object" &&
    normalized.additionalProperties === true &&
    normalized.properties &&
    Object.keys(normalized.properties).length > 0
  ) {
    delete normalized.additionalProperties;
  }
  return normalized;
}

const doc = normalizeOpenObjectMarkers(await loadSpec());
const defaultTypeMapping = TypeScriptGenerator.defaultOptions.typeMapping;

const generator = new TypeScriptGenerator({
  modelType: "interface",
  // WebSocket payloads are JSON objects, not JavaScript Map instances.
  mapType: "record",
  // `additionalProperties` is a JSON Schema keyword, not a wire-level field.
  // Keep genuinely dictionary-shaped objects (such as empty params objects),
  // but do not emit a misleading nested `additionalProperties` property on
  // otherwise-shaped messages.
  processorOptions: {
    jsonSchema: {
      ignoreAdditionalProperties: true,
    },
  },
  typeMapping: {
    ...defaultTypeMapping,
    // Keep untyped schema values safe at the public boundary. Callers must
    // narrow method-specific payloads instead of receiving an unsound any.
    Any() {
      return "unknown";
    },
    Integer(context) {
      if (context.constrainedModel.options.format === "int64") {
        const type = "number | bigint";
        return context.constrainedModel.options.isNullable
          ? `${type} | null`
          : type;
      }

      return defaultTypeMapping.Integer(context);
    },
  },
  constraints: {
    propertyKey: typeScriptDefaultPropertyKeyConstraints({
      // Keep wire keys verbatim (e/E, u/U). See header comment.
      NAMING_FORMATTER: (name) => name,
      // TS interface property keys may be reserved words as-is; don't let
      // Modelina rename `status` -> `reserved_status` etc.
      NO_RESERVED_KEYWORDS: (name) => name,
    }),
  },
});

const models = await generator.generate(doc);

// Guard: the whole reason this script exists is that Modelina's default naming
// drops case-distinct keys. Fail loudly if DepthUpdate ever loses one again.
const depthUpdate = models.find((m) => m.modelName === "DepthUpdate")?.result ?? "";
for (const key of ["e", "E", "s", "U", "u", "b", "a"]) {
  if (!new RegExp(`^\\s*${key}[?:]`, "m").test(depthUpdate)) {
    throw new Error(
      `generate-ws-types: DepthUpdate is missing wire key "${key}" — naming override regressed.`,
    );
  }
}
if (!/^\s*E:\s*number \| bigint;/m.test(depthUpdate)) {
  throw new Error(
    "generate-ws-types: DepthUpdate.E must stay widened for nanosecond int64 timestamps.",
  );
}

const banner =
  "// GENERATED by scripts/generate-ws-types.mjs from websocket.yaml — DO NOT EDIT.\n" +
  "// Regenerate: yarn ws:generate\n\n";
function refineKnownMethodLiterals(source) {
  return source
    .replace(
      /(export interface SubscribeRequest \{[\s\S]*?\n\s*method: )string(;)/,
      '$1"SUBSCRIBE" | "subscribe"$2',
    )
    .replace(
      /(export interface UnsubscribeRequest \{[\s\S]*?\n\s*method: )string(;)/,
      '$1"UNSUBSCRIBE" | "unsubscribe"$2',
    )
    .replace(
      /(export interface ListSubscriptionsRequest \{[\s\S]*?\n\s*method: )string(;)/,
      '$1"LIST_SUBSCRIPTIONS" | "list_subscriptions"$2',
    );
}

// Compatibility extension: live RFQ broadcasts include the underlying
// contract symbol on each leg. Keep this additive field in the generated
// public type while accepting older frames where it is omitted. Apply the
// extension after Modelina generation so unrelated anonymous schema names do
// not shift when the upstream schema changes.
function refineRfqLegSymbol(source) {
  const marker = "export interface RfqLeg {\n";
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error("generate-ws-types: RfqLeg interface is missing.");
  }
  const end = source.indexOf("\n}", start);
  if (end === -1) {
    throw new Error("generate-ws-types: RfqLeg interface is unterminated.");
  }
  const block = source.slice(start, end);
  if (/^\s*s\??:\s*string;/m.test(block)) return source;
  return `${source.slice(0, end)}\n  s?: string;${source.slice(end)}`;
}

// Modelina's library output doesn't prefix declarations with `export`; add it
// so the barrel file exports every type.
const body = refineRfqLegSymbol(
  refineKnownMethodLiterals(
    models
      .map((m) => m.result)
      .join("\n\n")
      .replace(/^(interface |enum |type )/gm, "export $1"),
  ),
);

if (/\bany\b/.test(body)) {
  throw new Error("generate-ws-types: generated output must not expose any.");
}
if (/\bMap\s*</.test(body)) {
  throw new Error("generate-ws-types: generated JSON objects must use Record, not Map.");
}
if (/^\s*additionalProperties\??:/m.test(body)) {
  throw new Error("generate-ws-types: additionalProperties must not be emitted as a wire field.");
}

for (const outDir of outDirs) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.ts"), banner + body + "\n");
  console.log(`Wrote ${models.length} model(s) to ${join(outDir, "index.ts")}`);
}
