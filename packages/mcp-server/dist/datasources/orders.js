import { getTicker } from './market.js';
export async function newOrder(client, symbol, amount, price, side, type, options, clientOrderId) {
    const body = { symbol, amount, price, side, type };
    if (options)
        body['options'] = options;
    if (clientOrderId)
        body['client_order_id'] = clientOrderId;
    try {
        return await client.authenticatedPost('/v1/order/new', body);
    }
    catch (err) {
        const isInvalidOrderType = err instanceof Error && err.message.includes('InvalidOrderType');
        const isMarketOrder = typeof type === 'string' && type.toLowerCase().includes('market');
        if (isInvalidOrderType && isMarketOrder) {
            const ticker = await getTicker(client, symbol);
            const fallbackPrice = side === 'buy' ? ticker.ask : ticker.bid;
            const fallbackBody = {
                symbol,
                amount,
                price: fallbackPrice,
                side,
                type: 'exchange limit',
            };
            if (clientOrderId)
                fallbackBody['client_order_id'] = clientOrderId;
            return client.authenticatedPost('/v1/order/new', fallbackBody);
        }
        throw err;
    }
}
export async function cancelOrder(client, orderId) {
    return client.authenticatedPost('/v1/order/cancel', { order_id: orderId });
}
export async function cancelAllSessionOrders(client) {
    return client.authenticatedPost('/v1/order/cancel/session');
}
export async function cancelAllActiveOrders(client) {
    return client.authenticatedPost('/v1/order/cancel/all');
}
export async function getOrderStatus(client, orderId) {
    return client.authenticatedPost('/v1/order/status', { order_id: orderId });
}
export async function getActiveOrders(client) {
    return client.authenticatedPost('/v1/orders');
}
export async function getMyTrades(client, symbol, limitTrades, timestamp) {
    const body = { symbol };
    if (limitTrades !== undefined)
        body['limit_trades'] = limitTrades;
    if (timestamp !== undefined)
        body['timestamp'] = timestamp;
    return client.authenticatedPost('/v1/mytrades', body);
}
export async function getTradeVolume(client) {
    return client.authenticatedPost('/v1/tradevolume');
}
export async function getNotionalVolume(client) {
    return client.authenticatedPost('/v1/notionalvolume');
}
