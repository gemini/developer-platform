import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { GeminiHttpClient } from './client/http.js';
import { createMarketTools, createOrderTools, createFundTools, createAccountTools, createMarginTools, createStakingTools, } from './tools/index.js';
export function createServer() {
    const server = new Server({ name: 'gemini-agents', version: '1.0.0' }, { capabilities: { tools: {} } });
    const client = new GeminiHttpClient();
    const allTools = [
        ...createMarketTools(client),
        ...createOrderTools(client),
        ...createFundTools(client),
        ...createAccountTools(client),
        ...createMarginTools(client),
        ...createStakingTools(client),
    ];
    const toolMap = new Map(allTools.map((t) => [t.name, t]));
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
