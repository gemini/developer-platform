#!/usr/bin/env node
// Manual, local smoke check for the @gemini-markets/sdk client wired up in
// src/client/sdk.ts — mirrors packages/sdk-typescript's own smoke:sandbox scripts and
// the plan doc's "Public-only SDK client smoke test" / "Authenticated HMAC request smoke
// test" checks. Not CI-gated; run it by hand (`npm run smoke:sdk`) with credentials set
// (GEMINI_API_KEY/GEMINI_API_SECRET) before relying on this client in a downstream
// migration ticket — required, not optional, so a run never silently skips the one thing
// this script exists to prove: that HmacAuth actually round-trips against a real Gemini
// account, not just that the request headers look right locally.
//
// Targets whichever environment is already configured (GEMINI_SDK_ENV, default
// production) — set GEMINI_SDK_ENV=sandbox to run against sandbox instead. The one
// authenticated call this makes (getPositions) is read-only regardless of environment.
import { createSdkClient } from '../src/client/sdk.js';
import { config } from '../src/config.js';

// The SDK normalizes schema-declared int64 fields (e.g. positions[].instrumentId) to
// bigint, which plain JSON.stringify cannot serialize at all — it throws, not just
// loses precision. This logging script only needs a human-readable value, not a
// round-trippable one, so stringify each bigint rather than avoiding serialization
// entirely.
function stringifySafe(value: unknown): string {
  return JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val));
}

async function main(): Promise<void> {
  if (!config.apiKey || !config.apiSecret) {
    console.error(
      '[smoke:sdk] FAILED: GEMINI_API_KEY and GEMINI_API_SECRET must both be set — this ' +
        'script exists specifically to prove an authenticated call works, so it refuses to ' +
        'run public-only.'
    );
    process.exit(1);
  }

  console.log(`[smoke:sdk] constructing SDK client against ${config.sdkEnv}...`);
  const client = await createSdkClient();

  console.log('[smoke:sdk] public call: predictions.getCategories()');
  const categories = await client.predictions.getCategories();
  console.log(`[smoke:sdk] OK — received ${stringifySafe(categories).length} bytes`);

  console.log('[smoke:sdk] authenticated call (read-only): predictions.getPositions()');
  const positions = await client.predictions.getPositions();
  console.log(`[smoke:sdk] OK — received ${stringifySafe(positions).length} bytes`);
  console.log(`[smoke:sdk] positions payload: ${stringifySafe(positions)}`);

  client.close();
  console.log(`[smoke:sdk] done — authenticated call succeeded against ${config.sdkEnv}`);
}

main().catch((err) => {
  console.error('[smoke:sdk] FAILED:', err);
  process.exit(1);
});
