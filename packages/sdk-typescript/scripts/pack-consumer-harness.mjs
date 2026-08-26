import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** Pack the SDK once for isolated consumer and runtime verification. */
export function packSdk(destination) {
  return JSON.parse(execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", destination, "--cache", join(destination, ".npm")],
    { encoding: "utf8", cwd: process.cwd() },
  ))[0];
}
