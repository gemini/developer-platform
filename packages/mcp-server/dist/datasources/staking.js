export async function getStakingBalances(client) {
    return client.authenticatedPost('/v1/balances/staking');
}
export async function getStakingHistory(client) {
    return client.authenticatedPost('/v1/staking/history');
}
export async function getStakingRates(client) {
    return client.authenticatedPost('/v1/staking/rates');
}
export async function stake(client, currency, amount, providerId) {
    return client.authenticatedPost('/v1/staking/stake', { currency, amount, providerId });
}
export async function unstake(client, currency, amount, providerId) {
    return client.authenticatedPost('/v1/staking/unstake', { currency, amount, providerId });
}
