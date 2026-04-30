import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { GeminiHttpClient } from './client/http.js';
import { WebSocketManager } from './websocket/manager.js';
import { config } from './config.js';
import {
  createMarketTools,
  createOrderTools,
  createFundTools,
  createAccountTools,
  createMarginTools,
  createStakingTools,
  createPredictionTools,
  createWebSocketTools,
  createHybridTools,
} from './tools/index.js';
import type { ToolDefinition } from './tools/index.js';

export function createServer(): Server {
  const server = new Server(
    {
      name: 'gemini-mcp',
      version: '1.0.0',
    },
    {
      capabilities: { tools: {} },
      instructions:
        'This server provides access to the Gemini cryptocurrency exchange. ' +
        'Gemini offers prediction markets covering sports outcomes, crypto price trends, ' +
        'political events, and financial markets — in addition to spot trading, derivatives, ' +
        'staking, and account management. Prediction market symbols all start with "GEMI-" ' +
        '(e.g. GEMI-BTCUSD-...). ' +
        'The server includes real-time WebSocket support for live market data. ' +
        'Use gemini_ws_subscribe to start receiving real-time updates, then use gemini_ws_get_* tools ' +
        'for instant access to cached data without HTTP requests.',
    }
  );

  const client = new GeminiHttpClient();

  // Initialize WebSocket manager
  const wsManager = new WebSocketManager(config.wsUrl);

  // Start WebSocket connection in background
  wsManager.initialize().catch((err) => {
    console.error('[Server] WebSocket initialization failed:', err.message);
    console.error('[Server] WebSocket features will be unavailable until connection is established');
  });

  const allTools: ToolDefinition[] = [
    ...createMarketTools(client),
    ...createOrderTools(client),
    ...createFundTools(client),
    ...createAccountTools(client),
    ...createMarginTools(client),
    ...createStakingTools(client),
    ...createPredictionTools(client),
    ...createWebSocketTools(wsManager),
    ...createHybridTools(client, wsManager), // Smart fallback tools
  ];

  const toolMap = new Map<string, ToolDefinition>(allTools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
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

    const parsed = tool.inputSchema.safeParse(request.params.arguments ?? {});
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
