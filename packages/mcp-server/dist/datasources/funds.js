export async function getBalances(client) {
    return client.authenticatedPost('/v1/balances');
}
export async function getNotionalBalances(client, currency) {
    return client.authenticatedPost(`/v1/notionalbalances/${currency}`);
}
export async function getTransfers(client, limitTransfers, currency) {
    const body = {};
    if (limitTransfers !== undefined)
        body['limit_transfers'] = limitTransfers;
    if (currency !== undefined)
        body['currency'] = currency;
    return client.authenticatedPost('/v1/transfers', body);
}
export async function getDepositAddresses(client, network) {
    return client.authenticatedPost(`/v1/addresses/${network}`);
}
export async function getNewDepositAddress(client, network, label) {
    const body = {};
    if (label)
        body['label'] = label;
    return client.authenticatedPost(`/v1/deposit/${network}/newAddress`, body);
}
export async function internalTransfer(client, currency, sourceAccount, targetAccount, amount) {
    return client.authenticatedPost('/v1/account/transfer', {
        currency,
        sourceAccount,
        targetAccount,
        amount,
    });
}
export async function addBank(client, body) {
    return client.authenticatedPost('/v1/payments/addbank', body);
}
export async function getBankPaymentMethods(client) {
    return client.authenticatedPost('/v1/payments/methods');
}
export async function cryptoWithdrawal(client, currency, address, amount, memo) {
    const body = { address, amount };
    if (memo)
        body['memo'] = memo;
    return client.authenticatedPost(`/v1/withdraw/${currency}`, body);
}
export async function getGasFeeEstimate(client, currency, address, amount) {
    return client.authenticatedPost(`/v1/withdraw/${currency.toLowerCase()}/feeEstimate`, { address, amount });
}
export async function fiatWithdrawal(client, accountId, amount, currency) {
    return client.authenticatedPost('/v1/withdraw/usd', { accountId, amount, currency });
}
