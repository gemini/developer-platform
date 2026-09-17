import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const specsDir = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(specsDir, "SOURCES.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

for (const entry of manifest.specs) {
  const response = await fetch(entry.url);
  if (!response.ok) throw new Error(`failed to fetch ${entry.url}: HTTP ${response.status}`);

  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const unchanged = entry.sha256 === sha256;
  const destination = join(specsDir, entry.path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);

  entry.sha256 = sha256;
  if (!unchanged) entry.fetchedAt = new Date().toISOString();
  console.log(`${unchanged ? "unchanged" : "updated"} ${entry.id} ${sha256}`);
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
