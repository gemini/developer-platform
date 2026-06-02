package schema

func BuildMCPTools() []MCPTool {
	return []MCPTool{
		{
			Name:        "gemini_predict_order_place",
			Description: "Place a prediction market order. IMPORTANT: Always provide client_order_id for safe retries - if a request fails, retry with the SAME client_order_id and duplicates will be rejected. For active trading, run 'gemini-markets stream orders' in background to get real-time fill notifications instead of polling.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"symbol":          {Type: "string", Description: "Contract symbol (e.g., GEMI-OSCARBP26-OSBP26ONEB). Get from 'predict markets get <ticker>'", Example: "GEMI-BTC2603052200-HI70500"},
					"side":            {Type: "string", Description: "Order side", Enum: []string{"buy", "sell"}, Example: "buy"},
					"outcome":         {Type: "string", Description: "Contract outcome", Enum: []string{"yes", "no"}, Example: "yes"},
					"quantity":        {Type: "string", Description: "Number of contracts (1-10000). Required unless dollars is set", Example: "100"},
					"dollars":         {Type: "string", Description: "Dollar amount. Buys cap total spend including estimated prediction fees; sells target gross notional. Market/IOC/FOK sizing uses a WebSocket depth snapshot", Example: "50"},
					"price":           {Type: "string", Description: "Limit price (0.01-0.99). Required for limit orders and dollar-based sizing", Example: "0.65"},
					"type":            {Type: "string", Description: "Order type", Enum: []string{"limit", "market"}, Default: "limit"},
					"client_order_id": {Type: "string", Description: "Idempotency key for safe retries. REQUIRED for agents. Use format: agent-{timestamp}-{uuid}", Example: "agent-1709424000-abc123"},
					"time_in_force":   {Type: "string", Description: "Time in force policy", Enum: []string{"good-til-cancel", "immediate-or-cancel", "fill-or-kill", "post-only"}, Default: "good-til-cancel"},
					"dry_run":         {Type: "boolean", Description: "Validate and preview order without placing. Returns order params that would be sent"},
				},
				Required: []string{"symbol", "side", "outcome", "client_order_id"},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "PredictOrderResponse with orderId, status, filledQuantity", Schema: "#/schemas/PredictOrderResponse"},
		},
		{
			Name:        "gemini_predict_order_cancel",
			Description: "Cancel a prediction market order by order ID.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"order_id": {Type: "string", Description: "Server-assigned order ID to cancel", Example: "12345678"},
				},
				Required: []string{"order_id"},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Canceled order details", Schema: "#/schemas/PredictOrderResponse"},
		},
		{
			Name:        "gemini_predict_order_cancel_all",
			Description: "Cancel ALL open prediction market orders atomically. Use as emergency kill switch. Use dry_run=true to preview which orders would be canceled.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"dry_run": {Type: "boolean", Description: "List orders that would be canceled without canceling"},
				},
				Required: []string{},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "List of canceled order IDs"},
		},
		{
			Name:        "gemini_predict_order_list",
			Description: "List all open prediction market orders.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"ticker": {Type: "string", Description: "Filter by market ticker (optional)", Example: "OSCARBP26"},
					"limit":  {Type: "string", Description: "Max results (default: 50)", Default: "50"},
				},
				Required: []string{},
			},
			OutputSchema: &MCPOutputSchema{Type: "array", Description: "Array of open orders", Schema: "#/schemas/PredictOrderResponse"},
		},
		{
			Name:        "gemini_predict_order_get",
			Description: "Get status and details of a specific prediction market order.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"order_id": {Type: "string", Description: "Server-assigned order ID", Example: "12345678"},
				},
				Required: []string{"order_id"},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Order details with current status", Schema: "#/schemas/PredictOrderResponse"},
		},
		{
			Name:        "gemini_predict_markets_list",
			Description: "List available prediction markets. Use to discover tradeable markets.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"status":   {Type: "string", Description: "Filter by status", Enum: []string{"active", "closed", "settled"}, Example: "active"},
					"category": {Type: "string", Description: "Filter by category (e.g., Sports, Politics, Crypto)", Example: "Crypto"},
				},
				Required: []string{},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Markets with pagination", Schema: "#/schemas/Market"},
		},
		{
			Name:        "gemini_predict_markets_get",
			Description: "Get detailed market info including contracts and current prices. Use this to find the instrumentSymbol needed for order placement.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"ticker": {Type: "string", Description: "Market ticker (e.g., OSCARBP26)", Example: "BTC2603052200"},
				},
				Required: []string{"ticker"},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Market with contracts[] containing instrumentSymbol for trading", Schema: "#/schemas/Market"},
		},
		{
			Name:        "gemini_predict_markets_search",
			Description: "Search prediction markets by keyword.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"query": {Type: "string", Description: "Search query (e.g., 'NBA', 'Bitcoin', 'Election')", Example: "Bitcoin"},
				},
				Required: []string{"query"},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Matching markets", Schema: "#/schemas/Market"},
		},
		{
			Name:        "gemini_predict_markets_newly_listed",
			Description: "List prediction markets created in the last 24 hours. Sorted by creation date (newest first).",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"category": {Type: "string", Description: "Filter by category (e.g., Sports, Politics, Crypto)", Example: "Sports"},
					"limit":    {Type: "string", Description: "Max results (default: 50)", Default: "50"},
					"offset":   {Type: "string", Description: "Pagination offset", Default: "0"},
				},
				Required: []string{},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "New markets with pagination", Schema: "#/schemas/Market"},
		},
		{
			Name:        "gemini_predict_markets_recently_settled",
			Description: "List prediction markets settled in the last 24 hours. Sorted by resolution date (most recent first).",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"category": {Type: "string", Description: "Filter by category (e.g., Sports, Politics, Crypto)", Example: "Sports"},
					"limit":    {Type: "string", Description: "Max results (default: 50)", Default: "50"},
					"offset":   {Type: "string", Description: "Pagination offset", Default: "0"},
				},
				Required: []string{},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Settled markets with pagination", Schema: "#/schemas/Market"},
		},
		{
			Name:        "gemini_predict_markets_upcoming",
			Description: "List pre-launch approved prediction markets. Sorted by start time (soonest first).",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"category": {Type: "string", Description: "Filter by category (e.g., Sports, Politics, Crypto)", Example: "Sports"},
					"limit":    {Type: "string", Description: "Max results (default: 50)", Default: "50"},
					"offset":   {Type: "string", Description: "Pagination offset", Default: "0"},
				},
				Required: []string{},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Upcoming markets with pagination", Schema: "#/schemas/Market"},
		},
		{
			Name:        "gemini_predict_markets_categories",
			Description: "List all available prediction market categories.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"status": {Type: "string", Description: "Filter categories by market status", Enum: []string{"active", "closed", "settled"}, Example: "active"},
				},
				Required: []string{},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Array of category strings"},
		},
		{
			Name:        "gemini_predict_order_history",
			Description: "List prediction market order history (filled, canceled, etc.).",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"ticker": {Type: "string", Description: "Filter by market ticker (optional)", Example: "OSCARBP26"},
					"status": {Type: "string", Description: "Filter by status (e.g., filled, canceled)", Example: "filled"},
					"limit":  {Type: "string", Description: "Max results (default: 50)", Default: "50"},
				},
				Required: []string{},
			},
			OutputSchema: &MCPOutputSchema{Type: "array", Description: "Historical orders", Schema: "#/schemas/PredictOrderResponse"},
		},
		{
			Name:         "gemini_predict_positions_list",
			Description:  "List all open prediction market positions with P&L.",
			InputSchema:  MCPInputSchema{Type: "object", Properties: map[string]MCPParam{}, Required: []string{}},
			OutputSchema: &MCPOutputSchema{Type: "array", Description: "Open positions with avgPrice, pnl", Schema: "#/schemas/Position"},
		},
		{
			Name:        "gemini_predict_positions_settled",
			Description: "List settled prediction market positions (resolved markets).",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"limit":  {Type: "string", Description: "Max results (default: 50)", Default: "50"},
					"offset": {Type: "string", Description: "Pagination offset", Default: "0"},
				},
				Required: []string{},
			},
			OutputSchema: &MCPOutputSchema{Type: "array", Description: "Settled positions with final P&L", Schema: "#/schemas/Position"},
		},
		{
			Name:        "gemini_spot_order_place",
			Description: "Place a spot/crypto trading order. IMPORTANT: Always provide client_order_id for safe retries. For active trading, run 'gemini-markets stream orders' in background to get real-time fill notifications instead of polling.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"symbol":          {Type: "string", Description: "Trading pair (e.g., BTCUSD, ETHUSD)", Example: "BTCUSD"},
					"side":            {Type: "string", Description: "Order side", Enum: []string{"buy", "sell"}, Example: "buy"},
					"amount":          {Type: "string", Description: "Order amount in base currency. Required unless dollars is set", Example: "0.01"},
					"dollars":         {Type: "string", Description: "Total dollar spend including fees. Adjusts for your fee tier. Mutually exclusive with amount", Example: "50"},
					"price":           {Type: "string", Description: "Limit price. Required for limit orders and when using dollars", Example: "50000"},
					"type":            {Type: "string", Description: "Order type", Enum: []string{"exchange limit", "exchange stop limit"}, Default: "exchange limit"},
					"client_order_id": {Type: "string", Description: "Idempotency key for safe retries. REQUIRED for agents", Example: "agent-1709424000-btc"},
					"dry_run":         {Type: "boolean", Description: "Validate and preview order without placing"},
				},
				Required: []string{"symbol", "side", "client_order_id"},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Order response with order_id, status", Schema: "#/schemas/SpotOrderResponse"},
		},
		{
			Name:        "gemini_spot_order_cancel",
			Description: "Cancel a spot trading order.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"order_id": {Type: "string", Description: "Server-assigned order ID to cancel", Example: "12345678"},
				},
				Required: []string{"order_id"},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Canceled order details", Schema: "#/schemas/SpotOrderResponse"},
		},
		{
			Name:        "gemini_spot_order_cancel_all",
			Description: "Cancel ALL open spot orders atomically. Use dry_run=true to preview which orders would be canceled.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"dry_run": {Type: "boolean", Description: "List orders that would be canceled without canceling"},
				},
				Required: []string{},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "List of canceled order IDs"},
		},
		{
			Name:        "gemini_spot_order_get",
			Description: "Get status and details of a specific spot order.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"order_id": {Type: "string", Description: "Server-assigned order ID", Example: "12345678"},
				},
				Required: []string{"order_id"},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Order details", Schema: "#/schemas/SpotOrderResponse"},
		},
		{
			Name:         "gemini_spot_order_list",
			Description:  "List all open spot orders.",
			InputSchema:  MCPInputSchema{Type: "object", Properties: map[string]MCPParam{}, Required: []string{}},
			OutputSchema: &MCPOutputSchema{Type: "array", Description: "Open orders", Schema: "#/schemas/SpotOrderResponse"},
		},
		{
			Name:        "gemini_spot_trades",
			Description: "List your spot trade history (executed fills).",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"symbol": {Type: "string", Description: "Filter by trading pair (optional)", Example: "BTCUSD"},
					"limit":  {Type: "string", Description: "Max results (default: 50)", Default: "50"},
				},
				Required: []string{},
			},
			OutputSchema: &MCPOutputSchema{Type: "array", Description: "Executed trades", Schema: "#/schemas/SpotTrade"},
		},
		{
			Name:         "gemini_spot_fees",
			Description:  "Get your fee tier and 30-day trading volume for spot markets.",
			InputSchema:  MCPInputSchema{Type: "object", Properties: map[string]MCPParam{}, Required: []string{}},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Fee tier and 30-day volume"},
		},
		{
			Name:         "gemini_spot_symbols",
			Description:  "List all available spot trading pairs.",
			InputSchema:  MCPInputSchema{Type: "object", Properties: map[string]MCPParam{}, Required: []string{}},
			OutputSchema: &MCPOutputSchema{Type: "array", Description: "Array of symbol strings (e.g., btcusd, ethusd)"},
		},
		{
			Name:        "gemini_spot_symbol",
			Description: "Get details for a spot trading pair including min order size and tick size.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"symbol": {Type: "string", Description: "Trading pair (e.g., BTCUSD)", Example: "BTCUSD"},
				},
				Required: []string{"symbol"},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Symbol details with min_order_size, tick_size", Schema: "#/schemas/SpotSymbolDetails"},
		},
		{
			Name:        "gemini_balance",
			Description: "Get account balances for all currencies.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"currency": {Type: "string", Description: "Filter by currency (e.g., USD, BTC). Optional", Example: "USD"},
				},
				Required: []string{},
			},
			OutputSchema: &MCPOutputSchema{Type: "array", Description: "Balances with amount, available", Schema: "#/schemas/Balance"},
		},
		{
			Name:        "gemini_book",
			Description: "Get order book depth for any symbol (spot or prediction).",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"symbol": {Type: "string", Description: "Symbol (e.g., BTCUSD or GEMI-OSCARBP26-...)", Example: "BTCUSD"},
					"limit":  {Type: "string", Description: "Number of levels per side (default: 20)", Default: "20"},
				},
				Required: []string{"symbol"},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Bids and asks arrays", Schema: "#/schemas/OrderBook"},
		},
		{
			Name:        "gemini_analyze",
			Description: "Analyze spread and estimate slippage for a target order size.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"symbol":   {Type: "string", Description: "Symbol to analyze", Example: "BTCUSD"},
					"quantity": {Type: "string", Description: "Target order size for slippage estimation", Example: "1.0"},
				},
				Required: []string{"symbol"},
			},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "Spread, slippage estimates, liquidity analysis"},
		},
		{
			Name:         "gemini_status",
			Description:  "Check API health and connectivity.",
			InputSchema:  MCPInputSchema{Type: "object", Properties: map[string]MCPParam{}, Required: []string{}},
			OutputSchema: &MCPOutputSchema{Type: "object", Description: "API status"},
		},
		{
			Name:        "gemini_candles",
			Description: "Get recent OHLCV candles for a symbol. Returns the most recent candles.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"symbol":   {Type: "string", Description: "Trading symbol (e.g., BTCUSD)", Example: "BTCUSD"},
					"interval": {Type: "string", Description: "Candle interval", Enum: []string{"1m", "5m", "15m", "30m", "1h", "6h", "1d"}, Default: "1h"},
					"limit":    {Type: "string", Description: "Number of candles (default: 50)", Default: "50"},
				},
				Required: []string{"symbol"},
			},
			OutputSchema: &MCPOutputSchema{Type: "array", Description: "OHLCV candles [timestamp, open, high, low, close, volume]"},
		},
		{
			Name:        "gemini_klines",
			Description: "Get historical OHLCV data with time range. Use for backtesting or historical analysis.",
			InputSchema: MCPInputSchema{
				Type: "object",
				Properties: map[string]MCPParam{
					"symbol":   {Type: "string", Description: "Trading symbol (e.g., BTCUSD)", Example: "BTCUSD"},
					"interval": {Type: "string", Description: "Candle interval", Enum: []string{"1m", "5m", "15m", "30m", "1h", "6h", "1d"}, Default: "1h"},
					"start":    {Type: "string", Description: "Start time (ISO 8601 or Unix timestamp)", Example: "2024-01-01T00:00:00Z"},
					"end":      {Type: "string", Description: "End time (ISO 8601 or Unix timestamp)", Example: "2024-01-07T00:00:00Z"},
					"limit":    {Type: "string", Description: "Max candles to return", Default: "500"},
				},
				Required: []string{"symbol"},
			},
			OutputSchema: &MCPOutputSchema{Type: "array", Description: "OHLCV candles with timestamps"},
		},
	}
}

func BuildOpenAIFunctions(mcpTools []MCPTool) []OpenAIFunction {
	functions := make([]OpenAIFunction, 0, len(mcpTools))
	for _, tool := range mcpTools {
		properties := make(map[string]any)
		for name, param := range tool.InputSchema.Properties {
			prop := map[string]any{
				"type":        param.Type,
				"description": param.Description,
			}
			if len(param.Enum) > 0 {
				prop["enum"] = param.Enum
			}
			properties[name] = prop
		}

		functions = append(functions, OpenAIFunction{
			Name:        tool.Name,
			Description: tool.Description,
			Parameters: map[string]any{
				"type":       "object",
				"properties": properties,
				"required":   tool.InputSchema.Required,
			},
		})
	}
	return functions
}

func BuildAnthropicTools(mcpTools []MCPTool) []AnthropicTool {
	tools := make([]AnthropicTool, 0, len(mcpTools))
	for _, tool := range mcpTools {
		properties := make(map[string]any)
		for name, param := range tool.InputSchema.Properties {
			prop := map[string]any{
				"type":        param.Type,
				"description": param.Description,
			}
			if len(param.Enum) > 0 {
				prop["enum"] = param.Enum
			}
			properties[name] = prop
		}

		tools = append(tools, AnthropicTool{
			Name:        tool.Name,
			Description: tool.Description,
			InputSchema: map[string]any{
				"type":       "object",
				"properties": properties,
				"required":   tool.InputSchema.Required,
			},
		})
	}
	return tools
}
