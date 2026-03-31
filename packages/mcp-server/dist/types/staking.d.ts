export interface StakingBalance {
    currency: string;
    balance: string;
    available: string;
    stakingRewards: {
        balance: string;
        currency: string;
    };
    rewardsRate: string;
    providerName: string;
}
export interface StakingHistory {
    type: string;
    datetime: string;
    amount: string;
    currency: string;
    status: string;
}
export interface StakingRate {
    symbol: string;
    rate: string;
    providerName: string;
}
export interface StakingResult {
    datetime: string;
    txHash: string;
    providerId: string;
    currency: string;
    amount: string;
    status: string;
}
