package main

import (
	"testing"

	"gopkg.in/yaml.v3"
)

type websocketCoverage struct {
	method string
	reason string
}

var sdkWebSocketCoverage = map[string]websocketCoverage{
	"stream:{symbol}@bookTicker": {method: "websocket.Client.SubscribeBookTicker"},
	"stream:{symbol}@depth":      {method: "websocket.Client.SubscribeDepth"},
	"stream:{symbol}@trade":      {method: "websocket.Client.SubscribeTrades"},
	"stream:contractStatus":      {method: "websocket.Client.SubscribeContractStatus"},
	"stream:orders@account":      {method: "websocket.Client.SubscribeOrderEvents"},
	"stream:balances@account":    {method: "websocket.Client.SubscribeBalances"},
	"stream:positions@account":   {method: "websocket.Client.SubscribePositions"},
	"stream:settlements@account": {method: "websocket.Client.SubscribeSettlements"},

	"stream:{symbol}@depth5":         {method: "websocket.Client.SubscribePartialDepth"},
	"stream:{symbol}@depth10":        {method: "websocket.Client.SubscribePartialDepth"},
	"stream:{symbol}@depth20":        {method: "websocket.Client.SubscribePartialDepth"},
	"stream:{symbol}@depth5@100ms":   {method: "websocket.Client.SubscribePartialDepth"},
	"stream:{symbol}@depth10@100ms":  {method: "websocket.Client.SubscribePartialDepth"},
	"stream:{symbol}@depth20@100ms":  {method: "websocket.Client.SubscribePartialDepth"},
	"stream:{symbol}@depth@100ms":    {method: "websocket.Client.SubscribeDepthWithOptions"},
	"stream:orders@session":          {method: "websocket.Client.SubscribeOrderEventsWithScope"},
	"stream:balances@account@1s":     {method: "websocket.Client.SubscribeBalancesWithOptions"},
	"stream:positions@account@1s":    {method: "websocket.Client.SubscribePositionsWithOptions"},
	"stream:requestForQuote":         {method: "websocket.Client.SubscribeRFQEvents"},
	"stream:requestForQuote@account": {method: "websocket.Client.SubscribeRFQDeliveries"},
	"stream:requestForQuote@session": {method: "websocket.Client.SubscribeRFQDeliveries"},

	"method:conninfo":             {method: "websocket.Client.ConnInfo"},
	"method:ping":                 {method: "websocket.Client.Ping"},
	"method:time":                 {method: "websocket.Client.Time"},
	"method:SUBSCRIBE":            {method: "websocket.Client.SubscribeStreams"},
	"method:subscribe":            {method: "websocket.Client.SubscribeStreams"},
	"method:UNSUBSCRIBE":          {method: "websocket.Client.UnsubscribeStreams"},
	"method:unsubscribe":          {method: "websocket.Client.UnsubscribeStreams"},
	"method:LIST_SUBSCRIPTIONS":   {method: "websocket.Client.ListSubscriptions"},
	"method:list_subscriptions":   {method: "websocket.Client.ListSubscriptions"},
	"method:depth":                {method: "websocket.Client.GetDepthSnapshot"},
	"method:order.place":          {method: "websocket.Client.PlaceOrder"},
	"method:order.cancel":         {method: "websocket.Client.CancelOrder"},
	"method:order.cancel_all":     {method: "websocket.Client.CancelAllOrders"},
	"method:order.cancel_session": {method: "websocket.Client.CancelSessionOrders"},
	"method:rfq.submit_quote":     {method: "websocket.Client.SubmitRFQQuote"},
	"method:rfq.withdraw_quote":   {method: "websocket.Client.WithdrawRFQQuote"},
	"method:rfq.confirm_quote":    {method: "websocket.Client.ConfirmRFQQuote"},
}

func TestAsyncAPIWebSocketCoverageManifest(t *testing.T) {
	specURL := websocketSpecURL
	raw, err := loadPublishedSpec(specURL)
	if err != nil {
		t.Fatalf("reading websocket spec %s: %v", specURL, err)
	}
	var root struct {
		XGeminiCoverage struct {
			Streams []struct {
				Name string `yaml:"name"`
			} `yaml:"streams"`
			Methods []struct {
				Name string `yaml:"name"`
			} `yaml:"methods"`
		} `yaml:"x-gemini-coverage"`
	}
	if err := yaml.Unmarshal(raw, &root); err != nil {
		t.Fatalf("unmarshaling websocket spec: %v", err)
	}

	seen := make(map[string]struct{})
	for _, stream := range root.XGeminiCoverage.Streams {
		key := "stream:" + stream.Name
		seen[key] = struct{}{}
		assertWebSocketCoverage(t, key)
	}
	for _, method := range root.XGeminiCoverage.Methods {
		key := "method:" + method.Name
		seen[key] = struct{}{}
		assertWebSocketCoverage(t, key)
	}
	for key := range sdkWebSocketCoverage {
		if _, ok := seen[key]; !ok {
			t.Errorf("WebSocket coverage entry %q does not match the current spec", key)
		}
	}
	if len(seen) == 0 {
		t.Fatal("no WebSocket coverage entries found in spec")
	}
	t.Logf("classified %d WebSocket streams and methods", len(seen))
}

func assertWebSocketCoverage(t *testing.T, key string) {
	t.Helper()
	coverage, ok := sdkWebSocketCoverage[key]
	if !ok {
		t.Errorf("WebSocket operation %q is missing from the SDK coverage manifest", key)
		return
	}
	if (coverage.method == "") == (coverage.reason == "") {
		t.Errorf("WebSocket coverage entry %q must contain exactly one of method or reason", key)
	}
}
