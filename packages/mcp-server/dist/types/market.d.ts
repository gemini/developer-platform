export declare enum CandleTimeFrame {
    OneMinute = "1m",
    FiveMinutes = "5m",
    FifteenMinutes = "15m",
    ThirtyMinutes = "30m",
    OneHour = "1hr",
    SixHours = "6hr",
    OneDay = "1day"
}
export interface TickerV2 {
    symbol: string;
    open: string;
    high: string;
    low: string;
    close: string;
    changes: string[];
    bid: string;
    ask: string;
}
export interface Trade {
    timestamp: number;
    timestampms: number;
    tid: number;
    price: string;
    amount: string;
    exchange: string;
    type: string;
}
export interface OrderBookEntry {
    price: string;
    amount: string;
}
export interface OrderBook {
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
}
export interface AuctionStatus {
    closed_until_ms: number;
    last_auction_eid: number;
    last_auction_price: string;
    last_auction_quantity: string;
    last_highest_bid_price: string;
    last_lowest_ask_price: string;
    next_auction_ms: number;
    next_update_ms: number;
}
export interface PriceFeed {
    pair: string;
    price: string;
    percentChange24h: string;
}
export interface FundingAmount {
    symbol: string;
    fundingDateTime: string;
    fundingRate: string;
}
