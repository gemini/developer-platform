package schema

func BuildWorkflows() []WorkflowSpec {
	// static workflows extracted from cmd/spec.go
	return []WorkflowSpec{
		{
			Name:        "spot_trading",
			Description: "Place and manage spot trades",
			Steps: []WorkflowStep{
				{Step: 1, Action: "list_symbols", Command: "gemini-markets spot symbols -q", Description: "List available trading pairs", Output: "string[]"},
				{Step: 2, Action: "get_details", Command: "gemini-markets spot symbol <pair> -q", Description: "Get trading parameters", Output: "SpotSymbolDetails"},
				{Step: 3, Action: "check_balance", Command: "gemini-markets balance -q", Description: "Check available balance", Output: "Balance[]"},
				{Step: 4, Action: "place_order", Command: "gemini-markets spot order place --symbol <pair> --side buy --amount <qty> --price <price> --client-order-id <id> -q", Description: "Place order with idempotency key", Output: "SpotOrderResponse"},
				{Step: 5, Action: "verify", Command: "gemini-markets spot order list -q", Description: "Verify order is active", Output: "SpotOrderResponse[]"},
			},
		},
		{
			Name:        "spot_market_analysis",
			Description: "Analyze spot market before trading",
			Steps: []WorkflowStep{
				{Step: 1, Action: "get_book", Command: "gemini-markets book <symbol> --limit 20 -q", Description: "Get order book depth", Output: "OrderBook"},
				{Step: 2, Action: "analyze_liquidity", Command: "gemini-markets analyze <symbol> --quantity <size> -q", Description: "Estimate slippage for target size", Output: "AnalysisResult"},
				{Step: 3, Action: "check_fees", Command: "gemini-markets spot fees -q", Description: "Check fee tier", Output: "NotionalVolumeResponse"},
			},
		},
		{
			Name:        "spot_execution_tracking",
			Description: "Track what orders filled",
			Steps: []WorkflowStep{
				{Step: 1, Action: "list_open", Command: "gemini-markets spot order list -q", Description: "Check pending orders", Output: "SpotOrderResponse[]"},
				{Step: 2, Action: "get_trades", Command: "gemini-markets spot trades --limit 50 -q", Description: "Get executed fills", Output: "SpotTrade[]"},
				{Step: 3, Action: "check_balance", Command: "gemini-markets balance -q", Description: "Verify resulting balances", Output: "Balance[]"},
			},
		},
		{
			Name:        "predict_market_discovery",
			Description: "Find and analyze prediction markets",
			Steps: []WorkflowStep{
				{Step: 1, Action: "list_markets", Command: "gemini-markets predict markets list --status active -q", Description: "Get all active markets", Output: "Market[]"},
				{Step: 2, Action: "get_details", Command: "gemini-markets predict markets get <ticker> -q", Description: "Get market details with contracts and prices", Output: "MarketDetail"},
				{Step: 3, Action: "analyze_spread", Command: "gemini-markets analyze <symbol> --quantity 100 -q", Description: "Analyze spread and liquidity", Output: "AnalysisResult"},
			},
		},
		{
			Name:        "predict_place_order",
			Description: "Place a prediction market order with idempotency",
			Steps: []WorkflowStep{
				{Step: 1, Action: "place", Command: "gemini-markets predict order place --symbol <symbol> --side <buy|sell> --outcome <yes|no> --type limit --quantity <qty> --price <price> --client-order-id <unique-id> -q", Description: "Place order with idempotency key", Output: "PredictOrderResponse"},
				{Step: 2, Action: "verify", Command: "gemini-markets predict order get <order-id> -q", Description: "Check order status", Output: "PredictOrderResponse"},
			},
		},
		{
			Name:        "predict_execution_tracking",
			Description: "Track what prediction orders filled",
			Steps: []WorkflowStep{
				{Step: 1, Action: "list_open", Command: "gemini-markets predict order list -q", Description: "Check pending orders", Output: "PredictOrdersResponse"},
				{Step: 2, Action: "order_history", Command: "gemini-markets predict order history --status filled --limit 50 -q", Description: "Get filled orders (these are your trades)", Output: "PredictOrdersResponse"},
				{Step: 3, Action: "positions", Command: "gemini-markets predict positions list -q", Description: "Current holdings with avg price and P&L", Output: "Position[]"},
			},
		},
		{
			Name:        "predict_position_management",
			Description: "Monitor and manage prediction positions",
			Steps: []WorkflowStep{
				{Step: 1, Action: "list_positions", Command: "gemini-markets predict positions list -q", Description: "Get all open positions with P&L", Output: "Position[]"},
				{Step: 2, Action: "check_market", Command: "gemini-markets predict markets get <ticker> -q", Description: "Get current market prices", Output: "MarketDetail"},
				{Step: 3, Action: "settled", Command: "gemini-markets predict positions settled -q", Description: "Review settled positions", Output: "Position[]"},
			},
		},
		{
			Name:        "emergency_exit",
			Description: "Cancel all orders immediately (kill switch)",
			Steps: []WorkflowStep{
				{Step: 1, Action: "cancel_spot", Command: "gemini-markets spot order cancel-all -q", Description: "Cancel all spot orders atomically", Output: "CancelAllResult"},
				{Step: 2, Action: "cancel_predict", Command: "gemini-markets predict order cancel-all -q", Description: "Cancel all prediction orders atomically", Output: "CancelAllResult"},
				{Step: 3, Action: "verify_spot", Command: "gemini-markets spot order list -q", Description: "Confirm no open spot orders", Output: "SpotOrderResponse[]"},
				{Step: 4, Action: "verify_predict", Command: "gemini-markets predict order list -q", Description: "Confirm no open prediction orders", Output: "PredictOrdersResponse"},
			},
		},
		{
			Name:        "portfolio_status",
			Description: "Full portfolio overview across products",
			Steps: []WorkflowStep{
				{Step: 1, Action: "balances", Command: "gemini-markets balance -q", Description: "Cash and crypto balances", Output: "Balance[]"},
				{Step: 2, Action: "spot_orders", Command: "gemini-markets spot order list -q", Description: "Open spot orders", Output: "SpotOrderResponse[]"},
				{Step: 3, Action: "predict_orders", Command: "gemini-markets predict order list -q", Description: "Open prediction orders", Output: "PredictOrdersResponse"},
				{Step: 4, Action: "predict_positions", Command: "gemini-markets predict positions list -q", Description: "Prediction holdings", Output: "Position[]"},
			},
		},
		{
			Name:        "realtime_monitoring",
			Description: "Stream real-time market data and order updates",
			Steps: []WorkflowStep{
				{Step: 1, Action: "stream_prices", Command: "gemini-markets stream ticker <symbol> -q", Description: "Stream best bid/ask prices", Output: "StreamMessage"},
				{Step: 2, Action: "stream_book", Command: "gemini-markets stream depth <symbol> -q", Description: "Stream order book changes", Output: "StreamMessage"},
				{Step: 3, Action: "stream_orders", Command: "gemini-markets stream orders -q", Description: "Stream your order fills (auth required)", Output: "StreamMessage"},
				{Step: 4, Action: "stream_balances", Command: "gemini-markets stream balances -q", Description: "Stream balance updates (auth required)", Output: "StreamMessage"},
			},
		},
		{
			Name:        "active_trading_with_streams",
			Description: "Place orders with real-time fill notifications (recommended for agents placing multiple orders)",
			Steps: []WorkflowStep{
				{Step: 1, Action: "start_order_stream", Command: "gemini-markets stream orders -q &", Description: "Start order stream in background - outputs fill events as they happen", Output: "StreamMessage"},
				{Step: 2, Action: "start_balance_stream", Command: "gemini-markets stream balances -q &", Description: "Start balance stream in background - know when funds are available", Output: "StreamMessage"},
				{Step: 3, Action: "place_order", Command: "gemini-markets predict order place --symbol <symbol> --side buy --outcome yes --quantity 100 --price 0.65 --client-order-id <id> -q", Description: "Place order - fill notification comes via stream", Output: "PredictOrderResponse"},
				{Step: 4, Action: "read_stream", Command: "Read from background stream stdout", Description: "Check stream output for fill events instead of polling order status", Output: "StreamMessage"},
				{Step: 5, Action: "next_order", Command: "Place next order based on fill/balance updates", Description: "React to real-time events for faster execution", Output: "PredictOrderResponse"},
			},
		},
		{
			Name:        "btc_prediction_arbitrage",
			Description: "Compare BTC spot price vs prediction market pricing",
			Steps: []WorkflowStep{
				{Step: 1, Action: "spot_price", Command: "gemini-markets book btcusd --limit 1 -q", Description: "Get current BTC spot price", Output: "OrderBook"},
				{Step: 2, Action: "find_btc_markets", Command: "gemini-markets predict markets list --status active --category Crypto -q", Description: "Find BTC prediction markets", Output: "Market[]"},
				{Step: 3, Action: "get_contracts", Command: "gemini-markets predict markets get <btc-ticker> -q", Description: "Get strike prices and odds", Output: "MarketDetail"},
				{Step: 4, Action: "analyze_edge", Command: "gemini-markets analyze <contract-symbol> --quantity 100 -q", Description: "Check liquidity at target size", Output: "AnalysisResult"},
			},
		},
	}
}

func BuildSchemas() map[string]Schema {
	// copied from existing spec.go
	return map[string]Schema{
		"SpotSymbolDetails": {Description: "Spot trading pair details", Fields: map[string]SchemaField{
			"symbol":         {Type: "string", Description: "Trading pair symbol (e.g., BTCUSD)"},
			"base_currency":  {Type: "string", Description: "Base currency (e.g., BTC)"},
			"quote_currency": {Type: "string", Description: "Quote currency (e.g., USD)"},
			"tick_size":      {Type: "string", Description: "Minimum price increment"},
			"min_order_size": {Type: "string", Description: "Minimum order size in base currency"},
			"status":         {Type: "string", Description: "Trading status"},
		}, Example: map[string]any{"symbol": "btcusd", "base_currency": "BTC", "quote_currency": "USD", "tick_size": "0.01", "min_order_size": "0.00001", "status": "open"}},
		"SpotOrderResponse": {Description: "Spot order placement or status response", Fields: map[string]SchemaField{
			"order_id":            {Type: "string", Description: "Server-assigned order ID"},
			"client_order_id":     {Type: "string", Description: "Your idempotency key"},
			"symbol":              {Type: "string", Description: "Trading pair"},
			"side":                {Type: "string", Description: "buy or sell"},
			"type":                {Type: "string", Description: "Order type"},
			"price":               {Type: "string", Description: "Limit price"},
			"original_amount":     {Type: "string", Description: "Order quantity"},
			"executed_amount":     {Type: "string", Description: "Quantity filled"},
			"remaining_amount":    {Type: "string", Description: "Quantity remaining"},
			"is_live":             {Type: "bool", Description: "Order is active"},
			"is_cancelled":        {Type: "bool", Description: "Order was canceled"},
			"avg_execution_price": {Type: "string", Description: "Average fill price"},
		}, Example: map[string]any{"order_id": "12345678", "client_order_id": "agent-1709424000-abc123", "symbol": "btcusd", "side": "buy", "type": "exchange limit", "price": "50000.00", "original_amount": "0.1", "executed_amount": "0", "remaining_amount": "0.1", "is_live": true, "is_cancelled": false, "avg_execution_price": "0.00"}},
		"SpotTrade": {Description: "Executed spot trade", Fields: map[string]SchemaField{
			"tid":          {Type: "int64", Description: "Trade ID"},
			"price":        {Type: "string", Description: "Execution price"},
			"amount":       {Type: "string", Description: "Trade amount"},
			"type":         {Type: "string", Description: "Buy or Sell"},
			"fee_amount":   {Type: "string", Description: "Fee paid"},
			"fee_currency": {Type: "string", Description: "Fee currency"},
			"timestampms":  {Type: "int64", Description: "Trade timestamp (ms)"},
		}, Example: map[string]any{"tid": 107317526, "price": "50000.00", "amount": "0.1", "type": "Buy", "fee_amount": "0.50", "fee_currency": "USD", "timestampms": 1709424000000}},
		"Market": {Description: "A prediction market event", Fields: map[string]SchemaField{
			"ticker":     {Type: "string", Description: "Unique market identifier"},
			"title":      {Type: "string", Description: "Human-readable market title"},
			"status":     {Type: "string", Description: "Market status: active, closed, settled"},
			"category":   {Type: "string", Description: "Market category"},
			"volume24h":  {Type: "string", Description: "24-hour trading volume in USD"},
			"expiryDate": {Type: "string", Description: "Market expiration date"},
			"contracts":  {Type: "Contract[]", Description: "Available contracts to trade"},
		}, Example: map[string]any{"ticker": "OSCARBP26", "title": "2026 Oscar for Best Picture", "status": "active", "category": "Entertainment", "volume24h": "125000.00", "expiryDate": "2026-03-15"}},
		"Contract": {Description: "A tradeable contract within a market", Fields: map[string]SchemaField{
			"id":               {Type: "string", Description: "Contract ID"},
			"instrumentSymbol": {Type: "string", Description: "Trading symbol (use this for orders)"},
			"label":            {Type: "string", Description: "Contract label (e.g., 'Yes', 'No', team name)"},
			"status":           {Type: "string", Description: "Contract status"},
			"prices.buy":       {Type: "string", Description: "Best ask price"},
			"prices.sell":      {Type: "string", Description: "Best bid price"},
		}, Example: map[string]any{"id": "OSBP26ONEB", "instrumentSymbol": "GEMI-OSCARBP26-OSBP26ONEB", "label": "One Best Picture", "status": "active", "prices": map[string]any{"buy": "0.80", "sell": "0.75"}}},
		"OrderBook": {Description: "Order book with bids and asks", Fields: map[string]SchemaField{
			"bids":          {Type: "OrderBookEntry[]", Description: "Buy orders sorted by price descending"},
			"asks":          {Type: "OrderBookEntry[]", Description: "Sell orders sorted by price ascending"},
			"bids[].price":  {Type: "string", Description: "Bid price"},
			"bids[].amount": {Type: "string", Description: "Quantity at this price"},
			"asks[].price":  {Type: "string", Description: "Ask price"},
			"asks[].amount": {Type: "string", Description: "Quantity at this price"},
		}, Example: map[string]any{"bids": []map[string]any{{"price": "0.75", "amount": "500"}, {"price": "0.74", "amount": "1200"}}, "asks": []map[string]any{{"price": "0.80", "amount": "300"}, {"price": "0.81", "amount": "800"}}}},
		"Balance": {Description: "Account balance for a currency", Fields: map[string]SchemaField{
			"currency":               {Type: "string", Description: "Currency code (e.g., USD, BTC)"},
			"amount":                 {Type: "string", Description: "Total balance"},
			"available":              {Type: "string", Description: "Available for trading"},
			"availableForWithdrawal": {Type: "string", Description: "Available for withdrawal"},
		}, Example: map[string]any{"currency": "USD", "amount": "10000.00", "available": "8500.00", "availableForWithdrawal": "8500.00"}},
		"PredictOrderResponse": {Description: "Prediction market order placement or status response", Fields: map[string]SchemaField{
			"orderId":        {Type: "string", Description: "Server-assigned order ID"},
			"clientOrderId":  {Type: "string", Description: "Your idempotency key"},
			"symbol":         {Type: "string", Description: "Contract symbol"},
			"side":           {Type: "string", Description: "buy or sell"},
			"outcome":        {Type: "string", Description: "yes or no"},
			"type":           {Type: "string", Description: "Order type: limit, market"},
			"status":         {Type: "string", Description: "Order status: open, filled, canceled"},
			"price":          {Type: "string", Description: "Limit price"},
			"quantity":       {Type: "string", Description: "Order quantity"},
			"filledQuantity": {Type: "string", Description: "Quantity filled so far"},
			"createdAt":      {Type: "string", Description: "Order creation timestamp"},
		}, Example: map[string]any{"orderId": "87654321", "clientOrderId": "agent-1709424000-oscars", "symbol": "GEMI-OSCARBP26-OSBP26ONEB", "side": "buy", "outcome": "yes", "type": "limit", "status": "open", "price": "0.75", "quantity": "100", "filledQuantity": "0", "createdAt": "2024-03-02T15:30:00Z"}},
		"Position": {Description: "Open position in a prediction contract", Fields: map[string]SchemaField{
			"contractId":         {Type: "string", Description: "Contract identifier"},
			"shares":             {Type: "string", Description: "Position size"},
			"avgPrice":           {Type: "string", Description: "Average entry price"},
			"currentMarketValue": {Type: "string", Description: "Current market value"},
			"pnl":                {Type: "string", Description: "Unrealized profit/loss"},
		}, Example: map[string]any{"contractId": "GEMI-OSCARBP26-OSBP26ONEB", "shares": "100", "avgPrice": "0.65", "currentMarketValue": "75.00", "pnl": "10.00"}},
		"ErrorResponse": {Description: "Structured error response for programmatic handling", Fields: map[string]SchemaField{
			"success":          {Type: "bool", Description: "Always false for errors"},
			"error.code":       {Type: "string", Description: "Error code for programmatic handling"},
			"error.message":    {Type: "string", Description: "Human-readable error message"},
			"error.retryable":  {Type: "bool", Description: "Whether this error can be retried"},
			"error.suggestion": {Type: "string", Description: "Suggested action to resolve"},
			"error.requestId":  {Type: "string", Description: "Request ID for debugging (when available)"},
		}, Example: map[string]any{"success": false, "error": map[string]any{"code": "INSUFFICIENT_FUNDS", "message": "Not enough balance to place order", "retryable": false, "suggestion": "Deposit funds or reduce order size"}}},
		"StreamMessage": {Description: "Real-time event from WebSocket stream (orders, balances, ticker, depth)", Fields: map[string]SchemaField{
			"type":      {Type: "string", Description: "Event type (e.g., order_update, balance_update, ticker, trade)"},
			"timestamp": {Type: "int64", Description: "Event timestamp in milliseconds"},
			"data":      {Type: "object", Description: "Event-specific payload"},
		}, Example: map[string]any{"type": "order_update", "timestamp": 1709424000000, "data": map[string]any{"orderId": "12345678", "status": "filled", "symbol": "GEMI-BTC2603052200-HI70500"}}},
	}
}

func BuildFieldAbbreviations() map[string]string {
	return map[string]string{"id": "orderId", "cid": "clientOrderId", "sym": "symbol / instrumentSymbol", "px": "price", "qty": "quantity", "filled": "filledQuantity", "remain": "remainingQuantity", "ts": "timestamp / createdAt", "cur": "currency", "amt": "amount", "avail": "available", "availWd": "availableForWithdrawal", "out": "outcome"}
}

func BuildErrorCodes() []ErrorCodeSpec {
	return []ErrorCodeSpec{
		{Code: "INVALID_INPUT", Retryable: false, HTTPStatus: 400, Category: "client_error", SuggestedAction: "Fix command arguments and retry"},
		{Code: "AUTH_REQUIRED", Retryable: false, HTTPStatus: 401, Category: "authentication", SuggestedAction: "Run 'gemini-markets auth login', or set GEMINI_ACCESS_TOKEN / GEMINI_API_KEY and GEMINI_API_SECRET"},
		{Code: "AUTH_FAILED", Retryable: false, HTTPStatus: 401, Category: "authentication", SuggestedAction: "Verify your token or API credentials are valid, or run 'gemini-markets auth login' to refresh OAuth access"},
		{Code: "NOT_FOUND", Retryable: false, HTTPStatus: 404, Category: "client_error", SuggestedAction: "Verify symbol, order ID, or resource identifier exists"},
		{Code: "INSUFFICIENT_FUNDS", Retryable: false, HTTPStatus: 400, Category: "business_logic", SuggestedAction: "Deposit funds or reduce order size"},
		{Code: "RATE_LIMITED", Retryable: true, HTTPStatus: 429, Category: "rate_limit", SuggestedAction: "Wait for Retry-After duration and use exponential backoff"},
		{Code: "MARKET_CLOSED", Retryable: false, HTTPStatus: 400, Category: "business_logic", SuggestedAction: "Check market status and wait for market to reopen"},
		{Code: "ORDER_REJECTED", Retryable: false, HTTPStatus: 400, Category: "business_logic", SuggestedAction: "Check order parameters (price, quantity, market status)"},
		{Code: "NETWORK_ERROR", Retryable: true, Category: "network", SuggestedAction: "Retry with exponential backoff (max 3 attempts)"},
		{Code: "SERVER_ERROR", Retryable: true, HTTPStatus: 500, Category: "server_error", SuggestedAction: "Retry with exponential backoff - temporary backend issue"},
		{Code: "UNKNOWN_ERROR", Retryable: false, Category: "unknown", SuggestedAction: "Check error message for details and contact support if persistent"},
	}
}

func BuildRateLimits() RateLimitSpec {
	return RateLimitSpec{
		RestAPI:          "600 requests per minute (shared across all REST endpoints)",
		WebSocket:        "5 concurrent connections per account",
		OrderPlacement:   "Recommended: 1 order per 100ms to avoid circuit breaker",
		CircuitBreaker:   "Opens after 3 consecutive 429 errors, closes after 30s cooldown",
		RetryAfterHeader: "Respect Retry-After header on 429 responses (duration in seconds)",
	}
}

func BuildConstraints() ConstraintsSpec {
	return ConstraintsSpec{
		Prediction: PredictionConstraints{MinQuantity: "1 contract", MaxQuantity: "10,000 contracts per order", PriceIncrement: "0.01 (1 cent)", PriceRange: "0.01 to 0.99", OutcomeValues: "yes or no"},
		Spot:       SpotConstraints{MinOrderSize: "Varies by symbol - use 'spot symbol <pair>' to check min_order_size", TickSize: "Varies by symbol - use 'spot symbol <pair>' to check tick_size", PricePrecision: "Varies by symbol - check symbol details for quote_increment"},
	}
}

func BuildRetryStrategy() RetryStrategySpec {
	return RetryStrategySpec{
		"RATE_LIMITED":       {Retry: true, Backoff: "exponential", BaseDelay: "1s", MaxDelay: "60s", RespectRetryAfter: true, Action: "Wait for Retry-After header duration, then retry with exponential backoff"},
		"NETWORK_ERROR":      {Retry: true, Backoff: "exponential", BaseDelay: "1s", MaxDelay: "10s", MaxAttempts: 3, Action: "Retry up to 3 times with exponential backoff"},
		"SERVER_ERROR":       {Retry: true, Backoff: "exponential", BaseDelay: "2s", MaxDelay: "30s", MaxAttempts: 3, Action: "Backend issue - retry up to 3 times with exponential backoff"},
		"INSUFFICIENT_FUNDS": {Retry: false, Action: "Check balance with 'balance' command, deposit funds, or reduce order size"},
		"AUTH_REQUIRED":      {Retry: false, Action: "Run 'gemini-markets auth login', or set GEMINI_ACCESS_TOKEN / GEMINI_API_KEY and GEMINI_API_SECRET"},
		"AUTH_FAILED":        {Retry: false, Action: "Verify your token or API credentials are valid, or run 'gemini-markets auth login' to refresh OAuth access"},
		"MARKET_CLOSED":      {Retry: false, Action: "Check market status - market may be closed, settled, or under review"},
		"ORDER_REJECTED":     {Retry: false, Action: "Verify order parameters (price within range, quantity within limits, valid symbol)"},
		"NOT_FOUND":          {Retry: false, Action: "Verify the resource (symbol, order ID, etc.) exists and is spelled correctly"},
		"INVALID_INPUT":      {Retry: false, Action: "Fix command arguments - check help with --help flag"},
	}
}
