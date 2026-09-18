#!/usr/bin/env node
// Manual, local smoke check for the @gemini-markets/sdk client wired up in
// src/client/sdk.ts — mirrors packages/sdk-typescript's own smoke:sandbox scripts and
// the plan doc's "Public-only SDK client smoke test" / "Authenticated HMAC request smoke
// test" checks. Not CI-gated; run it by hand (`npm run smoke:sdk`) against sandbox
// before relying on this client in a downstream migration ticket.
import { createSdkClient } from '../src/client/sdk.js';
import { config } from '../src/config.js';

async function main(): Promise<void> {
  // Mutate the already-loaded config singleton directly (same pattern this package's
  // own tests use) rather than setting process.env, since config snapshots env vars at
  // import time — too late to affect it from within this same process.
  config.sdkEnv = 'sandbox';

  console.log('[smoke:sdk] constructing SDK client against sandbox...');
  const client = await createSdkClient();

  console.log('[smoke:sdk] public call: predictions.getCategories()');
  const categories = await client.predictions.getCategories();
  console.log(`[smoke:sdk] OK — received ${JSON.stringify(categories).length} bytes`);

  if (config.apiKey && config.apiSecret) {
    console.log('[smoke:sdk] authenticated call: predictions.getPositions()');
    const positions = await client.predictions.getPositions();
    console.log(`[smoke:sdk] OK — received ${JSON.stringify(positions).length} bytes`);
  } else {
    console.log('[smoke:sdk] no GEMINI_API_KEY/GEMINI_API_SECRET set — skipping authenticated call');
  }

  client.close();
  console.log('[smoke:sdk] done');
}

main().catch((err) => {
  console.error('[smoke:sdk] FAILED:', err);
  process.exit(1);
});
