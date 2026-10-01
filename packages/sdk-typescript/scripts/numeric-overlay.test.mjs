import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { loadVendoredSpecText, specsRoot } from "./spec-sources.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const modelsPath = resolve(scriptDir, "../src/generated/market-data/models.ts");

function extensionLocations(document) {
  const locations = [];
  for (const [schema, schemaDocument] of Object.entries(document.components?.schemas ?? {})) {
    for (const [property, propertyDocument] of Object.entries(schemaDocument?.properties ?? {})) {
      if (propertyDocument?.["x-unsigned-int64"] === true) locations.push({ schema, property });
    }
  }
  return locations;
}

function generatedSchema(source, name) {
  const match = source.match(new RegExp(`(?:^|\\n)        ${name}: \\{(?<body>[\\s\\S]*?)(?:\\n        \\};)`));
  assert(match, `${name} schema must be present in generated market-data models`);
  return match.groups.body;
}

function locationKey({ schema, property }) {
  return `${schema}.${property}`;
}

test("numeric overlay declares the generated SDK numeric policy", async () => {
  const overlay = parse(await readFile(join(specsRoot(), "overlays", "numeric-types.yaml"), "utf8"));
  const [rest, predictionMarkets] = await Promise.all([
    loadVendoredSpecText("rest").then(parse),
    loadVendoredSpecText("predictionMarkets").then(parse),
  ]);
  const models = await readFile(modelsPath, "utf8");

  assert.equal(overlay.version, 1);
  for (const [name, group] of Object.entries(overlay)) {
    if (name === "version") continue;
    assert.ok(group && typeof group === "object", `${name} must be a rule group`);
    assert.ok(Array.isArray(group.appliesTo) && group.appliesTo.length > 0, `${name}.appliesTo must be non-empty`);
    assert.equal(new Set(group.appliesTo).size, group.appliesTo.length, `${name}.appliesTo must not contain duplicates`);
    assert.ok(group.appliesTo.every((language) => language === "go" || language === "typescript"), `${name}.appliesTo contains an unknown language`);
    if (!group.appliesTo.includes("typescript")) {
      assert.equal(typeof group.reason, "string", `${name}.reason must be a non-empty string`);
      assert.ok(group.reason.trim().length > 0, `${name}.reason must be a non-empty string`);
    }
  }

  const unsigned = overlay.unsignedIntegers;
  assert.ok(unsigned && Array.isArray(unsigned.locations), "unsignedIntegers.locations must be an array");
  for (const location of unsigned.locations) {
    assert.deepEqual(Object.keys(location).sort(), ["property", "schema"], "unsigned integer locations must only declare schema and property");
    assert.equal(typeof location.schema, "string", "unsigned integer location schema must be a string");
    assert.equal(typeof location.property, "string", "unsigned integer location property must be a string");
  }
  const declaredKeys = unsigned.locations.map(locationKey);

  const restLocations = extensionLocations(rest);
  const predictionMarketsLocations = extensionLocations(predictionMarkets);
  const specLocations = [...new Map([...restLocations, ...predictionMarketsLocations].map((location) => [locationKey(location), location])).values()];
  assert.deepEqual(
    [...declaredKeys].sort(),
    specLocations.map(locationKey).sort(),
    "unsignedIntegers.locations must exactly match x-unsigned-int64 properties in the vendored specs",
  );
  for (const location of unsigned.locations) {
    assert.equal(
      rest.components?.schemas?.[location.schema]?.properties?.[location.property]?.["x-unsigned-int64"],
      true,
      `${locationKey(location)} must be x-unsigned-int64:true in the REST spec`,
    );
  }

  assert.equal(overlay.decimalFormat.typescript.numberSchema, "number");
  assert.equal(overlay.decimalFormat.typescript.stringSchema, "string");
  assert.match(generatedSchema(models, "SymbolDetails"), /\btick_size\?: number;/, "SymbolDetails.tick_size must be number");
  assert.match(generatedSchema(models, "Trade"), /\bprice\?: string;/, "Trade.price must be string");
});
