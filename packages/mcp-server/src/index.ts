import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { createSdkClient } from './client/sdk.js';
import { config } from './config.js';

function validateConfig(): void {
  const hasKey = Boolean(config.apiKey);
  const hasSecret = Boolean(config.apiSecret);

  if (hasKey !== hasSecret) {
    const missing = hasKey ? 'GEMINI_API_SECRET' : 'GEMINI_API_KEY';
    console.error(`Error: ${missing} is not set, but its counterpart is.`);
    console.error('Both GEMINI_API_KEY and GEMINI_API_SECRET must be provided together,');
    console.error('or omit both to run in public-only mode. See README for details.');
    process.exit(1);
  }

  if (!hasKey && !hasSecret) {
    console.error(
      'Warning: GEMINI_API_KEY and GEMINI_API_SECRET are not set. ' +
        'Public market data tools will work; authenticated tools (trading, balances, ' +
        'withdrawals, etc.) will return an error when called.'
    );
    return;
  }

  if (config.apiKey.startsWith('master-') && !config.account) {
    console.error('Error: GEMINI_ACCOUNT is required when using a Master API key.');
    console.error('Master API keys must specify which account to use (e.g. "primary").');
    console.error('Add GEMINI_ACCOUNT to your MCP client config under "env". See README for details.');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  validateConfig();
  const sdkClient = await createSdkClient();
  const server = createServer(sdkClient);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is running, listening on stdio
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
