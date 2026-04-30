import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { GeminiHttpClient } from './client/http.js';
import {
  createMarketTools,
  createOrderTools,
  createFundTools,
  createAccountTools,
  createMarginTools,
  createStakingTools,
  createPredictionTools,
} from './tools/index.js';
import type { ToolDefinition } from './tools/index.js';

export function createServer(): Server {
  const server = new Server(
    {
      name: 'gemini-mcp',
      version: '1.0.1',
    },
    {
      capabilities: { tools: {} },
      instructions:
        'This server provides access to the Gemini cryptocurrency exchange — spot trading, ' +
        'derivatives, staking, account management, and prediction markets. Prediction market ' +
        'symbols all start with "GEMI-" (e.g. GEMI-BTCUSD-...).\n\n' +
        'IMPORTANT — destructive actions: Several tools place orders, transfer funds, withdraw ' +
        'crypto/fiat, stake/unstake assets, or mass-cancel orders. These are IRREVERSIBLE. ' +
        'Before invoking any tool annotated with destructiveHint=true, you MUST present the ' +
        'user with a plain-language summary of the action — including the specific symbol, ' +
        'amount, side, and a dollar-quantified estimate of impact where possible — and obtain ' +
        'explicit confirmation. The server requires you to set `confirm: true` in the tool ' +
        'arguments to proceed; do this only AFTER the user has approved.\n\n'
    }
  );

  const client = new GeminiHttpClient();

  const allTools: ToolDefinition[] = [
    ...createMarketTools(client),
    ...createOrderTools(client),
    ...createFundTools(client),
    ...createAccountTools(client),
    ...createMarginTools(client),
    ...createStakingTools(client),
    ...createPredictionTools(client),
  ];

  const toolMap = new Map<string, ToolDefinition>(allTools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
      annotations: {
        title: t.name,
        readOnlyHint: !t.destructive,
        destructiveHint: !!t.destructive,
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolMap.get(request.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }

    const rawArgs = (request.params.arguments ?? {}) as Record<string, unknown>;

    if (tool.destructive && rawArgs.confirm !== true) {
      return {
        content: [
          {
            type: 'text',
            text:
              `This is a destructive, irreversible action (${tool.name}). ` +
              `Before retrying, present the user with a clear summary of the call — ` +
              `including symbol/amount/side and a dollar-quantified impact estimate ` +
              `where applicable — and obtain their explicit approval. Then call again ` +
              `with the same arguments plus \`confirm: true\`.`,
          },
        ],
        isError: true,
      };
    }

    const parsed = tool.inputSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        content: [{ type: 'text', text: `Invalid arguments: ${parsed.error.message}` }],
        isError: true,
      };
    }

    return tool.handler(parsed.data);
  });

  return server;
}
