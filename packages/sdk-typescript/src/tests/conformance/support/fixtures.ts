import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import { parseLosslessJson } from "../../../transport/http.js";
import {
  isBoundaryObject,
  type BoundaryRecord,
} from "../../../utils/boundary-value.js";

export type ManifestSuite = {
  readonly id: string;
  readonly kind: string;
  readonly cases: readonly string[];
};

export type ConformanceManifest = {
  readonly version: number;
  readonly suites: readonly ManifestSuite[];
  readonly exceptions: readonly string[];
};

export type WireException = {
  readonly id: string;
  readonly cases?: readonly string[];
  readonly [key: string]: unknown;
};

export type FixtureCase = BoundaryRecord & {
  readonly id: string;
  readonly kind: string;
  readonly exceptions?: readonly string[];
};

/** Locate the repository's conformance directory without assuming a checkout depth. */
export function conformanceRoot(): string {
  const startDir = dirname(fileURLToPath(import.meta.url));
  let current = startDir;
  for (;;) {
    const root = join(current, "conformance");
    if (existsSync(join(root, "manifest.json"))) return root;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`conformance/manifest.json not found above ${startDir}`);
}

export async function loadManifest(): Promise<ConformanceManifest> {
  const manifest = JSON.parse(await readFile(join(conformanceRoot(), "manifest.json"), "utf8")) as ConformanceManifest;
  if (!manifest || typeof manifest !== "object") throw new Error("conformance manifest must be an object");
  if (manifest.version !== 1) throw new Error(`unsupported conformance manifest version: ${String(manifest.version)}`);
  if (!Array.isArray(manifest.suites)) throw new Error("conformance manifest suites must be an array");
  if (!Array.isArray(manifest.exceptions)) throw new Error("conformance manifest exceptions must be an array");
  return manifest;
}

export async function loadCase(suiteId: string, caseId: string): Promise<FixtureCase> {
  const path = join(conformanceRoot(), suiteId, `${caseId}.json`);
  const value = parseLosslessJson(await readFile(path, "utf8"));
  if (!isBoundaryObject(value)) throw new Error(`conformance case must be an object: ${suiteId}/${caseId}`);
  return value as FixtureCase;
}

export async function loadExceptions(): Promise<readonly WireException[]> {
  const root = dirname(conformanceRoot());
  const path = join(root, "specs", "overlays", "gemini-wire-exceptions.yaml");
  const document = parseYaml(await readFile(path, "utf8")) as { exceptions?: unknown } | null;
  if (!document || !Array.isArray(document.exceptions)) {
    throw new Error("wire exceptions overlay must contain an exceptions array");
  }
  return document.exceptions as WireException[];
}
