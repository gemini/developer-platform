export async function getAccount(client) {
    return client.authenticatedPost('/v1/account');
}
export async function createAccount(client, name, type) {
    return client.authenticatedPost('/v1/account/create', { name, type });
}
export async function getAccounts(client) {
    return client.authenticatedPost('/v1/account/list');
}
export async function getRoles(client) {
    return client.authenticatedPost('/v1/roles');
}
export async function getApprovedAddresses(client, network) {
    return client.authenticatedPost(`/v1/approvedAddresses/account/${network}`);
}
export async function sessionHeartbeat(client) {
    return client.authenticatedPost('/v1/heartbeat');
}
export async function revokeOAuthToken(client) {
    return client.authenticatedPost('/v1/oauth/token/revoke');
}
