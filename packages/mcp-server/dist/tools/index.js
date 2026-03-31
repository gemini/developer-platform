export function wrapHandler(handler) {
    return async (args) => {
        try {
            const result = await handler(args);
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: 'text', text: `Error: ${message}` }],
                isError: true,
            };
        }
    };
}
export { createMarketTools } from './market.js';
export { createOrderTools } from './orders.js';
export { createFundTools } from './funds.js';
export { createAccountTools } from './account.js';
export { createMarginTools } from './margin.js';
export { createStakingTools } from './staking.js';
