// Generated from prediction-markets.yaml. Do not edit.

export interface paths {
    "/v1/prediction-markets/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List prediction market events
         * @description Returns a paginated list of prediction market events with optional filtering by status, category, sports-market classification, and search text. Repeated values for the same filter use OR semantics; different filters combine with AND semantics.
         */
        get: operations["listEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/events/{eventTicker}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get event by ticker
         * @description Returns detailed information about a specific prediction market event.
         */
        get: operations["getEvent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/events/{eventTicker}/strike": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get strike price for event
         * @description Returns strike price information for a specific prediction market event.
         *
         *     Useful for crypto Up/Down contracts where the strike price becomes available at the start of the observation window (typically ~5 minutes before expiry for 5M contracts).
         *
         *     For Up/Down contracts, the `value` field will be `null` until the strike is captured at `availableAt` time.
         */
        get: operations["getEventStrike"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/events/newly-listed": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List newly listed events
         * @description Returns a list of prediction market events created in the last 24 hours, sorted by creation date (newest first). Repeated values for the same sports-market filter use OR semantics; different filters combine with AND semantics.
         */
        get: operations["listNewlyListedEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/events/recently-settled": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List recently settled events
         * @description Returns a list of prediction market events settled in the last 24 hours, sorted by resolution date (most recently settled first). Repeated values for the same sports-market filter use OR semantics; different filters combine with AND semantics.
         */
        get: operations["listRecentlySettledEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/events/upcoming": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List upcoming events
         * @description Returns a list of approved prediction market events that are not yet active (pre-launch), sorted by start time (soonest first). Repeated values for the same sports-market filter use OR semantics; different filters combine with AND semantics.
         */
        get: operations["listUpcomingEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List event categories
         * @description Returns available prediction market event categories, optionally filtered by event status.
         */
        get: operations["getCategories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/volume/{date}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get daily prediction market trade volume
         * @description Returns prediction-market trade volume by category for one completed UTC day. This is a public, unauthenticated endpoint.
         *
         *     `date` must use the `YYYY-MM-DD` UTC calendar-date format. Requests may select one day in the rolling one-year UTC window ending before the current UTC day; the current UTC day is not available. The exact earliest supported date is evaluated for each request.
         *
         *     Prediction-market volume begins at `2025-12-15`. A pre-launch date, or a post-launch date with any missing source hour, returns `404 NOT_FOUND`. The endpoint never synthesizes zero-volume rows for time before launch.
         *
         *     All volume values are non-negative decimal strings. Category rows are flat and ordered with each parent before its descendants. Each category row's `volume` includes trades assigned directly to that category and to all descendant categories.
         */
        get: operations["getPredictionMarketDailyVolume"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/volume/{date}/hourly": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get hourly prediction market trade volume
         * @description Returns prediction-market trade volume by category and UTC hour for one completed UTC day. This is a public, unauthenticated endpoint.
         *
         *     `date` must use the `YYYY-MM-DD` UTC calendar-date format. Requests may select one day in the rolling one-year UTC window ending before the current UTC day; the current UTC day is not available. The exact earliest supported date is evaluated for each request.
         *
         *     Prediction-market volume begins at `2025-12-15`. A pre-launch date, or a post-launch date with any missing source hour, returns `404 NOT_FOUND`. The endpoint never synthesizes zero-volume rows for time before launch or completed zero-volume hours.
         *
         *     All volume values are non-negative decimal strings. Rows are ordered by UTC hour, then with each category parent before its descendants. Each category row's `volume` includes trades assigned directly to that category and to all descendant categories.
         */
        get: operations["getPredictionMarketHourlyVolume"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/terms": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get prediction market terms
         * @description Returns the latest Prediction Markets terms content. This endpoint is public so clients can display the terms before asking an authenticated account to accept them.
         */
        get: operations["getPredictionMarketsTerms"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/terms/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get prediction market terms status
         * @description Returns whether the authenticated account group has accepted the latest Prediction Markets terms. Requires authentication and OrderStatus permission.
         */
        get: operations["getPredictionMarketsTermsStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/terms/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Accept prediction market terms
         * @description Accepts the latest configured Prediction Markets terms for the authenticated account group. Requires authentication and NewOrder permission. The actor is recorded from the OAuth client when OAuth is used, otherwise from the API key session.
         */
        post: operations["acceptPredictionMarketsTerms"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Place order
         * @description Place a new prediction market order. Supports limit and stop-limit order types. Requires authentication and NewOrder permission.
         *
         *     Before sending orders, check `GET /v1/prediction-markets/terms/status`. If `hasAcceptedLatest` is `false`, display `GET /v1/prediction-markets/terms` and call `POST /v1/prediction-markets/terms/accept`, then retry the order.
         *
         *     Validate each order's quantity and price against the instrument-specific `quantityIncrement`, `quantityMinimum`, `priceIncrement`, and `priceMinimum` returned in the contract metadata. Do not assume a fixed quantity or price grid across instruments.
         *
         *     ### Stop-Limit Orders
         *     A stop-limit order is an order type that allows for order placement when a price reaches a specified level. Stop-limit orders take in both a `price` and a `stopPrice` as parameters. The `stopPrice` is the price that triggers the order to be placed on the continuous live order book at the `price`. For buy orders, the `stopPrice` must be greater than or equal to the last trade price and less than or equal to the `price`; for sell orders, the `stopPrice` must be less than or equal to the last trade price and greater than or equal to the `price`. Both `price` and `stopPrice` must be in the 0-1 range.
         */
        post: operations["placeOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/order/batch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Place a batch of orders
         * @description Place between 1 and 20 prediction market orders in one authenticated request. The complete payload is signed once using the standard private REST authentication headers. Each entry accepts the same fields as `POST /v1/prediction-markets/order`.
         *
         *     The operation is synchronous and non-atomic. Gemini validates the entire batch before submitting any orders. If the batch or any entry fails up-front validation, the request fails and no orders are submitted. After validation succeeds, orders are submitted sequentially and each result is returned in request order. An exchange rejection for one order does not stop later orders from being submitted; it appears as an `error` and `message` for that entry in the `200` response.
         */
        post: operations["placeOrderBatch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/order/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel order
         * @description Cancel an existing prediction market order. Requires authentication and CancelOrder permission.
         */
        post: operations["cancelOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/order/batch/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel a batch of orders
         * @description Cancel between 1 and 20 prediction market orders in one authenticated request. The complete payload is signed once using the standard private REST authentication headers. Each order ID may be a JSON integer or a quoted numeric string.
         *
         *     The operation is synchronous and non-atomic. Gemini validates all order IDs before attempting any cancellation. If the batch is empty, contains more than 20 entries, or contains an invalid ID, the request fails and no orders are cancelled. After validation succeeds, cancellations are attempted sequentially and each result is returned in request order. A rejection for one cancellation does not stop later cancellations from being attempted; it appears as an `error` and `message` for that entry in the `200` response.
         */
        post: operations["cancelOrderBatch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/orders/active": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get active orders
         * @description Returns a list of currently open (active) orders. Requires authentication.
         */
        post: operations["getActiveOrders"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/orders/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get order history
         * @description Returns historical orders (filled or cancelled) for the authenticated user. Use `status: filled` with `from` and `to` to retrieve fully filled orders in a bounded time window. The range is `[from, to)`: `from` is inclusive and `to` is exclusive. A time-bounded response contains at most `limit` results and ignores `offset`; split high-volume periods into non-overlapping ranges. Use `/orders/active` for open orders.
         */
        post: operations["getOrderHistory"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/positions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get positions
         * @description Returns current filled positions for the authenticated user. All query parameters are optional; omitting them preserves the legacy unpaginated, unsorted behavior.
         */
        post: operations["getPositions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/positions/settled": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get settled positions
         * @description Returns historically settled positions for the authenticated user. Each entry represents a position in a contract that has resolved.
         *      - `payout` — the amount received from settlement
         *      - `resolutionSide` — indicates which outcome (`yes` or `no`) won.
         *
         *     This endpoint differs from [Get positions](#operation/getPositions) in that it returns closed positions from settled contracts rather than current open positions.
         */
        post: operations["getSettledPositions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/metrics/volume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get volume metrics
         * @description Returns per-contract share volume metrics for an event, including the authenticated user's taker and maker volumes.
         *
         *     All volumes are in shares (number of contracts traded), not dollar amounts.
         *
         *     - `totalQty` — Total taker volume across all participants for this contract
         *     - `userAggressorQty` — The authenticated user's taker (aggressor) volume
         *     - `userRestingQty` — The authenticated user's maker (resting) volume, counted when another order fills against the user's resting limit order
         *
         *     An optional time range can be specified to filter trades within a specific window.
         */
        post: operations["getVolumeMetrics"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/combos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List combo contracts
         * @description Returns a paginated list of combo contracts. Each combo includes its full leg breakdown and per-leg resolution status. When `status` is omitted, the endpoint returns only `Active` combos. This Combo Prediction Markets endpoint is not currently enabled in production.
         */
        get: operations["listCombos"];
        put?: never;
        /**
         * Create or retrieve a canonical combo
         * @description Creates a combo from two to six underlying contract legs for the authenticated account. The service canonicalizes the complete leg set, so submitting the same legs again returns the existing combo regardless of leg order. The account is derived from the authenticated API key; do not include an account ID in the request. This Combo Prediction Markets endpoint is not currently enabled in production.
         *
         *     Requires signed private REST authentication, the `PredictionsNewOrder` permission, and an unrestricted trading account. A new canonical combo returns `201 Created` with `alreadyExisted: false`; an existing canonical combo returns `200 OK` with `alreadyExisted: true`.
         */
        post: operations["createCombo"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/combos/{instrumentSymbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get combo by instrument symbol
         * @description Returns the full specification of a single combo contract identified by its instrument symbol, including leg breakdown and per-leg resolution status. This Combo Prediction Markets endpoint is not currently enabled in production.
         */
        get: operations["getComboByInstrumentSymbol"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/maker-rebate/rates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get maker-rebate rate schedule
         * @description Returns the current Maker Rebate rate rules. Public endpoint; no authentication required.
         *
         *     Each rule defines a `rebate_multiplier_bps` (basis points of the maker fee that is rebated) and an `effective_from` timestamp. An optional `category` scopes the rule to a single market category (omitted rules apply to all categories). An optional `effective_to` marks a rule as superseded.
         *
         *     Returns `503` with `error: "Maker rebate program is not currently available"` when the program is disabled.
         */
        get: operations["getMakerRebateRates"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/maker-rebate/payouts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List maker-rebate payouts
         * @description Returns the authenticated account's Maker Rebate payout history. Most recent payout first.
         *
         *     Pagination is read from the `limit` and `offset` query parameters: `limit` is clamped to `[1, 100]` (default 50), `offset` is clamped to `[0, +∞)` (default 0).
         *
         *     Requires authentication with `OrderStatus` permission. Returns `503` when the program is disabled.
         */
        post: operations["listMakerRebatePayouts"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/maker-rebate/summary/total": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get maker-rebate lifetime summary
         * @description Returns lifetime totals for the authenticated account's Maker Rebate payouts. When both `dateFrom` and `dateTo` are provided, the totals are restricted to payouts paid within that inclusive Eastern Time window.
         *
         *     Either provide both date parameters or omit both. Dates must be in `YYYY-MM-DD` format, `dateTo` must be on or after `dateFrom`, and the range must not exceed 5 years.
         *
         *     Requires authentication with `OrderStatus` permission. Returns `503` when the program is disabled.
         */
        get: operations["getMakerRebateLifetimeSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/liquidity-rewards/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get liquidity-rewards program config
         * @description Returns the Liquidity Rewards program configuration. Public endpoint; no authentication required.
         *
         *     When the program is fully configured the response includes `max_spread_cents`, `min_payout_threshold_usd`, and `enabled: true`. When the program is not yet fully configured, the response collapses to `{ "enabled": false }` only.
         *
         *     Returns `503` when the program is not currently available.
         */
        get: operations["getLiquidityRewardsConfig"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/liquidity-rewards/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List liquidity-rewards events
         * @description Returns the paginated list of events currently participating in the Liquidity Rewards program. Public endpoint; no authentication required.
         *
         *     `category` accepts a comma-separated list of category names (whitespace trimmed, empty entries dropped). `sort` controls ordering. `limit` is clamped to `[1, 100]` (default 50); `offset` is clamped to `[0, +∞)` (default 0). `last_score_date` is the most recent date for which scoring data has been written, or `null` when no scoring has run yet.
         *
         *     Returns `503` when the program is not currently available.
         */
        get: operations["listLiquidityRewardsEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/liquidity-rewards/summary/daily": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get liquidity-rewards daily summary
         * @description Returns daily Liquidity Rewards payouts for the authenticated account within the requested date window. Both `dateFrom` and `dateTo` are required and must be in `YYYY-MM-DD` format; `dateTo` must be on or after `dateFrom`.
         *
         *     Each daily entry includes the total USD reward for that day, the payout status (e.g. `PENDING`, `PAID`), the paid-at timestamp (if paid), and per-event score breakdowns showing how the day's reward was distributed across events the account scored on.
         *
         *     Requires authentication with `OrderStatus` permission. Returns `503` when the program is not currently available.
         */
        get: operations["getLiquidityRewardsDailySummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/prediction-markets/liquidity-rewards/summary/total": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get liquidity-rewards lifetime summary
         * @description Returns lifetime totals for the authenticated account's Liquidity Rewards payouts. When both `dateFrom` and `dateTo` are provided, the totals are restricted to payouts paid within that inclusive Eastern Time window.
         *
         *     Either provide both date parameters or omit both. Dates must be in `YYYY-MM-DD` format, `dateTo` must be on or after `dateFrom`, and the range must not exceed 5 years.
         *
         *     Requires authentication with `OrderStatus` permission. Returns `503` when the program is not currently available.
         */
        get: operations["getLiquidityRewardsLifetimeSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Error: {
            /**
             * @description Error code
             * @example InvalidInput
             */
            error?: string;
            /**
             * @description Human-readable error message
             * @example orderId is required
             */
            message?: string;
        };
        PredictionMarketsError: {
            /**
             * @description Prediction Markets error class
             * @example InvalidInput
             */
            error: string;
            /**
             * @description Request field associated with the error, when available
             * @example orders
             */
            field?: string;
            /**
             * @description Human-readable error detail, when available
             * @example orders must contain between 1 and 20 entries
             */
            message?: string;
        };
        AuthErrorResponse: {
            /** @enum {string} */
            result: "error";
            /**
             * @description Authentication or authorization error class
             * @example MissingNonce
             */
            reason: string;
            /**
             * @description Human-readable authentication or authorization detail
             * @example Must provide unique monotonic increasing 'nonce' field in payload
             */
            message: string;
        };
        AccountGroupBlockedError: {
            /** @enum {string} */
            error: "This account is not permitted to trade prediction markets";
            /** @enum {string} */
            code: "ACCOUNT_GROUP_BLOCKED";
        };
        TermsNotAcceptedError: {
            /** @enum {string} */
            error: "TERMS_NOT_ACCEPTED";
            /** @enum {string} */
            message: "Prediction markets terms must be accepted before placing orders";
        };
        RestrictedSellOnlyError: {
            /** @enum {string} */
            error: "ACCOUNT_RESTRICTED_SELL_ONLY";
            /** @enum {string} */
            message: "Your account is restricted to selling existing positions; buying is not permitted.";
        };
        PredictionMarketsTerms: {
            /**
             * @description Terms type identifier
             * @example PredictionsMarket
             */
            termsType: string;
            /**
             * @description Latest terms version
             * @example 3
             */
            version: number;
            /**
             * @description Terms content to display before acceptance
             * @example These are the prediction market terms.
             */
            content: string;
            /**
             * Format: date-time
             * @description UTC timestamp when the terms content was last updated
             * @example 2026-05-18T17:00:00Z
             */
            updatedAt: string;
        };
        PredictionMarketsTermsStatus: {
            /**
             * @description Whether the account group has accepted the latest configured Prediction Markets terms
             * @example false
             */
            hasAcceptedLatest: boolean;
            /**
             * @description Latest terms version accepted by the account group, if any
             * @example 2
             */
            acceptedVersion?: number | null;
            /**
             * @description Latest configured Prediction Markets terms version, if available
             * @example 3
             */
            latestVersion?: number | null;
        };
        AcceptPredictionMarketsTermsResponse: {
            /** @example true */
            success: boolean;
        };
        /**
         * @description Status of a prediction market
         * @enum {string}
         */
        MarketStatus: "approved" | "active" | "closed" | "under_review" | "settled" | "invalid";
        /**
         * @description Type of prediction market
         * @enum {string}
         */
        MarketType: "binary" | "categorical";
        /**
         * @description Sport whose rules give the market's scope and metric their sport-specific meaning.
         * @enum {string}
         */
        SportsMarketSport: "american_football" | "athletics" | "australian_rules_football" | "baseball" | "basketball" | "boxing" | "chess" | "cricket" | "cycling" | "darts" | "esports" | "golf" | "hockey" | "lacrosse" | "mixed_martial_arts" | "motorsports" | "rugby" | "sailing" | "soccer" | "tennis";
        /**
         * @description Conventional sports-market family. `subject`, `scope`, and `metric` provide detail within the family. This classification is independent of the event's structural `type` (`binary` or `categorical`).
         * @enum {string}
         */
        SportsMarketType: "moneyline" | "spread" | "total" | "prop" | "correct_score" | "to_advance" | "futures" | "other";
        /**
         * @description What the market is about. `participant` covers non-player entrants such as drivers and horses.
         * @enum {string}
         */
        SportsMarketSubject: "contest" | "team" | "player" | "participant" | "other";
        /**
         * @description Unit covered by the market. `full_contest` follows the market's official final-result rules; `regulation` covers scheduled regulation play only. Ordinal and range qualifiers are represented separately on `SportsMarketScope`.
         * @enum {string}
         */
        SportsMarketScopeType: "full_contest" | "regulation" | "half" | "quarter" | "period" | "inning" | "team_innings" | "over" | "powerplay" | "set" | "game" | "round" | "hole" | "match_day" | "session" | "super_over" | "race" | "sprint" | "qualifying" | "practice" | "stage" | "lap" | "series" | "season" | "tournament" | "competition" | "other";
        /**
         * @description Statistic measured by the market. Interpret shared metric names using `sportsMarket.sport`.
         * @enum {string}
         */
        SportsMarketMetric: "aces" | "assists" | "balls_faced" | "birdies" | "blocked_shots" | "blocks" | "bogeys" | "boundaries" | "break_points_won" | "cards" | "catches" | "clean_sheets" | "completed_passes" | "control_time" | "corners" | "defensive_rebounds" | "double_double" | "double_faults" | "doubles" | "eagles" | "earned_runs" | "errors" | "faceoff_wins" | "fairways_hit" | "fantasy_points" | "fastest_lap" | "field_goals_made" | "finishing_position" | "fouls" | "fours" | "free_throws_made" | "fumbles" | "games" | "goals" | "goals_allowed" | "greens_in_regulation" | "grid_position" | "hits" | "hits_allowed" | "hits_runs_rbis" | "holes_in_one" | "home_runs" | "innings_pitched" | "interceptions_thrown" | "kicking_points" | "knockdowns" | "laps_completed" | "laps_led" | "lap_time" | "longest_pass_completion" | "longest_reception" | "longest_rush" | "maiden_overs" | "offensive_rebounds" | "offsides" | "pars" | "passes" | "pass_attempts" | "pass_completions" | "passing_touchdowns" | "passing_yards" | "penalty_minutes" | "pitching_outs_recorded" | "pit_stops" | "points" | "points_assists" | "points_rebounds" | "points_rebounds_assists" | "positions_gained" | "power_play_points" | "putts" | "qualifying_position" | "rebounds" | "rebounds_assists" | "receiving_touchdowns" | "receiving_yards" | "receptions" | "red_cards" | "retirements" | "rounds" | "runs" | "runs_batted_in" | "runs_conceded" | "rush_attempts" | "rushing_touchdowns" | "rushing_yards" | "sacks" | "safety_cars" | "saves" | "sets" | "shots" | "shots_on_goal" | "shots_on_target" | "shutouts" | "significant_strikes" | "singles" | "sixes" | "steals" | "stolen_bases" | "strokes" | "strikeouts" | "submission_attempts" | "tackles" | "takedowns" | "three_pointers_made" | "tiebreaks_won" | "total_bases" | "total_points_won" | "total_strikes" | "touchdowns" | "triples" | "triple_double" | "turnovers" | "walks" | "wickets" | "wins" | "yellow_cards" | "other";
        /** @description Settlement scope. `ordinal` identifies one unit; `start` and `end` identify an inclusive range of units. */
        SportsMarketScope: {
            type: components["schemas"]["SportsMarketScopeType"];
            /**
             * Format: int32
             * @description Optional ordinal within the scope type, such as half `1` or quarter `4`.
             */
            ordinal?: number;
            /**
             * Format: int32
             * @description Optional inclusive start of a scope range, such as inning `1`.
             */
            start?: number;
            /**
             * Format: int32
             * @description Optional inclusive end of a scope range, such as inning `5`.
             */
            end?: number;
        };
        /** @description Atomic sports-market classification shared by every contract grouped under the event. Present only for sports events. All fields except `metric` are required together. */
        SportsMarket: {
            sport: components["schemas"]["SportsMarketSport"];
            type: components["schemas"]["SportsMarketType"];
            subject: components["schemas"]["SportsMarketSubject"];
            scope: components["schemas"]["SportsMarketScope"];
            metric?: components["schemas"]["SportsMarketMetric"];
        };
        /**
         * @description Order type. `stop-limit` orders require a `stopPrice` that triggers a limit order at `price` when the market reaches the trigger.
         * @enum {string}
         */
        OrderType: "limit" | "stop-limit";
        /** @enum {string} */
        OrderSide: "buy" | "sell";
        /**
         * @description The outcome being traded (Yes or No)
         * @enum {string}
         */
        Outcome: "yes" | "no";
        /**
         * @description Order execution behavior:
         *     - `good-til-cancel` - Order remains active until filled or cancelled (default)
         *     - `immediate-or-cancel` - Fill immediately or cancel remaining
         *     - `fill-or-kill` - Fill entire order immediately or cancel
         * @default good-til-cancel
         * @enum {string}
         */
        TimeInForce: "good-til-cancel" | "immediate-or-cancel" | "fill-or-kill";
        /** @enum {string} */
        OrderStatus: "open" | "filled" | "cancelled";
        /** @enum {string} */
        PositionStatus: "active" | "resolved" | "cancelled";
        Pagination: {
            /** @example 50 */
            limit?: number;
            /** @example 0 */
            offset?: number;
            /** @example 100 */
            total?: number;
        };
        PaginationSimple: {
            limit?: number;
            offset?: number;
            /** @description Number of items in current response */
            count?: number;
        };
        OrderBook: {
            bids?: components["schemas"]["OrderBookEntry"][];
            asks?: components["schemas"]["OrderBookEntry"][];
        };
        OrderBookEntry: {
            side?: components["schemas"]["OrderSide"];
            /** @example 0.65 */
            price?: string;
            /** @example 1000 */
            quantity?: string;
        };
        OrderBookDepth: {
            bids?: components["schemas"]["OrderBookLevel"][];
            asks?: components["schemas"]["OrderBookLevel"][];
            /** Format: date-time */
            lastUpdateTime?: string;
        };
        OrderBookLevel: {
            price?: string;
            quantity?: string;
            orderCount?: number;
        };
        /** @description Contract quantity and price validation is instrument-specific. Clients must validate order quantities and prices against the returned increment and minimum fields rather than assuming a fixed grid. */
        Contract: {
            id?: string;
            /** @description Human-readable label for the contract's YES-space proposition (e.g., "SOL > $90") */
            label?: string;
            /** @description Short form label (e.g., ">$90") */
            abbreviatedName?: string | null;
            /** @description Rich text description */
            description?: Record<string, never>;
            prices?: components["schemas"]["ContractPrices"];
            totalShares?: string | null;
            color?: string | null;
            status?: components["schemas"]["MarketStatus"];
            imageUrl?: string | null;
            priceHistory?: components["schemas"]["PricePoint"][] | null;
            /** Format: date-time */
            createdAt?: string;
            /** Format: date-time */
            expiryDate?: string | null;
            resolutionSide?: components["schemas"]["Outcome"];
            /** Format: date-time */
            resolvedAt?: string | null;
            termsAndConditionsUrl?: string;
            ticker?: string;
            instrumentSymbol?: string;
            /** @description Contract quantity grid from instrument refdata (for example, "0.01"). */
            quantityIncrement?: string | null;
            /** @description Minimum contract quantity from instrument refdata (for example, "1.00"). */
            quantityMinimum?: string | null;
            /** @description Contract price grid from instrument refdata (for example, "0.0001"). */
            priceIncrement?: string | null;
            /** @description Decimal places supported by the instrument's quote asset. */
            quoteAssetPrecision?: number | null;
            /** @description Minimum contract price and anchor for the instrument price grid (for example, "0.0001"). */
            priceMinimum?: string | null;
            /** Format: date-time */
            effectiveDate?: string | null;
            /**
             * @description Trading state of the contract
             * @enum {string|null}
             */
            marketState?: "open" | "closed" | null;
            /** @description Display order within the event */
            sortOrder?: number | null;
            strike?: components["schemas"]["Strike"];
            /**
             * @deprecated
             * @description Deprecated: use the event-level `sourceDetails` (`agency` + `index`) instead. Data source identifier for price observation (e.g., "GRR-KAIKO_BTCUSD_60S"). Present for crypto Up/Down contracts.
             * @example GRR-KAIKO_BTCUSD_60S
             */
            source?: string | null;
            /**
             * @description The observed settlement price. Only present after the contract is settled.
             * @example 87654.32
             */
            settlementValue?: string | null;
        };
        /**
         * @description Strike or condition inequality type for contract threshold evaluation. - `reference`: Crypto Up/Down reference strike price captured at `availableAt` time. - `above`: Higher/Lower contract threshold. - `spread`: Point, run, or goal handicap spread line. - `over`: Total or prop threshold evaluated as strict greater than (`>`). - `over_or_equal`: Total or prop threshold evaluated as greater than or equal to (`>=`). - `under`: Total or prop threshold evaluated as strict less than (`<`). - `under_or_equal`: Position, rank, or total threshold evaluated as less than or equal to (`<=`).
         * @example spread
         * @enum {string}
         */
        StrikeType: "reference" | "above" | "spread" | "over" | "over_or_equal" | "under" | "under_or_equal";
        /** @description Strike price or contract threshold information for Up/Down crypto contracts and sports prediction market contracts. */
        Strike: {
            /**
             * @description The strike price value. Null for "reference" type strikes where the value is determined at availableAt time. For sports contracts, this represents the derived numeric strike value (e.g. spread margin, total line, or position/rank threshold).
             * @example 87500.00
             */
            value?: string | null;
            type?: components["schemas"]["StrikeType"];
            /**
             * Format: date-time
             * @description When the strike price becomes available
             * @example 2026-03-27T19:45:00.000Z
             */
            availableAt?: string | null;
        };
        /** @description Structured data source information for price observation. Replaces the deprecated flat `source` string on the event and contract. Present for crypto Up/Down events. Both fields are omitted when not available. */
        SourceDetails: {
            /**
             * @description The data provider / vendor name.
             * @example Kaiko
             */
            agency?: string | null;
            /**
             * @description The specific data feed identifier (the value previously carried by the flat `source` field).
             * @example GRR-KAIKO_BTCUSD_60S
             */
            index?: string | null;
        } | null;
        PricePoint: {
            /** Format: date-time */
            timestamp?: string;
            price?: string;
        };
        /** @description Current bid/ask pricing for the contract */
        ContractPrices: {
            /** @description Buy prices for each outcome */
            buy?: {
                /**
                 * @description Price to buy YES outcome
                 * @example 0.42
                 */
                yes?: string;
                /**
                 * @description Price to buy NO outcome
                 * @example 0.58
                 */
                no?: string;
            };
            /** @description Sell prices for each outcome */
            sell?: {
                /**
                 * @description Price to sell YES outcome
                 * @example 0.42
                 */
                yes?: string;
                /**
                 * @description Price to sell NO outcome
                 * @example 0.58
                 */
                no?: string;
            };
            /**
             * @description Highest buy offer
             * @example 0.49
             */
            bestBid?: string | null;
            /**
             * @description Lowest sell offer
             * @example 0.54
             */
            bestAsk?: string | null;
            /**
             * @description Most recent transaction price
             * @example 0.75
             */
            lastTradePrice?: string | null;
        } | null;
        /** @description A prediction market event containing one or more tradeable contracts */
        Event: {
            id?: string;
            /** @example Will Bitcoin reach $100k by end of 2028? */
            title?: string;
            /** @example bitcoin-100k-2028 */
            slug?: string;
            description?: string | null;
            imageUrl?: string | null;
            type?: components["schemas"]["MarketType"];
            /** @example crypto */
            category?: string;
            series?: string | null;
            sportsMarket?: components["schemas"]["SportsMarket"];
            /**
             * @description The event ticker (e.g., "BTC100K2028")
             * @example BTC100K2028
             */
            ticker?: string;
            status?: components["schemas"]["MarketStatus"];
            /** Format: date-time */
            resolvedAt?: string | null;
            /** Format: date-time */
            createdAt?: string;
            /** @description Tradeable contracts within this event */
            contracts?: components["schemas"]["Contract"][];
            contractOrderbooks?: {
                [key: string]: components["schemas"]["OrderBook"];
            };
            /**
             * @description Total trading volume in USD
             * @example 125000.00
             */
            volume?: string;
            /**
             * @description Total liquidity in USD
             * @example 50000.00
             */
            liquidity?: string;
            tags?: string[] | null;
            /** Format: date-time */
            effectiveDate?: string;
            /** Format: date-time */
            expiryDate?: string | null;
            subcategory?: components["schemas"]["Subcategory"];
            /**
             * @deprecated
             * @description Deprecated: use `sourceDetails` (`agency` + `index`) instead. Data source identifier for price observation. Aggregated from contracts for crypto Up/Down events.
             * @example GRR-KAIKO_BTCUSD_60S
             */
            source?: string | null;
            sourceDetails?: components["schemas"]["SourceDetails"];
            settlement?: components["schemas"]["Settlement"];
        };
        /** @description Nested category information for the event */
        Subcategory: {
            /**
             * @description Category identifier
             * @example 35
             */
            id?: number;
            /**
             * @description URL-friendly category identifier
             * @example crypto_solana
             */
            slug?: string;
            /**
             * @description Display name
             * @example Solana
             */
            name?: string;
            /**
             * @description Category hierarchy path
             * @example [
             *       "Crypto",
             *       "Solana"
             *     ]
             */
            path?: string[];
        } | null;
        /** @description Settlement information for resolved events */
        Settlement: {
            /**
             * @description The observed settlement value (e.g., the price at expiry for crypto contracts)
             * @example 87654.32
             */
            value?: string | null;
        };
        EventsResponse: {
            data?: components["schemas"]["Event"][];
            pagination?: components["schemas"]["Pagination"];
        };
        ContractMetadata: {
            contractId?: string;
            contractName?: string;
            contractTicker?: string;
            eventTicker?: string;
            eventName?: string;
            category?: string;
            contractStatus?: string;
            /** @description Event type ("binary" or "categorical") */
            eventType?: string;
            /** Format: date-time */
            expiryDate?: string | null;
            /** Format: date-time */
            resolvedAt?: string | null;
            /** @description Winning outcome if resolved ("yes" or "no") */
            resolutionSide?: string | null;
            /** @description Parent event ticker for sub-events */
            parentEventTicker?: string | null;
            /**
             * Format: date-time
             * @description Start datetime (ISO 8601)
             */
            startTime?: string | null;
        };
        ComboLeg: {
            /**
             * Format: int64
             * @description Internal ID of the parent combo contract
             * @example 456
             */
            comboId: bigint;
            /**
             * @description Zero-based position of this leg in the combo
             * @example 0
             */
            legIndex: number;
            /**
             * @description Internal ID of the underlying single contract, represented as a decimal string
             * @example 101
             */
            contractId: string;
            /**
             * @description The outcome this leg must settle for the combo to settle YES
             * @example Yes
             * @enum {string}
             */
            requiredOutcome: "Yes" | "No";
            /**
             * @description The outcome this leg has settled to, if resolved (`"Yes"` or `"No"`). Null while the leg is still active.
             * @example null
             */
            legOutcome?: string | null;
            /**
             * Format: date-time
             * @description UTC timestamp when this leg resolved. Null while still active.
             * @example null
             */
            resolvedAt?: string | null;
            /** @description Full metadata for the underlying single contract */
            contract?: components["schemas"]["ContractMetadata"] | null;
        };
        ComboResponse: {
            /** @description Metadata for the combo contract itself (ticker, status, expiry, etc.) */
            contract: components["schemas"]["ContractMetadata"];
            /** @description Ordered list of legs that make up this combo */
            legs: components["schemas"]["ComboLeg"][];
        };
        ListCombosResponse: {
            /** @description List of combo contracts matching the query */
            combos: components["schemas"]["ComboResponse"][];
            pagination: components["schemas"]["Pagination"];
        };
        /** @description A canonical combo definition. The authenticated account is derived from the signed request and is not a request field. */
        CreateComboRequest: {
            /** @description Two to six distinct underlying contract legs. The service canonicalizes their complete set, so leg order does not create a distinct combo. */
            legs: components["schemas"]["CreateComboLeg"][];
        };
        CreateComboLeg: {
            /**
             * @description Underlying contract ID as a decimal string.
             * @example 101
             */
            contractId: string;
            /**
             * @description Required settlement outcome for this leg.
             * @example Yes
             * @enum {string}
             */
            requiredOutcome: "Yes" | "No";
        };
        CreateComboResponse: {
            combo: components["schemas"]["ComboSummary"];
            /** @description `false` when this request created the canonical combo; `true` when the canonical combo already existed. */
            alreadyExisted: boolean;
        };
        ComboSummary: {
            /**
             * Format: int64
             * @description Internal combo ID.
             * @example 456
             */
            id: bigint;
            /**
             * @description Canonical identity of the complete combo leg set.
             * @example 101:Yes|202:No
             */
            canonicalLegKey: string;
            /**
             * Format: int32
             * @description Number of legs in the combo.
             * @example 2
             */
            legCount: number;
            /** @description Human-readable combo name, when available. */
            displayName?: string;
            /** @description Current combo status, when available. */
            status?: string;
            /**
             * Format: int64
             * @description Associated instrument ID, when available.
             */
            instrumentId?: bigint;
            /**
             * @description Associated instrument symbol, when available.
             * @example GEMI-CMB-0526-A7F3B2C1D4E5
             */
            instrumentSymbol?: string;
            /** @description Whether the combo has been registered with an instrument symbol. */
            instrumentRegistered: boolean;
            /**
             * Format: date-time
             * @description Latest expiry among the underlying legs, when available.
             */
            latestExpiryDate?: string;
            /**
             * Format: date-time
             * @description Creation time, when available.
             */
            createdAt?: string;
            /**
             * Format: date-time
             * @description Most recent update time, when available.
             */
            updatedAt?: string;
            /** @description Canonically ordered combo legs. */
            legs: components["schemas"]["ComboSummaryLeg"][];
        };
        ComboSummaryLeg: {
            /**
             * Format: int64
             * @description Parent combo ID.
             */
            comboId: bigint;
            /**
             * Format: int32
             * @description Zero-based leg position in canonical order.
             */
            legIndex: number;
            /** @description Underlying contract ID as a decimal string. */
            contractId: string;
            /**
             * @description Required settlement outcome for the leg.
             * @enum {string}
             */
            requiredOutcome: "Yes" | "No";
            /**
             * @description Settled outcome for the leg, when resolved.
             * @enum {string|null}
             */
            legOutcome?: "Yes" | "No" | null;
            /**
             * Format: date-time
             * @description Resolution time for the leg, when resolved.
             */
            resolvedAt?: string | null;
            /** @description Underlying contract metadata, when available. */
            contract?: components["schemas"]["ContractMetadata"];
        };
        ComboWriteError: {
            /**
             * @description Error class.
             * @example InvalidInput
             */
            error: string;
            /**
             * @description Machine-readable code for validation or missing-leg errors, when available.
             * @example COMBO_VALIDATION_ERROR
             */
            code?: string;
            /**
             * @description Human-readable error detail.
             * @example a combo needs 2-6 legs
             */
            message: string;
        };
        OrderRequest: {
            /**
             * @description Contract instrument symbol
             * @example GEMI-FEDJAN26-DN25
             */
            symbol: string;
            orderType: components["schemas"]["OrderType"];
            side: components["schemas"]["OrderSide"];
            /**
             * Format: decimal
             * @description Number of contracts
             * @example 100
             */
            quantity: string;
            /**
             * Format: decimal
             * @description Limit price (0-1 range)
             * @example 0.65
             */
            price: string;
            /**
             * Format: decimal
             * @description The price to trigger a stop-limit order (0-1 range). Only available for stop-limit orders. See [Stop-Limit Orders](#operation/placeOrder) above for `stopPrice`/`price` constraints.
             * @example 0.60
             */
            stopPrice?: string;
            outcome: components["schemas"]["Outcome"];
            timeInForce?: components["schemas"]["TimeInForce"];
            /**
             * @description Set to `true` to require maker-only behavior. If the order would immediately take liquidity, the order is cancelled instead of filling.
             * @default false
             */
            makerOrCancel: boolean;
        };
        PlaceOrderBatchRequest: {
            /** @description Orders to submit. Every entry is validated before any order is submitted. All orders use the account associated with the authenticated request. */
            orders: components["schemas"]["OrderRequest"][];
        };
        /** @description An accepted order returned for one batch entry. */
        BatchOrderResponse: {
            /**
             * Format: int64
             * @example 12345678
             */
            orderId: bigint;
            /** @description Hashed order ID; omitted when unavailable */
            hashOrderId?: string;
            /** @description Client-provided order ID; omitted when unavailable */
            clientOrderId?: string;
            /** @description Global order ID; omitted when unavailable */
            globalOrderId?: string;
            /** @enum {string} */
            status: "open" | "filled" | "cancelled" | "closed";
            symbol: string;
            side: components["schemas"]["OrderSide"];
            outcome: components["schemas"]["Outcome"];
            orderType: components["schemas"]["OrderType"];
            /** @enum {string} */
            timeInForce: "good-til-cancel" | "immediate-or-cancel" | "fill-or-kill" | "maker-or-cancel";
            /** @description Original order quantity */
            quantity: string;
            /** @description Amount filled so far */
            filledQuantity: string;
            /** @description Amount remaining to fill */
            remainingQuantity: string;
            /** @description Limit price */
            price: string;
            /** @description Stop trigger price; omitted unless populated for a `stop-limit` order */
            stopPrice?: string;
            /** @description Average price of fills; omitted when unavailable */
            avgExecutionPrice?: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            /**
             * Format: date-time
             * @description Cancellation time; omitted unless the order was cancelled
             */
            cancelledAt?: string;
            contractMetadata?: components["schemas"]["ContractMetadata"];
            /** @description Promotional cash reserved or applied to the order; omitted when unavailable */
            promoCashApplied?: string;
            /** @description Cash reserved for the unfilled portion of a resting buy order; omitted when unavailable */
            fundsOnHold?: string;
        };
        PlaceOrderBatchSuccessResult: {
            order: components["schemas"]["BatchOrderResponse"];
        };
        PlaceOrderBatchErrorResult: {
            /**
             * @description Error class for a rejected entry
             * @example InsufficientFunds
             */
            error: string;
            /**
             * @description Human-readable detail for a rejected entry
             * @example Insufficient funds
             */
            message: string;
        };
        /** @description Exactly one outcome is present. Accepted entries contain `order`; rejected entries contain `error` and `message`. */
        PlaceOrderBatchResult: components["schemas"]["PlaceOrderBatchSuccessResult"] | components["schemas"]["PlaceOrderBatchErrorResult"];
        PlaceOrderBatchResponse: {
            /** @description One result for each submitted order, in request order. */
            results: components["schemas"]["PlaceOrderBatchResult"][];
        };
        CancelOrderBatchRequest: {
            /** @description Order IDs to cancel. Each ID may be an integer or a quoted numeric string. All IDs are validated before any cancellation is attempted. */
            orderIds: (bigint | string)[];
        };
        CancelOrderBatchSuccessResult: {
            /**
             * Format: int64
             * @description Order ID from the corresponding request entry.
             * @example 12345678
             */
            orderId: bigint;
            /** @enum {string} */
            result: "ok";
        };
        CancelOrderBatchErrorResult: {
            /**
             * Format: int64
             * @description Order ID from the corresponding request entry.
             * @example 12345678
             */
            orderId: bigint;
            /**
             * @description Error class for a rejected cancellation
             * @example OrderNotFound
             */
            error: string;
            /**
             * @description Human-readable detail for a rejected cancellation
             * @example Order 12345678 not found
             */
            message: string;
        };
        /** @description Exactly one outcome is present. Successful entries contain `orderId` and `result`; rejected entries contain `orderId`, `error`, and `message`. */
        CancelOrderBatchResult: components["schemas"]["CancelOrderBatchSuccessResult"] | components["schemas"]["CancelOrderBatchErrorResult"];
        CancelOrderBatchResponse: {
            /** @description One result for each requested cancellation, in request order. */
            results: components["schemas"]["CancelOrderBatchResult"][];
        };
        OrderResponse: {
            /**
             * Format: int64
             * @example 12345678
             */
            orderId?: bigint;
            hashOrderId?: string | null;
            clientOrderId?: string | null;
            globalOrderId?: string | null;
            status?: components["schemas"]["OrderStatus"];
            symbol?: string;
            side?: components["schemas"]["OrderSide"];
            outcome?: components["schemas"]["Outcome"];
            orderType?: components["schemas"]["OrderType"];
            /** @description Original order quantity */
            quantity?: string;
            /** @description Amount filled so far */
            filledQuantity?: string;
            /** @description Amount remaining to fill */
            remainingQuantity?: string;
            /** @description Limit price */
            price?: string;
            /** @description Stop trigger price (populated for `stop-limit` orders) */
            stopPrice?: string | null;
            /** @description Average price of fills */
            avgExecutionPrice?: string | null;
            /** Format: date-time */
            createdAt?: string;
            /** Format: date-time */
            updatedAt?: string;
            /** Format: date-time */
            cancelledAt?: string | null;
            contractMetadata?: components["schemas"]["ContractMetadata"];
        };
        OrdersResponse: {
            orders?: components["schemas"]["OrderResponse"][];
            pagination?: components["schemas"]["PaginationSimple"];
        };
        Position: {
            symbol?: string;
            /** Format: int64 */
            instrumentId?: bigint;
            /** @description Total position size */
            totalQuantity?: string;
            /** @description Quantity currently on hold from open orders */
            quantityOnHold?: string;
            /** @description Average entry price */
            avgPrice?: string;
            outcome?: components["schemas"]["Outcome"];
            contractMetadata?: components["schemas"]["ContractMetadata"];
            prices?: components["schemas"]["PositionPrices"];
            /** @description Winning outcome ("yes" or "no") if the contract has resolved */
            resolutionSide?: string | null;
            /** @description Whether the position is above the auto-start threshold */
            isAboveAutoStartThreshold?: boolean;
            /** @description Whether the market is currently live/active */
            isLive?: boolean;
            /** @description Realized profit/loss from sells */
            realizedPl?: string | null;
            /**
             * @description Mark-to-market value of the position in USD at the current sell price (bestBid for YES, bestAsk for NO). **Absent** from the response when the held outcome has no live sell quote (no liquidity to sell into) — surface a no-liquidity state rather than a price the user cannot transact at. `lastTradePrice` is still returned for display. Treat as `Optional<T>`.
             * @example 65.00
             */
            marketValue?: string;
            /**
             * @description Unrealized P&L in USD (`marketValue - costBasis`). **Absent** whenever `marketValue` is absent. Treat as `Optional<T>`.
             * @example 12.50
             */
            unrealizedPnl?: string;
            /**
             * Format: double
             * @description Unrealized P&L as a percentage of cost basis. Expressed as a percent (e.g. `12.5` represents 12.5%, **not** `0.125`); rounded to 4 decimal places. **Absent** when there is no live sell quote, or when cost basis is zero. Treat as `Optional<T>`.
             * @example 23.81
             */
            unrealizedPct?: number;
        };
        /** @description Current bid/ask/last-trade prices for the contract */
        PositionPrices: {
            buy: {
                yes?: string | null;
                no?: string | null;
            };
            sell: {
                yes?: string | null;
                no?: string | null;
            };
            bestBid?: string | null;
            bestAsk?: string | null;
            lastTradePrice?: string | null;
        } | null;
        PositionsResponse: {
            positions?: components["schemas"]["Position"][];
            /** @description Total number of positions (for pagination) */
            total?: number | null;
        };
        /** @description A historically settled position in a resolved prediction market contract. */
        SettledPosition: {
            /**
             * Format: int64
             * @description Account that held the position
             */
            accountId?: bigint;
            /**
             * Format: int64
             * @description Unique instrument identifier for the contract
             */
            instrumentId?: bigint;
            /**
             * @description Contract instrument symbol
             * @example GEMI-FEDJAN26-DN25
             */
            instrumentSymbol?: string;
            /**
             * @description Signed position held at settlement. Positive values represent a `yes` position; negative values represent a `no` position.
             * @example 125
             */
            position?: string;
            /**
             * @description Absolute quantity held at settlement (unsigned)
             * @example 125
             */
            positionQuantity?: string;
            outcome?: components["schemas"]["Outcome"];
            /**
             * @description Payout received from settlement. `0` when the position lost.
             * @example 125.00
             */
            payout?: string;
            /** @description The winning outcome of the contract */
            resolutionSide?: components["schemas"]["Outcome"];
            /**
             * Format: date-time
             * @description Settlement timestamp (ISO 8601)
             */
            settledAt?: string;
            contractMetadata?: components["schemas"]["ContractMetadata"];
            /**
             * @description Total amount spent to enter the position, net of any prior realized P&L from partial sells. Omitted when cost-basis data is not available.
             * @example 78.75
             */
            costBasis?: string | null;
            /**
             * @description Realized profit or loss recorded from sells prior to settlement. Omitted when not available.
             * @example 0
             */
            realizedPnl?: string | null;
            /**
             * @description Net profit for the position, computed as `payout - costBasis + realizedPnl`. Omitted when `costBasis` is not available.
             * @example 46.25
             */
            netProfit?: string | null;
        };
        SettledPositionsResponse: {
            positions?: components["schemas"]["SettledPosition"][];
            /** @description Total number of settled positions across all pages for the current filter set. */
            total?: number | null;
            /** @description Sum of `payout` across all settled positions in the filter set. Retained for binary back-compat with the legacy response shape; **field is absent (not `null`) on the unified backend** because computing a roll-up over the full filtered set would require a separate aggregate query (deferred until a partner asks). Play's default `OptionHandlers` omits absent `Option` fields rather than emitting `null`. */
            totalPayout?: string;
            /** @description Sum of `costBasis` across all settled positions in the filter set. Retained for binary back-compat; **field is absent (not `null`) on the unified backend** (see `totalPayout`). */
            totalCostBasis?: string;
            /** @description Sum of `netProfit` across all settled positions in the filter set. Retained for binary back-compat; **field is absent (not `null`) on the unified backend** (see `totalPayout`). */
            totalNetProfit?: string;
            /** @description Cash-outs (early sells before contract resolution) in the same account-scoped time window as the returned page's settled positions. Field is absent (not `null`) when `withCashOuts=true` is not passed on the request. `positions[]` pagination is unaffected — `limit`/`offset` continue to scope `positions[]` only. */
            cashOuts?: components["schemas"]["CashedOutPosition"][];
            /**
             * @description Sum of `cashOuts[].proceeds` over the returned cash-outs. Field is absent (not `null`) when `withCashOuts=true` is not passed on the request.
             * @example 120.00
             */
            totalCashOutProceeds?: string;
            /**
             * @description Sum of `cashOuts[].costBasis` over the returned cash-outs. Field is absent (not `null`) when `withCashOuts=true` is not passed on the request.
             * @example 100.00
             */
            totalCashOutCostBasis?: string;
            /**
             * @description Sum of `cashOuts[].netProfit` over the returned cash-outs. Field is absent (not `null`) when `withCashOuts=true` is not passed on the request.
             * @example 20.00
             */
            totalCashOutNetProfit?: string;
        };
        /** @description A qualifying cash-out (early sell before contract resolution) with cost-basis context. Exposed only via the `withCashOuts=true` sibling array on `POST /v1/prediction-markets/positions/settled`. Distinct from `SettledPosition` — cash-outs don't have a `payout` or `resolutionSide` since the contract hadn't resolved when the user sold. */
        CashedOutPosition: {
            /**
             * Format: int64
             * @description Account that held the position.
             * @example 456
             */
            accountId: bigint;
            /**
             * Format: int64
             * @description Contract instrument ID.
             * @example 16789219
             */
            instrumentId: bigint;
            /**
             * @description Contract instrument symbol.
             * @example GEMI-FEDJAN26-DN25
             */
            instrumentSymbol: string;
            /**
             * Format: date-time
             * @description Wall-clock timestamp when the cash-out order closed (ISO 8601).
             * @example 2026-05-15T14:30:00.000Z
             */
            timestamp: string;
            /**
             * @description Quantity sold (cumulative filled quantity on the cash-out order).
             * @example 10
             */
            filledQuantity: string;
            /**
             * @description Always `sell` for cash-outs.
             * @example sell
             * @enum {string}
             */
            side: "sell";
            /**
             * @description Amount received from the sale in USD. For prediction sells, proceeds flow through `cash_balance` rather than `closed_orders.total_spend`, so the value is derived from position-balance snapshots before/after the fill.
             * @example 10.50
             */
            proceeds: string;
            /**
             * @description Cost basis allocated proportionally to the filled quantity (`(costBasisSpend / costBasisPositionBalance) * filledQuantity`).
             * @example 10.00
             */
            costBasis: string;
            /**
             * @description Realized P&L from this cash-out fill (`proceeds - costBasis`). Equals the ledger `realized_pl` delta on the position-balance row pair around the fill; falls back to `0` under transient market-data lag so a missing post-fill snapshot can't poison the page.
             * @example 0.50
             */
            netProfit: string;
            contractMetadata?: components["schemas"]["ContractMetadata"];
        };
        ContractShareVolume: {
            /**
             * @description Contract instrument symbol
             * @example GEMI-FED260318-CUT25
             */
            symbol?: string;
            /**
             * @description Total taker volume across all participants (in shares)
             * @example 94625
             */
            totalQty?: string;
            /**
             * @description The authenticated user's taker (aggressor) volume (in shares)
             * @example 1
             */
            userAggressorQty?: string | null;
            /**
             * @description The authenticated user's maker (resting) volume (in shares)
             * @example 0
             */
            userRestingQty?: string | null;
        };
        VolumeMetricsResponse: {
            /**
             * @description The event ticker
             * @example FED260318
             */
            eventTicker?: string;
            contracts?: components["schemas"]["ContractShareVolume"][];
        };
        PredictionMarketVolumeCategory: {
            /**
             * @description Display-name path from the top-level category to this category. It replaces recursive child nodes.
             * @example [
             *       "Sports",
             *       "Football",
             *       "Pro Football"
             *     ]
             */
            categoryPath: string[];
            /** @description Total volume for this category, including all descendant categories. */
            volume: components["schemas"]["PredictionMarketVolumeDecimal"];
        };
        PredictionMarketHourlyVolumeCategory: {
            /**
             * Format: date-time
             * @description Inclusive UTC start of this hourly period.
             * @example 2026-07-20T00:00:00Z
             */
            periodStart: string;
            /**
             * @description Display-name path from the top-level category to this category. It replaces recursive child nodes.
             * @example [
             *       "Sports",
             *       "Football",
             *       "Pro Football"
             *     ]
             */
            categoryPath: string[];
            /** @description Total volume for this category in this hour, including all descendant categories. */
            volume: components["schemas"]["PredictionMarketVolumeDecimal"];
        };
        /**
         * @description Non-negative decimal string. Preserve it as a string to avoid floating-point precision loss.
         * @example 143567.25
         */
        PredictionMarketVolumeDecimal: string;
        MakerRebateRateRule: {
            /**
             * Format: int64
             * @description Stable identifier for this rate rule.
             * @example 12
             */
            id: bigint;
            /**
             * Format: int32
             * @description Portion of the maker fee that is rebated, in basis points (10000 bps = 100%).
             * @example 5000
             */
            rebate_multiplier_bps: number;
            /**
             * Format: date-time
             * @description ISO-8601 timestamp at which this rule becomes effective. Always present; in practice never `null`.
             * @example 2026-03-19T00:00:00Z
             */
            effective_from: string | null;
            /**
             * @description Market category this rule applies to. When absent, the rule applies to all categories.
             * @example Crypto
             */
            category?: string;
            /**
             * Format: date-time
             * @description ISO-8601 timestamp after which this rule is superseded. Omitted when the rule is still current.
             * @example 2026-04-19T00:00:00Z
             */
            effective_to?: string;
        };
        MakerRebateRatesResponse: {
            rate_rules: components["schemas"]["MakerRebateRateRule"][];
        };
        MakerRebatePayout: {
            /**
             * Format: int64
             * @description Stable payout identifier.
             * @example 9182
             */
            id: bigint;
            /**
             * @description Total qualifying maker volume contributing to this payout, in USD.
             * @example 12450.00
             */
            total_volume_usd: string;
            /**
             * @description Total rebate paid, in USD.
             * @example 6.23
             */
            total_rebate_usd: string;
            /**
             * Format: int32
             * @description Number of qualifying maker fills that contributed to the payout.
             * @example 187
             */
            total_fill_count: number;
            /**
             * @description Payout status (e.g. `PENDING`, `PAID`).
             * @example PAID
             */
            status: string;
            /**
             * Format: date-time
             * @description ISO-8601 timestamp at which the rebate was credited. Always present; `null` for payouts that have not yet been paid.
             * @example 2026-05-20T21:00:00Z
             */
            paid_at: string | null;
            /**
             * Format: date-time
             * @description ISO-8601 timestamp at which the payout row was created. Always present.
             * @example 2026-05-20T20:55:12Z
             */
            created_at: string | null;
        };
        MakerRebatePayoutsResponse: {
            payouts: components["schemas"]["MakerRebatePayout"][];
        };
        MakerRebateLifetimeSummary: {
            /**
             * @description Sum of `total_rebate_usd` across payouts in the window.
             * @example 152.40
             */
            total_earned_usd: string;
            /**
             * Format: int64
             * @description Sum of qualifying maker fills across payouts in the window.
             * @example 4218
             */
            total_fill_count: bigint;
            /**
             * @description Sum of qualifying maker volume (USD) across payouts in the window.
             * @example 304800.00
             */
            total_volume_usd: string;
            /**
             * Format: int32
             * @description Number of payouts in the window. Always present; `0` when no payouts exist in the window.
             * @example 27
             */
            payout_count: number;
            /**
             * Format: date
             * @description Date of the earliest payout in the window, or `null` if no payouts exist.
             * @example 2026-03-19
             */
            first_payout_date: string | null;
            /**
             * Format: date
             * @description Date of the most recent payout in the window, or `null` if no payouts exist.
             * @example 2026-05-20
             */
            last_payout_date: string | null;
        };
        LiquidityRewardsConfig: {
            /**
             * Format: int32
             * @description Quotes wider than this spread score zero in the scoring algorithm. Only present when `enabled` is `true`.
             * @example 10
             */
            max_spread_cents?: number;
            /**
             * @description Daily reward amounts below this threshold are suppressed (sub-threshold accounts get no row at all). Only present when `enabled` is `true`.
             * @example 1.00
             */
            min_payout_threshold_usd?: string;
            /**
             * @description True when the program is fully configured upstream. When false, the response collapses to `{ "enabled": false }` only.
             * @example true
             */
            enabled: boolean;
        };
        LiquidityRewardEvent: {
            /**
             * @description Event ticker (e.g. `BTC2605202100`).
             * @example BTC2605202100
             */
            event_ticker: string;
            /**
             * @description Event title.
             * @example BTC above $95,000?
             */
            title: string;
            /**
             * @description Market category.
             * @example Crypto
             */
            category: string;
            /**
             * @description Daily USD reward pool budgeted for this event.
             * @example 500.00
             */
            daily_pool_usd: string;
            /**
             * @description Whether the pool came from a per-event override or the category default.
             * @example event_override
             * @enum {string}
             */
            pool_source: "event_override" | "category_default" | "unspecified";
            /**
             * Format: date-time
             * @description ISO-8601 timestamp at which the event ends and stops scoring. `null` when the underlying event has no end timestamp set.
             * @example 2026-05-20T21:00:00Z
             */
            ends_at: string | null;
            /**
             * Format: int32
             * @description Number of accounts that met qualifying-maker criteria in the most recent snapshot window for this event.
             * @example 14
             */
            qualifying_maker_count: number;
            /**
             * @description Optional URL for the event icon. Omitted when not configured.
             * @example https://example.com/btc.png
             */
            icon_url?: string;
        };
        LiquidityRewardsEventsResponse: {
            events: components["schemas"]["LiquidityRewardEvent"][];
            pagination: components["schemas"]["Pagination"];
            /**
             * Format: date
             * @description Most recent date for which scoring has been written. `null` when no scoring has run yet.
             * @example 2026-05-19
             */
            last_score_date: string | null;
        };
        LiquidityEventScore: {
            /**
             * Format: int64
             * @description Stable event identifier.
             * @example 1234567890
             */
            event_id: bigint;
            /**
             * @description Event title.
             * @example BTC above $95,000?
             */
            event_name: string;
            /**
             * @description Market category.
             * @example Crypto
             */
            category_name: string;
            /**
             * @description This account's normalized score for the event on the scoring date (0-1 range as a decimal string).
             * @example 0.4521
             */
            normalized_score: string;
            /**
             * Format: int32
             * @description Number of snapshots in which this account had a qualifying quote.
             * @example 1180
             */
            snapshot_count: number;
            /**
             * Format: int32
             * @description Total snapshots taken for the event on the scoring date.
             * @example 1440
             */
            total_snapshots: number;
            /**
             * @description Portion of the day's total reward attributed to this event.
             * @example 8.20
             */
            event_reward_usd: string;
        };
        LiquidityDailySummary: {
            /**
             * Format: date
             * @description Date the payout applies to (Eastern Time).
             * @example 2026-05-07
             */
            payout_date: string;
            /**
             * @description Total USD reward for the day across all events the account scored on.
             * @example 12.45
             */
            total_reward_usd: string;
            /**
             * @description Status of the day's payout (e.g. `PENDING`, `PAID`, `ZERO_AMOUNT`).
             * @example PAID
             */
            payout_status: string;
            /**
             * Format: date-time
             * @description ISO-8601 timestamp the day's payout was credited. Always present; `null` if not yet paid.
             * @example 2026-05-08T21:00:00Z
             */
            paid_at: string | null;
            /** @description Per-event score breakdown showing how the day's total was distributed. */
            events: components["schemas"]["LiquidityEventScore"][];
        };
        LiquidityRewardsDailySummaryResponse: {
            daily_summaries: components["schemas"]["LiquidityDailySummary"][];
        };
        LiquidityRewardsLifetimeSummary: {
            /**
             * @description Sum of `total_reward_usd` across daily payouts in the window.
             * @example 84.20
             */
            total_earned_usd: string;
            /**
             * Format: int32
             * @description Number of daily payouts in the window. Always present; `0` when no payouts exist in the window.
             * @example 12
             */
            payout_count: number;
            /**
             * Format: date
             * @description Date of the earliest payout in the window, or `null` if no payouts exist.
             * @example 2026-05-08
             */
            first_payout_date: string | null;
            /**
             * Format: date
             * @description Date of the most recent payout in the window, or `null` if no payouts exist.
             * @example 2026-05-20
             */
            last_payout_date: string | null;
        };
    };
    responses: {
        /** @description Invalid request parameters */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Authentication required or invalid credentials */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Internal server error */
        InternalError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Prediction markets feature is temporarily unavailable */
        ServiceUnavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: {
        /** @description Maximum number of results to return (max 500) */
        Limit: number;
        /** @description Number of results to skip for pagination */
        Offset: number;
        /** @description Filter by `sportsMarket.sport`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`; valid combinations with no matching events return an empty result. */
        SportFilter: components["schemas"]["SportsMarketSport"][];
        /** @description Filter by `sportsMarket.type`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
        SportsMarketTypeFilter: components["schemas"]["SportsMarketType"][];
        /** @description Filter by `sportsMarket.subject`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
        SportsMarketSubjectFilter: components["schemas"]["SportsMarketSubject"][];
        /** @description Filter by `sportsMarket.scope.type`. Repeat the parameter to match any supplied value (OR). Ordinal and range qualifiers are not inferred by this filter. Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
        SportsMarketScopeFilter: components["schemas"]["SportsMarketScopeType"][];
        /** @description Filter by `sportsMarket.metric`. Repeat the parameter to match any supplied value (OR). A metric can be queried without `sport`; use `sport` when its sport-specific meaning matters. Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
        SportsMarketMetricFilter: components["schemas"]["SportsMarketMetric"][];
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listEvents: {
        parameters: {
            query?: {
                /** @description Filter by event status (can specify multiple) */
                status?: components["schemas"]["MarketStatus"][];
                /** @description Filter by category (can specify multiple). If omitted, returns events from all categories. */
                category?: string[];
                /** @description Filter by `sportsMarket.sport`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`; valid combinations with no matching events return an empty result. */
                sport?: components["parameters"]["SportFilter"];
                /** @description Filter by `sportsMarket.type`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_type?: components["parameters"]["SportsMarketTypeFilter"];
                /** @description Filter by `sportsMarket.subject`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_subject?: components["parameters"]["SportsMarketSubjectFilter"];
                /** @description Filter by `sportsMarket.scope.type`. Repeat the parameter to match any supplied value (OR). Ordinal and range qualifiers are not inferred by this filter. Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_scope?: components["parameters"]["SportsMarketScopeFilter"];
                /** @description Filter by `sportsMarket.metric`. Repeat the parameter to match any supplied value (OR). A metric can be queried without `sport`; use `sport` when its sport-specific meaning matters. Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_metric?: components["parameters"]["SportsMarketMetricFilter"];
                /** @description Search text to filter events by title */
                search?: string;
                /** @description Maximum number of results to return (max 500) */
                limit?: components["parameters"]["Limit"];
                /** @description Number of results to skip for pagination */
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventsResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    getEvent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description The event ticker symbol (e.g., "BTC100K") */
                eventTicker: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Event"];
                };
            };
            /** @description Event not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    getEventStrike: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description The event ticker symbol (e.g., "BTC05M2603271950") */
                eventTicker: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Strike"];
                };
            };
            /** @description Strike not found (event doesn't exist or doesn't have strike data) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "Strike not found"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    listNewlyListedEvents: {
        parameters: {
            query?: {
                /** @description Filter by category (can specify multiple). If omitted, returns events from all categories. */
                category?: string[];
                /** @description Filter by `sportsMarket.sport`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`; valid combinations with no matching events return an empty result. */
                sport?: components["parameters"]["SportFilter"];
                /** @description Filter by `sportsMarket.type`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_type?: components["parameters"]["SportsMarketTypeFilter"];
                /** @description Filter by `sportsMarket.subject`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_subject?: components["parameters"]["SportsMarketSubjectFilter"];
                /** @description Filter by `sportsMarket.scope.type`. Repeat the parameter to match any supplied value (OR). Ordinal and range qualifiers are not inferred by this filter. Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_scope?: components["parameters"]["SportsMarketScopeFilter"];
                /** @description Filter by `sportsMarket.metric`. Repeat the parameter to match any supplied value (OR). A metric can be queried without `sport`; use `sport` when its sport-specific meaning matters. Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_metric?: components["parameters"]["SportsMarketMetricFilter"];
                /** @description Maximum number of results to return (max 500) */
                limit?: components["parameters"]["Limit"];
                /** @description Number of results to skip for pagination */
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventsResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    listRecentlySettledEvents: {
        parameters: {
            query?: {
                /** @description Filter by category (can specify multiple). If omitted, returns events from all categories. */
                category?: string[];
                /** @description Filter by `sportsMarket.sport`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`; valid combinations with no matching events return an empty result. */
                sport?: components["parameters"]["SportFilter"];
                /** @description Filter by `sportsMarket.type`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_type?: components["parameters"]["SportsMarketTypeFilter"];
                /** @description Filter by `sportsMarket.subject`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_subject?: components["parameters"]["SportsMarketSubjectFilter"];
                /** @description Filter by `sportsMarket.scope.type`. Repeat the parameter to match any supplied value (OR). Ordinal and range qualifiers are not inferred by this filter. Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_scope?: components["parameters"]["SportsMarketScopeFilter"];
                /** @description Filter by `sportsMarket.metric`. Repeat the parameter to match any supplied value (OR). A metric can be queried without `sport`; use `sport` when its sport-specific meaning matters. Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_metric?: components["parameters"]["SportsMarketMetricFilter"];
                /** @description Maximum number of results to return (max 500) */
                limit?: components["parameters"]["Limit"];
                /** @description Number of results to skip for pagination */
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventsResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    listUpcomingEvents: {
        parameters: {
            query?: {
                /** @description Filter by category (can specify multiple). If omitted, returns events from all categories. */
                category?: string[];
                /** @description Filter by `sportsMarket.sport`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`; valid combinations with no matching events return an empty result. */
                sport?: components["parameters"]["SportFilter"];
                /** @description Filter by `sportsMarket.type`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_type?: components["parameters"]["SportsMarketTypeFilter"];
                /** @description Filter by `sportsMarket.subject`. Repeat the parameter to match any supplied value (OR). Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_subject?: components["parameters"]["SportsMarketSubjectFilter"];
                /** @description Filter by `sportsMarket.scope.type`. Repeat the parameter to match any supplied value (OR). Ordinal and range qualifiers are not inferred by this filter. Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_scope?: components["parameters"]["SportsMarketScopeFilter"];
                /** @description Filter by `sportsMarket.metric`. Repeat the parameter to match any supplied value (OR). A metric can be queried without `sport`; use `sport` when its sport-specific meaning matters. Sports-market filters compose independently using AND. Unsupported enum values return `400 Bad Request`. */
                sports_market_metric?: components["parameters"]["SportsMarketMetricFilter"];
                /** @description Maximum number of results to return (max 500) */
                limit?: components["parameters"]["Limit"];
                /** @description Number of results to skip for pagination */
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventsResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    getCategories: {
        parameters: {
            query?: {
                /** @description Filter categories by event status */
                status?: components["schemas"]["MarketStatus"][];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @example [
                         *       "sports",
                         *       "politics",
                         *       "crypto",
                         *       "entertainment"
                         *     ]
                         */
                        categories?: string[];
                    };
                };
            };
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    getPredictionMarketDailyVolume: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Completed UTC calendar date in `YYYY-MM-DD` format. */
                date: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Category volume for the requested UTC day */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PredictionMarketVolumeCategory"][];
                };
            };
            /** @description Invalid or unsupported date. The message includes the current one-year UTC date bounds. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description No complete volume data is available for the requested date. This includes dates before prediction markets launched and post-launch dates with a missing source hour. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "NOT_FOUND",
                     *       "message": "Prediction market volume data is not available for the requested date"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description The canonical source is invalid or temporarily unavailable. The endpoint does not return a partial result. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "SERVICE_UNAVAILABLE",
                     *       "message": "Prediction market volume data is temporarily unavailable"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    getPredictionMarketHourlyVolume: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Completed UTC calendar date in `YYYY-MM-DD` format. */
                date: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Hourly category volume for the requested UTC day */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PredictionMarketHourlyVolumeCategory"][];
                };
            };
            /** @description Invalid or unsupported date. The message includes the current one-year UTC date bounds. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description No complete volume data is available for the requested date. This includes dates before prediction markets launched and post-launch dates with a missing source hour. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "NOT_FOUND",
                     *       "message": "Prediction market volume data is not available for the requested date"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description The canonical source is invalid or temporarily unavailable. The endpoint does not return a partial result. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "SERVICE_UNAVAILABLE",
                     *       "message": "Prediction market volume data is temporarily unavailable"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    getPredictionMarketsTerms: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Latest Prediction Markets terms */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PredictionMarketsTerms"];
                };
            };
            /** @description No Prediction Markets terms are configured */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "TermsNotFound",
                     *       "message": "No terms configured for prediction markets"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            500: components["responses"]["InternalError"];
        };
    };
    getPredictionMarketsTermsStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Terms acceptance status */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PredictionMarketsTermsStatus"];
                };
            };
            401: components["responses"]["Unauthorized"];
            500: components["responses"]["InternalError"];
        };
    };
    acceptPredictionMarketsTerms: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Terms accepted */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "success": true
                     *     }
                     */
                    "application/json": components["schemas"]["AcceptPredictionMarketsTermsResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
            /** @description No Prediction Markets terms are configured */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "TermsNotFound",
                     *       "message": "No terms configured for prediction markets"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            500: components["responses"]["InternalError"];
        };
    };
    placeOrder: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderRequest"];
            };
        };
        responses: {
            /** @description Order created successfully */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            /** @description Order rejected (e.g., insufficient funds) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    placeOrderBatch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PlaceOrderBatchRequest"];
            };
        };
        responses: {
            /** @description Batch processed. Results are returned in request order and may contain both successful orders and per-entry errors. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlaceOrderBatchResponse"];
                };
            };
            /** @description Invalid payload, empty batch, more than 20 entries, or an invalid order. No orders are submitted. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthErrorResponse"] | components["schemas"]["PredictionMarketsError"];
                };
            };
            /** @description Authentication is missing or invalid. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthErrorResponse"];
                };
            };
            /** @description The account is not permitted to place orders or has not accepted the current Prediction Markets terms. No orders are submitted. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthErrorResponse"] | components["schemas"]["AccountGroupBlockedError"] | components["schemas"]["TermsNotAcceptedError"] | components["schemas"]["RestrictedSellOnlyError"];
                };
            };
            /** @description The request nonce conflicts with a previously submitted request. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthErrorResponse"];
                };
            };
            /** @description An order failed an up-front risk check. No orders are submitted. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PredictionMarketsError"];
                };
            };
            /** @description Internal server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PredictionMarketsError"];
                };
            };
            /** @description Prediction markets or batch orders are temporarily unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PredictionMarketsError"];
                };
            };
        };
    };
    cancelOrder: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: int64
                     * @description The order ID to cancel
                     * @example 12345678
                     */
                    orderId: bigint;
                };
            };
        };
        responses: {
            /** @description Order cancelled successfully */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example ok */
                        result?: string;
                        /** @example Order 12345678 cancelled successfully */
                        message?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            /** @description Order not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Order cannot be cancelled (e.g., already filled) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    cancelOrderBatch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelOrderBatchRequest"];
            };
        };
        responses: {
            /** @description Batch processed. Results are returned in request order and may contain both successful cancellations and per-entry errors. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CancelOrderBatchResponse"];
                };
            };
            /** @description Invalid payload, empty batch, more than 20 entries, or an invalid order ID. No orders are cancelled. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthErrorResponse"] | components["schemas"]["PredictionMarketsError"];
                };
            };
            /** @description Authentication is missing or invalid. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthErrorResponse"];
                };
            };
            /** @description The account is not permitted to cancel orders. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthErrorResponse"];
                };
            };
            /** @description The request nonce conflicts with a previously submitted request. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthErrorResponse"];
                };
            };
            /** @description Internal server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PredictionMarketsError"];
                };
            };
            /** @description Prediction markets or batch orders are temporarily unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PredictionMarketsError"];
                };
            };
        };
    };
    getActiveOrders: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    /**
                     * @description Filter by contract instrument symbol
                     * @example GEMI-FEDJAN26-DN25
                     */
                    symbol?: string;
                    /**
                     * @description Maximum number of results to return (default 50, max 100)
                     * @default 50
                     */
                    limit?: number;
                    /**
                     * @description Number of results to skip for pagination
                     * @default 0
                     */
                    offset?: number;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrdersResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    getOrderHistory: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    /**
                     * @description Filter by order status
                     * @enum {string}
                     */
                    status?: "filled" | "cancelled";
                    /**
                     * @description Filter by contract instrument symbol
                     * @example GEMI-FEDJAN26-DN25
                     */
                    symbol?: string;
                    /**
                     * @description Maximum number of results to return. Defaults to 50 and is capped at 1000.
                     * @default 50
                     */
                    limit?: number;
                    /**
                     * @description Number of results to skip for pagination. Offset is ignored when `from` or `to` is supplied.
                     * @default 0
                     */
                    offset?: number;
                    /**
                     * Format: int64
                     * @description Inclusive start of the order-closed time range, expressed as Unix epoch milliseconds. Use with `to` for a UTC daily window.
                     * @example 1775001600000
                     */
                    from?: bigint;
                    /**
                     * Format: int64
                     * @description Exclusive end of the order-closed time range, expressed as Unix epoch milliseconds. `from` must not be later than `to`.
                     * @example 1775088000000
                     */
                    to?: bigint;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrdersResponse"];
                };
            };
            /** @description Invalid status parameter or date range */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            401: components["responses"]["Unauthorized"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    getPositions: {
        parameters: {
            query?: {
                /** @description Filter positions to a single event ticker (e.g. `FEDJAN26`). Positions on sub-events whose `parentEventTicker` matches the value may also be included. */
                eventTicker?: string;
                /** @description Maximum number of positions to return. Clamped to `[1, 1000]` when supplied. Omit for legacy unpaginated behavior. */
                limit?: number;
                /** @description Number of positions to skip for pagination. Floor-clamped to `0` when supplied. Ignored when `limit` is omitted (the response is unpaginated). */
                offset?: number;
                /** @description Sort order. Accepts `positionValue`, `unrealizedPnl`, or `expiryDate` (case-insensitive), optionally prefixed with `+` (ascending) or `-` (descending). A bare field name uses each field's default direction: `positionValue` and `unrealizedPnl` default to descending; `expiryDate` defaults to ascending (soonest-first). `unrealizedPnl` and `expiryDate` sort NULLS LAST so positions without the sort key sink to the bottom regardless of direction. `instrumentId` ascending is the final tiebreaker for stable pagination across quote ticks. A malformed `sort` value silently falls back to `-positionValue` — no `400` is returned. */
                sort?: "positionValue" | "+positionValue" | "-positionValue" | "unrealizedPnl" | "+unrealizedPnl" | "-unrealizedPnl" | "expiryDate" | "+expiryDate" | "-expiryDate";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PositionsResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    getSettledPositions: {
        parameters: {
            query?: {
                /** @description Optional event ticker to filter settled positions to a single event (e.g. `FEDJAN26`). If omitted, all settled positions for the account are returned. */
                eventTicker?: string;
                /** @description Maximum number of settled positions to return. */
                limit?: number;
                /** @description Number of settled positions to skip for pagination. */
                offset?: number;
                /** @description Sort order. Accepts `date` or `payout`, optionally prefixed with `+` (ascending) or `-` (descending). A bare field name defaults to descending. `date` ascending is rejected and silently falls back to the default order — settled positions are conceptually ordered most-recent-first. A malformed `sort` value also falls back silently; no `400` is returned. */
                sort?: "date" | "-date" | "payout" | "+payout" | "-payout";
                /** @description Case-insensitive substring filter. Matches against the event name, contract name, event ticker, or any ancestor category name in the contract's category subtree (up to four levels). Whitespace is trimmed; inputs under 3 characters are dropped (GIN trigram lookup floor); inputs over 64 characters are truncated. */
                search?: string;
                /** @description Filter to settled positions whose contract's event belongs to the named category (or any of its descendants in the category tree). Whitespace is trimmed; empty values are ignored. */
                category?: string;
                /** @description Opt-in flag. When `true`, the response carries new sibling fields (`cashOuts`, `totalCashOutProceeds`, `totalCashOutCostBasis`, `totalCashOutNetProfit`) populated with the qualifying cash-outs in the same account-scoped time window as the returned page's settled positions. When `false` (default) the response shape is byte-identical to the pre-`withCashOuts` contract: the `positions[]` element schema is unchanged regardless of the flag. */
                withCashOuts?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettledPositionsResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    getVolumeMetrics: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description The event ticker symbol
                     * @example FED260318
                     */
                    eventTicker: string;
                    /**
                     * Format: int64
                     * @description Start of time range filter (epoch milliseconds). If omitted, defaults to the earliest contract creation time.
                     */
                    startTime?: bigint;
                    /**
                     * Format: int64
                     * @description End of time range filter (epoch milliseconds). If omitted, includes all trades up to now.
                     */
                    endTime?: bigint;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VolumeMetricsResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    listCombos: {
        parameters: {
            query?: {
                /** @description Filter by combo contract status (for example, `Active`, `Settled`, or `Voided`). Defaults to `Active` when omitted. */
                status?: string;
                /** @description Filter to combos that contain a specific underlying contract ID as a leg */
                contractId?: bigint;
                /** @description Filter by whether the combo has been registered with an instrument symbol */
                instrumentRegistered?: boolean;
                /** @description Maximum number of results to return (max 500) */
                limit?: components["parameters"]["Limit"];
                /** @description Number of results to skip for pagination */
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListCombosResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    createCombo: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateComboRequest"];
            };
        };
        responses: {
            /** @description The canonical combo already exists. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateComboResponse"];
                };
            };
            /** @description A new canonical combo was created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateComboResponse"];
                };
            };
            /** @description The request body is malformed or fails combo validation. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "InvalidInput",
                     *       "code": "COMBO_VALIDATION_ERROR",
                     *       "message": "a combo needs 2-6 legs"
                     *     }
                     */
                    "application/json": components["schemas"]["ComboWriteError"];
                };
            };
            /** @description Signed private REST authentication is missing or invalid. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthErrorResponse"];
                };
            };
            /** @description The API key lacks `PredictionsNewOrder`, or the authenticated trading account is restricted. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthErrorResponse"];
                };
            };
            /** @description Combos are unavailable, or an underlying contract in the request cannot be found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ComboWriteError"];
                };
            };
            /** @description An unexpected error occurred while creating the combo. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "InternalError",
                     *       "message": "An unexpected error occurred"
                     *     }
                     */
                    "application/json": components["schemas"]["ComboWriteError"];
                };
            };
        };
    };
    getComboByInstrumentSymbol: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description The combo contract's instrument symbol (e.g. `GEMI-CMB-0526-A7F3B2C1D4E5`)
                 * @example GEMI-CMB-0526-A7F3B2C1D4E5
                 */
                instrumentSymbol: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ComboResponse"];
                };
            };
            /** @description Combo not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "NOT_FOUND",
                     *       "message": "Combo not found"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            500: components["responses"]["InternalError"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    getMakerRebateRates: {
        parameters: {
            query?: {
                /** @description Filter to rules that apply to this category (e.g. `Crypto`, `Sports`). When omitted, returns all rules. */
                category?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MakerRebateRatesResponse"];
                };
            };
            /** @description Internal server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "An unexpected error occurred"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Maker rebate program is not currently available */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "Maker rebate program is not currently available"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    listMakerRebatePayouts: {
        parameters: {
            query?: {
                /** @description Maximum number of payouts to return (default 50, clamped to [1, 100]). */
                limit?: number;
                /** @description Number of payouts to skip (default 0). */
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MakerRebatePayoutsResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
            /** @description Internal server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "An unexpected error occurred"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Maker rebate program is not currently available */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "Maker rebate program is not currently available"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    getMakerRebateLifetimeSummary: {
        parameters: {
            query?: {
                /** @description Inclusive start of the payout date window (`YYYY-MM-DD`, Eastern Time). Must be provided together with `dateTo`. */
                dateFrom?: string;
                /** @description Inclusive end of the payout date window (`YYYY-MM-DD`, Eastern Time). Must be on or after `dateFrom` and within 5 years of it. */
                dateTo?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MakerRebateLifetimeSummary"];
                };
            };
            /** @description Invalid date parameters */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "BAD_REQUEST",
                     *       "message": "date_to must be on or after date_from"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            401: components["responses"]["Unauthorized"];
            /** @description Internal server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "INTERNAL_ERROR",
                     *       "message": "An unexpected error occurred"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Maker rebate program is not currently available */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "SERVICE_UNAVAILABLE",
                     *       "message": "Maker rebate program is not currently available"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    getLiquidityRewardsConfig: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LiquidityRewardsConfig"];
                };
            };
            /** @description Internal server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "INTERNAL_ERROR",
                     *       "message": "An unexpected error occurred"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Liquidity rewards program is not currently available */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "SERVICE_UNAVAILABLE",
                     *       "message": "Liquidity rewards program is not currently available"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    listLiquidityRewardsEvents: {
        parameters: {
            query?: {
                /** @description Comma-separated list of category names. Whitespace is trimmed and empty entries are dropped. */
                category?: string;
                /** @description Filter events by title substring (case-insensitive). */
                search?: string;
                /** @description Sort order for the returned events. Defaults to `daily_pool_desc`. */
                sort?: "daily_pool_desc" | "daily_pool_asc" | "ends_soonest" | "ends_latest" | "title_asc" | "title_desc" | "category_asc" | "category_desc" | "competition_asc" | "competition_desc";
                /** @description Maximum number of events to return (default 50, clamped to [1, 100]). */
                limit?: number;
                /** @description Number of events to skip (default 0). */
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LiquidityRewardsEventsResponse"];
                };
            };
            /** @description Invalid sort or pagination parameters */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "BAD_REQUEST",
                     *       "message": "sort must be one of: daily_pool_desc, daily_pool_asc, ends_soonest, ends_latest, title_asc, title_desc, category_asc, category_desc, competition_asc, competition_desc (got 'foo')"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Internal server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "INTERNAL_ERROR",
                     *       "message": "An unexpected error occurred"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Liquidity rewards program is not currently available */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "SERVICE_UNAVAILABLE",
                     *       "message": "Liquidity rewards program is not currently available"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    getLiquidityRewardsDailySummary: {
        parameters: {
            query: {
                /** @description Inclusive start of the date window (`YYYY-MM-DD`, Eastern Time). */
                dateFrom: string;
                /** @description Inclusive end of the date window (`YYYY-MM-DD`, Eastern Time). Must be on or after `dateFrom`. */
                dateTo: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LiquidityRewardsDailySummaryResponse"];
                };
            };
            /** @description Invalid date parameters */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "date_to must be on or after date_from"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            401: components["responses"]["Unauthorized"];
            /** @description Internal server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "An unexpected error occurred"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Liquidity rewards program is not currently available */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "Liquidity incentive program is not currently available"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    getLiquidityRewardsLifetimeSummary: {
        parameters: {
            query?: {
                /** @description Inclusive start of the payout date window (`YYYY-MM-DD`, Eastern Time). Must be provided together with `dateTo`. */
                dateFrom?: string;
                /** @description Inclusive end of the payout date window (`YYYY-MM-DD`, Eastern Time). Must be on or after `dateFrom` and within 5 years of it. */
                dateTo?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LiquidityRewardsLifetimeSummary"];
                };
            };
            /** @description Invalid date parameters */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "BAD_REQUEST",
                     *       "message": "date_to must be on or after date_from"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            401: components["responses"]["Unauthorized"];
            /** @description Internal server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "INTERNAL_ERROR",
                     *       "message": "An unexpected error occurred"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Liquidity rewards program is not currently available */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": "SERVICE_UNAVAILABLE",
                     *       "message": "Liquidity rewards program is not currently available"
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
}
