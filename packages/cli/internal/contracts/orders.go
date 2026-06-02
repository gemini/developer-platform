package contracts

type PredictPlaceDryRun struct {
	DryRun            bool   `json:"dry_run"`
	Action            string `json:"action"`
	Symbol            string `json:"symbol"`
	Side              string `json:"side"`
	Outcome           string `json:"outcome"`
	Type              string `json:"type"`
	Quantity          string `json:"quantity"`
	Price             string `json:"price"`
	TimeInForce       string `json:"time_in_force"`
	ClientOrderID     string `json:"client_order_id"`
	StopPrice         string `json:"stop_price,omitempty"`
	MakerOrCancel     bool   `json:"maker_or_cancel,omitempty"`
	DollarBudget      string `json:"dollar_budget,omitempty"`
	SizingMethod      string `json:"sizing_method,omitempty"`
	FeeType           string `json:"fee_type,omitempty"`
	FeeRate           string `json:"fee_rate,omitempty"`
	FeesIncluded      bool   `json:"fees_included,omitempty"`
	EstimatedNotional string `json:"estimated_notional,omitempty"`
	EstimatedFee      string `json:"estimated_fee,omitempty"`
	EstimatedTotal    string `json:"estimated_total,omitempty"`
	EstimatedNet      string `json:"estimated_net,omitempty"`
}

type SpotPlaceDryRun struct {
	DryRun        bool     `json:"dry_run"`
	Action        string   `json:"action"`
	Symbol        string   `json:"symbol"`
	Side          string   `json:"side"`
	Type          string   `json:"type"`
	Amount        string   `json:"amount"`
	Price         string   `json:"price"`
	ClientOrderID string   `json:"client_order_id"`
	StopPrice     string   `json:"stop_price,omitempty"`
	Options       []string `json:"options,omitempty"`
	Account       string   `json:"account,omitempty"`
}

type CancelAllDryRun struct {
	DryRun     bool   `json:"dry_run"`
	Action     string `json:"action"`
	OrderCount int    `json:"order_count"`
	Orders     any    `json:"orders"`
}

type CancelAllResponse struct {
	CanceledOrders []string `json:"canceled_orders"`
}
