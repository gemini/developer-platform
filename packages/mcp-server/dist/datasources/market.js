export async function getSymbols(client) {
    return client.publicGet('/v1/symbols');
}
export async function getSymbolDetails(client, symbol) {
    return client.publicGet(`/v1/symbols/details/${symbol}`);
}
export async function getNetworkCodes(client, token) {
    return client.publicGet(`/v1/network/${token}`);
}
export async function getTicker(client, symbol) {
    return client.publicGet(`/v2/ticker/${symbol}`);
}
export async function getTickerV1(client, symbol) {
    return client.publicGet(`/v1/pubticker/${symbol}`);
}
export async function getCandles(client, symbol, timeFrame) {
    return client.publicGet(`/v2/candles/${symbol}/${timeFrame}`);
}
export async function getDerivativeCandles(client, symbol, timeFrame) {
    return client.publicGet(`/v2/derivatives/candles/${symbol}/${timeFrame}`);
}
export async function getFeePromos(client) {
    return client.publicGet('/v1/feepromos');
}
export async function getRecentTrades(client, symbol, limitTrades, since) {
    const params = {};
    if (limitTrades !== undefined)
        params['limit_trades'] = String(limitTrades);
    if (since !== undefined)
        params['since'] = String(since);
    return client.publicGet(`/v1/trades/${symbol}`, params);
}
export async function getOrderBook(client, symbol, limitBids, limitAsks) {
    const params = {};
    if (limitBids !== undefined)
        params['limit_bids'] = String(limitBids);
    if (limitAsks !== undefined)
        params['limit_asks'] = String(limitAsks);
    return client.publicGet(`/v1/book/${symbol}`, params);
}
export async function getAuctionHistory(client, symbol, limitAuctions) {
    const params = {};
    if (limitAuctions !== undefined)
        params['limit_auction_results'] = String(limitAuctions);
    return client.publicGet(`/v1/auction/${symbol}/history`, params);
}
export async function getPriceFeed(client) {
    return client.publicGet('/v1/pricefeed');
}
export async function getFundingAmounts(client) {
    return client.publicGet('/v1/fundingamounts');
}
export async function getCurrentFundingRate(client, symbol) {
    return client.publicGet(`/v1/perpetuals/fundingrates/${symbol}`);
}
