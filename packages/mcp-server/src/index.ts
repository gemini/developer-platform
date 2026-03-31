import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { config } from './config.js';

function validateConfig(): void {
  if (!config.apiKey) {
    console.error('Error: GEMINI_API_KEY is not set.');
    console.error('Set it in your MCP client config under "env". See README for details.');
    process.exit(1);
  }
  if (!config.apiSecret) {
    console.error('Error: GEMINI_API_SECRET is not set.');
    console.error('Set it in your MCP client config under "env". See README for details.');
    process.exit(1);
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
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is running, listening on stdio
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
