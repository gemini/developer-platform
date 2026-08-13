// Generated from rest.yaml#Market Data. Do not edit.

export interface paths {
    "/v1/symbols": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Symbols
         * @description This endpoint retrieves all available symbols for trading.
         */
        get: operations["listSymbols"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/symbols/details/{symbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Symbol Details
         * @description This endpoint retrieves extra detail on supported symbols, such as minimum order size, tick size, quote increment and more.
         */
        get: operations["getSymbolDetails"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/networks/{network}/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Assets for Network
         * @description This endpoint retrieves the enabled assets (tokens) available on a specified blockchain network, filtered by your account's access permissions.
         *
         *     This authenticated endpoint returns only the assets where your account has deposit and withdraw access enabled on the specified network.
         *
         *     Use this endpoint to discover all tokens that support deposits and withdrawals on a particular blockchain network.
         *
         *     The `assets` field in the response is always an array, sorted alphabetically, containing one or more enabled asset codes.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Fund Manager or Auditor role assigned. See [Roles](/roles#roles) for more information.
         */
        get: operations["getAssetsForNetwork"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/network/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Network
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *           The v1 network endpoint is being retired. This v2 endpoint is the recommended replacement, offering account-level filtering for deposit and withdraw access. Please migrate to this endpoint at your earliest convenience.
         *       </div>
         *     </div>
         *
         *     This endpoint retrieves the associated network(s) for a requested token, filtered by your account's access permissions.
         *
         *     This authenticated endpoint returns only the networks where your account has both deposit and withdraw access enabled. This supports the multinetwork deposit and withdrawal flow.
         *
         *     Many tokens are available on multiple blockchain networks. For example, USDC is available on Optimism, Solana, Base, Arbitrum, Avalanche, and Ethereum. Use this endpoint to discover which networks your account can deposit to and withdraw from for a given token.
         *
         *     The `network` field in the response is always an array, which may contain one or more supported networks.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Fund Manager or Auditor role assigned. See [Roles](/roles#roles) for more information.
         */
        get: operations["getTokenNetworkV2"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/pubticker/{symbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Ticker
         * @description This endpoint retrieves information about recent trading activity for the symbol.
         *
         *     <p class="p-4 text-sm section-icon section-info rounded-sm flex" role="alert">
         *       <svg
         *         view-box="0 0 24 24"
         *       >
         *         <path
         *           fill-rule="evenodd"
         *           clip-rule="evenodd"
         *           d="M11.1258 5.63252C11.5068 4.94671 12.4932 4.94671 12.8742 5.63252L19.4751 17.5143C19.8454 18.1808 19.3635 18.9999 18.601 18.9999H5.39903C4.63655 18.9999 4.15458 18.1808 4.52487 17.5143L11.1258 5.63252ZM14.6225 4.66123C13.4795 2.6038 10.5205 2.60381 9.37753 4.66124L2.77656 16.543C1.66567 18.5426 3.11158 20.9999 5.39903 20.9999H18.601C20.8884 20.9999 22.3343 18.5426 21.2234 16.543L14.6225 4.66123ZM11 7.99991V13.9999H13V7.99991H11ZM11 15.9999V17.9999H13V15.9999H11Z"
         *         />
         *       </svg>
         *       <span>
         *       We recommend using <a href="/rest/market-data#get-ticker-v2">Version 2</a> to retrieve recent ticker activty.
         *       </span>
         *     </p>
         */
        get: operations["getTicker"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/feepromos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Fee Promos
         * @description This endpoint retrieves symbols that currently have fee promos.
         */
        get: operations["listFeePromos"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/book/{symbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Current Order Book
         * @description This will return the current order book as two arrays (bids / asks).
         *
         *     <p class="p-4 text-sm section-icon section-info rounded-sm flex" role="alert">
         *       <svg
         *         view-box="0 0 24 24"
         *       >
         *         <path
         *           fill-rule="evenodd"
         *           clip-rule="evenodd"
         *           d="M11.1258 5.63252C11.5068 4.94671 12.4932 4.94671 12.8742 5.63252L19.4751 17.5143C19.8454 18.1808 19.3635 18.9999 18.601 18.9999H5.39903C4.63655 18.9999 4.15458 18.1808 4.52487 17.5143L11.1258 5.63252ZM14.6225 4.66123C13.4795 2.6038 10.5205 2.60381 9.37753 4.66124L2.77656 16.543C1.66567 18.5426 3.11158 20.9999 5.39903 20.9999H18.601C20.8884 20.9999 22.3343 18.5426 21.2234 16.543L14.6225 4.66123ZM11 7.99991V13.9999H13V7.99991H11ZM11 15.9999V17.9999H13V15.9999H11Z"
         *         />
         *       </svg>
         *       The quantities and prices returned are returned as strings rather than numbers. The numbers returned are exact, not rounded, and it can be dangerous to treat them as floating point numbers.
         *     </p>
         */
        get: operations["getCurrentOrderBook"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/trades/{symbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Trades
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *           This public API endpoint is limited to retrieving seven calendar days of data.
         *       </div>
         *
         *       <span>
         *         Please contact us <a href="https://gemini24.zendesk.com/hc/en-us/requests/new" target="_blank">through this form</a> for information about Gemini market data.
         *       </span>
         *     </div>
         *
         *     This will return the trades that have executed since the specified timestamp. Timestamps are either seconds or milliseconds since the epoch (1970-01-01). See the [Data Types](/data-types) section about `timestamp` for information on this.
         *
         *     Each request will show at most 500 records.
         *
         *     If no `since` or `timestamp` is specified, then it will show the most recent trades; otherwise, it will show the most recent trades that occurred after that timestamp.
         */
        get: operations["listTrades"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/pricefeed": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Prices */
        get: operations["listPrices"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/fundingamount/{symbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Funding Amount */
        get: operations["getFundingAmount"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/fundingamountreport/records.xlsx": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Funding Amount Report File
         * @description ### Examples
         *     - `symbol=BTCGUSDPERP&fromDate=2024-04-10&toDate=2024-04-25&numRows=1000` </br>
         *     Compare and obtain the minimum records between (2024-04-10 to 2024-04-25) and 1000. If (2024-04-10 to 2024-04-25) contains 360 records. Then fetch the minimum between 360 and 1000 records only.
         *
         *     - `symbol=BTCGUSDPERP&numRows=2024-04-10&toDate=2024-04-25` </br>
         *     If (2024-04-10 to 2024-04-25) contains 360 records. Then fetch 360 records only.
         *
         *     - `symbol=BTCGUSDPERP&numRows=1000` </br>
         *     Fetch maximum 1000 records starting from Now to a historical date
         *
         *     - `symbol=BTCGUSDPERP` </br>
         *     Fetch maximum 8760 records starting from Now to a historical date
         */
        get: operations["getFundingAmountReportFile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/order/new": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create New Order
         * @description If you wish orders to be automatically cancelled when your session ends, see the [require heartbeat](/authentication/api-key#require-heartbeat) section, or manually send the [cancel all session orders](/rest/orders#cancel-all-session-orders) message.
         *
         *     <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *           Master API keys do not support cancelation on disconnect via heartbeat.
         *       </div>
         *
         *       Enabled for perpetuals accounts from July 10th, 0100hrs ET onwards.
         *     </div>
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See <a href="/roles#roles">Roles</a> for more information.
         *
         *     The OAuth scope must have `orders:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         *
         *
         *     ### Margin Orders
         *     Set `margin_order: true` to place an order using borrowed funds on a margin-enabled account. This allows you to trade with leverage beyond your available balance.
         *
         *     **Important**: Margin trading amplifies both gains and losses. Monitor your account using the [Margin Account Summary](/rest/margin-trading#get-margin-account-summary) endpoint and preview order impacts with [Order Preview](/rest/margin-trading#preview-margin-order-impact) before placing margin orders.
         *
         *     ###  Stop-Limit Orders
         *     A Stop-Limit order is an order type that allows for order placement when a price reaches a specified level. Stop-Limit orders take in both a `price` and and a `stop_price` as parameters. The `stop_price` is the price that triggers the order to be placed on the continous live order book at the `price`. For buy orders, the `stop_price` must be below the `price` while sell orders require the `stop_price` to be greater than the `price`.
         *
         *
         *     ### What about market orders?
         *     The API doesn't directly support market orders because they provide you with no price protection.
         *
         *     Instead, use the “immediate-or-cancel” order execution option, coupled with an aggressive limit price (i.e. very high for a buy order or very low for a sell order), to achieve the same result.
         *
         *     ### Order execution options
         *     Note that `options` is an array. If you omit `options` or provide an empty array, your order will be a standard limit order - it will immediately fill against any open orders at an equal or better price, then the remainder of the order will be posted to the order book.
         *
         *     If you specify more than one option (or an unsupported option) in the `options` array, the exchange will reject your order.
         *
         *     No `options` can be applied to stop-limit orders at this time.
         *
         *     The available limit order options are:
         *
         *     | Option | Description |
         *     |--------|-------------|
         *     | `"maker-or-cancel"` | This order will only add liquidity to the order book.<br><br>If any part of the order could be filled immediately, the whole order will instead be canceled before any execution occurs.<br><br> If that happens, the response back from the API will indicate that the order has already been canceled (`"is_cancelled": true` in JSON).<br><br>*Note: some other exchanges call this option "post-only".* |
         *     | `"immediate-or-cancel"` | This order will only remove liquidity from the order book.<br><br>It will fill whatever part of the order it can immediately, then cancel any remaining amount so that no part of the order is added to the order book.<br><br>If the order doesn't fully fill immediately, the response back from the API will indicate that the order has already been canceled (`"is_cancelled": true` in JSON). |
         *     | `"fill-or-kill"` | This order will only remove liquidity from the order book.<br><br>It will fill the entire order immediately or cancel.<br><br>If the order doesn't fully fill immediately, the response back from the API will indicate that the order has already been canceled (`"is_cancelled": true` in JSON). |
         */
        post: operations["createNewOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/order/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel Order
         * @description This will cancel an order. If the order is already canceled, the message will succeed but have no effect.
         *
         *     <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *           Enabled for perpetuals accounts from July 10th, 0100hrs ET onwards.
         *       </div>
         *     </div>
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles) for more information.
         *
         *     The OAuth scope must have `orders:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         *
         *     ### All Cancellation Reasons
         *     Under unique circumstances, orders may be automatically cancelled by the exchange. These scenarios are detailed in the table below:
         *
         *     | Cancel Reason | Description |
         *     |---------------|-------------|
         *     | `MakerOrCancelWouldTake` | Occurs when the "maker-or-cancel" execution option is included in the order request and any part of the requested order could be filled immediately. |
         *     | `ExceedsPriceLimits` | Occurs when there is not sufficient liquidity on the order book to support the entered trade. Orders will be automatically cancelled when liquidity conditions are such that the order would move price +/- 5%. |
         *     | `SelfCrossPrevented` | Occurs when a user enters a bid that is higher than that user's lowest open ask or enters an ask that is lower than their highest open bid on the same pair. |
         *     | `ImmediateOrCancelWouldPost` | Occurs when the "immediate-or-cancel" execution option is included in the order request and the requested order cannot be fully filled immediately. This type of cancellation will only cancel the unfulfilled part of any impacted order. |
         *     | `FillOrKillWouldNotFill` | Occurs when the "fill-or-kill" execution option is included in the new order request and the entire order cannot be filled immediately.<br><br>Unlike "immediate-or-cancel" orders, this execution option will result in the entire order being cancelled rather than just the unfulfilled portion. |
         *     | `Requested` | Cancelled via user request to /v1/order/cancel endpoint. |
         *     | `MarketClosed` | Occurs when an order is placed for a trading pair that is currently closed. |
         *     | `TradingClosed` | Occurs when an order is placed while the exchange is closed for trading. |
         */
        post: operations["cancelOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/order/cancel/all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel All Active Orders
         * @description This will cancel all outstanding orders created by all [sessions](/authentication/api-key#sessions) owned by this account, including interactive orders placed through the UI.
         *
         *     <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *           Note that this cancels orders that were not placed using this API key.
         *           Enabled for perpetuals accounts from July 10th, 0100hrs ET onwards.
         *       </div>
         *     </div>
         *
         *     Typically [Cancel All Session Orders](/rest/orders#cancel-all-session-orders) is preferable, so that only orders related to the current connected session are cancelled.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `orders:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["cancelAllActiveOrders"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/order/cancel/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel All Session Orders
         * @description This will cancel all orders opened by this [session](/authentication/api-key#sessions).
         *
         *     This will have the same effect as [heartbeat](/authentication/api-key#require-heartbeat) expiration if "Require Heartbeat" is selected for the session.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `orders:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["cancelAllSessionOrders"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/order/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Order Status
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *          <div>Gemini recommends using our <a href="/websocket/order-events/about">WebSocket Order Events</a> API to receive order status changes. It's much better because you'll be notified of order status changes as they happen.</div>
         *       </div>
         *         <p>Under the terms of the <a href="https://www.gemini.com/legal/api-agreement">Gemini API Agreement</a>, polling this endpoint may be subject to <a href="/rate-limit">rate limiting</a>.</p>
         *         <p>Enabled for perpetuals accounts from July 10th, 0100hrs ET onwards. Trade info for all perpetuals orders submitted prior to this timing, will not be available through this API.</p>
         *     </div>
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `orders:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["getOrderStatus"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Active Orders
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *          <div>Gemini recommends using our <a href="/websocket/order-events/about">WebSocket Order Events</a> API to maintain a current view of your active orders. It's both faster and more efficient than polling this endpoint.</div>
         *       </div>
         *         <p>Under the terms of the <a href="https://www.gemini.com/legal/api-agreement">Gemini API Agreement</a>, polling this endpoint may be subject to <a href="/rate-limit">rate limiting</a>.</p>
         *         <p>Enabled for perpetuals accounts from July 10th, 0100hrs ET onwards.</p>
         *     </div>
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `orders:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["listActiveOrders"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/orders/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Past Orders
         * @description This API retrieves (closed) orders history for an account.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `history:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         *
         *
         *     ### How to retrieve your order history
         *
         *     To retrieve your full order history walking backwards,
         *
         *     1. Initial request: `POST` to https://api.gemini.com/v1/orders/history with a JSON payload including a `timestamp` key with value `0` and a `limit_orders` key with value `500`
         *     2. When you receive the list of orders, it will be sorted by `timestamp` descending - so the first element in the list will have the highest `timestamp` value. For this example, say that value is `X`.
         *     3. Create a second `POST` request with a JSON payload including a `timestamp` key with value `X+1` and a `limit_orders` key with value `500`.
         *     4. Take the first element of the list returned with highest `timestamp` value `Y` and create a third `POST` request with a JSON payload including a `timestamp` key with value `Y+1` and a `limit_orders` key with value `500`.
         *     5. Continue creating `POST` requests and retrieving orders until an empty list is returned.
         *
         *     ### Break Types
         *
         *     In the rare event that a trade has been reversed (broken), the trade that is broken will have this flag set. The field will contain one of these values
         *
         *     |Value|Description|
         *     |--- |--- |
         *     |manual|The trade was reversed manually.  This means that all fees, proceeds, and debits associated with the trade have been credited or debited to the account seperately.  That means that this reported trade must be included for order for the account balance to be correct.|
         *     |full|The trade was fully broken.  The reported trade should not be accounted for.  It will be as though the transfer of fund associated with the trade had simply not happened.|
         */
        post: operations["listPastOrders"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/mytrades": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Past Trades
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *          <div>Gemini recommends using our <a href="/websocket/order-events/about">WebSocket Order Events</a> API to be notified when a trade executes on your account instead of polling this endpoint.</div>
         *       </div>
         *         <p>Under the terms of the <a href="https://www.gemini.com/legal/api-agreement">Gemini API Agreement</a>, polling this endpoint may be subject to <a href="/rate-limit">rate limiting</a>.</p>
         *         <p>Enabled for perpetuals accounts from July 10th, 0100hrs ET onwards. Trade info for all perpetuals orders submitted prior to this timing, will not be available through this API.</p>
         *     </div>
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `history:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         *
         *     ### How to retrieve your trade history
         *
         *     To retrieve your full trade history walking backwards,
         *
         *     1. Initial request: `POST` to https://api.gemini.com/v1/mytrades with a JSON payload including a `timestamp` key with value 0 and a `limit_trades` key with value `500`
         *     2. When you receive the list of trades, it will be sorted by `timestamp` descending - so the first element in the list will have the highest `timestamp` value. For this example, say that value is `X`.
         *     3. Create a second `POST` request with a JSON payload including a `timestamp` key with value `X+1` and a `limit_trades` key with value `500`.
         *     4. Take the first element of the list returned with highest `timestamp` value `Y` and create a third `POST` request with a JSON payload including a `timestamp` key with value `Y+1` and a `limit_trades` key with value `500`.
         *     5. Continue creating `POST` requests and retrieving trades until an empty list is returned.
         *
         *     ### Break Types
         *
         *     In the rare event that a trade has been reversed (broken), the trade that is broken will have this flag set. The field will contain one of these values
         *
         *     |Value|Description|
         *     |--- |--- |
         *     |manual|The trade was reversed manually.  This means that all fees, proceeds, and debits associated with the trade have been credited or debited to the account seperately.  That means that this reported trade must be included for order for the account balance to be correct.|
         *     |full|The trade was fully broken.  The reported trade should not be accounted for.  It will be as though the transfer of fund associated with the trade had simply not happened.|
         */
        post: operations["listPastTrades"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/tradevolume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Trading Volume
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `history:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["getTradingVolume"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/balances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Available Balances
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *          <div>Under the terms of the <a href="https://www.gemini.com/legal/api-agreement">Gemini API Agreement</a>, polling this endpoint may be subject to <a href="/rate-limit">rate limiting</a>.</div>
         *       </div>
         *     </div>
         *
         *     This will show the available balances in the supported currencies
         *
         *     <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *          <div>Please note that Gemini is currently in the process of introducing new API architecture that will impact how decimal balances are returned from this endpoint for fiat and crypto assets.</div>
         *       </div>
         *
         *       <p>As a result of this change, requests to the balances endpoint routed via the new architecture will return fiat balances and crypto balances truncated to 15 and 19 decimal places, respectively. This change has been introduced to correct for the display of miniscule residual values that do not actually represent usable balances.</p>
         *
         *       <div>It is recommended that users floor the values returned from this endpoint to the correct precision until the migration to the new architecture has been completed.</div>
         *     </div>
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `balances:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["getAvailableBalances"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/notionalvolume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Notional Trading Volume
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `history:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["getNotionalTradingVolume"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/margin/account": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Margin Account Summary
         * @description Retrieves comprehensive margin account information including collateral, leverage, buying/selling power, and liquidation risk.
         *
         *     This endpoint provides real-time margin statistics for spot margin trading accounts, helping you monitor your account health and manage risk.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `balances:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         *
         *     ### Account Type
         *     This endpoint is only available for margin trading accounts. Standard exchange accounts will receive an error.
         */
        post: operations["getMarginAccount"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/margin/rates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Margin Interest Rates
         * @description Retrieves current margin interest rates for all borrowable assets.
         *
         *     Returns hourly, daily, and annual borrow rates for each currency that can be borrowed on margin. Interest is charged on borrowed amounts at the hourly rate and compounds over time.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `balances:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         *
         *     ### Account Type
         *     This endpoint is only available for margin trading accounts.
         */
        post: operations["getMarginRates"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/margin/order/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Preview Margin Order Impact
         * @description Previews the margin impact of a hypothetical spot order without actually placing it.
         *
         *     Returns both pre-order and post-order margin risk statistics, allowing you to understand how an order would affect your margin account before execution. This is useful for risk management and planning trades.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `orders:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         *
         *     ### Account Type
         *     This endpoint is only available for margin trading accounts.
         */
        post: operations["previewMarginOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/heartbeat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Heartbeat
         * @description This will prevent a [session](/authentication/api-key#private-api-invocation) from timing out and canceling orders if the [require heartbeat](/authentication/api-key#require-heartbeat) flag has been set. Note that this is only required if no other private API requests have been made. The arrival of any message resets the heartbeat timer.
         */
        post: operations["sendHeartbeat"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/wrap/{symbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Wrap Order
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `orders:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["wrapOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/notionalbalances/{currency}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Notional Balances
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *          <div>Under the terms of the <a href="https://www.gemini.com/legal/api-agreement">Gemini API Agreement</a>, polling this endpoint may be subject to <a href="/rate-limit">rate limiting</a>.</div>
         *       </div>
         *     </div>
         *
         *     This will show the available balances in the supported currencies as well as the notional value in the currency specified.
         *
         *     <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *          <div>Please note that Gemini is currently in the process of introducing new API architecture that will impact how decimal balances are returned from this endpoint for fiat and crypto assets.</div>
         *       </div>
         *
         *       <p>As a result of this change, requests to the notional balances endpoint routed via the new architecture will return fiat balances and crypto balances truncated to 15 and 19 decimal places, respectively. This change has been introduced to correct for the display of miniscule residual values that do not actually represent usable balances.</p>
         *
         *       <div>It is recommended that users floor the values returned from this endpoint to the correct precision until the migration to the new architecture has been completed.</div>
         *     </div>
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `balances:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["getNotionalBalances"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/addresses/{network}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Deposit Addresses
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *          <div>Under the terms of the <a href="https://www.gemini.com/legal/api-agreement">Gemini API Agreement</a>, polling this endpoint may be subject to <a href="/rate-limit">rate limiting</a>. This endpoint is currently restricted further than our standard rate limiting to a rate of 1 request per 2 seconds per subaccount. This rate is subject to change and will be updated here accordingly.</div>
         *       </div>
         *     </div>
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `addresses:read` or `addresses:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["listDepositAddresses"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/deposit/{network}/newAddress": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create New Deposit Address
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *          <div>Under the terms of the <a href="https://www.gemini.com/legal/api-agreement">Gemini API Agreement</a>, polling this endpoint may be subject to <a href="/rate-limit">rate limiting</a>. This endpoint is currently restricted further than our standard rate limiting to a rate of 1 request per 2 seconds per subaccount. This rate is subject to change and will be updated here accordingly.</div>
         *       </div>
         *     </div>
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Fund Manager role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `addresses:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["createNewDepositAddress"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/transfers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Past Transfers
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *           The v1 transfers endpoint is being retired. This v2 endpoint is the recommended replacement, offering full multichain support with accurate status for all supported networks. Please migrate to this endpoint at your earliest convenience.
         *       </div>
         *     </div>
         *
         *     This endpoint shows deposits and withdrawals in supported currencies with full multichain (multi-network) support. It returns accurate status information for transfers on **all supported networks** including Solana, Arbitrum, Optimism, Base, Avalanche, and Ethereum.
         *
         *     Each transfer in the response includes a `network` field identifying the blockchain network, along with network-specific `feeAmount`, `feeCurrency`, and `txHash` values.
         *
         *     This endpoint does not currently show cancelled advances, returned outgoing wires or ACH transactions, or other exceptional transaction circumstances.
         *
         *     Fiat transfers between non-derivative and derivatives accounts are prohibited.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `history:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["listPastTransfers"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/custodyaccountfees": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Custody Fee Transfers
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *          <div>Under the terms of the <a href="https://www.gemini.com/legal/api-agreement">Gemini API Agreement</a>, polling this endpoint may be subject to <a href="/rate-limit">rate limiting</a>. This endpoint is currently restricted further than our standard rate limiting to a rate of 1 request per 5 seconds per subaccount. This rate is subject to change and will be updated here accordingly. This is the same limit as the <a href="/rest/fund-management#list-past-transfers">transfers</a> endpoint. One call to one affects the other.</div>
         *       </div>
         *     </div>
         *
         *     This endpoint shows Custody fee records in the supported currencies.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `history:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["listCustodyFeeTransfers"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/withdraw/{network}/{ticker}/feeEstimate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Gas Fee Estimation
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *           The v1 fee estimation endpoint is being retired. This v2 endpoint is the recommended replacement, offering explicit blockchain network selection for multi-network tokens. Please migrate to this endpoint at your earliest convenience.
         *       </div>
         *     </div>
         *
         *     API users will not be aware of the transfer fees before starting the withdrawal process. This endpoint allows you to find out the estimated gas fees before you start a withdrawal. It requires specifying the blockchain network and ticker, which is useful for tokens that exist on multiple networks (e.g. USDC on Ethereum vs Solana).
         *
         *     ### Roles
         *     The API key you use to access this endpoint can have the Trader, Fund Manager, Auditor, WealthManager or Administrator role assigned. See [Roles](#roles) for more information.
         */
        post: operations["getGasFeeEstimation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/withdraw/{network}/{ticker}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Withdraw Crypto Funds
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm" role="alert">
         *       <div class="flex">
         *          <svg
         *             view-box="0 0 24 24"
         *           >
         *             <path
         *               fill-rule="evenodd"
         *               clip-rule="evenodd"
         *               d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *             />
         *           </svg>
         *           The v1 withdraw endpoint is being retired. This v2 endpoint is the recommended replacement, offering explicit blockchain network selection for multi-network tokens. Please migrate to this endpoint at your earliest convenience.
         *       </div>
         *     </div>
         *
         *     Withdraw cryptocurrency funds to an approved address, with explicit network selection.
         *
         *     The key improvement over v1 is the explicit `network` path parameter, which allows you to specify exactly which blockchain network to use for the withdrawal. This is especially important for tokens available on multiple networks (e.g., USDC on Ethereum, Solana, Base, Arbitrum, etc.).
         *
         *     Before you can withdraw cryptocurrency funds to an approved address, you need three things:
         *
         *     1. You must have an approved address list for your account
         *     2. The address you want to withdraw funds to needs to already be on that approved address list
         *     3. An API key with the Fund Manager role added
         *
         *     If you would like to withdraw via API to addresses that are not on your approved address list, please reach out to trading@gemini.com. We can enable this feature for you provided a set of approved IP addresses. This functionality is only available for exchange accounts. Pre-approved IP addresses and addresses added to your approved address list are required to enable withdrawal APIs for custody accounts.
         *
         *     Use the [Get Network](/rest/market-data#get-network) endpoint to discover which networks support withdrawals for a given token.
         *
         *     See [Roles](/roles#roles) for more information on how to add the Fund Manager role to the API key you want to use.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Fund Manager role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `crypto:send` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["withdrawCryptoFunds"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/clearing/new": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create New Clearing Order
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `clearing:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["createNewClearingOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/clearing/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Clearing Order
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `clearing:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["getClearingOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/clearing/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel Clearing Order
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `clearing:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["cancelClearingOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/clearing/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Confirm Clearing Order
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `clearing:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["confirmClearingOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/clearing/list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Clearing Orders
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `clearing:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["listClearingOrders"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/clearing/broker/list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Clearing Brokers
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `clearing:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["listClearingBrokers"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/clearing/broker/new": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create New Broker Order
         * @description Gemini Clearing also allows for brokers to facilitate trades between two Gemini customers. A broker can submit a new Gemini Clearing order that must then be confirmed by each counterparty before settlement.
         */
        post: operations["createNewBrokerOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/clearing/trades": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Clearing Trades
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `clearing:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["listClearingTrades"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/instant/quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Instant Quote
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `orders:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["getInstantQuote"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/instant/execute": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Execute Instant Order
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `orders:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["executeInstantOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/payments/addbank": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Add Bank
         * @description The add bank API allows for banking information to be sent in via API. However, for the bank to be verified, you must still send in a wire for any amount from the bank account.
         *
         *     ### Roles
         *     This API requires the FundManager role. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `banks:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["addBank"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/payments/addbank/cad": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Add Bank CAD
         * @description The add bank API allows for CAD banking information to be sent in via API. However, for the bank to be verified, you must still send in a wire for any amount from the bank account.
         *
         *     ### Roles
         *     This API requires the FundManager role. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `banks:create` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["addBankCAD"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/payments/methods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Payment Methods
         * @description The payments methods API will return data on balances in the account and linked banks.
         *
         *     ### Roles
         *     The API key you use to access this endpoint can be either a Master or Account level key with any role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `banks:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["listPaymentMethods"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/account": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Account Detail
         * @description The account API will return detail about the specific account requested such as users, country codes, etc.
         *
         *     ### Roles
         *     The API key you use to access this endpoint can be either a Master or Account level key with any role assigned. See [Roles](/roles#roles) for more information.
         */
        post: operations["getAccountDetail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/approvedAddresses/account/{network}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Approved Addresses
         * @description Allows viewing of Approved Address list.
         *
         *     ### Roles
         *     This API can accept any role. See [Roles](/roles#roles) for more information.
         */
        post: operations["listApprovedAddresses"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/approvedAddresses/{network}/request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create New Approved Address
         * @description Allows for creation of an approved withdrawal address. Once the request is made, the 7 day waiting period will begin. Please note that all approved address requests are subject to the 7 day waiting period.
         *
         *     If you add an address using an account-scoped API key, then the address will be added to your account specific approved address list. If you use a master-scoped API key, the address will be added to your group-level approved address list unless you specify an account.
         *
         *     This endpoint is subject to additional security constraints and is only accessible via API keys which have configured Trusted IP controls.
         *
         *     Please reach out to trading@gemini.com if you have any questions about approved addresses.
         *
         *     ### Roles
         *     This API requires the FundManager role. See [Roles](/roles#roles) for more information.
         */
        post: operations["createNewApprovedAddress"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/approvedAddresses/{network}/remove": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Remove Approved Address
         * @description Allows for removal of active or time-pending addresses from the Approved Address list. Addresses that are pending approval from another user on the account cannot be removed via API.
         *
         *     ### Roles
         *     This API requires the FundManager role. See [Roles](/roles#roles) for more information.
         */
        post: operations["removeApprovedAddress"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/account/create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create New Account
         * @description A Master API key can create a new exchange account within the group. This API will return the name of your new account for use with the account parameter in when using Master API keys to perform account level functions. Please see the [example](/account-admin-endpoints#using-master-api-keys).
         *
         *     ### Roles
         *     The API key you use to access this endpoint must be a Master level key and have the Administrator role assigned. See [Roles](/roles#roles) for more information.
         */
        post: operations["createNewAccount"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/account/rename": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rename Account
         * @description A Master or Account level API key can rename an account within the group.
         *
         *     ### Roles
         *     The API key you use to access this endpoint can be either a Master or Account level API key and must have the Administrator role assigned. See [Roles](/roles#roles) for more information.
         */
        post: operations["renameAccount"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/account/list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Accounts in Group
         * @description A Master API key can be used to get the accounts within the group. A maximum of 500 accounts can be listed in a single API call.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must be a Master level key. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `account:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["listAccountsInGroup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/account/transfer/{currency}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Transfer Between Accounts
         * @description This API allows you to execute an internal transfer between any two accounts within your Master Group. In the scenario of exchange account to exchange account there will be no activity on a blockchain network. All other combinations will result in a movement of funds on a blockchain network.
         *
         *     Gemini Custody account withdrawals will not occur until the daily custody run occurs. In the case of funds moving from a Gemini Custody account to a Gemini Exchange account, the exchange account will get a precredit for the amount to be received. The exchange account will be able to trade these funds but will be unable to withdraw until the funds are processed on the blockchain and received.
         *
         *     Gemini Custody accounts request withdrawals to approved addresses in all cases and require the request to come from an approved IP address. Please reach out to trading@gemini.com to enable API withdrawals for custody accounts.
         *
         *     Gemini Custody accounts do not support fiat currency transfers.
         *
         *     Fiat transfers between non-derivative and derivatives accounts are prohibited.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must be a Master level key and have the Fund Manager role assigned. See [Roles](/roles#roles) for more information.
         */
        post: operations["transferBetweenAccounts"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/transactions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Transaction History
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm flex" role="alert">
         *       <svg
         *         view-box="0 0 24 24"
         *       >
         *         <path
         *           fill-rule="evenodd"
         *           clip-rule="evenodd"
         *           d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *         />
         *       </svg>
         *       <span>
         *        Under the terms of the <a href="https://www.gemini.com/legal/api-agreement">Gemini API Agreement</a>, polling this endpoint may be subject to <a href="/rate-limit">rate limiting</a>. Due to current limitations with the v1/transactions endpoint, historical data can only be returned for dates _after_ August 1st, 2022. For any requests to this endpoint, please ensure that the value provided for _timestamp_nanos_ as after this date.
         *        </span>
         *     </div>
         *
         *     This endpoint shows trade detail and transactions. There is a `continuation_token` that is a pagination token used for subsequent requests.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Auditor role assigned and have the master account scope. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `history:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["getTransactionHistory"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/oauth/revokeByToken": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Revoke OAuth Token
         * @description The `access_token` may be revoked at any time by using `v1/oauth/revokeByToken`. Once a token is revoked or expires, it can no longer be used to make requests.
         *
         *     This endpoint is only available using an `access_token` and will revoke the token used to make the request.
         */
        post: operations["revokeOAuthToken"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/balances/staking": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Staking Balances
         * @description This will show the available balance in Staking as well as the available balance for withdrawal.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Auditor role assigned. See [Roles](/roles#roles) for more information.
         */
        post: operations["listStakingBalances"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/staking/stake": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Stake Crypto Funds
         * @description Initiates Staking deposits.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Trader role assigned. See [Roles](/roles#roles) for more information.
         */
        post: operations["stakeCryptoFunds"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/staking/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Staking Event History
         * @description This will show all staking deposits, redemptions and interest accruals.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     ### How to iterate through all transactions:
         *     To retrieve your full Staking history walking backwards,
         *
         *     1. Initial request: `POST` to https://api.gemini.com/v1/staking/history with a JSON payload including `sortAsc` set to `false` and a limit key with value `500`.
         *     2. When you receive the list of Staking transactions, they will be sorted by `datetime` descending - so the last element in the list will have the lowest `timestamp` value. For this example, say that value is `X`.
         *     3. Create a second `POST` request with a JSON payload including a `until` timestamp key with value `X-1`, `sortAsc` set to `false`, and a limit key with value `500`.
         *     4. Take the last element of the list returned with lowest `datetime` value `Y` and create a third `POST` request with a JSON payload including a `until` timestamp key with value `Y-1`, `sortAsc` set to false, and a `limit` key with value `500`.
         *     5. Continue creating `POST` requests and retrieving Staking transactions until an empty list is returned.
         */
        post: operations["listStakingEventHistory"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/staking/rates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Staking Rates
         * @description This will return the current Gemini Staking interest rates (in bps). When including the specific asset(s) in the request, the response will include the specific assets' (e.g. `eth`, `matic`) Staking rate. When not including the specific asset in the request, the response will include all Staking rates.
         */
        get: operations["listStakingRates"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/staking/rewards": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Staking Rewards
         * @description This will show the historical Staking reward payments and accrual.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Auditor role assigned. See [Roles](/roles#roles) for more information.
         */
        post: operations["listStakingRewards"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/staking/unstake": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Unstake Crypto Funds
         * @description Initiates Staking withdrawals.
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader, Fund Manager or Trader role assigned. See [Roles](/roles#roles) for more information.
         */
        post: operations["unstakeCryptoFunds"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Roles Endpoint
         * @description The `v1/roles` endpoint will return a string of the role of the current API key. The response fields will be different for account-level and master-level API keys.
         */
        post: operations["getRoles"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/margin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Account Margin
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader or Auditor role assigned. See <a href="/roles#roles">Roles</a> for more information.
         *
         *     The OAuth scope must have `orders:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["getAccountMargin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/perpetuals/fundingPayment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Funding Payments
         * @description <div class="p-4 text-sm section-icon section-info rounded-sm flex" role="alert">
         *         <svg
         *           view-box="0 0 24 24"
         *         >
         *           <path
         *             fill-rule="evenodd"
         *             clip-rule="evenodd"
         *             d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 17V11H13V17H11ZM11 9V7H13V9H11Z"
         *           />
         *         </svg>
         *         <span>
         *          Note that the response field 'instrumentSymbol' is only attached to requests from 16th April 2024 onwards.
         *         </span>
         *     </div>
         *
         *     ### Roles
         *     The API key you use to access this endpoint must have the Trader or Auditor role assigned. See <a href="/roles#roles">Roles</a> for more information.
         *
         *     The OAuth scope must have `orders:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["listFundingPayments"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/perpetuals/fundingpaymentreport/records.xlsx": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Funding Payment Report File
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader or Auditor role assigned. See <a href="/roles#roles">Roles</a> for more information.
         *
         *     The OAuth scope must have `orders:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         *
         *     ### Examples
         *     - `&fromDate=2024-04-10&toDate=2024-04-25&numRows=1000` </br>
         *       Compare and obtain the minimum records between (2024-04-10 to 2024-04-25) and 1000. If (2024-04-10 to 2024-04-25) contains 360 records. Then fetch the minimum between 360 and 1000 records only.
         *
         *     - `&numRows=2024-04-10&toDate=2024-04-25` </br>
         *       If (2024-04-10 to 2024-04-25) contains 360 records. Then fetch 360 records only.
         *
         *     - `&numRows=1000` </br>
         *       Fetch maximum 1000 records starting from Now to a historical date
         *
         *     - `<blank>` </br>
         *       Fetch maximum 8760 records starting from Now to a historical date
         */
        get: operations["getFundingPaymentReportFile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/perpetuals/fundingpaymentreport/records.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Funding Payment Report JSON
         * @description This endpoint retrieves funding payment report in JSON format.
         *
         *     ### Examples
         *     - `&fromDate=2024-04-10&toDate=2024-04-25&numRows=1000` </br>
         *       Compare and obtain the minimum records between (2024-04-10 to 2024-04-25) and 1000. If (2024-04-10 to 2024-04-25) contains 360 records. Then fetch the minimum between 360 and 1000 records only.
         *
         *     - `&numRows=2024-04-10&toDate=2024-04-25` </br>
         *       If (2024-04-10 to 2024-04-25) contains 360 records. Then fetch 360 records only.
         *
         *     - `&numRows=1000` </br>
         *       Fetch maximum 1000 records starting from Now to a historical date
         *
         *     - `<blank>` </br>
         *       Fetch maximum 8760 records starting from Now to a historical date
         */
        post: operations["getFundingPaymentReportJson"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/positions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get Open Positions
         * @description ### Roles
         *     The API key you use to access this endpoint must have the Trader or Auditor role assigned. See [Roles](/roles#roles) for more information.
         *
         *     The OAuth scope must have `orders:read` assigned to access this endpoint. See [OAuth Scopes](/authentication/oauth#oauth-scopes) for more information.
         */
        post: operations["getOpenPositions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/riskstats/{symbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Risk Stats */
        get: operations["getRiskStats"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/ticker/{symbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Ticker V2
         * @description This endpoint retrieves information about recent trading activity for the provided symbol.
         */
        get: operations["getTickerV2"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/candles/{symbol}/{time_frame}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Candles
         * @description This endpoint retrieves time-intervaled data for the provided symbol.
         */
        get: operations["listCandles"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/derivatives/candles/{symbol}/{time_frame}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Derivative Candles
         * @description This endpoint retrieves time-intervaled data for the provided perpetual symbol.
         */
        get: operations["listDerivativeCandles"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/fxrate/{symbol}/{timestamp}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * FX Rate
         * @description We have a growing international institutional customer base. When pulling market data for charting, it can be useful to have access to our FX rate for the relevant currency at that time.
         *
         *     Please note, Gemini does not offer foreign exchange services. This endpoint is for historical reference only and does not provide any guarantee of future exchange rates.
         *
         *     **Roles**
         *     The API key you use to access this endpoint must have the Auditor role assigned. See Roles for more information.
         *
         *     **Supported Pairs**
         *
         *     `
         *     [AUDUSD, CADUSD, COPUSD, EURUSD, CHFUSD, HKDUSD, NZDUSD, GBPUSD, BRLUSD, INRUSD, SGDUSD, KRWUSD, JPYUSD, CNYUSD]
         *     `
         */
        get: operations["getFXRate"];
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
        /** @description timestamp */
        TimestampType: string | bigint;
        /** @description The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
        Nonce: components["schemas"]["TimestampType"] | number;
        ErrorResponse: {
            /** @description Error */
            result?: string;
            /** @description A short description */
            reason?: string;
            /** @description Detailed error message */
            message?: string;
        };
        SymbolDetails: {
            /**
             * @description The requested symbol. See [**symbols and minimums**](/market-data/symbols-and-minimums#all-supported-symbols)
             * @example BTCUSD
             */
            symbol?: string;
            /**
             * @description CCY1 or the top currency. (i.e `BTC` in `BTCUSD`)
             * @example BTC
             */
            base_currency?: string;
            /**
             * @description CCY2 or the quote currency. (i.e `USD` in `BTCUSD`)
             * @example USD
             */
            quote_currency?: string;
            /**
             * Format: decimal
             * @description The number of decimal places in the `base_currency`. (i.e `1e-8`)
             * @example 1e-8
             */
            tick_size?: number;
            /**
             * Format: decimal
             * @description The number of decimal places in the `quote_currency` (i.e `0.01`)
             * @example 0.01
             */
            quote_increment?: number;
            /**
             * @description The minimum order size in `base_currency` units (i.e `0.00001`)
             * @example 0.00001
             */
            min_order_size?: string;
            /**
             * @description Status of the current order book. Can be `open`, `closed`, `cancel_only`, `post_only`, `limit_only`.
             * @example open
             */
            status?: string;
            /**
             * @description When `True`, symbol can be wrapped using this endpoint:
             *     `POST https://api.gemini.com/v1/wrap/:symbol`
             * @example false
             */
            wrap_enabled?: boolean;
            /**
             * @description Instrument type `spot` / `swap` -- where `swap` signifies `perpetual swap`.
             * @example spot
             */
            product_type?: string;
            /**
             * @description `vanilla` / `linear` / `inverse` where `vanilla` is for spot
             *     while `linear` is for perpetual swap and `inverse` is a special case perpetual swap where the perpetual contract will be settled in base currency.
             * @example vanilla
             */
            contract_type?: string;
            /**
             * @description CCY2 or the quote currency for spot instrument (i.e. `USD` in `BTCUSD`)
             *     Or collateral currency of the contract in case of perpetual swap instrument.
             * @example USD
             */
            contract_price_currency?: string;
        };
        Ticker: {
            /**
             * Format: decimal
             * @description The highest bid currently available
             * @example 977.59
             */
            bid?: string;
            /**
             * Format: decimal
             * @description The lowest ask currently available
             * @example 977.35
             */
            ask?: string;
            /**
             * Format: decimal
             * @description The price of the last executed trade
             * @example 977.65
             */
            last?: string;
            /** @description Information about the 24 hour volume on the exchange. See properties below */
            volume?: {
                /**
                 * @description The end of the 24-hour period over which volume was measured. [timestamp (ms)](/rest/~schemas#timestamp-type)
                 * @example 1483018200000
                 */
                timestamp?: components["schemas"]["TimestampType"];
                /**
                 * Format: decimal
                 * @description The volume denominated in the price currency
                 * @example 2210.505328803
                 */
                price_symbol?: string;
                /**
                 * Format: decimal
                 * @description The volume denominated in the quantity currency
                 * @example 2135477.463379586263
                 */
                quantity_symbol?: string;
            };
        };
        OrderBook: {
            /** @description The bid price levels currently on the book. These are offers to buy at a given price. */
            bids?: components["schemas"]["OrderBookEntry"][];
            /** @description The ask price levels currently on the book. These are offers to sell at a given price. */
            asks?: components["schemas"]["OrderBookEntry"][];
        };
        OrderBookEntry: {
            /**
             * Format: decimal
             * @description The price
             */
            price?: string;
            /**
             * Format: decimal
             * @description The total quantity remaining at the price
             */
            amount?: string;
            /** @description **DO NOT USE** - this field is included for compatibility reasons only and is just populated with a dummy value. */
            timestamp?: string;
        };
        Trade: {
            /**
             * @description The time that the trade was executed
             * @example 1547146811
             */
            timestamp?: components["schemas"]["TimestampType"];
            /**
             * @description The time that the trade was executed in milliseconds
             * @example 1547146811357
             */
            timestampms?: components["schemas"]["TimestampType"];
            /**
             * Format: int64
             * @description The trade ID number
             * @example 5335307668
             */
            tid?: bigint;
            /**
             * Format: decimal
             * @description The price the trade was executed at
             * @example 3610.85
             */
            price?: string;
            /**
             * Format: decimal
             * @description The amount that was traded
             * @example 0.27413495
             */
            amount?: string;
            /**
             * @description Will always be "gemini"
             * @example gemini
             */
            exchange?: string;
            /**
             * @description - `buy` means that an ask was removed from the book by an incoming buy order.
             *     - `sell` means that a bid was removed from the book by an incoming sell order.
             * @example buy
             * @enum {string}
             */
            type?: "buy" | "sell";
            /**
             * @description Whether the trade was broken or not. Broken trades will not be displayed by default; use the `include_breaks` to display them.
             * @example false
             */
            broken?: boolean;
        };
        Heartbeat: {
            /** @description The literal string `/v1/heartbeat` */
            request?: string;
            /** @description The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
            nonce?: string | bigint;
        };
        NewOrderRequest: {
            /**
             * @description The literal string "/v1/order/new"
             * @example /v1/order/new
             */
            request: string;
            /** @description The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
            nonce: number;
            /** @description *Recommended*. A [client-specified order id](/client-order-id) */
            client_order_id?: string;
            /**
             * @description The [symbol](/market-data/symbols-and-minimums) for the new order
             * @example BTCUSD
             */
            symbol: string;
            /**
             * @description Quoted decimal amount to purchase
             * @example 5
             */
            amount: string;
            /**
             * @description Quoted decimal amount to spend per unit
             * @example 3633.00
             */
            price: string;
            /**
             * @example buy
             * @enum {string}
             */
            side: "buy" | "sell";
            /**
             * @description The order type. "exchange limit" for all order types except for stop-limit orders. "exchange stop limit" for stop-limit orders.
             * @example exchange limit
             * @enum {string}
             */
            type: "exchange limit" | "exchange stop limit" | "exchange market";
            /**
             * @description An optional array containing at most one supported order execution option. See Order execution options for details.
             * @example [
             *       "maker-or-cancel"
             *     ]
             */
            options?: ("maker-or-cancel" | "immediate-or-cancel" | "fill-or-kill")[];
            /** @description The price to trigger a stop-limit order. Only available for stop-limit orders. */
            stop_price?: string;
            /**
             * @description Set to `true` to place this order on a margin account using borrowed funds. Defaults to `false`. Only available for margin-enabled accounts. See [Margin Trading](/margin/account-summary) for details.
             * @example false
             */
            margin_order?: boolean;
            /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts. */
            account?: string;
        };
        CancelOrderRequest: {
            /**
             * @description The literal string "/v1/order/cancel"
             * @example /v1/order/cancel
             */
            request: string;
            /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
            nonce: components["schemas"]["TimestampType"];
            /**
             * Format: int64
             * @description The order ID given by `/order/new`
             * @example 106817811
             */
            order_id: bigint;
            /**
             * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to cancel the order. Only available for exchange accounts.
             * @example primary
             */
            account?: string;
        };
        CancelAllOrdersRequest: {
            /**
             * @description The literal string "/v1/order/cancel/all"
             * @example /v1/order/cancel/all
             */
            request: string;
            /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
            nonce: components["schemas"]["TimestampType"];
            /**
             * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to cancel the orders. Only available for exchange accounts.
             * @example primary
             */
            account?: string;
        };
        CancelAllOrdersBySessionRequest: {
            /**
             * @description The literal string "/v1/order/cancel/session"
             * @example /v1/order/cancel/session
             */
            request: string;
            /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
            nonce: components["schemas"]["TimestampType"];
            /**
             * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to cancel the orders. Only available for exchange accounts.
             * @example primary
             */
            account?: string;
        };
        OrderStatusRequest: {
            /**
             * @description The API endpoint path
             * @example /v1/order/status
             */
            request: string;
            /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
            nonce: components["schemas"]["TimestampType"];
            /**
             * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts.
             * @example primary
             */
            account?: string;
            /**
             * Format: int64
             * @description The order id to get information on. The `order_id` represents a whole number and is transmitted as an unsigned 64-bit integer in JSON format. `order_id` cannot be used in combination with `client_order_id`.
             * @example 123456789012345
             */
            order_id: bigint;
            /** @description The `client_order_id` used when placing the order. `client_order_id` cannot be used in combination with `order_id` */
            client_order_id?: string;
            /** @description Either `True` or `False`. If `True` the endpoint will return individual trade details of all fills from the order. */
            include_trades?: boolean;
        };
        MyTradesRequest: {
            /**
             * @description The API endpoint path
             * @example /v1/mytrades
             */
            request: string;
            /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
            nonce: components["schemas"]["TimestampType"];
            /**
             * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts.
             * @example primary
             */
            account?: string;
            /**
             * @description The [symbol](/market-data/symbols-and-minimums) to retrieve trades for
             * @example btcusd
             */
            symbol?: string;
            /**
             * @description The maximum number of trades to return. Default is 50, max is 500.
             * @example 50
             */
            limit_trades?: number;
            /**
             * @description Only return trades on or after this timestamp. See [Data Types: Timestamps](/rest/~schemas#timestamp-type) for more information. If not present, will show the most recent orders.
             * @example 1591084414000
             */
            timestamp?: components["schemas"]["TimestampType"];
        };
        /** Limit Order Response */
        LimitOrderResponse: {
            order_id?: string;
            id?: string;
            symbol?: string;
            exchange?: string;
            avg_execution_price?: string;
            /** @enum {string} */
            side?: "buy" | "sell";
            /** @enum {string} */
            type?: "exchange limit" | "exchange stop limit" | "exchange market";
            timestamp?: components["schemas"]["TimestampType"];
            timestampms?: components["schemas"]["TimestampType"];
            is_live?: boolean;
            is_cancelled?: boolean;
            is_hidden?: boolean;
            was_forced?: boolean;
            executed_amount?: string;
            /** Format: double */
            remaining_amount?: string;
            client_order_id?: string;
            options?: string[];
            /** Format: double */
            price?: string;
            /** Format: double */
            original_amount?: string;
        };
        /** Stop-Limit Order Response */
        StopLimitOrderResponse: {
            order_id?: string;
            id?: string;
            symbol?: string;
            exchange?: string;
            avg_execution_price?: string;
            /** @enum {string} */
            side?: "buy" | "sell";
            /** @enum {string} */
            type?: "exchange stop limit";
            timestamp?: components["schemas"]["TimestampType"];
            timestampms?: components["schemas"]["TimestampType"];
            is_live?: boolean;
            is_cancelled?: boolean;
            is_hidden?: boolean;
            was_forced?: boolean;
            executed_amount?: string;
            options?: string[];
            /** Format: double */
            stop_price?: string;
            /** Format: double */
            price?: string;
            /** Format: double */
            original_amount?: string;
        };
        CancelOrderResponse: {
            /** Format: integer */
            order_id?: string;
            /** Format: integer */
            id?: string;
            symbol?: string;
            exchange?: string;
            /** Format: double */
            avg_execution_price?: string;
            /** @enum {string} */
            side?: "buy" | "sell";
            /** @enum {string} */
            type?: "exchange limit" | "exchange stop limit" | "exchange market";
            timestamp?: components["schemas"]["TimestampType"];
            timestampms?: components["schemas"]["TimestampType"];
            is_live?: boolean;
            is_cancelled?: boolean;
            is_hidden?: boolean;
            was_forced?: boolean;
            /** Format: double */
            executed_amount?: string;
            /** Format: double */
            remaining_amount?: string;
            /** @enum {string} */
            reason?: "MakerOrCancelWouldTake" | "ExceedsPriceLimits" | "SelfCrossPrevented" | "ImmediateOrCancelWouldPost" | "FillOrKillWouldNotFill" | "Requested" | "MarketClosed" | "TradingClosed";
            options?: string[];
            /** Format: double */
            price?: string;
            /** Format: double */
            original_amount?: string;
        };
        Order: {
            /**
             * Format: integer
             * @description The order id
             */
            order_id?: string;
            /**
             * Format: integer
             * @description An optional [client-specified order id](/client-order-id#client-order-id)
             */
            client_order_id?: string;
            /** @description The [symbol](/market-data/symbols-and-minimums#symbols-and-minimums) of the order */
            symbol?: string;
            /** @description Will always be "gemini" */
            exchange?: string;
            /**
             * Format: decimal
             * @description The price the order was issued at
             */
            price?: string;
            /**
             * Format: decimal
             * @description The average price at which this order as been executed so far. 0 if the order has not been executed at all.
             */
            avg_execution_price?: string;
            /** @enum {string} */
            side?: "buy" | "sell";
            /**
             * @description Description of the order
             * @enum {string}
             */
            type?: "exchange limit" | "exchange stop limit" | "exchange market";
            /** @description An array containing at most one supported order execution option. See [Order execution options](/rest/orders#create-new-order) for details. */
            options?: string[];
            /** @description The timestamp the order was submitted. Note that for compatibility reasons, this is returned as a string. We recommend using the timestampms field instead. */
            timestamp?: components["schemas"]["TimestampType"];
            /** @description The timestamp the order was submitted in milliseconds. */
            timestampms?: components["schemas"]["TimestampType"];
            /** @description `true` if the order is active on the book (has remaining quantity and has not been canceled) */
            is_live?: boolean;
            /** @description `true` if the order has been canceled. Note the spelling, "cancelled" instead of "canceled". This is for compatibility reasons. */
            is_cancelled?: boolean;
            /** @description Populated with the reason your order was canceled, if available. */
            reason?: string;
            /** @description Will always be `false`. */
            was_forced?: boolean;
            /**
             * Format: decimal
             * @description The amount of the order that has been filled.
             */
            executed_amount?: string;
            /**
             * Format: decimal
             * @description The amount of the order that has not been filled.
             */
            remaining_amount?: string;
            /**
             * Format: decimal
             * @description The originally submitted amount of the order.
             */
            original_amount?: string;
            /** @description Will always return `false`. */
            is_hidden?: boolean;
            /** @description Contains an array of JSON objects with trade details. */
            trades?: {
                /**
                 * Format: decimal
                 * @description The price that the execution happened at
                 */
                price?: string;
                /**
                 * Format: decimal
                 * @description The quantity that was executed
                 */
                amount?: string;
                /** @description The time that the trade happened in epoch seconds */
                timestamp?: components["schemas"]["TimestampType"];
                /** @description The time that the trade happened in milliseconds */
                timestampms?: components["schemas"]["TimestampType"];
                /**
                 * @description Will be either "Buy" or "Sell", indicating the side of the original order
                 * @example Buy
                 * @enum {string}
                 */
                type?: "Buy" | "Sell";
                /** @description If `true`, this order was the taker in the trade */
                aggressor?: boolean;
                /**
                 * @description Currency that the fee was paid in
                 * @example USD
                 */
                fee_currency?: string;
                /**
                 * Format: decimal
                 * @description The amount charged
                 * @example 1.23
                 */
                fee_amount?: string;
                /**
                 * @description Unique identifier for the trade
                 * @example 17379712930
                 */
                tid?: number;
                /**
                 * @description The order that this trade executed against
                 * @example 123456789
                 */
                order_id?: string;
                /**
                 * @description Will always be "gemini"
                 * @example gemini
                 */
                exchange?: string;
                /** @description Will only be present if the trade is broken. See `Break Types` below for more information. */
                break?: string;
            }[];
        };
        CancelAllResult: {
            /** @example ok */
            result?: string;
            /** @description cancelledOrders/cancelRejects with IDs of both */
            details?: {
                cancelledOrders?: number[];
                cancelRejects?: number[];
            };
        };
        MyTrade: {
            /** @example 9100 */
            price?: string;
            /** @example 1.5 */
            amount?: string;
            /** @example 1591084414 */
            timestamp?: components["schemas"]["TimestampType"];
            /** @example 1591084414622 */
            timestampms?: components["schemas"]["TimestampType"];
            /**
             * @example Buy
             * @enum {string}
             */
            type?: "Buy" | "Sell";
            /** @example true */
            aggressor?: boolean;
            /** @example USD */
            fee_currency?: string;
            /** @example 13.65 */
            fee_amount?: string;
            /**
             * Format: int64
             * @example 123456789
             */
            tid?: bigint;
            /** @example 123456789 */
            order_id?: string;
            client_order_id?: string;
            /** @example gemini */
            exchange?: string;
            /** @example false */
            is_auction_fill?: boolean;
            /**
             * @example
             * @enum {string}
             */
            break?: "" | "trade correct";
        };
        TradeVolume: {
            /** @example btcusd */
            symbol?: string;
            /** @example BTC */
            base_currency?: string;
            /** @example USD */
            quote_currency?: string;
            /** @example USD */
            notional_currency?: string;
            /** @example 2020-06-02 */
            data_date?: string;
            /** @example 10.5 */
            total_volume_base?: string;
            /** @example 1.2 */
            maker_buy_sell_ratio?: string;
            /** @example 5.5 */
            buy_maker_base?: string;
            /** @example 50050 */
            buy_maker_notional?: string;
            /** @example 10 */
            buy_maker_count?: number;
            /** @example 5 */
            sell_maker_base?: string;
            /** @example 45500 */
            sell_maker_notional?: string;
            /** @example 8 */
            sell_maker_count?: number;
            /** @example 8.5 */
            buy_taker_base?: string;
            /** @example 77350 */
            buy_taker_notional?: string;
            /** @example 15 */
            buy_taker_count?: number;
            /** @example 7.5 */
            sell_taker_base?: string;
            /** @example 68250 */
            sell_taker_notional?: string;
            /** @example 12 */
            sell_taker_count?: number;
        };
        Balance: {
            /**
             * @example exchange
             * @enum {string}
             */
            type?: "exchange";
            /**
             * @description The currency symbol
             * @example BTC
             */
            currency?: string;
            /**
             * @description The confirmed balance for the currency (also referred to as `confirmedBalance`). For crypto withdrawals, this value is **not** reduced until the withdrawal has been confirmed on the blockchain. This delay protects against blockchain reorganizations. Use the `available` field instead if you need balances that immediately reflect holds.
             * @example 10.5
             */
            amount?: number;
            /**
             * @description The amount available for trading. This value is reduced **immediately** when an order hold or withdrawal hold is placed, making it the recommended field for tracking real-time spendable balances.
             * @example 9
             */
            available?: number;
            /**
             * @description The amount available for withdrawal
             * @example 9
             */
            availableForWithdrawal?: number;
            /**
             * @description The amount pending withdrawal
             * @example 1
             */
            pendingWithdrawal?: number;
            /**
             * @description The amount pending deposit
             * @example 0.5
             */
            pendingDeposit?: number;
            /**
             * Format: date-time
             * @description Server-side monotonically increasing clock value as an ISO 8601 timestamp. Clients can use this value to detect and filter out stale responses that may occur due to load balancing or potential stale servers.
             * @example 2024-03-16T00:00:00.000000Z
             */
            _timestamp?: string;
        };
        NotionalVolume: {
            /**
             * Format: date
             * @example 2020-06-02
             */
            date?: string;
            /** @example 1591084414622 */
            last_updated_ms?: number;
            /** @example 25 */
            web_maker_fee_bps?: number;
            /** @example 35 */
            web_taker_fee_bps?: number;
            /** @example 25 */
            web_auction_fee_bps?: number;
            /** @example 10 */
            api_maker_fee_bps?: number;
            /** @example 35 */
            api_taker_fee_bps?: number;
            /** @example 20 */
            api_auction_fee_bps?: number;
            /** @example 10 */
            fix_maker_fee_bps?: number;
            /** @example 35 */
            fix_taker_fee_bps?: number;
            /** @example 20 */
            fix_auction_fee_bps?: number;
            /** @example 1000000 */
            notional_30d_volume?: string;
            notional_1d_volume?: {
                /** @description UTC date in `yyyy-MM-dd` format */
                date?: string;
                /**
                 * Format: decimal
                 * @description Notional volume value in USD for this single day
                 */
                notional_volume?: string;
            }[];
            /** @example 750000 */
            api_notional_30d_volume?: string;
            fee_tier?: {
                /** @example 0bps */
                tier?: string;
                /** @example 0 */
                api_maker_fee_bps?: number;
                /** @example 10 */
                api_taker_fee_bps?: number;
            };
        };
        NotionalBalance: {
            /** @description Currency code, see symbols and minimums */
            currency?: string;
            /** @description The current balance */
            amount?: string;
            /** @description Amount, in notional */
            amountNotional?: string;
            /** @description The amount that is available to trade */
            available?: string;
            /** @description Available, in notional */
            availableNotional?: string;
            /** @description The amount that is available to withdraw */
            availableForWithdrawal?: string;
            /** @description AvailableForWithdrawal, in notional */
            availableForWithdrawalNotional?: string;
        };
        Address: {
            /** @description String representation of the cryptocurrency address */
            address?: string;
            /** @description Creation date of the address */
            timestamp?: components["schemas"]["TimestampType"];
            /** @description If you provided a label when creating the address, it will be echoed back here */
            label?: string;
            /** @description It would be present if applicable, it will be present for cosmos address */
            memo?: string;
            /** @description The blockchain network for the address */
            network?: string;
        };
        Transfer: {
            /** @enum {string} */
            type?: "Deposit" | "Withdrawal";
            /** @enum {string} */
            status?: "Complete" | "Pending";
            /** @description The timestamp in milliseconds */
            timestampms?: components["schemas"]["TimestampType"];
            /**
             * Format: int64
             * @description The transfer ID
             */
            eid?: bigint;
            /** @description The currency transferred */
            currency?: string;
            /** @description The amount transferred */
            amount?: string;
            /** @description The transaction hash if applicable */
            txHash?: string;
        };
        V2Transfer: {
            /**
             * @description The type of the transfer
             * @enum {string}
             */
            type?: "Deposit" | "Withdrawal" | "Reward" | "AdminDebit" | "AdminCredit";
            /**
             * @description The status of the transfer
             * @enum {string}
             */
            status?: "Complete" | "Pending" | "Advanced";
            /** @description The timestamp in milliseconds */
            timestampms?: components["schemas"]["TimestampType"];
            /**
             * Format: int64
             * @description The transfer event ID
             */
            eid?: bigint;
            /** @description The currency transferred */
            currency?: string;
            /** @description The amount transferred */
            amount?: string;
            /** @description The blockchain network the transfer was executed on (e.g., `ethereum`, `solana`, `arbitrum`, `optimism`, `base`, `avalanche`). Not present for fiat or administrative transfers. */
            network?: string;
            /** @description The fee charged for the transfer */
            feeAmount?: string;
            /** @description The currency in which the fee was charged */
            feeCurrency?: string;
            /** @description The on-chain transaction hash, if applicable */
            txHash?: string;
            /** @description The transfer method (e.g., `ACH`, `CreditCard`) */
            method?: string;
            /** @description The destination address for withdrawals */
            destination?: string;
            /** @description The unique withdrawal identifier */
            withdrawalId?: string;
            /** @description The output index for withdrawals */
            outputIdx?: number;
            /** @description The purpose or reason for administrative transfers */
            purpose?: string;
        };
        InstantQuote: {
            /** @description Unique ID for the quote. This is used in the execution of the order */
            quoteId?: number;
            /** @description Number of milliseconds until this quote price expires. Once expired, you will need to request a new quote */
            maxAgeMs?: number;
            /** @description The symbol passed in the quote request */
            pair?: string;
            /** @description The quoted price of the asset. This will not change when attempting execution */
            price?: string;
            /** @description The currency in which the order is priced. Matches `CCY2` in the symbol */
            priceCurrency?: string;
            /**
             * @description Either "buy" or "sell"
             * @enum {string}
             */
            side?: "buy" | "sell";
            /** @description The quantity of the asset to be bought or sold */
            quantity?: string;
            /** @description The currency label for the `quantity` field. Matches `CCY1` in the symbol */
            quantityCurrency?: string;
            /** @description The fee quantity to be taken for the order upon execution */
            fee?: string;
            /** @description The currency label for the order */
            feeCurrency?: string;
            /** @description The deposit fee quantity. Will be applied if a debit card is used for the order. Will return 0 if there is no `depositFee` */
            depositFee?: string;
            /** @description Currency in which `depositFee` is taken */
            depositFeeCurrency?: string;
            /** @description Total quantity to spend for the order. Will be the sum inclusive of all fees and amount to be traded. */
            totalSpend?: string;
            /** @description Currency of the `totalSpend` to be spent on the order */
            totalSpendCurrency?: string;
        };
        ClearingOrder: {
            /** @description The clearing ID */
            clearing_id?: string;
            /** @description The trading pair */
            symbol?: string;
            /** @description The order price */
            price?: string;
            /** @description The order amount */
            amount?: string;
            /** @enum {string} */
            side?: "buy" | "sell";
            /** @description The order status */
            status?: string;
            /** @description The timestamp */
            timestamp?: components["schemas"]["TimestampType"];
            /** @description The timestamp in milliseconds */
            timestampms?: number;
            /** @description Whether the order is confirmed */
            is_confirmed?: boolean;
        };
        Account: {
            /** @description The account name */
            name?: string;
            /** @description The account ID */
            account_id?: string;
            /** @description Whether the account is the default account */
            is_default?: boolean;
            /** @description The creation date */
            created?: string;
        };
        Transaction: {
            /** @description The account. */
            account?: string;
            /** @description The quantity that was executed. */
            amount?: string;
            /** @description The client order ID, if defined. Otherwise an empty string. */
            clientOrderId?: string;
            /** @description The price that the execution happened at. */
            price?: string;
            /** @description The time that the trade happened in milliseconds. */
            timestampms?: components["schemas"]["TimestampType"];
            /** @description Indicating the side of the original order. */
            side?: string;
            /** @description If true, this order was the taker in the trade. */
            isAggressor?: boolean;
            /** @description The symbol that the trade was for */
            feeAssetCode?: string;
            /** @description The fee amount charged */
            feeAmount?: string;
            /**
             * Format: int64
             * @description The order that this trade executed against.
             */
            orderId?: bigint;
            /** @description Will always be "gemini". */
            exchange?: string;
            /** @description True if the trade was a auction trade and not an on-exchange trade. */
            isAuctionFill?: boolean;
            /** @description True if the trade was a clearing trade and not an on-exchange trade. */
            isClearingFill?: boolean;
            /**
             * Format: int64
             * @description The trade ID.
             */
            tid?: bigint;
            /** @description The symbol that the trade was for. */
            symbol?: string;
        } | {
            /** @description The time that the trade happened in milliseconds. */
            timestampms?: components["schemas"]["TimestampType"];
            /** @description The account you are transferring from. */
            source?: string;
            /** @description The account you are transferring to. */
            destination?: string;
            /** @description The operation reason. */
            operationReason?: string;
            /** @description The status of the transfer. */
            status?: string;
            /**
             * Format: int64
             * @description Transfer event id.
             */
            eid?: bigint;
            /** @description Currency code, see symbols */
            currency?: string;
            /** @description The quantity that was transferred. */
            amount?: string;
            /** @description Type of transfer method. */
            method?: string;
            /**
             * Format: int64
             * @description Correlation ID.
             */
            correlationId?: bigint;
            /** @description Transfer type. */
            transferType?: string;
            /** @description Bank ID. */
            bankId?: string;
            /** @description Purpose. */
            purpose?: string;
            /** @description Supplies the transaction hash when available. */
            transactionHash?: string;
            /** @description Transfer ID. */
            transferId?: string;
            /** @description Withdrawal ID. */
            withdrawalId?: string;
            /** @description Client Transfer ID. Client transfer ID is an optional client-supplied unique identifier for each withdrawal or internal transfer. */
            clientTransferId?: string;
            /**
             * Format: int64
             * @description Deposit advance event ID.
             */
            advanceEid?: bigint;
            /**
             * Format: int64
             * @description Pending event ID.
             */
            pendingEid?: bigint;
            /**
             * Format: int64
             * @description Withdrawal event ID.
             */
            withdrawalEid?: bigint;
            /** @description Fee ID. */
            feeId?: string;
        };
        RevokeOauthTokenResponse: {
            /** @description A message that indicates the token has been revoked for the account */
            message?: string;
        };
        NetworkToken: {
            /** @description The requested token identifier. */
            token?: string;
            /**
             * @description Array of supported blockchain networks for the token. Many tokens (especially stablecoins like USDC, USDT) are available on multiple networks.
             *
             *     Supported networks include: `bitcoin`, `ethereum`, `solana`, `optimism`, `arbitrum`, `base`, `monad`, `avalanche`, `litecoin`, `bitcoincash`, `dogecoin`, `zcash`, `filecoin`, `tezos`, `polkadot`, `cosmos`, `xrpl`, `linea`, and more.
             * @example [
             *       "optimism",
             *       "solana",
             *       "base",
             *       "arbitrum",
             *       "monad",
             *       "avalanche",
             *       "ethereum"
             *     ]
             */
            network?: string[];
        };
        NetworkAssets: {
            /**
             * @description The blockchain network identifier.
             * @example ethereum
             */
            network?: string;
            /**
             * @description Alphabetically sorted array of enabled asset/token codes available on this network. Assets include both exchange-tradable and custody-supported tokens.
             * @example [
             *       "AAVE",
             *       "BAT",
             *       "DAI",
             *       "ETH",
             *       "LINK",
             *       "MATIC",
             *       "UNI",
             *       "USDC",
             *       "USDT",
             *       "WBTC"
             *     ]
             */
            assets?: string[];
        };
        FeePromos: {
            /** @description Symbols that currently have fee promos */
            symbols?: string[];
        };
        PriceFeedResponse: {
            /** @description Trading pair symbol. See [**symbols and minimums**](/market-data/symbols-and-minimums#all-supported-symbols) */
            pair?: string;
            /** @description Current price of the pair on the Gemini order book */
            price?: string;
            /** @description 24 hour change in price of the pair on the Gemini order book */
            percentChange24h?: string;
        }[];
        ApprovedAddress: {
            /** @description The network of the approved address. Network can be `bitcoin`, `ethereum`, `bitcoincash`, `litecoin`, `zcash`, `filecoin`, `dogecoin`, `tezos`, `solana`, `polkadot`, `avalanche`, `cosmos`, or `xrpl` */
            network?: string;
            /** @description Will return the scope of the address as either "account" or "group" */
            scope?: string;
            /** @description The label assigned to the address */
            label?: string;
            /** @description The status of the address that will return as "active", "pending-time" or "pending-mua". The remaining time is exactly 7 days after the initial request. "pending-mua" is for multi-user accounts and will require another administator or fund manager on the account to approve the address. */
            status?: string;
            /** @description UTC timestamp in millisecond of when the address was created. */
            createdAt?: string;
            /** @description The address on the approved address list. */
            address?: string;
        };
        OpenPosition: {
            /** @description The [symbol](/market-data/symbols-and-minimums) of the order. */
            symbol?: string;
            /** @description The type of instrument. Either "spot" or "perp". */
            instrument_type?: string;
            /**
             * Format: decimal
             * @description The position size. Value will be negative for shorts.
             */
            quantity?: string;
            /**
             * Format: decimal
             * @description The value of position; calculated as (`quantity` * `mark_price`). Value will be negative for shorts.
             */
            notional_value?: string;
            /**
             * Format: decimal
             * @description The current P&L that has been realised from the position.
             */
            realised_pnl?: string;
            /**
             * Format: decimal
             * @description Current Mark to Market value of the positions.
             */
            unrealised_pnl?: string;
            /**
             * Format: decimal
             * @description The average price of the current position.
             */
            average_cost?: string;
            /**
             * Format: decimal
             * @description The current Mark Price for the Asset or the position.
             */
            mark_price?: string;
        };
        FundingAmountResponse: {
            /** @description The requested symbol. See [**symbols and minimums**](/market-data/symbols-and-minimums#all-supported-symbols) */
            symbol?: string;
            /** @description UTC date time in format `yyyy-MM-ddThh:mm:ss.SSSZ` format */
            fundingDateTime?: string;
            /**
             * Format: long
             * @description Current funding amount Epoc time.
             */
            fundingTimestampMilliSecs?: number;
            /**
             * Format: long
             * @description Next funding amount Epoc time.
             */
            nextFundingTimestamp?: number;
            /**
             * Format: decimal
             * @description The dollar amount for a Long 1 position held in the symbol for funding period (1 hour)
             */
            amount?: number;
            /**
             * Format: decimal
             * @description The estimated dollar amount for a Long 1 position held in the symbol for next funding period (1 hour)
             */
            estimatedFundingAmount?: number;
        };
        StakingBalance: {
            /**
             * @description Will always be "Staking"
             * @example Staking
             */
            type?: string;
            /**
             * @description Currency code, see symbols and minimums
             * @example MATIC
             */
            currency?: string;
            /**
             * Format: decimal
             * @description The current Staking balance
             * @example 10
             */
            balance?: number;
            /**
             * Format: decimal
             * @description The amount that is available to trade
             * @example 0
             */
            available?: number;
            /**
             * Format: decimal
             * @description The Staking amount that is available to redeem to exchange account
             * @example 10
             */
            availableForWithdrawal?: number;
            balanceByProvider?: {
                [key: string]: {
                    /**
                     * Format: decimal
                     * @description The current Staking balance per providerId
                     * @example 10
                     */
                    balance?: number;
                };
            };
        };
        StakingDeposit: {
            /**
             * @description A unique identifier for the staking transaction
             * @example 65QN4XM5
             */
            transactionId?: string;
            /**
             * @description Provider Id, in uuid4 format
             * @example 62b21e17-2534-4b9f-afcf-b7edb609dd8d
             */
            providerId?: string;
            /**
             * @description Currency code, see [symbols](/market-data/symbols-and-minimums)
             * @example MATIC
             */
            currency?: string;
            /**
             * Format: decimal
             * @description The amount deposited
             * @example 30
             */
            amount?: number;
            /**
             * Format: decimal
             * @description The total accrual
             */
            accrualTotal?: number;
            /** @description A JSON object including one or many rates. If more than one rate it would be an array of rates. */
            rates?: {
                /**
                 * @description Staking interest rate in bps (Expressed as a simple rate. Interest on Staking balances compounds daily. In mobile and web applications, APYs are derived from this rate and rounded to 1/10th of a percent.)
                 * @example 540
                 */
                rate?: number;
            };
        };
        StakingTransaction: {
            /**
             * @description A unique identifier for the staking transaction
             * @example MPZ7LDD8
             */
            transactionId?: string;
            /**
             * @description Can be any one of the following - Deposit, Redeem, Interest, RedeemPayment, AdminRedeem, AdminCreditAdjustment, AdminDebitAdjustment
             * @example Redeem
             * @enum {string}
             */
            transactionType?: "Deposit" | "Redeem" | "Interest" | "RedeemPayment" | "AdminRedeem" | "AdminCreditAdjustment" | "AdminDebitAdjustment";
            /**
             * @description Currency code
             * @example MATIC
             */
            amountCurrency?: string;
            /**
             * Format: decimal
             * @description The amount that is defined by the transactionType above
             * @example 20
             */
            amount?: number;
            /**
             * @description A supported three-letter fiat currency code, e.g. usd
             * @example USD
             */
            priceCurrency?: string;
            /**
             * Format: decimal
             * @description Current market price of the underlying token at the time of the reward
             * @example 0.1
             */
            priceAmount?: number;
            /**
             * @description The time of the transaction in milliseconds
             * @example 1667418560153
             */
            dateTime?: components["schemas"]["TimestampType"];
        };
        StakingHistory: {
            /**
             * @description Provider Id, in uuid4 format
             * @example 62b21e17-2534-4b9f-afcf-b7edb609dd8d
             */
            providerId?: string;
            transactions?: components["schemas"]["StakingTransaction"][];
        };
        StakingRate: {
            /**
             * @description Provider Id, in uuid4 format
             * @example 62bb4d27-a9c8-4493-a737-d4fa33994f1f
             */
            providerId?: string;
            /**
             * @description Staking interest rate in bps (Expressed as a simple rate. Interest on Staking balances compounds daily. In mobile and web applications, APYs are derived from this rate and rounded to 1/10th of a percent.)
             * @example 429.386
             */
            rate?: number;
            /**
             * Format: decimal
             * @description Staking interest APY (Expressed as a percentage derived from the rate and rounded to 1/10th of a percent.)
             * @example 4.39
             */
            apyPct?: number;
            /**
             * Format: decimal
             * @description `rate` expressed as a percentage
             * @example 4.29386
             */
            ratePct?: number;
            /**
             * @description Maximum new amount in USD notional of this crypto that can participate in Gemini Staking per account per month
             * @example 500000
             */
            depositUsdLimit?: number;
        };
        /** @description Currency Symbol Keys */
        StakingRateProvider: {
            currency_symbol?: components["schemas"]["StakingRate"];
        };
        /** @description Provider UUID Keys */
        StakingRateResponse: {
            provider_uuid?: components["schemas"]["StakingRateProvider"];
        };
        StakingRewardPeriod: {
            /**
             * @description Provider Id, in uuid4 format
             * @example 62b21e17-2534-4b9f-afcf-b7edb609dd8d
             */
            providerId?: string;
            /**
             * @description Currency code, see [symbols](/market-data/symbols-and-minimums)
             * @example MATIC
             */
            currency?: string;
            /**
             * Format: decimal
             * @description Staking reward rate expressed as an APY at time of accrual. Interest on Staking balances compounds daily based on the simple rate which is available from `/v1/staking/rates/`
             * @example 5.75
             */
            apyPct?: number;
            /**
             * Format: decimal
             * @description Rate expressed as a percentage
             * @example 5.592369
             */
            ratePct?: number;
            /**
             * @description Number of accruals in the specific aggregate, typically one per day. If the rate is adjusted, new accruals are added.
             * @example 1
             */
            numberOfAccruals?: number;
            /**
             * Format: decimal
             * @description The total accrual
             * @example 0.0065678
             */
            accrualTotal?: number;
            /**
             * @description Time of first accrual. In iso datetime with timezone format
             * @example 2022-08-23T20:00:00.000Z
             */
            firstAccrualAt?: string;
            /**
             * @description Time of last accrual. In iso datetime with timezone format
             * @example 2022-08-23T20:00:00.000Z
             */
            lastAccrualAt?: string;
        };
        StakingRewards: {
            /**
             * @description Provider Id, in uuid4 format
             * @example 62b21e17-2534-4b9f-afcf-b7edb609dd8d
             */
            providerId?: string;
            /**
             * @description Currency code, see [symbols](/market-data/symbols-and-minimums)
             * @example MATIC
             */
            currency?: string;
            /**
             * Format: decimal
             * @description The total accrual
             * @example 0.103994
             */
            accrualTotal?: number;
            /** @description Array of JSON objects with period accrual information */
            ratePeriods?: components["schemas"]["StakingRewardPeriod"][];
        };
        /** @description Currency Symbol Keys */
        StakingRewardsProvider: {
            currency_symbol?: components["schemas"]["StakingRewards"];
        };
        /** @description Provider UUID Keys */
        StakingRewardsResponse: {
            provider_uuid?: components["schemas"]["StakingRewardsProvider"];
        };
        StakingWithdrawal: {
            /**
             * @description A unique identifier for the staking transaction
             * @example MPZ7LDD8
             */
            transactionId?: string;
            /**
             * Format: decimal
             * @description The amount deposited
             * @example 20
             */
            amount?: number;
            /**
             * Format: decimal
             * @description The amount redeemed successfully
             * @example 20
             */
            amountPaidSoFar?: number;
            /**
             * Format: decimal
             * @description The amount pending to be redeemed
             * @example 0
             */
            amountRemaining?: number;
            /**
             * @description Currency code
             * @example MATIC
             */
            currency?: string;
            /**
             * @description In ISO datetime with timezone format
             * @example 2022-11-02T19:49:20.153Z
             */
            requestInitiated?: string;
        };
        FeeEstimateRequest: {
            /**
             * @description The string `/v1/withdraw/{currencyCodeLowerCase}/feeEstimate` where `:currencyCodeLowerCase` is replaced with the currency code of a supported crypto-currency, e.g. `eth`, `aave`, etc. See [Symbols and minimums](/market-data/symbols-and-minimums)
             * @example /v1/withdraw/eth/feeEstimate
             */
            request: string;
            nonce: components["schemas"]["Nonce"];
            /**
             * @description Standard string format of cryptocurrency address
             * @example 0x31c2105b8dea834167f32f7ea7d877812e059230
             */
            address: string;
            /**
             * @description Quoted decimal amount to withdraw
             * @example 0.01
             */
            amount: string;
            /**
             * @description The name of the account within the subaccount group.
             * @example primary
             */
            account: string;
        };
        FeeEstimateResponse: {
            /**
             * @description Currency code, see [symbols](/market-data/symbols-and-minimums).
             * @example ETH
             */
            currency?: string;
            /**
             * @description The estimated gas fee
             * @example {currency: 'ETH', value: '0'}
             */
            fee?: string;
            /**
             * @description Value that shows if an override on the customer's account for free withdrawals exists
             * @example false
             */
            isOverride?: boolean;
            /**
             * @description Total nunber of allowable fee-free withdrawals
             * @example 1
             */
            monthlyLimit?: number;
            /**
             * @description Total number of allowable fee-free withdrawals left to use
             * @example 1
             */
            monthlyRemaining?: number;
        };
        FeeEstimateV2Request: {
            /**
             * @description The string `/v2/withdraw/{network}/{ticker}/feeEstimate` where `{network}` is the blockchain network (e.g. `ethereum`, `bitcoin`, `solana`) and `{ticker}` is the currency code (e.g. `eth`, `btc`, `sol`). See [Symbols and minimums](/market-data/symbols-and-minimums)
             * @example /v2/withdraw/ethereum/eth/feeEstimate
             */
            request: string;
            nonce: components["schemas"]["Nonce"];
            /**
             * @description Standard string format of the destination cryptocurrency address
             * @example 0x31c2105b8dea834167f32f7ea7d877812e059230
             */
            address: string;
            /**
             * @description Quoted decimal amount to withdraw
             * @example 0.01
             */
            amount: string;
            /**
             * @description Required for Master API keys. The name of the account within the subaccount group.
             * @example primary
             */
            account?: string;
            /** @description It would be present if applicable, it will be present for cosmos address. */
            memo?: string;
        };
        FeeEstimateV2Response: {
            /**
             * @description Currency code, see [symbols](/market-data/symbols-and-minimums).
             * @example ETH
             */
            currency?: string;
            /**
             * Format: decimal
             * @description The estimated withdrawal fee as a decimal amount
             * @example 0.001
             */
            fee?: number;
            /**
             * @description Whether an override on the customer's account for free withdrawals exists
             * @example false
             */
            isOverride?: boolean;
            /**
             * @description Total number of allowable fee-free withdrawals
             * @example 1
             */
            monthlyLimit?: number;
            /**
             * @description Total number of allowable fee-free withdrawals remaining
             * @example 1
             */
            monthlyRemaining?: number;
        };
        RoleResponse: {
            /** @description `True` if the Auditor role is assigned to the API keys. `False` otherwise. */
            isAuditor: boolean;
            /** @description `True` if the Fund Manager role is assigned to the API keys. `False` otherwise. */
            isFundManager: boolean;
            /** @description `True` if the Trader role is assigned to the API keys. `False` otherwise. */
            isTrader: boolean;
            /** @description _Only returned for master-level API keys_. The Gemini clearing counterparty ID associated with the API key making the request. */
            counterparty_id?: string;
            /** @description _Only returned for master-level API keys_.`True` if the Administrator role is assigned to the API keys. `False` otherwise. */
            isAccountAdmin?: boolean;
        };
        MarginResponse: {
            /**
             * Format: decimal
             * @description The $ equivalent value of all the assets available in the current trading account that can contribute to funding a derivatives position.
             */
            margin_assets_value?: string;
            /**
             * Format: decimal
             * @description The $ amount that is being required by the accounts current positions and open orders.
             */
            initial_margin?: string;
            /**
             * Format: decimal
             * @description The difference between the `margin_assets_value` and `initial_margin`.
             */
            available_margin?: string;
            /**
             * Format: decimal
             * @description The minimum amount of `margin_assets_value` required before the account is moved to liquidation status.
             */
            margin_maintenance_limit?: string;
            /**
             * Format: decimal
             * @description The ratio of Notional Value to Margin Assets Value.
             */
            leverage?: string;
            /**
             * Format: decimal
             * @description The $ value of the current position.
             */
            notional_value?: string;
            /**
             * Format: decimal
             * @description The estimated price for the asset at which liquidation would occur.
             */
            estimated_liquidation_price?: string;
            /**
             * Format: decimal
             * @description The contribution to `initial_margin` from open positions.
             */
            initial_margin_positions?: string;
            /**
             * Format: decimal
             * @description The contribution to `initial_margin` from open orders.
             */
            reserved_margin?: string;
            /**
             * Format: decimal
             * @description The contribution to `initial_margin` from open BUY orders.
             */
            reserved_margin_buys?: string;
            /**
             * Format: decimal
             * @description The contribution to `initial_margin` from open SELL orders.
             */
            reserved_margin_sells?: string;
            /**
             * Format: decimal
             * @description The amount of that product the account could purchase based on current `initial_margin` and `margin_assets_value`.
             */
            buying_power?: string;
            /**
             * Format: decimal
             * @description The amount of that product the account could sell based on current `initial_margin` and `margin_assets_value`.
             */
            selling_power?: string;
        };
        MoneyAmount: {
            /**
             * @description The currency code (e.g., "USD", "BTC", "ETH")
             * @example USD
             */
            currency: string;
            /**
             * Format: decimal
             * @description The amount in the specified currency
             * @example 10000.00
             */
            value: string;
        };
        LiquidationRisk: {
            /**
             * Format: decimal
             * @description The percentage loss from current value that would trigger liquidation, formatted as decimal (e.g., "0.1550" = 15.50%)
             * @example 0.1550
             */
            lossPercentage: string;
            /** @description The estimated price at which liquidation would occur (optional, may not be present for all positions) */
            liquidationPrice?: components["schemas"]["MoneyAmount"];
        };
        InterestRateInfo: {
            /**
             * Format: decimal
             * @description The interest rate as a decimal string
             * @example 0.00001141552511
             */
            rate: string;
            /**
             * @description The time interval for the rate (currently only "hour" is supported)
             * @example hour
             * @enum {string}
             */
            interval: "hour";
        };
        MarginAccountSummary: {
            /** @description The total value of all assets available in the margin account that can contribute to funding positions */
            marginAssetValue: components["schemas"]["MoneyAmount"];
            /** @description The amount of collateral available for new positions or withdrawals */
            availableCollateral: components["schemas"]["MoneyAmount"];
            /** @description The total value of all open positions */
            notionalValue: components["schemas"]["MoneyAmount"];
            /** @description The total amount currently borrowed across all currencies */
            totalBorrowed: components["schemas"]["MoneyAmount"];
            /**
             * Format: decimal
             * @description The current leverage ratio (notionalValue / marginAssetValue)
             * @example 1.5
             */
            leverage: string;
            /** @description The maximum value that can be purchased with available collateral */
            buyingPower: components["schemas"]["MoneyAmount"];
            /** @description The maximum value that can be sold with available collateral */
            sellingPower: components["schemas"]["MoneyAmount"];
            /** @description Liquidation risk information (only present if positions exist) */
            liquidationRisk?: components["schemas"]["LiquidationRisk"];
            /** @description Current interest rate on borrowed amounts (only present if borrows exist) */
            interestRate?: components["schemas"]["InterestRateInfo"];
            /** @description Collateral reserved for open buy orders */
            reservedBuyOrders: components["schemas"]["MoneyAmount"];
            /** @description Collateral reserved for open sell orders */
            reservedSellOrders: components["schemas"]["MoneyAmount"];
        };
        MarginInterestRate: {
            /**
             * @description The currency code (e.g., "BTC", "ETH", "USD")
             * @example BTC
             */
            currency: string;
            /**
             * Format: decimal
             * @description The hourly borrow rate as a decimal
             * @example 0.00001141552511
             */
            borrowRate: string;
            /**
             * Format: decimal
             * @description The daily borrow rate (hourly rate × 24)
             * @example 0.00027397260264
             */
            borrowRateDaily: string;
            /**
             * Format: decimal
             * @description The annualized borrow rate (daily rate × 365)
             * @example 0.1
             */
            borrowRateAnnual: string;
            /**
             * Format: int64
             * @description Unix timestamp in milliseconds when the rate was last updated
             * @example 1700000000000
             */
            lastUpdated: bigint;
        };
        MarginRatesResponse: {
            /** @description Array of interest rates for all borrowable currencies */
            rates: components["schemas"]["MarginInterestRate"][];
        };
        MarginRiskStats: {
            /** @description The total value of all assets available in the margin account */
            marginAssetValue: components["schemas"]["MoneyAmount"];
            /** @description The amount of collateral available for new positions */
            availableCollateral: components["schemas"]["MoneyAmount"];
            /** @description The total value of all open positions */
            notionalValue: components["schemas"]["MoneyAmount"];
            /** @description The total amount currently borrowed */
            totalBorrowed: components["schemas"]["MoneyAmount"];
            /**
             * Format: decimal
             * @description The leverage ratio
             * @example 1.5
             */
            leverage: string;
            /** @description Collateral reserved for open buy orders */
            reservedBuyOrders: components["schemas"]["MoneyAmount"];
            /** @description Collateral reserved for open sell orders */
            reservedSellOrders: components["schemas"]["MoneyAmount"];
            /** @description The maximum value that can be purchased */
            buyingPower: components["schemas"]["MoneyAmount"];
            /** @description The maximum value that can be sold */
            sellingPower: components["schemas"]["MoneyAmount"];
            /** @description Liquidation risk information (only present if applicable) */
            liquidationRisk?: components["schemas"]["LiquidationRisk"];
        };
        MarginOrderPreview: {
            /** @description Margin risk statistics before the order would be executed */
            preorder: components["schemas"]["MarginRiskStats"];
            /** @description Margin risk statistics after the order would be executed */
            postorder: components["schemas"]["MarginRiskStats"];
        };
        Quantity: {
            /** @description The currency code of the quantity. */
            currency: string;
            /**
             * Format: decimal
             * @description The value of the quantity.
             */
            value: string;
        };
        FundingTransfer: {
            /** @description Event type */
            eventType: string;
            /** @description Time of the funding payment */
            timestamp: components["schemas"]["TimestampType"];
            /** @description Asset symbol */
            assetCode: string;
            /**
             * @description Credit or Debit
             * @enum {string}
             */
            action: "Credit" | "Debit";
            /** @description A nested JSON object describing the transaction amount */
            quantity: components["schemas"]["Quantity"];
            /** @description Symbol of the underlying instrument. **Note** that this is only attached to requests from 16th April 2024 onwards. */
            instrumentSymbol?: string;
        };
        FundingPayment: {
            /**
             * @description Event type
             * @enum {string}
             */
            eventType: "Hourly Funding Transfer";
            hourlyFundingTransfer: components["schemas"]["FundingTransfer"];
        };
        FundingPaymentReportItem: {
            /**
             * @description Event type
             * @enum {string}
             */
            eventType: "Hourly Funding Transfer";
            /** @description Time of the funding payment */
            timestamp: components["schemas"]["TimestampType"];
            /** @description Asset symbol */
            assetCode: string;
            /**
             * @description Credit or Debit
             * @enum {string}
             */
            action: "Credit" | "Debit";
            /** @description A nested JSON object describing the transaction amount */
            quantity: components["schemas"]["Quantity"];
            /** @description Symbol of the underlying instrument. **Note** that this is only attached to requests from 16th April 2024 onwards. */
            instrumentSymbol?: string;
        };
        RiskStatsResponse: {
            /**
             * @description Contract type for which the symbol data is fetched
             * @enum {string}
             */
            product_type?: "PerpetualSwapContract";
            /**
             * Format: decimal
             * @description Current mark price at the time of request
             */
            mark_price?: string;
            /**
             * Format: decimal
             * @description Current index price at the time of request
             */
            index_price?: string;
            /**
             * Format: decimal
             * @description string representation of decimal value of open interest
             */
            open_interest?: string;
            /**
             * Format: decimal
             * @description string representation of decimal value of open interest notional
             */
            open_interest_notional?: string;
        };
        FxRate: {
            /**
             * @description The requested currency pair
             * @example AUDUSD
             */
            fxPair?: string;
            /**
             * Format: double
             * @description The exchange rate
             * @example 0.69
             */
            rate?: number;
            /**
             * @description The timestamp (in Epoch time format) that the requested fxrate has been retrieved for
             * @example 1594651859000
             */
            asOf?: components["schemas"]["TimestampType"];
            /**
             * @description The market data provider
             * @example bcb
             */
            provider?: string;
            /**
             * @description The market for which the retrieved price applies to
             * @example Spot
             */
            benchmark?: string;
        };
        /**
         * @example [
         *       [
         *         1559755800000,
         *         7781.6,
         *         7820.23,
         *         7776.56,
         *         7819.39,
         *         34.7624802159
         *       ],
         *       [
         *         1559755800000,
         *         7781.6,
         *         7829.46,
         *         7776.56,
         *         7817.28,
         *         43.4228281059
         *       ]
         *     ]
         */
        Candle: number[];
        CandleResponse: components["schemas"]["Candle"][];
        TickerInfo: {
            /**
             * @description The trading pair symbol
             * @example BTCUSD
             */
            symbol?: string;
            /**
             * Format: decimal
             * @description Open price from 24 hours ago
             * @example 9121.76
             */
            open?: string;
            /**
             * Format: decimal
             * @description High price from 24 hours ago
             * @example 9440.66
             */
            high?: string;
            /**
             * Format: decimal
             * @description Low price from 24 hours ago
             * @example 9106.51
             */
            low?: string;
            /**
             * Format: decimal
             * @description Close price (most recent trade)
             * @example 9347.66
             */
            close?: string;
            /**
             * @description Hourly prices descending for past 24 hours
             * @example [
             *       "9365.1",
             *       "9386.16",
             *       "9373.41",
             *       "9322.56",
             *       "9268.89",
             *       "9265.38"
             *     ]
             */
            changes?: string[];
            /**
             * Format: decimal
             * @description Current best bid
             * @example 9345.70
             */
            bid?: string;
            /**
             * Format: decimal
             * @description Current best offer
             * @example 9347.67
             */
            ask?: string;
        };
    };
    responses: {
        /** @description Bad request - malformed request or invalid parameters */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "result": "error",
                 *       "reason": "InvalidSignature",
                 *       "message": "Invalid signature for this request"
                 *     }
                 */
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Unauthorized - missing or invalid authentication */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "result": "error",
                 *       "reason": "MissingApikeyHeader",
                 *       "message": "Must provide 'X-GEMINI-APIKEY' header"
                 *     }
                 */
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description ApiKey fails IP Filtering Check */
        ApiKeyIpFilteringFailure: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "result": "error",
                 *       "reason": "ApiKeyIpFilteringFailure",
                 *       "message": "ApiKey fails IP Filtering Check for some accounts"
                 *     }
                 */
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Resource not found */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "result": "error",
                 *       "reason": "EndpointNotFound",
                 *       "message": "API entry point not found"
                 *     }
                 */
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Too many requests - you have exceeded the rate limit */
        TooManyRequests: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "result": "error",
                 *       "reason": "Too Many Requests",
                 *       "message": "Too Many Requests"
                 *     }
                 */
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Internal server error */
        InternalError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "result": "error",
                 *       "reason": "Internal Server Error",
                 *       "message": "Unexpected server error occurred."
                 *     }
                 */
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
    };
    parameters: {
        /**
         * @description The timestamp to pull the FX rate for.
         *
         *     Gemini strongly recommends using milliseconds instead of seconds for timestamps.
         * @example 1591084414622
         */
        timestampParam: components["schemas"]["TimestampType"];
        /**
         * @description Trading pair symbol <br /> <br />
         *
         *     `BTCUSD`, etc. See [<u>**symbols and minimums**</u>](/market-data/symbols-and-minimums#all-supported-symbols).
         */
        symbolParam: string;
        /** @description Either a fiat currency, e.g. `usd` or `gbp`, or a supported crypto-currency, e.g. `gusd`, `btc`, `eth`, `aave`, etc. */
        currencyParam: string;
        /** @description Can be `bitcoin`, `ethereum`, `bitcoincash`, `litecoin`, `zcash`, `filecoin`, `dogecoin`, `tezos`, `solana`, `polkadot`, `avalanche`, `cosmos`, or `xrpl` */
        networkParam: string;
        /** @description Your API key */
        apiKeyAuth: string;
        /** @description Base64-encoded JSON payload */
        payloadAuth: string;
        /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
        signatureAuth: string;
        contentType: string;
        contentLength: string;
        cacheControl: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listSymbols: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The full list of supported symbols. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       "aavegusd",
                     *       "aaveusd",
                     *       "aligusd",
                     *       "aliusd",
                     *       "ampgusd",
                     *       "ampusd",
                     *       "ankrgusd",
                     *       "ankrusd",
                     *       "apegusd",
                     *       "apeusd",
                     *       "api3gusd",
                     *       "api3usd",
                     *       "arbgusd",
                     *       "arbusd",
                     *       "atomgusd",
                     *       "atomusd",
                     *       "avaxgusd",
                     *       "avaxgusdperp",
                     *       "avaxusd",
                     *       "axsgusd",
                     *       "axsusd",
                     *       "batgusd",
                     *       "batusd",
                     *       "bchgusd",
                     *       "bchgusdperp",
                     *       "bchusd",
                     *       "bnbgusdperp",
                     *       "bomegusd",
                     *       "bomegusdperp",
                     *       "bomeusd",
                     *       "bonkgusd",
                     *       "bonkgusdperp",
                     *       "bonkusd",
                     *       "btceur",
                     *       "btcgbp",
                     *       "btcgusd",
                     *       "btcgusdperp",
                     *       "btcsgd",
                     *       "btcusd",
                     *       "btcusdt",
                     *       "chillguygusd",
                     *       "chillguyusd",
                     *       "chzgusd",
                     *       "chzusd",
                     *       "compgusd",
                     *       "compusd",
                     *       "crvgusd",
                     *       "crvusd",
                     *       "ctxgusd",
                     *       "ctxusd",
                     *       "cubegusd",
                     *       "cubeusd",
                     *       "daigusd",
                     *       "daiusd",
                     *       "dogebtc",
                     *       "dogeeth",
                     *       "dogegusd",
                     *       "dogegusdperp",
                     *       "dogeusd",
                     *       "dotgusd",
                     *       "dotgusdperp",
                     *       "dotusd",
                     *       "efilfil",
                     *       "elongusd",
                     *       "elonusd",
                     *       "ensgusd",
                     *       "ensusd",
                     *       "ethbtc",
                     *       "etheur",
                     *       "ethgbp",
                     *       "ethgusd",
                     *       "ethgusdperp",
                     *       "ethsgd",
                     *       "ethusd",
                     *       "ethusdt",
                     *       "fetgusd",
                     *       "fetusd",
                     *       "filgusd",
                     *       "filusd",
                     *       "flokigusd",
                     *       "flokigusdperp",
                     *       "flokiusd",
                     *       "ftmgusd",
                     *       "ftmusd",
                     *       "galagusd",
                     *       "galausd",
                     *       "gmtgusd",
                     *       "gmtusd",
                     *       "goatgusd",
                     *       "goatgusdperp",
                     *       "goatusd",
                     *       "grtgusd",
                     *       "grtusd",
                     *       "gusdgbp",
                     *       "gusdsgd",
                     *       "gusdusd",
                     *       "hntgusd",
                     *       "hntusd",
                     *       "hypegusdperp",
                     *       "imxgusd",
                     *       "imxusd",
                     *       "injgusd",
                     *       "injgusdperp",
                     *       "injusd",
                     *       "iotxgusd",
                     *       "iotxusd",
                     *       "ksl2gusdperp",
                     *       "kt5gusdperp",
                     *       "ldogusd",
                     *       "ldousd",
                     *       "linkbtc",
                     *       "linketh",
                     *       "linkgusd",
                     *       "linkgusdperp",
                     *       "linkusd",
                     *       "lptgusd",
                     *       "lptusd",
                     *       "lrcgusd",
                     *       "lrcusd",
                     *       "ltcbtc",
                     *       "ltceth",
                     *       "ltcgusd",
                     *       "ltcgusdperp",
                     *       "ltcusd",
                     *       "managusd",
                     *       "manausd",
                     *       "maskgusd",
                     *       "maskusd",
                     *       "maticgusd",
                     *       "maticusd",
                     *       "mewgusd",
                     *       "mewgusdperp",
                     *       "mewusd",
                     *       "mkrgusd",
                     *       "mkrusd",
                     *       "moodenggusd",
                     *       "moodenggusdperp",
                     *       "moodengusd",
                     *       "opgusd",
                     *       "opgusdperp",
                     *       "opusd",
                     *       "oxtgusd",
                     *       "oxtusd",
                     *       "paxggusd",
                     *       "paxgusd",
                     *       "pepegusd",
                     *       "pepegusdperp",
                     *       "pepeusd",
                     *       "pnutgusd",
                     *       "pnutgusdperp",
                     *       "pnutusd",
                     *       "polgusdperp",
                     *       "popcatgusd",
                     *       "popcatgusdperp",
                     *       "popcatusd",
                     *       "pythgusd",
                     *       "pythgusdperp",
                     *       "pythusd",
                     *       "qntgusd",
                     *       "qntusd",
                     *       "raregusd",
                     *       "rareusd",
                     *       "rengusd",
                     *       "renusd",
                     *       "rlusdusd",
                     *       "rndrgusd",
                     *       "rndrusd",
                     *       "samogusd",
                     *       "samousd",
                     *       "sandgusd",
                     *       "sandusd",
                     *       "shibgusd",
                     *       "shibgusdperp",
                     *       "shibusd",
                     *       "sklgusd",
                     *       "sklusd",
                     *       "solbtc",
                     *       "soleth",
                     *       "solgusd",
                     *       "solgusdperp",
                     *       "solusd",
                     *       "storjgusd",
                     *       "storjusd",
                     *       "sushigusd",
                     *       "sushiusd",
                     *       "trumpgusdperp",
                     *       "umagusd",
                     *       "umausd",
                     *       "unigusd",
                     *       "unigusdperp",
                     *       "uniusd",
                     *       "usdcusd",
                     *       "usdtgusd",
                     *       "usdtusd",
                     *       "wifgusd",
                     *       "wifgusdperp",
                     *       "wifusd",
                     *       "xrpgusd",
                     *       "xrpgusdperp",
                     *       "xrpusd",
                     *       "xtzgusd",
                     *       "xtzusd",
                     *       "yfigusd",
                     *       "yfiusd",
                     *       "zecgusd",
                     *       "zecusd",
                     *       "zrxgusd",
                     *       "zrxusd"
                     *     ]
                     */
                    "application/json": string[];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getSymbolDetails: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description Trading pair symbol <br /> <br />
                 *
                 *     `BTCUSD`, etc. See [<u>**symbols and minimums**</u>](/market-data/symbols-and-minimums#all-supported-symbols).
                 */
                symbol: components["parameters"]["symbolParam"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Instrument responses examples */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SymbolDetails"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getAssetsForNetwork: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /**
                 * @description Blockchain network identifier (lowercase). Supported networks include: `ethereum`, `solana`, `bitcoin`, `optimism`, `arbitrum`, `base`, `monad`, `avalanche`, `litecoin`, `bitcoincash`, `dogecoin`, `zcash`, `filecoin`, `tezos`, `polkadot`, `cosmos`, `xrpl`, `linea`, and more.
                 * @example ethereum
                 */
                network: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The response will be a JSON object containing the network name and its supported assets. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NetworkAssets"];
                };
            };
            /** @description The supplied network is not supported or has no enabled assets. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        errorMessage?: string;
                    };
                };
            };
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getTokenNetworkV2: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /**
                 * @description Token identifier. `BTC`, `ETH`, `USDC`, `SOL` etc. See [<u>**symbols and minimums**</u>](/market-data/symbols-and-minimums)
                 * @example USDC
                 */
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The response will be a JSON object containing the token and its available networks for the authenticated account. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NetworkToken"];
                };
            };
            400: components["responses"]["BadRequest"];
            /** @description Returned when the token is not supported or the account has no available networks for the requested token. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example error */
                        result?: string;
                        /** @example UnsupportedNetwork */
                        reason?: string;
                        /** @example UnsupportedNetwork: INVALIDTOKEN */
                        message?: string;
                    };
                };
            };
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getTicker: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description Trading pair symbol <br /> <br />
                 *
                 *     `BTCUSD`, etc. See [<u>**symbols and minimums**</u>](/market-data/symbols-and-minimums#all-supported-symbols).
                 */
                symbol: components["parameters"]["symbolParam"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The current ticker for the symbol */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "bid": "977.59",
                     *       "ask": "977.35",
                     *       "last": "977.65",
                     *       "volume": {
                     *         "BTC": "2210.505328803",
                     *         "USD": "2135477.463379586263",
                     *         "timestamp": 1483018200000
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["Ticker"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listFeePromos: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The response will be a JSON object */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "symbols": [
                     *         "PNUTGUSDPERP",
                     *         "WIFGUSDPERP",
                     *         "PYTHGUSDPERP",
                     *         "MEWGUSDPERP",
                     *         "BONKGUSDPERP",
                     *         "BCHGUSDPERP",
                     *         "BTCGUSDPERP",
                     *         "BUSDUSD",
                     *         "POLGUSDPERP",
                     *         "FRAXUSD",
                     *         "OPGUSDPERP",
                     *         "DOTGUSDPERP",
                     *         "TRUMPGUSDPERP",
                     *         "GUSDGBP",
                     *         "USDTUSD",
                     *         "POPCATGUSDPERP",
                     *         "FLOKIGUSDPERP",
                     *         "MOODENGGUSDPERP",
                     *         "LINKGUSDPERP",
                     *         "ETHGUSDPERP",
                     *         "UNIGUSDPERP",
                     *         "MATICGUSDPERP",
                     *         "USDTGUSD",
                     *         "BNBGUSDPERP",
                     *         "MIMUSD",
                     *         "KSL2GUSDPERP",
                     *         "LUSDUSD",
                     *         "SHIBGUSDPERP",
                     *         "AVAXGUSDPERP",
                     *         "BOMEGUSDPERP",
                     *         "USDCUSD",
                     *         "HYPEGUSDPERP",
                     *         "MOGGUSDPERP",
                     *         "KT5GUSDPERP",
                     *         "SOLGUSDPERP",
                     *         "PEPEGUSDPERP",
                     *         "DOGEGUSDPERP",
                     *         "GUSDSGD",
                     *         "INJGUSDPERP",
                     *         "LTCGUSDPERP",
                     *         "XRPGUSDPERP",
                     *         "USTUSD",
                     *         "GOATGUSDPERP",
                     *         "DAIUSD"
                     *       ]
                     *     }
                     */
                    "application/json": components["schemas"]["FeePromos"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getCurrentOrderBook: {
        parameters: {
            query?: {
                /** @description Limit the number of bid (offers to buy) price levels returned. Default is 50. May be 0 to return the full order book on this side. */
                limit_bids?: number;
                /** @description Limit the number of ask (offers to sell) price levels returned. Default is 50. May be 0 to return the full order book on this side. */
                limit_asks?: number;
            };
            header?: never;
            path: {
                /**
                 * @description Trading pair symbol <br /> <br />
                 *
                 *     `BTCUSD`, etc. See [<u>**symbols and minimums**</u>](/market-data/symbols-and-minimums#all-supported-symbols).
                 */
                symbol: components["parameters"]["symbolParam"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The response will be two arrays. The bids and the asks are grouped by price, so each entry may represent multiple orders at that price. Each element of the array will be a JSON object. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "bids": [
                     *         {
                     *           "price": "3607.85",
                     *           "amount": "6.643373",
                     *           "timestamp": "1547147541"
                     *         }
                     *       ],
                     *       "asks": [
                     *         {
                     *           "price": "3607.86",
                     *           "amount": "14.68205084",
                     *           "timestamp": "1547147541"
                     *         }
                     *       ]
                     *     }
                     */
                    "application/json": components["schemas"]["OrderBook"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listTrades: {
        parameters: {
            query?: {
                /** @description Only return trades after this timestamp. See [<u>**Timestamps**</u>](/rest/~schemas#timestamp-type) for more information. If not present, will show the most recent trades. For backwards compatibility, you may also use the alias `since`. With timestamp, there is a 90-day hard limit. */
                timestamp?: components["schemas"]["TimestampType"];
                /** @description Only retuns trades that executed after this tid. since_tid trumps timestamp parameter which has no effect if provided too. You may set since_tid to zero to get the earliest available trade history data. */
                since_tid?: number;
                /** @description The maximum number of trades to return. The default is 50. */
                limit_trades?: number;
                /** @description Whether to display broken trades. False by default. Can be `1` or `true` to activate */
                include_breaks?: boolean;
            };
            header?: never;
            path: {
                /**
                 * @description Trading pair symbol <br /> <br />
                 *
                 *     `BTCUSD`, etc. See [<u>**symbols and minimums**</u>](/market-data/symbols-and-minimums#all-supported-symbols).
                 */
                symbol: components["parameters"]["symbolParam"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The response will be an array of JSON objects, sorted by timestamp, with the newest trade shown first. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "timestamp": 1547146811,
                     *       "timestampms": 1547146811357,
                     *       "tid": 5335307668,
                     *       "price": "3610.85",
                     *       "amount": "0.27413495",
                     *       "exchange": "gemini",
                     *       "type": "buy",
                     *       "broken": true
                     *     }
                     */
                    "application/json": components["schemas"]["Trade"][];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listPrices: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response is a list of objects, one for each pair. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "pair": "BTCUSD",
                     *         "price": "9500.00",
                     *         "percentChange24h": "5.23"
                     *       },
                     *       {
                     *         "pair": "ETHUSD",
                     *         "price": "257.54",
                     *         "percentChange24h": "4.85"
                     *       },
                     *       {
                     *         "pair": "BCHUSD",
                     *         "price": "450.10",
                     *         "percentChange24h": "-2.91"
                     *       },
                     *       {
                     *         "pair": "LTCUSD",
                     *         "price": "79.50",
                     *         "percentChange24h": "7.63"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["PriceFeedResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getFundingAmount: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description Trading pair symbol <br /> <br />
                 *
                 *     `BTCGUSDPERP`, etc. See [<u>**symbols and minimums**</u>](/market-data/symbols-and-minimums#all-supported-symbols).
                 * @example BTCGUSDPERP
                 */
                symbol: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The response will be an object */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "symbol": "BTCGUSDPERP",
                     *       "fundingDateTime": "2025-04-22T18:00:00.000Z",
                     *       "fundingTimestampMilliSecs": 1745344800000,
                     *       "nextFundingTimestamp": 1745348400000,
                     *       "fundingAmount": -1.50991,
                     *       "estimatedFundingAmount": -2.10595
                     *     }
                     */
                    "application/json": components["schemas"]["FundingAmountResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getFundingAmountReportFile: {
        parameters: {
            query: {
                /**
                 * @description Trading pair symbol <br /> <br />
                 *
                 *     `BTCGUSDPERP`, etc. See [<u>**symbols and minimums**</u>](/market-data/symbols-and-minimums#all-supported-symbols).
                 */
                symbol: string;
                /** @description Mandatory if `toDate` is specified, else optional. If empty, will only fetch records by numRows value. */
                fromDate?: string;
                /** @description Mandatory if `fromDate` is specified, else optional. If empty, will only fetch records by numRows value. */
                toDate?: string;
                /** @description If empty, default value '8760' */
                numRows?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The response will be an excel / csv file. filename=FundingAmount_{SYMBOL}.{xlsx,csv} */
            200: {
                headers: {
                    "Content-Disposition"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": string;
                    "text/csv": string;
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    createNewOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NewOrderRequest"];
            };
        };
        responses: {
            /** @description Response will be the fields included in Order Status */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LimitOrderResponse"] | components["schemas"]["StopLimitOrderResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    cancelOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelOrderRequest"];
            };
        };
        responses: {
            /** @description Response will be the fields included in Order Status. If the order was already canceled, then the request will have no effect and the status will be returned. Note the *is_cancelled* node will have a value of 'true' */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CancelOrderResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    cancelAllActiveOrders: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelAllOrdersRequest"];
            };
        };
        responses: {
            /** @description JSON response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "result": "ok",
                     *       "details": {
                     *         "cancelRejects": [],
                     *         "cancelledOrders": [
                     *           330429106,
                     *           330429079,
                     *           330429082
                     *         ]
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["CancelAllResult"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    cancelAllSessionOrders: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelAllOrdersBySessionRequest"];
            };
        };
        responses: {
            /** @description JSON response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "result": "ok",
                     *       "details": {
                     *         "cancelRejects": [
                     *           330429345
                     *         ],
                     *         "cancelledOrders": []
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["CancelAllResult"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getOrderStatus: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderStatusRequest"];
            };
        };
        responses: {
            /** @description The order status */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listActiveOrders: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description The API endpoint path
                     * @example /v1/orders
                     */
                    request: string;
                    /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
                    nonce: components["schemas"]["TimestampType"];
                    /**
                     * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts.
                     * @example primary
                     */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description The active orders */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"][];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listPastOrders: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The API endpoint `/v1/orders/history` */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description The symbol to retrieve orders for */
                    symbol?: string;
                    /**
                     * @description The maximum number of orders to return. Default is 50, max is 500.
                     * @default 50
                     */
                    limit_orders?: number;
                    /**
                     * #/components/schemas/TimestampType
                     * @description In iso datetime with timezone format from that date you will get order history
                     */
                    timestamp?: components["schemas"]["TimestampType"];
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"][];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listPastTrades: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MyTradesRequest"];
            };
        };
        responses: {
            /** @description The past trades */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MyTrade"][];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getTradingVolume: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description The API endpoint path
                     * @example /v1/tradevolume
                     */
                    request: string;
                    /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
                    nonce: components["schemas"]["TimestampType"];
                    /**
                     * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts.
                     * @example primary
                     */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description The trade volume */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TradeVolume"][];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getAvailableBalances: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/balances",
                 *       "nonce": "<nonce>",
                 *       "account": "primary",
                 *       "showPendingBalances": false
                 *     }
                 */
                "application/json": {
                    /**
                     * @description The API endpoint path
                     * @example /v1/balances
                     */
                    request: string;
                    /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
                    nonce: components["schemas"]["TimestampType"];
                    /**
                     * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts.
                     * @example primary
                     */
                    account: string;
                    /**
                     * @description Whether to include pending balances such as in-flight crypto deposits or withdrawals in the balances response.
                     *
                     *     > **Note:** Setting this field to `true` will result in slower response times due to additional database lookups required to retrieve pending balance information.
                     * @default false
                     * @example false
                     */
                    showPendingBalances?: boolean;
                };
            };
        };
        responses: {
            /** @description The account balances */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Balance"][];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getNotionalTradingVolume: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description The API endpoint path
                     * @example /v1/notionalvolume
                     */
                    request: string;
                    /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
                    nonce: components["schemas"]["TimestampType"];
                    /**
                     * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts.
                     * @example primary
                     */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description The notional volume */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotionalVolume"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getMarginAccount: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/margin/account",
                 *       "nonce": "<nonce>"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/margin/account" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Margin account summary with risk statistics */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "marginAssetValue": {
                     *         "currency": "USD",
                     *         "value": "10000.00"
                     *       },
                     *       "availableCollateral": {
                     *         "currency": "USD",
                     *         "value": "8500.00"
                     *       },
                     *       "notionalValue": {
                     *         "currency": "USD",
                     *         "value": "15000.00"
                     *       },
                     *       "totalBorrowed": {
                     *         "currency": "USD",
                     *         "value": "5000.00"
                     *       },
                     *       "leverage": "1.5",
                     *       "buyingPower": {
                     *         "currency": "USD",
                     *         "value": "8500.00"
                     *       },
                     *       "sellingPower": {
                     *         "currency": "USD",
                     *         "value": "8500.00"
                     *       },
                     *       "liquidationRisk": {
                     *         "lossPercentage": "0.1550",
                     *         "liquidationPrice": {
                     *           "currency": "USD",
                     *           "value": "50000.00"
                     *         }
                     *       },
                     *       "interestRate": {
                     *         "rate": "0.00001141552511",
                     *         "interval": "hour"
                     *       },
                     *       "reservedBuyOrders": {
                     *         "currency": "USD",
                     *         "value": "1000.00"
                     *       },
                     *       "reservedSellOrders": {
                     *         "currency": "USD",
                     *         "value": "500.00"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["MarginAccountSummary"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getMarginRates: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/margin/rates",
                 *       "nonce": "<nonce>"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/margin/rates" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Current margin interest rates for all borrowable assets */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "rates": [
                     *         {
                     *           "currency": "BTC",
                     *           "borrowRate": "0.00001141552511",
                     *           "borrowRateDaily": "0.00027397260264",
                     *           "borrowRateAnnual": "0.1",
                     *           "lastUpdated": 1700000000000
                     *         },
                     *         {
                     *           "currency": "ETH",
                     *           "borrowRate": "0.00001141552511",
                     *           "borrowRateDaily": "0.00027397260264",
                     *           "borrowRateAnnual": "0.1",
                     *           "lastUpdated": 1700000000000
                     *         },
                     *         {
                     *           "currency": "USD",
                     *           "borrowRate": "0.00000913242009",
                     *           "borrowRateDaily": "0.00021917808216",
                     *           "borrowRateAnnual": "0.08",
                     *           "lastUpdated": 1700000000000
                     *         }
                     *       ]
                     *     }
                     */
                    "application/json": components["schemas"]["MarginRatesResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    previewMarginOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/margin/order/preview" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /**
                     * @description The trading pair symbol (e.g., "btcusd")
                     * @example btcusd
                     */
                    symbol: string;
                    /**
                     * @description The order side
                     * @example buy
                     * @enum {string}
                     */
                    side: "buy" | "sell";
                    /**
                     * @description The order type
                     * @example limit
                     * @enum {string}
                     */
                    type: "market" | "limit";
                    /**
                     * Format: decimal
                     * @description The order amount in base currency (required for limit orders and sell market orders)
                     * @example 0.5
                     */
                    amount?: string;
                    /**
                     * Format: decimal
                     * @description The limit price (required for limit orders)
                     * @example 50000.00
                     */
                    price?: string;
                    /**
                     * Format: decimal
                     * @description Total spend in quote currency (required for buy market orders)
                     * @example 25000.00
                     */
                    totalSpend?: string;
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Pre-order and post-order margin risk statistics */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "preorder": {
                     *         "marginAssetValue": {
                     *           "currency": "USD",
                     *           "value": "10000.00"
                     *         },
                     *         "availableCollateral": {
                     *           "currency": "USD",
                     *           "value": "8500.00"
                     *         },
                     *         "notionalValue": {
                     *           "currency": "USD",
                     *           "value": "15000.00"
                     *         },
                     *         "totalBorrowed": {
                     *           "currency": "USD",
                     *           "value": "5000.00"
                     *         },
                     *         "leverage": "1.5",
                     *         "reservedBuyOrders": {
                     *           "currency": "USD",
                     *           "value": "0.00"
                     *         },
                     *         "reservedSellOrders": {
                     *           "currency": "USD",
                     *           "value": "0.00"
                     *         },
                     *         "buyingPower": {
                     *           "currency": "USD",
                     *           "value": "8500.00"
                     *         },
                     *         "sellingPower": {
                     *           "currency": "USD",
                     *           "value": "8500.00"
                     *         }
                     *       },
                     *       "postorder": {
                     *         "marginAssetValue": {
                     *           "currency": "USD",
                     *           "value": "10000.00"
                     *         },
                     *         "availableCollateral": {
                     *           "currency": "USD",
                     *           "value": "6000.00"
                     *         },
                     *         "notionalValue": {
                     *           "currency": "USD",
                     *           "value": "40000.00"
                     *         },
                     *         "totalBorrowed": {
                     *           "currency": "USD",
                     *           "value": "30000.00"
                     *         },
                     *         "leverage": "4.0",
                     *         "reservedBuyOrders": {
                     *           "currency": "USD",
                     *           "value": "0.00"
                     *         },
                     *         "reservedSellOrders": {
                     *           "currency": "USD",
                     *           "value": "0.00"
                     *         },
                     *         "buyingPower": {
                     *           "currency": "USD",
                     *           "value": "6000.00"
                     *         },
                     *         "sellingPower": {
                     *           "currency": "USD",
                     *           "value": "6000.00"
                     *         },
                     *         "liquidationRisk": {
                     *           "lossPercentage": "0.6000",
                     *           "liquidationPrice": {
                     *             "currency": "USD",
                     *             "value": "30000.00"
                     *           }
                     *         }
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["MarginOrderPreview"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    sendHeartbeat: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/heartbeat",
                 *       "nonce": "<nonce>"
                 *     }
                 */
                "application/json": components["schemas"]["Heartbeat"];
            };
        };
        responses: {
            /** @description The heartbeat was received successfully */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "result": "ok"
                     *     }
                     */
                    "application/json": {
                        /**
                         * @description ok
                         * @example ok
                         */
                        result?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    wrapOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /**
                 * @description Trading pair symbol <br /> <br />
                 *
                 *     `BTCUSD`, etc. See [<u>**symbols and minimums**</u>](/market-data/symbols-and-minimums#all-supported-symbols).
                 */
                symbol: components["parameters"]["symbolParam"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/wrap/GUSDUSD",
                 *       "nonce": "<nonce>",
                 *       "amount": "1",
                 *       "side": "buy",
                 *       "client_order_id": "4ac6f45f-baf1-40f8-83c5-001e3ea73c7f"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/wrap/symbol" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description The amount to wrap */
                    amount: string;
                    /**
                     * @description "buy" or "sell"
                     * @enum {string}
                     */
                    side?: "buy" | "sell";
                    /** @description A client-specified order id */
                    client_order_id?: string;
                    /** @description Required for Master API keys. The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "orderId": 429135395,
                     *       "pair": "GUSDUSD",
                     *       "price": "1",
                     *       "priceCurrency": "USD",
                     *       "side": "buy",
                     *       "quantity": "1",
                     *       "quantityCurrency": "GUSD",
                     *       "totalSpend": "1",
                     *       "totalSpendCurrency": "USD",
                     *       "fee": "0",
                     *       "feeCurrency": "USD",
                     *       "depositFee": "0",
                     *       "depositFeeCurrency": "USD"
                     *     }
                     */
                    "application/json": {
                        /** @description The order ID */
                        orderId?: string;
                        /** @description Trading pair symbol */
                        pair?: string;
                        /** @description The price of the order */
                        price?: string;
                        /** @description The currency in which the order is priced */
                        priceCurrency?: string;
                        /** @description Either "buy" or "sell" */
                        side?: string;
                        /** @description The amount that was executed */
                        quantity?: string;
                        /** @description The currency label for the quantity field */
                        quantityCurrency?: string;
                        /** @description Total quantity spent for the order */
                        totalSpend?: string;
                        /** @description Currency of the totalSpend */
                        totalSpendCurrency?: string;
                        /** @description The amount charged */
                        fee?: string;
                        /** @description Currency that the fee was paid in */
                        feeCurrency?: string;
                        /** @description The deposit fee quantity */
                        depositFee?: string;
                        /** @description Currency in which depositFee is taken */
                        depositFeeCurrency?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getNotionalBalances: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /** @description Either a fiat currency, e.g. `usd` or `gbp`, or a supported crypto-currency, e.g. `gusd`, `btc`, `eth`, `aave`, etc. */
                currency: components["parameters"]["currencyParam"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/notionalbalances/currency" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Required for Master API keys. The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "currency": "BTC",
                     *         "amount": "1154.62034001",
                     *         "amountNotional": "10386000.59",
                     *         "available": "1129.10517279",
                     *         "availableNotional": "10161000.71",
                     *         "availableForWithdrawal": "1129.10517279",
                     *         "availableForWithdrawalNotional": "10161000.71"
                     *       },
                     *       {
                     *         "currency": "USD",
                     *         "amount": "18722.79",
                     *         "amountNotional": "18722.79",
                     *         "available": "14481.62",
                     *         "availableNotional": "14481.62",
                     *         "availableForWithdrawal": "14481.62",
                     *         "availableForWithdrawalNotional": "14481.62"
                     *       },
                     *       {
                     *         "currency": "ETH",
                     *         "amount": "20124.50369697",
                     *         "amountNotional": "100621.31",
                     *         "available": "20124.50369697",
                     *         "availableNotional": "100621.31",
                     *         "availableForWithdrawal": "20124.50369697",
                     *         "availableForWithdrawalNotional": "100621.31"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["NotionalBalance"][];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listDepositAddresses: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /** @description Can be `bitcoin`, `ethereum`, `bitcoincash`, `litecoin`, `zcash`, `filecoin`, `dogecoin`, `tezos`, `solana`, `polkadot`, `avalanche`, `cosmos`, or `xrpl` */
                network: components["parameters"]["networkParam"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/addresses/network" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Only returns addresses created on or after this timestamp */
                    timestamp?: components["schemas"]["TimestampType"];
                    /** @description Required for Master API keys. The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Address"][];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    createNewDepositAddress: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /** @description Can be `bitcoin`, `ethereum`, `bitcoincash`, `litecoin`, `zcash`, `filecoin`, `dogecoin`, `tezos`, `solana`, `polkadot`, `avalanche`, `cosmos`, or `xrpl` */
                network: components["parameters"]["networkParam"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/deposit/network/newAddress" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description A label for the address */
                    label?: string;
                    /** @description Whether to generate a legacy P2SH-P2PKH litecoin address. False by default. */
                    legacy?: boolean;
                    /** @description Required for Master API keys. The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Address"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listPastTransfers: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v2/transfers" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Currency code, see symbols and minimums */
                    currency?: string;
                    /** @description Filter transfers by blockchain network (e.g., `ethereum`, `solana`, `arbitrum`, `optimism`, `base`, `avalanche`) */
                    network?: string;
                    /** @description Only return transfers after this timestamp */
                    timestamp?: components["schemas"]["TimestampType"];
                    /** @description The maximum number of transfers to return. The default is 10 and the maximum is 50. */
                    limit_transfers?: number;
                    /** @description Required for Master API keys. The name of the account within the subaccount group. */
                    account?: string;
                    /** @description Whether to display completed deposit advances. True by default. */
                    show_completed_deposit_advances?: boolean;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["V2Transfer"][];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listCustodyFeeTransfers: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/custodyaccountfees" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Only return Custody fee records on or after this timestamp */
                    timestamp?: components["schemas"]["TimestampType"];
                    /** @description The maximum number of Custody fee records to return. The default is 10 and the maximum is 50. */
                    limit_transfers?: number;
                    /** @description Required for Master API keys. The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Time of Custody fee record in milliseconds */
                        txTime?: number;
                        /** @description The fee amount charged */
                        feeAmount?: string;
                        /** @description Currency that the fee was paid in */
                        feeCurrency?: string;
                        /** @description Custody fee event id */
                        eid?: number;
                        /** @description Custody fee event type */
                        eventType?: string;
                    }[];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getGasFeeEstimation: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /**
                 * @description The blockchain network for the withdrawal (e.g. `ethereum`, `bitcoin`, `solana`)
                 * @example ethereum
                 */
                network: string;
                /**
                 * @description The currency code for the withdrawal (e.g. `eth`, `btc`, `sol`, `usdc`)
                 * @example eth
                 */
                ticker: string;
            };
            cookie?: never;
        };
        /** @description Sample payload for ETH fee estimation on Ethereum network */
        requestBody: {
            content: {
                "application/json": components["schemas"]["FeeEstimateV2Request"];
            };
        };
        responses: {
            /** @description Successful fee estimation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeeEstimateV2Response"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    withdrawCryptoFunds: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /** @description Can be `bitcoin`, `ethereum`, `bitcoincash`, `litecoin`, `zcash`, `filecoin`, `dogecoin`, `tezos`, `solana`, `polkadot`, `avalanche`, `cosmos`, or `xrpl` */
                network: components["parameters"]["networkParam"];
                /**
                 * @description The cryptocurrency ticker code (e.g., `btc`, `eth`, `usdc`). See [Symbols and minimums](/market-data/symbols-and-minimums).
                 * @example eth
                 */
                ticker: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The destination address for the withdrawal */
                    address: string;
                    /** @description The amount to withdraw */
                    amount: string;
                    /** @description Required for certain networks that use memos (e.g., Solana, XRP, Cosmos). The destination tag or memo for the withdrawal. */
                    memo?: string;
                    /**
                     * Format: uuid
                     * @description A unique UUID for idempotent withdrawals. If provided, duplicate requests with the same `clientTransferId` will not create additional withdrawals.
                     */
                    clientTransferId?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description A unique ID for the withdrawal */
                        withdrawalId?: string;
                        /** @description Standard string format of the withdrawal destination address */
                        address?: string;
                        /** @description The withdrawal amount */
                        amount?: string;
                        /** @description The currency code of the withdrawn asset */
                        currency?: string;
                        /** @description The fee charged for the withdrawal */
                        fee?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    createNewClearingOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/clearing/new" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description The trading pair */
                    symbol: string;
                    /** @description The amount to trade */
                    amount: string;
                    /** @description The price */
                    price: string;
                    /**
                     * @description The direction of the trade
                     * @enum {string}
                     */
                    side: "buy" | "sell";
                    /** @description The counterparty ID */
                    counterparty_id?: string;
                    /** @description The number of hours until the order expires */
                    expires_in_hrs?: number;
                    /** @description Required for Master API keys. The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "result": "AwaitConfirm",
                     *       "clearing_id": "0OQGOZXW"
                     *     }
                     */
                    "application/json": components["schemas"]["ClearingOrder"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getClearingOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/clearing/status" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description The clearing ID */
                    clearing_id: string;
                    /** @description Required for Master API keys. The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "result": "ok",
                     *       "status": "Confirmed"
                     *     }
                     */
                    "application/json": components["schemas"]["ClearingOrder"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    cancelClearingOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/clearing/cancel" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description The clearing ID */
                    clearing_id: string;
                    /** @description Required for Master API keys. The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Status of the cancel operation */
                        result?: string;
                        /** @description Detailed description of the result */
                        details?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    confirmClearingOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/clearing/confirm" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description The clearing ID */
                    clearing_id: string;
                    /** @description The trading pair */
                    symbol: string;
                    /** @description The amount to trade */
                    amount: string;
                    /** @description The price */
                    price: string;
                    /**
                     * @description The direction of the trade
                     * @enum {string}
                     */
                    side: "buy" | "sell";
                    /** @description Required for Master API keys. The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Status of the confirmation operation */
                        result?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listClearingOrders: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/clearing/list" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Trading pair */
                    symbol?: string;
                    /** @description counterparty_id or counterparty_alias */
                    counterparty?: string;
                    /**
                     * @description "buy" or "sell"
                     * @enum {string}
                     */
                    side?: "buy" | "sell";
                    /** @description UTC timestamp. Requires `expiration_end` if set */
                    expiration_start?: components["schemas"]["TimestampType"];
                    /** @description UTC timestamp. Requires `expiration_start` if set */
                    expiration_end?: components["schemas"]["TimestampType"];
                    /** @description UTC timestamp. Requires `submission_end` if set */
                    submission_start?: components["schemas"]["TimestampType"];
                    /** @description UTC timestamp. Requires `submission_start` if set */
                    submission_end?: components["schemas"]["TimestampType"];
                    /** @description Default value false if not set */
                    funded?: boolean;
                    /** @description Filter by status */
                    status?: string;
                    /** @description Only return orders after this timestamp */
                    timestamp?: components["schemas"]["TimestampType"];
                    /** @description The maximum number of orders to return */
                    limit_orders?: number;
                    /** @description Required for Master API keys. The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Status of the operation */
                        result?: string;
                        orders?: {
                            /** @description A unique identifier for the clearing order */
                            clearing_id?: string;
                            /** @description Only provided if order was submitted with it */
                            order_id?: string;
                            /** @description A symbol that corresponds with a counterparty */
                            counterparty_id?: string;
                            /** @description Counterparty alias */
                            counterparty_alias?: string;
                            /** @description A symbol that corresponds with a broker id */
                            broker_id?: string;
                            /** @description Trading pair */
                            symbol?: string;
                            /**
                             * @description "buy" or "sell"
                             * @enum {string}
                             */
                            side?: "buy" | "sell";
                            /**
                             * Format: decimal
                             * @description The price the clearing order was executed at
                             */
                            price?: number;
                            /**
                             * Format: decimal
                             * @description The amount that was executed
                             */
                            quantity?: number;
                            /** @description A description of the status of the order */
                            status?: string;
                            /** @description UTC timestamp */
                            submission?: components["schemas"]["TimestampType"];
                            /** @description UTC timestamp */
                            expiration?: components["schemas"]["TimestampType"];
                        }[];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listClearingBrokers: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/clearing/broker/list" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Trading pair */
                    symbol?: string;
                    /** @description UTC timestamp. Requires `expiration_end` if set */
                    expiration_start?: components["schemas"]["TimestampType"];
                    /** @description UTC timestamp. Requires `expiration_start` if set */
                    expiration_end?: components["schemas"]["TimestampType"];
                    /** @description UTC timestamp. Requires `submission_end` if set */
                    submission_start?: components["schemas"]["TimestampType"];
                    /** @description UTC timestamp. Requires `submission_start` if set */
                    submission_end?: components["schemas"]["TimestampType"];
                    /** @description Default value false if not set */
                    funded?: boolean;
                    /** @description Filter by status */
                    status?: string;
                    /** @description Only return orders after this timestamp */
                    timestamp?: components["schemas"]["TimestampType"];
                    /** @description The maximum number of orders to return */
                    limit_orders?: number;
                    /** @description Required for Master API keys. The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Status of the operation */
                        result?: string;
                        orders?: {
                            /** @description A unique identifier for the clearing order */
                            clearing_id?: string;
                            /** @description Source counterparty id */
                            source_counterparty_id?: string;
                            /** @description Only provided if order was submitted with it */
                            source_order_id?: string;
                            /** @description Only provided if target counterparty was already set */
                            target_counterparty_id?: string;
                            /** @description Only provided if target counterparty set this field */
                            target_order_id?: string;
                            /** @description Trading pair */
                            symbol?: string;
                            /**
                             * @description "buy" or "sell"
                             * @enum {string}
                             */
                            source_side?: "buy" | "sell";
                            /**
                             * Format: decimal
                             * @description The price the clearing order was executed at
                             */
                            price?: number;
                            /**
                             * Format: decimal
                             * @description The amount that was executed
                             */
                            quantity?: number;
                            /** @description A description of the status of the order */
                            status?: string;
                            /** @description UTC timestamp */
                            submission?: number;
                            /** @description UTC timestamp */
                            expiration?: number;
                        }[];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    createNewBrokerOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/clearing/broker/new" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description A symbol that corresponds with the counterparty sourcing the clearing trade */
                    source_counterparty_id: string;
                    /** @description A symbol that corresponds with the counterparty where the clearing trade is targeted */
                    target_counterparty_id: string;
                    /** @description The [symbol](/market-data/symbols-and-minimums) of the order */
                    symbol: string;
                    /**
                     * Format: decimal
                     * @description Quoted decimal amount to purchase
                     */
                    amount: string;
                    /**
                     * Format: float
                     * @description The number of hours before the trade expires. Your counterparty will need to confirm the order before this time expires.
                     */
                    expires_in_hrs: number;
                    /**
                     * Format: decimal
                     * @description Quoted decimal amount to spend per unit
                     */
                    price: string;
                    /**
                     * @description "buy" or "sell". This side will be assigned to the `source_counterparty_id`. The opposite side will be sent to the `target_counterparty_id`
                     * @enum {string}
                     */
                    side: "buy" | "sell";
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the broker account on which to place the order. Only available for exchange accounts. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "result": "AwaitSourceTargetConfirm",
                     *       "clearing_id": "8EM7NVXD"
                     *     }
                     */
                    "application/json": {
                        /** @description Will return `AwaitSourceTargetConfirm`, meaning the order is waiting for both the source and the target parties to confirm the order */
                        result?: string;
                        /** @description A unique identifier for the clearing order. */
                        clearing_id?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listClearingTrades: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/clearing/trades" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Only return transfers on or after this timestamp in nanos */
                    timestamp_nanos?: number;
                    /** @description The maximum number of clearing trades to return. The default is 100 and the maximum is 300. */
                    limit_per_account?: number;
                    /** @description Only required when using a master api-key. The name of the account within the subaccount group. */
                    account?: string;
                    /** @description The trading pair */
                    symbol?: string;
                    /** @description Only return trades after this timestamp */
                    timestamp?: components["schemas"]["TimestampType"];
                    /** @description The maximum number of trades to return */
                    limit_trades?: number;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        results?: {
                            /** @description A account that corresponds with the counterparty sourcing the clearing trade */
                            sourceAccount?: string;
                            /** @description A account that corresponds with the counterparty where the clearing trade is targeted */
                            targetAccount?: string;
                            /** @description The trading pair of the clearing trade */
                            pair?: string;
                            /**
                             * @description "buy" or "sell"
                             * @enum {string}
                             */
                            sourceSide?: "buy" | "sell";
                            /** @description The price the clearing order was executed at */
                            price?: string;
                            /** @description The amount that was executed */
                            quantity?: string;
                            /** @description The clearing ID */
                            clearingId?: string;
                            /** @description A description of the status of the order */
                            status?: string;
                            /** @description The time that the clearing trade expires */
                            expirationTimeMs?: components["schemas"]["TimestampType"];
                            /** @description The time that the clearing trade was created */
                            createdMs?: components["schemas"]["TimestampType"];
                            /** @description The last time the clearing trade was updated */
                            lastUpdatedMs?: components["schemas"]["TimestampType"];
                            /** @description Broker trade */
                            hasBroker?: boolean;
                            /** @description Broker was notified */
                            wasNotified?: boolean;
                        }[];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getInstantQuote: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/instant/quote/" */
                    request: string;
                    /**
                     * @description "buy" or "sell"
                     * @enum {string}
                     */
                    side: "buy" | "sell";
                    /** @description The [symbol](/market-data/symbols-and-minimums) for the order. Instant includes order books denominated in a [supported currency](https://support.gemini.com/hc/en-us/articles/360000032663-Does-Gemini-support-fiat-currencies-other-than-USD), as `CCY2` */
                    symbol: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Quoted decimal amount to spend on the order. Must comply with [stated minimums](/market-data/symbols-and-minimums). The `totalSpend` will be `CCY2` in `buy` orders and `CCY1` in `sell` orders. */
                    totalSpend: string;
                    /** @description uuid provided as `bankId` in [Payment Methods API](/fund-management#list-payment-methods) */
                    paymentMethodUuid?: string;
                    /** @description Method used to specify payment method in `buy` order. Can be "AccountBalancePaymentType" to use funds available in USD balance held on Gemini, "BankAccountType" to initial an ACH from a linked bank account, or "CardAccountType" to use a linked debit card to fund the purchase. */
                    paymentMethodType?: string;
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Sample Responses */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InstantQuote"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    executeInstantOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/instant/execute" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description The symbol for the order. */
                    symbol: string;
                    /**
                     * @description "buy" or "sell"
                     * @enum {string}
                     */
                    side: "buy" | "sell";
                    /** @description The quantity of the asset bought or sold. quantity must match quantity returned in the quote */
                    quantity: string;
                    /** @description The price from the quote. price must match price returned in the quote */
                    price: string;
                    /** @description The fee for the order. fee must match fee returned in the quote */
                    fee: string;
                    /** @description Unique ID for the quote. quoteId must match quoteId returned in the quote */
                    quoteId: number;
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description JSON response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description The ID for the executed order */
                        orderId?: number;
                        /** @description The symbol for the order. */
                        pair?: string;
                        /** @description The price at which the order was executed */
                        price?: string;
                        /** @description The currency in which the order is priced. Matches `CCY2` in the symbol */
                        priceCurrency?: string;
                        /** @description Either "buy" or "sell" */
                        side?: string;
                        /** @description The quantity of the asset bought or sold */
                        quantity?: string;
                        /** @description The currency label for the `quantity` field. */
                        quantityCurrency?: string;
                        /** @description Total quantity to spend for the order. Will be the sum inclusive of all fees and amount to be traded. */
                        totalSpend?: string;
                        /** @description Currency of the `totalSpend` to be spent on the order */
                        totalSpendCurrency?: string;
                        /** @description The fee quantity charged for the order */
                        fee?: string;
                        /** @description The currency label for the fee. */
                        feeCurrency?: string;
                        /** @description The deposit fee quantity. Will be applied if a debit card is used for the order. Will return 0 if there is no `depositFee` */
                        depositFee?: string;
                        /** @description Currency in which `depositFee` is taken */
                        depositFeeCurrency?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    addBank: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/payments/addbank",
                 *       "nonce": "<nonce>",
                 *       "accountnumber": "account-number-string",
                 *       "routing": "routing-number-string",
                 *       "type": "checking",
                 *       "name": "Satoshi Nakamoto Checking"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/payments/addbank" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Account number of bank account to be added */
                    accountnumber: string;
                    /** @description Routing number of bank account to be added */
                    routing: string;
                    /**
                     * @description Type of bank account to be added. Accepts `checking` or `savings`
                     * @enum {string}
                     */
                    type: "checking" | "savings";
                    /** @description The name of the bank account as shown on your account statements */
                    name: string;
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Master API keys can get all account names using the [Get Accounts endpoint](/rest/account-administration#list-accounts-in-group). */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "referenceId": "BankAccountRefId(18428)"
                     *     }
                     */
                    "application/json": {
                        /** @description Reference ID for the new bank addition request. Once received, send in a wire from the requested bank account to verify it and enable withdrawals to that account. */
                        referenceId?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    addBankCAD: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/payments/addbank/cad",
                 *       "nonce": "<nonce>",
                 *       "swiftcode": "swift-code-string",
                 *       "accountnumber": "account-number-string",
                 *       "institutionnumber": "institution-number-string",
                 *       "branchnumber": "branch-number-string",
                 *       "type": "checking",
                 *       "name": "Satoshi Nakamoto Checking",
                 *       "account": "account-string"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/payments/addbank/cad" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description The account SWIFT code */
                    swiftcode: string;
                    /** @description Account number of bank account to be added */
                    accountNumber: string;
                    /** @description The institution number of the account - optional but recommended. */
                    institutionNumber?: string;
                    /** @description The branch number - optional but recommended. */
                    branchnnumber?: string;
                    /**
                     * @description Type of bank account to be added. Accepts `checking` or `savings`
                     * @enum {string}
                     */
                    type: "checking" | "savings";
                    /** @description The name of the bank account as shown on your account statements */
                    name: string;
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Master API keys can get all account names using the [Get Accounts endpoint](/rest/account-administration#list-accounts-in-group). */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "result": "OK"
                     *     }
                     */
                    "application/json": {
                        /** @description Status of the request. "OK" indicates the account has been created successfully. */
                        result?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listPaymentMethods: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/payments/methods",
                 *       "account": "primary",
                 *       "nonce": "<nonce>"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/payments/methods" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Master API keys can get all account names using the [Get Accounts endpoint](/rest/account-administration#list-accounts-in-group). */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "balances": [
                     *         {
                     *           "type": "exchange",
                     *           "currency": "USD",
                     *           "amount": "50893484.26",
                     *           "available": "50889972.01",
                     *           "availableForWithdrawal": "50889972.01"
                     *         }
                     *       ],
                     *       "banks": [
                     *         {
                     *           "bank": "Jpmorgan Chase Bank Checking  - 1111",
                     *           "bankId": "97631a24-ca40-4277-b3d5-38c37673d029"
                     *         }
                     *       ]
                     *     }
                     */
                    "application/json": {
                        /** @description Array of JSON objects with available fiat currencies and their balances. */
                        balances?: {
                            /** @description Account type. Will always be `exchange` */
                            type?: string;
                            /** @description Symbol for fiat balance. */
                            currency?: string;
                            /** @description Total account balance for currency. */
                            amount?: string;
                            /** @description Total amount available for trading */
                            available?: string;
                            /** @description Total amount available for withdrawal */
                            availableForWithdrawal?: string;
                        }[];
                        /** @description Array of JSON objects with banking information */
                        banks?: {
                            /** @description Name of bank account */
                            bank?: string;
                            /** @description Unique identifier for bank account */
                            bankId?: string;
                        }[];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getAccountDetail: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/account",
                 *       "account": "primary",
                 *       "nonce": "<nonce>"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/account" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Master API keys can get all account names using the [Get Accounts endpoint](/rest/account-administration#list-accounts-in-group). */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "account": {
                     *         "accountName": "Primary",
                     *         "shortName": "primary",
                     *         "type": "exchange",
                     *         "created": "1498245007981"
                     *       },
                     *       "users": [
                     *         {
                     *           "name": "Satoshi Nakamoto",
                     *           "lastSignIn": "2020-07-21T13:37:39.453Z",
                     *           "status": "Active",
                     *           "countryCode": "US",
                     *           "isVerified": true
                     *         },
                     *         {
                     *           "name": "Gemini Support",
                     *           "lastSignIn": "2018-07-11T20:04:36.073Z",
                     *           "status": "Suspended",
                     *           "countryCode": "US",
                     *           "isVerified": false
                     *         }
                     *       ],
                     *       "memo_reference_code": "GEMPJBRDZ",
                     *       "virtual_account_number": "123456"
                     *     }
                     */
                    "application/json": {
                        /** @description Contains information on the requested account */
                        account?: {
                            /** @description The name of the account provided upon creation. Will default to `Primary` */
                            accountName?: string;
                            /** @description Nickname of the specific account (will take the name given, remove all symbols, replace all " " with "-" and make letters lowercase) */
                            shortName?: string;
                            /** @description The type of account. Will return either `exchange` or `custody` */
                            type?: string;
                            /** @description The timestamp of account creation, displayed as number of milliseconds since 1970-01-01 UTC. This will be transmitted as a JSON number */
                            created?: components["schemas"]["TimestampType"];
                        };
                        /** @description Contains an array of JSON objects with user information for the requested account */
                        users?: {
                            /** @description Full legal name of the user */
                            name?: string;
                            /** @description Timestamp of the last sign for the user. Formatted as yyyy-MM-dd'T'HH:mm:ss.SSS'Z' */
                            lastSignIn?: string;
                            /** @description Returns user status. Will inform of `active` users or otherwise not active */
                            status?: string;
                            /** @description 2 Letter country code indicating residence of user */
                            countryCode?: string;
                            /** @description Returns verification status of user */
                            isVerified?: boolean;
                        }[];
                        /** @description Returns wire memo reference code for linked bank account */
                        memo_reference_code?: string;
                        /** @description Virtual account number for the account. Only populated if applicable for the account */
                        virtual_account_number?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listApprovedAddresses: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /** @description Can be `bitcoin`, `ethereum`, `bitcoincash`, `litecoin`, `zcash`, `filecoin`, `dogecoin`, `tezos`, `solana`, `polkadot`, `avalanche`, `cosmos`, or `xrpl` */
                network: components["parameters"]["networkParam"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/approvedAddresses/account/ethereum",
                 *       "nonce": "<nonce>",
                 *       "account": "primary"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/approvedAddresses/account/:network" where `:network` can be `bitcoin`, `ethereum`, `bitcoincash`, `litecoin`, `zcash`, `filecoin`, `dogecoin`, `tezos`, `solana`, `polkadot`, `avalanche`, `cosmos`, or `xrpl` */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to view the approved address list. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "approvedAddresses": [
                     *         {
                     *           "network": "ethereum",
                     *           "scope": "account",
                     *           "label": "api_added_ETH_address",
                     *           "status": "pending-time",
                     *           "createdAt": "1602692572349",
                     *           "address": "0x0000000000000000000000000000000000000000"
                     *         },
                     *         {
                     *           "network": "ethereum",
                     *           "scope": "group",
                     *           "label": "api_added_ETH_address",
                     *           "status": "pending-time",
                     *           "createdAt": "1602692542296",
                     *           "address": "0x0000000000000000000000000000000000000000"
                     *         },
                     *         {
                     *           "network": "ethereum",
                     *           "scope": "group",
                     *           "label": "hardware_wallet",
                     *           "status": "active",
                     *           "createdAt": "1602087433270",
                     *           "address": "0xA63123350Acc8F5ee1b1fBd1A6717135e82dBd28"
                     *         },
                     *         {
                     *           "network": "ethereum",
                     *           "scope": "account",
                     *           "label": "hardware_wallet",
                     *           "status": "active",
                     *           "createdAt": "1602086832986",
                     *           "address": "0xA63123350Acc8F5ee1b1fBd1A6717135e82dBd28"
                     *         }
                     *       ]
                     *     }
                     */
                    "application/json": {
                        /** @description Array of approved addresses on both the account and group level. */
                        approvedAddresses?: components["schemas"]["ApprovedAddress"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    createNewApprovedAddress: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /** @description Can be `bitcoin`, `ethereum`, `bitcoincash`, `litecoin`, `zcash`, `filecoin`, `dogecoin`, `tezos`, `solana`, `polkadot`, `avalanche`, `cosmos`, or `xrpl` */
                network: components["parameters"]["networkParam"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/approvedAddresses/ethereum/request",
                 *       "nonce": "<nonce>",
                 *       "address": "0x0000000000000000000000000000000000000000",
                 *       "label": "api_added_ETH_address",
                 *       "account": "primary"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/approvedAddresses/:network/request" where `:network` can be `bitcoin`, `ethereum`, `bitcoincash`, `litecoin`, `zcash`, `filecoin`, `dogecoin`, `tezos`, `solana`, `polkadot`, `avalanche`, `cosmos`, or `xrpl` */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description A string of the address to be added to the approved address list. */
                    address: string;
                    /** @description The label of the approved address. */
                    label: string;
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to add the approved address. */
                    account?: string;
                    /** @description it would be present if applicable, it will be present for cosmos address. */
                    memo?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "message": "Approved address addition is now waiting a 7-day approval hold before activation."
                     *     }
                     */
                    "application/json": {
                        /** @description Upon successful request, the endpoint will return a string indicating the 7-day approval hold period has begun. */
                        message?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    removeApprovedAddress: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /** @description Can be `bitcoin`, `ethereum`, `bitcoincash`, `litecoin`, `zcash`, `filecoin`, `dogecoin`, `tezos`, `solana`, `polkadot`, `avalanche`, `cosmos`, or `xrpl` */
                network: components["parameters"]["networkParam"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/approvedAddresses/ethereum/remove",
                 *       "nonce": "<nonce>",
                 *       "address": "0x0000000000000000000000000000000000000000"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/approvedAddresses/:network/remove" where `:network` can be `bitcoin`, `ethereum`, `bitcoincash`, `litecoin`, `zcash`, `filecoin`, `dogecoin`, `tezos`, `solana`, `polkadot`, `avalanche`, `cosmos`, or `xrpl` */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description A string of the address to be removed from the approved address list. */
                    address: string;
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to remove the approved address. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "message": "0x0000000000000000000000000000000000000000 removed from group pending-time approved addresses."
                     *     }
                     */
                    "application/json": {
                        /** @description Upon successful request, the endpoint will return a string indicating the address and whether it was removed from the group-level or account-level approved address list. */
                        message?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    createNewAccount: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/account/create" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description A unique name for the new account */
                    name: string;
                    /** @description Either `exchange` or `custody` is accepted. Will generate an exchange account if `exchange` or parameter is missing. Will generate a custody account if `custody`. */
                    type?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "account": "my-secondary-account",
                     *       "type": "exchange"
                     *     }
                     */
                    "application/json": {
                        /** @description Account reference string for use in APIs based off the provided `name` field */
                        account?: string;
                        /** @description Will return the type of account generated. `exchange` if an exchange account was created, `custody` if a custody account was created */
                        type?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    renameAccount: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/account/rename". */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Only required when using a master api-key. The shortname of the account within the subaccount group. Master API keys can get all account shortnames from the `account` field returned by the [Get Accounts endpoint](/rest/account-administration#list-accounts-in-group). */
                    account?: string;
                    /** @description A unique name for the new account. If not provided, name will not change. */
                    newName?: string;
                    /** @description A unique shortname for the new account. If not provided, shortname will not change. */
                    newAccount?: string;
                };
            };
        };
        responses: {
            /** @description An element containing the updated name of the account. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "name": "My Exchange Account New Name",
                     *       "account": "my-exchange-account-new-name"
                     *     }
                     */
                    "application/json": {
                        /** @description New name for the account based off the provided `newName` field. Only returned if `newName` was provided in the request. */
                        name?: string;
                        /** @description New shortname for the account based off the provided `newAccount` field. Only returned if `newAccount` was provided in the request. */
                        account?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listAccountsInGroup: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/account/list",
                 *       "nonce": "<nonce>",
                 *       "limit_accounts": 100,
                 *       "timestamp": 1632485834721
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/account/list" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description The maximum number of accounts to return. Maximum and default values are both 500. */
                    limit_accounts?: number;
                    /** @description Only return accounts created on or before the supplied timestamp. If not provided, the 500 most recently created accounts are returned. */
                    timestamp?: components["schemas"]["TimestampType"];
                };
            };
        };
        responses: {
            /** @description The response will be a JSON object containing all accounts within the master group */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "name": "Primary",
                     *         "account": "primary",
                     *         "type": "exchange",
                     *         "counterparty_id": "EMONNYXH",
                     *         "created": 1495127793000,
                     *         "status": "open"
                     *       },
                     *       {
                     *         "name": "My Custody Account",
                     *         "account": "my-custody-account",
                     *         "type": "custody",
                     *         "counterparty_id": null,
                     *         "created": 1565970772000,
                     *         "status": "open"
                     *       },
                     *       {
                     *         "name": "Other exchange account!",
                     *         "account": "other-exchange-account",
                     *         "type": "exchange",
                     *         "counterparty_id": "EMONNYXK",
                     *         "created": 1565970772000,
                     *         "status": "closed"
                     *       }
                     *     ]
                     */
                    "application/json": {
                        /** @description The name of the account provided upon creation */
                        name?: string;
                        /** @description Nickname of the specific account (will take the name given, remove all symbols, replace all " " with "-" and make letters lowercase) */
                        account?: string;
                        /** @description Either "exchange" or "custody" depending on type of account */
                        type?: string;
                        /** @description The Gemini clearing counterparty ID associated with the API key making the request. Will return `None` for custody accounts */
                        counterparty_id?: string;
                        /** @description The timestamp of account creation, displayed as number of milliseconds since 1970-01-01 UTC. This will be transmitted as a JSON number */
                        created?: components["schemas"]["TimestampType"];
                        /** @description Either "open" or "closed" */
                        status?: string;
                    }[];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    transferBetweenAccounts: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /** @description Either a fiat currency, e.g. `usd` or `gbp`, or a supported crypto-currency, e.g. `gusd`, `btc`, `eth`, `aave`, etc. */
                currency: components["parameters"]["currencyParam"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The string `/v1/account/transfer/:currency` where `:currency` is replaced with either `usd` or a supported crypto-currency, e.g. `gusd`, `btc`, `eth`, `aave`, etc. See [Symbols and minimums](/market-data/symbols-and-minimums). */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Nickname of the account you are transferring from. Use the [Get Accounts endpoint](/rest/account-administration#list-accounts-in-group) to get all account names in the group. */
                    sourceAccount: string;
                    /** @description Nickname of the account you are transferring to. Use the [Get Accounts endpoint](/rest/account-administration#list-accounts-in-group) to get all account names in the group. */
                    targetAccount: string;
                    /** @description Quoted decimal amount to withdraw */
                    amount: string;
                    /** @description A unique identifier for the internal transfer, in uuid4 format */
                    clientTransferId?: string;
                    /** @description Unique ID of the requested withdrawal. */
                    withdrawalId?: string;
                };
            };
        };
        responses: {
            /** @description JSON response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "fromAccount": "my-account",
                     *       "toAccount": "my-other-account",
                     *       "amount": "1",
                     *       "currency": "Bitcoin",
                     *       "uuid": "9c153d64-83ba-4532-a159-ebe3f6797766",
                     *       "message": "Success, transfer completed."
                     *     }
                     */
                    "application/json": {
                        /** @description Source account where funds are sent from */
                        fromAccount?: string;
                        /** @description Target account to receive funds in the internal transfer */
                        toAccount?: string;
                        /** @description Quantity of assets being transferred */
                        amount?: string;
                        /** @description Fee taken for the transfer. Exchange account to exchange account transfers will always be free and will not be deducted from the free monthly transfer amount for that account. */
                        fee?: string;
                        /** @description Display Name. Can be `Bitcoin`, `Ether`, `Zcash`, `Litecoin`, `Dollar`, etc. */
                        currency?: string;
                        /** @description _Excludes_ exchange to exchange. Unique ID of the requested withdrawal */
                        withdrawalId?: string;
                        /** @description _Only_ for exchange to exchange. Unique ID of the completed transfer */
                        uuid?: string;
                        /** @description Message describing result of withdrawal. Will inform of success, failure, or pending blockchain transaction. */
                        message?: string;
                        /** @description _Only for Ethereum network transfers. Excludes exchange to exchange transfers_. Transaction hash for ethereum network transfer. */
                        txHash?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getTransactionHistory: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/transactions",
                 *       "nonce": "<nonce>",
                 *       "timestamp_nanos": 1630382206000000000,
                 *       "limit": 50,
                 *       "continuation_token": "daccgrp_123421:n712621873886999872349872349:a71289723498273492374978424:m2:iForward"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/transactions" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Only return transfers on or after this timestamp in nanos. If this is defined, do not define “continuation_token”. */
                    timestamp_nanos?: components["schemas"]["TimestampType"];
                    /**
                     * @description The maximum number of transfers to return. The default is 100 and the maximum is 300.
                     * @default 100
                     */
                    limit?: number;
                    /** @description For subsequent requests, use the returned `continuation_token` value for next page. If this is defined, do not define “timestamp_nanos”. */
                    continuation_token?: string;
                };
            };
        };
        responses: {
            /** @description The response will be an array of JSON objects, sorted by trade and transfer as well as a continuationToken to be used in subsequent requests. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Results will contain either a list of Trade or Transfer responses */
                        results?: components["schemas"]["Transaction"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    revokeOAuthToken: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description The literal string "/v1/oauth/revokeByToken" */
                    request: string;
                };
            };
        };
        responses: {
            /** @description An object that indicates the access_token has been revoked. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description A message that indicates the token has been revoked for the account */
                        message?: string;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listStakingBalances: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/balances/staking",
                 *       "nonce": "<nonce>",
                 *       "account": "primary"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/balances/staking" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description The staking balances */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "type": "Staking",
                     *         "currency": "MATIC",
                     *         "balance": 10,
                     *         "available": 0,
                     *         "availableForWithdrawal": 10,
                     *         "balanceByProvider": {
                     *           "62b21e17-2534-4b9f-afcf-b7edb609dd8d": {
                     *             "balance": 10
                     *           }
                     *         }
                     *       },
                     *       {
                     *         "type": "Staking",
                     *         "currency": "ETH",
                     *         "balance": 3,
                     *         "available": 0,
                     *         "availableForWithdrawal": 3,
                     *         "balanceByProvider": {
                     *           "62b21e17-2534-4b9f-afcf-b7edb609dd8d": {
                     *             "balance": 3
                     *           }
                     *         }
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["StakingBalance"][];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    stakeCryptoFunds: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "v1/staking/stake",
                 *       "nonce": "<nonce>",
                 *       "providerId": "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
                 *       "currency": "MATIC",
                 *       "amount": 30
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "v1/staking/stake" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. */
                    account?: string;
                    /** @description Provider Id, in uuid4 format. providerId is accessible from the [Staking rates](#list-staking-rates) response */
                    providerId: string;
                    /** @description Currency code, see [symbols](/market-data/symbols-and-minimums) */
                    currency: string;
                    /**
                     * Format: decimal
                     * @description The amount of currency to deposit
                     */
                    amount: string;
                };
            };
        };
        responses: {
            /** @description The staking deposit transaction */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "transactionId": "65QN4XM5",
                     *       "providerId": "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
                     *       "currency": "MATIC",
                     *       "amount": 30,
                     *       "rates": {
                     *         "rate": 540
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["StakingDeposit"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listStakingEventHistory: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/staking/history",
                 *       "nonce": "<nonce>",
                 *       "account": "primary",
                 *       "since": "2022-11-01T00:00:00.000Z",
                 *       "until": "2022-11-03T00:00:00.000Z",
                 *       "limit": 50
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/staking/history" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. */
                    account?: string;
                    /** @description In iso datetime with timezone format. Defaults to the timestamp of the first deposit into Staking. */
                    since?: components["schemas"]["TimestampType"];
                    /** @description In iso datetime with timezone format, default to current time as of server time */
                    until?: components["schemas"]["TimestampType"];
                    /**
                     * @description The maximum number of transactions to return. Default is 50, max is 500.
                     * @default 50
                     */
                    limit?: number;
                    /** @description Borrower Id, in uuid4 format. providerId is accessible from the [Staking rates](#list-staking-rates) response */
                    providerId?: string;
                    /** @description Currency code, see [symbols](/market-data/symbols-and-minimums) */
                    currency?: string;
                    /**
                     * @description Toggles whether to only return daily interest transactions. Defaults to false.
                     * @default false
                     */
                    interestOnly?: boolean;
                    /**
                     * @description Toggles whether to sort the transactions in ascending order by datetime. Defaults to false.
                     * @default false
                     */
                    sortAsc?: boolean;
                };
            };
        };
        responses: {
            /** @description Staking transaction history */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "providerId": "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
                     *         "transactions": [
                     *           {
                     *             "transactionId": "MPZ7LDD8",
                     *             "transactionType": "Redeem",
                     *             "amountCurrency": "MATIC",
                     *             "amount": 20,
                     *             "dateTime": 1667418560153
                     *           },
                     *           {
                     *             "transactionId": "65QN4XM5",
                     *             "transactionType": "Deposit",
                     *             "amountCurrency": "MATIC",
                     *             "amount": 30,
                     *             "dateTime": 1667418287795
                     *           },
                     *           {
                     *             "transactionId": "YP22OK4P",
                     *             "transactionType": "Deposit",
                     *             "amountCurrency": "ETH",
                     *             "amount": 3,
                     *             "dateTime": 1667397368929
                     *           },
                     *           {
                     *             "transactionId": "TQN9OPN",
                     *             "transactionType": "Interest",
                     *             "amountCurrency": "MATIC",
                     *             "amount": 0.01,
                     *             "priceCurrency": "USD",
                     *             "priceAmount": 0.1,
                     *             "dateTime": 1667418287795
                     *           }
                     *         ]
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["StakingHistory"][];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listStakingRates: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description JSON response with staking rates */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "62bb4d27-a9c8-4493-a737-d4fa33994f1f": {
                     *         "MATIC": {
                     *           "providerId": "62bb4d27-a9c8-4493-a737-d4fa33994f1f",
                     *           "rate": 95.8909,
                     *           "apyPct": 0.96,
                     *           "ratePct": 0.958909,
                     *           "depositUsdLimit": 500000
                     *         },
                     *         "ETH": {
                     *           "providerId": "62bb4d27-a9c8-4493-a737-d4fa33994f1f",
                     *           "rate": 228.0197,
                     *           "apyPct": 2.31,
                     *           "ratePct": 2.280197,
                     *           "depositUsdLimit": 500000
                     *         },
                     *         "SOL": {
                     *           "providerId": "62bb4d27-a9c8-4493-a737-d4fa33994f1f",
                     *           "rate": 321.5282,
                     *           "apyPct": 3.27,
                     *           "ratePct": 3.215282,
                     *           "depositUsdLimit": 500000
                     *         }
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["StakingRateResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listStakingRewards: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/staking/rewards",
                 *       "nonce": "<nonce>",
                 *       "since": "2022-08-20T00:00:00.000Z",
                 *       "until": "2022-11-05T00:00:00.000Z",
                 *       "providerId": "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
                 *       "currency": "ETH"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/staking/rewards" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. */
                    account?: string;
                    /** @description In iso datetime with timezone format */
                    since: string;
                    /** @description In iso datetime with timezone format, default to current time as of server time */
                    until?: string;
                    /** @description Borrower Id, in uuid4 format. providerId is accessible from the [Staking rates](#list-staking-rates) response */
                    providerId?: string;
                    /** @description Currency code, see [symbols](/market-data/symbols-and-minimums) */
                    currency?: string;
                };
            };
        };
        responses: {
            /** @description A nested JSON object, organized by provider, then currency */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "62b21e17-2534-4b9f-afcf-b7edb609dd8d": {
                     *         "MATIC": {
                     *           "providerId": "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
                     *           "currency": "MATIC",
                     *           "accrualTotal": 0.103994,
                     *           "ratePeriods": [
                     *             {
                     *               "providerId": "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
                     *               "currency": "MATIC",
                     *               "apyPct": 5.75,
                     *               "ratePct": 5.592369,
                     *               "numberOfAccruals": 1,
                     *               "accrualTotal": 0.0065678,
                     *               "firstAccrualAt": "2022-08-23T20:00:00.000Z",
                     *               "lastAccrualAt": "2022-08-23T20:00:00.000Z"
                     *             },
                     *             {
                     *               "providerId": "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
                     *               "currency": "MATIC",
                     *               "apyPct": 5.2,
                     *               "ratePct": 5.073801,
                     *               "numberOfAccruals": 1,
                     *               "accrualTotal": 0.0037971687995651837,
                     *               "firstAccrualAt": "2022-10-28T20:00:00.000Z",
                     *               "lastAccrualAt": "2022-10-28T20:00:00.000Z"
                     *             }
                     *           ]
                     *         },
                     *         "ETH": {
                     *           "providerId": "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
                     *           "currency": "ETH",
                     *           "accrualTotal": 0.017999076209977,
                     *           "ratePeriods": [
                     *             {
                     *               "providerId": "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
                     *               "currency": "ETH",
                     *               "apyPct": 0.66,
                     *               "ratePct": 0.65913408,
                     *               "numberOfAccruals": 1,
                     *               "accrualTotal": 0.00014802170517505,
                     *               "firstAccrualAt": "2022-11-02T20:00:00.000Z",
                     *               "lastAccrualAt": "2022-11-02T20:00:00.000Z"
                     *             }
                     *           ]
                     *         }
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["StakingRewardsResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    unstakeCryptoFunds: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "v1/staking/unstake",
                 *       "nonce": "<nonce>",
                 *       "providerId": "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
                 *       "currency": "MATIC",
                 *       "amount": 20
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "v1/staking/unstake" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. */
                    account?: string;
                    /** @description Provider Id, in uuid4 format. providerId is accessible from the [Staking rates](#list-staking-rates) response */
                    providerId: string;
                    /** @description Currency code, see [symbols](/market-data/symbols-and-minimums) */
                    currency: string;
                    /**
                     * Format: decimal
                     * @description The amount of currency to withdraw
                     */
                    amount: string;
                };
            };
        };
        responses: {
            /** @description The staking withdrawal transaction */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "transactionId": "MPZ7LDD8",
                     *       "amount": 20,
                     *       "amountPaidSoFar": 20,
                     *       "amountRemaining": 0,
                     *       "currency": "MATIC",
                     *       "requestInitiated": "2022-11-02T19:49:20.153Z"
                     *     }
                     */
                    "application/json": components["schemas"]["StakingWithdrawal"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getRoles: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/roles",
                 *       "nonce": "<nonce>"
                 *     }
                 */
                "application/json": {
                    /**
                     * @description The literal string "/v1/roles"
                     * @example /v1/roles
                     */
                    request: string;
                    /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
                    nonce: components["schemas"]["TimestampType"];
                };
            };
        };
        responses: {
            /** @description The response will be a JSON object indicating the assigned roles to the set of API keys used to call `/v1/roles`. The `Auditor` role cannot be combined with other roles. `Fund Manager` and `Trader` can be combined. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleResponse"];
                };
            };
        };
    };
    getAccountMargin: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/margin",
                 *       "nonce": "<nonce>",
                 *       "symbol": "BTC-GUSD-PERP"
                 *     }
                 */
                "application/json": {
                    /**
                     * @description The API endpoint path
                     * @example /v1/margin
                     */
                    request: string;
                    /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
                    nonce: components["schemas"]["TimestampType"];
                    /**
                     * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts.
                     * @example primary
                     */
                    account?: string;
                    /** @description Trading pair symbol. See [symbols and minimums](/market-data/symbols-and-minimums) */
                    symbol: string;
                };
            };
        };
        responses: {
            /** @description JSON object */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "margin_assets_value": "9800",
                     *       "initial_margin": "6000",
                     *       "available_margin": "3800",
                     *       "margin_maintenance_limit": "5800",
                     *       "leverage": "12.34567",
                     *       "notional_value": "1300",
                     *       "estimated_liquidation_price": "1300",
                     *       "initial_margin_positions": "3500",
                     *       "reserved_margin": "2500",
                     *       "reserved_margin_buys": "1800",
                     *       "reserved_margin_sells": "700",
                     *       "buying_power": "0.19",
                     *       "selling_power": "0.19"
                     *     }
                     */
                    "application/json": components["schemas"]["MarginResponse"];
                };
            };
        };
    };
    listFundingPayments: {
        parameters: {
            query?: {
                /** @description If specified, only return funding payments after this point. Default value is 24h in past. See [<u>**Timestamps**</u>](/rest/~schemas#timestamp-type) for more information */
                since?: components["schemas"]["TimestampType"];
                /** @description If specified, only returns funding payment until this point. Default value is now. See [<u>**Timestamps**</u>](/rest/~schemas#timestamp-type) for more information */
                to?: components["schemas"]["TimestampType"];
            };
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/perpetuals/fundingPayment",
                 *       "nonce": "<nonce>"
                 *     }
                 */
                "application/json": {
                    /**
                     * @description The API endpoint path
                     * @example /v1/perpetuals/fundingPayment
                     */
                    request: string;
                    /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
                    nonce: components["schemas"]["TimestampType"];
                    /**
                     * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts.
                     * @example primary
                     */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description The response will be an array of funding payment objects. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "eventType": "Hourly Funding Transfer",
                     *         "hourlyFundingTransfer": {
                     *           "eventType": "Hourly Funding Transfer",
                     *           "timestamp": 1683730803940,
                     *           "assetCode": "GUSD",
                     *           "action": "Debit",
                     *           "quantity": {
                     *             "currency": "GUSD",
                     *             "value": "4.78958"
                     *           }
                     *         }
                     *       },
                     *       {
                     *         "eventType": "Hourly Funding Transfer",
                     *         "hourlyFundingTransfer": {
                     *           "eventType": "Hourly Funding Transfer",
                     *           "timestamp": 1683734406746,
                     *           "assetCode": "GUSD",
                     *           "action": "Debit",
                     *           "quantity": {
                     *             "currency": "GUSD",
                     *             "value": "4.78958"
                     *           },
                     *           "instrumentSymbol": "BTCGUSDPERP"
                     *         }
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["FundingPayment"][];
                };
            };
        };
    };
    getFundingPaymentReportFile: {
        parameters: {
            query?: {
                /** @description If empty, will only fetch records by numRows value. */
                fromDate?: string;
                /** @description If empty, will only fetch records by numRows value. */
                toDate?: string;
                /** @description If empty, default value '8760' */
                numRows?: number;
            };
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/perpetuals/fundingpaymentreport/records.xlsx?fromDate=2024-04-10&toDate=2024-04-25&numRows=1000",
                 *       "nonce": "<nonce>"
                 *     }
                 */
                "application/json": {
                    /**
                     * @description The API endpoint path
                     * @example /v1/perpetuals/fundingpaymentreport/records.xlsx
                     */
                    request: string;
                    /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
                    nonce: components["schemas"]["TimestampType"];
                    /**
                     * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts.
                     * @example primary
                     */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description XLSX file downloaded containing funding payment report. */
            200: {
                headers: {
                    "Content-Disposition"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": string;
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getFundingPaymentReportJson: {
        parameters: {
            query?: {
                /** @description If empty, will only fetch records by numRows value. */
                fromDate?: string;
                /** @description If empty, will only fetch records by numRows value. */
                toDate?: string;
                /** @description If empty, default value '8760' */
                numRows?: number;
            };
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/perpetuals/fundingpaymentreport/records.json?fromDate=2024-04-10&toDate=2024-04-25&numRows=1000",
                 *       "nonce": "<nonce>"
                 *     }
                 */
                "application/json": {
                    /**
                     * @description The API endpoint path
                     * @example /v1/perpetuals/fundingpaymentreport/records.json?fromDate=2024-04-10&toDate=2024-04-25&numRows=1000
                     */
                    request: string;
                    /** The nonce, as described in [Private API Invocation](/authentication/api-key#private-api-invocation) */
                    nonce: components["schemas"]["TimestampType"];
                    /**
                     * @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which you intend to place the order. Only available for exchange accounts.
                     * @example primary
                     */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description JSON response containing funding payment report. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "eventType": "Hourly Funding Transfer",
                     *         "timestamp": 1713344403617,
                     *         "assetCode": "GUSD",
                     *         "action": "Credit",
                     *         "quantity": {
                     *           "currency": "GUSD",
                     *           "value": "35.81084"
                     *         },
                     *         "instrumentSymbol": "BTCGUSDPERP"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["FundingPaymentReportItem"][];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getOpenPositions: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "request": "/v1/positions",
                 *       "nonce": "<nonce>",
                 *       "account": "primary"
                 *     }
                 */
                "application/json": {
                    /** @description The literal string "/v1/positions" */
                    request: string;
                    nonce: components["schemas"]["Nonce"];
                    /** @description Required for Master API keys as described in [Private API Invocation](/authentication/api-key#private-api-invocation). The name of the account within the subaccount group. Specifies the account on which the orders were placed. Only available for exchange accounts. */
                    account?: string;
                };
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "symbol": "btcgusdperp",
                     *         "instrument_type": "perp",
                     *         "quantity": "0.2",
                     *         "notional_value": "4000.036",
                     *         "realised_pnl": "1234.5678",
                     *         "unrealised_pnl": "999.946",
                     *         "average_cost": "15000.45",
                     *         "mark_price": "20000.18"
                     *       }
                     *     ]
                     */
                    "application/json": {
                        openPositions?: components["schemas"]["OpenPosition"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getRiskStats: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description Perps Trading pair symbol <br /> <br />
                 *
                 *     `BTCGUSDPERP`, etc. See [<u>**symbols and minimums**</u>](/market-data/symbols-and-minimums#all-supported-symbols).
                 */
                symbol: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The response will be an json object */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "product_type": "PerpetualSwapContract",
                     *       "mark_price": "30080.00",
                     *       "index_price": "30079.046",
                     *       "open_interest": "14.439",
                     *       "open_interest_notional": "434325.12"
                     *     }
                     */
                    "application/json": components["schemas"]["RiskStatsResponse"];
                };
            };
        };
    };
    getTickerV2: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description Trading pair symbol
                 * @example BTCUSD
                 */
                symbol: string;
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
                    /**
                     * @example {
                     *       "symbol": "BTCUSD",
                     *       "open": "9121.76",
                     *       "high": "9440.66",
                     *       "low": "9106.51",
                     *       "close": "9347.66",
                     *       "changes": [
                     *         "9365.1",
                     *         "9386.16",
                     *         "9373.41",
                     *         "9322.56",
                     *         "9268.89",
                     *         "9265.38",
                     *         "9245",
                     *         "9231.43",
                     *         "9235.88",
                     *         "9265.8",
                     *         "9295.18",
                     *         "9295.47",
                     *         "9310.82",
                     *         "9335.38",
                     *         "9344.03",
                     *         "9261.09",
                     *         "9265.18",
                     *         "9282.65",
                     *         "9260.01",
                     *         "9225",
                     *         "9159.5",
                     *         "9150.81",
                     *         "9118.6",
                     *         "9148.01"
                     *       ],
                     *       "bid": "9345.70",
                     *       "ask": "9347.67"
                     *     }
                     */
                    "application/json": components["schemas"]["TickerInfo"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listCandles: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description Trading pair symbol
                 * @example BTCUSD
                 */
                symbol: string;
                /**
                 * @description Time range for each candle:
                 *     * `1m` - 1 minute
                 *     * `5m` - 5 minutes
                 *     * `15m` - 15 minutes
                 *     * `30m` - 30 minutes
                 *     * `1h` - 1 hour
                 *     * `6h` - 6 hours
                 *     * `1day` - 1 day
                 * @example 15m
                 */
                time_frame: "1m" | "5m" | "15m" | "30m" | "1h" | "6h" | "1d";
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The response will be an array of arrays */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       [
                     *         1559755800000,
                     *         7781.6,
                     *         7820.23,
                     *         7776.56,
                     *         7819.39,
                     *         34.7624802159
                     *       ],
                     *       [
                     *         1559755800000,
                     *         7781.6,
                     *         7829.46,
                     *         7776.56,
                     *         7817.28,
                     *         43.4228281059
                     *       ]
                     *     ]
                     */
                    "application/json": components["schemas"]["CandleResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    listDerivativeCandles: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description Trading pair symbol. Available only for perpetual pairs like `BTCGUSDPERP`
                 * @example BTCGUSDPERP
                 */
                symbol: string;
                /**
                 * @description Time range for each candle. `1m`: 1 minute (only)
                 * @example 1m
                 */
                time_frame: "1m";
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The response will be an array of arrays */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       [
                     *         1714126740000,
                     *         68038,
                     *         68038,
                     *         68038,
                     *         68038,
                     *         0
                     *       ],
                     *       [
                     *         1714126680000,
                     *         68038,
                     *         68038,
                     *         68038,
                     *         68038,
                     *         0
                     *       ]
                     *     ]
                     */
                    "application/json": components["schemas"]["CandleResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
    getFXRate: {
        parameters: {
            query?: never;
            header: {
                /** @description Your API key */
                "X-GEMINI-APIKEY": components["parameters"]["apiKeyAuth"];
                /** @description HEX-encoded HMAC-SHA384 of payload signed with API secret */
                "X-GEMINI-SIGNATURE": components["parameters"]["signatureAuth"];
                /** @description Base64-encoded JSON payload */
                "X-GEMINI-PAYLOAD": components["parameters"]["payloadAuth"];
                "Content-Type"?: components["parameters"]["contentType"];
                "Content-Length"?: components["parameters"]["contentLength"];
                "Cache-Control"?: components["parameters"]["cacheControl"];
            };
            path: {
                /**
                 * @description Trading pair symbol <br /> <br />
                 *
                 *     `BTCUSD`, etc. See [<u>**symbols and minimums**</u>](/market-data/symbols-and-minimums#all-supported-symbols).
                 */
                symbol: components["parameters"]["symbolParam"];
                /**
                 * @description The timestamp to pull the FX rate for.
                 *
                 *     Gemini strongly recommends using milliseconds instead of seconds for timestamps.
                 * @example 1591084414622
                 */
                timestamp: components["parameters"]["timestampParam"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "fxPair": "AUDUSD",
                     *       "rate": "0.69",
                     *       "asOf": 1594651859000,
                     *       "provider": "bcb",
                     *       "benchmark": "Spot"
                     *     }
                     */
                    "application/json": components["schemas"]["FxRate"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ApiKeyIpFilteringFailure"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["InternalError"];
        };
    };
}
