export async function getMarginAccount(client) {
    return client.authenticatedPost('/v1/margin/account');
}
export async function getMarginPreview(client, symbol, side, quantity, price) {
    return client.authenticatedPost('/v1/margin/preview', { symbol, side, quantity, price });
}
export async function getOpenPositions(client) {
    return client.authenticatedPost('/v1/positions');
}
export async function getFundingPayments(client, since, until) {
    const body = {};
    if (since !== undefined)
        body['since'] = since;
    if (until !== undefined)
        body['until'] = until;
    return client.authenticatedPost('/v1/fundingpayments', body);
}
export async function clearingNewOrder(client, body) {
    return client.authenticatedPost('/v1/clearing/new', body);
}
export async function clearingBrokerNewOrder(client, body) {
    return client.authenticatedPost('/v1/clearing/broker/new', body);
}
export async function clearingOrderStatus(client, clearingId) {
    return client.authenticatedPost('/v1/clearing/status', { clearing_id: clearingId });
}
