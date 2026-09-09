package cli

import (
	"bytes"
	"context"
	"reflect"
	"strings"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/marketdata"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/spf13/cobra"
)

type publicFakeServices struct {
	book        *marketdata.OrderBook
	symbols     []string
	candles     marketdata.CandleResponse
	events      *predictions.EventsResponse
	termsStatus *predictions.PredictionMarketsTermsStatus
	terms       *predictions.PredictionMarketsTerms
	termsAccept *predictions.AcceptPredictionMarketsTermsResponse

	bookSymbol      string
	bookBids        int
	bookAsks        int
	eventParam      *predictions.ListEventsParams
	candleSymbol    string
	candleTimeframe string
}

func (f *publicFakeServices) GetSymbols(context.Context) ([]string, error) { return f.symbols, nil }

func (f *publicFakeServices) GetTicker(context.Context, string) (*marketdata.Ticker, error) {
	return &marketdata.Ticker{}, nil
}

func (f *publicFakeServices) GetOrderBook(_ context.Context, symbol string, bids, asks int) (*marketdata.OrderBook, error) {
	f.bookSymbol, f.bookBids, f.bookAsks = symbol, bids, asks
	return f.book, nil
}

func (f *publicFakeServices) GetCandles(_ context.Context, symbol, timeframe string) (marketdata.CandleResponse, error) {
	f.candleSymbol, f.candleTimeframe = symbol, timeframe
	return f.candles, nil
}

func (f *publicFakeServices) GetEvents(_ context.Context, params *predictions.ListEventsParams) (*predictions.EventsResponse, error) {
	f.eventParam = params
	return f.events, nil
}

func (f *publicFakeServices) GetEvent(context.Context, string) (*predictions.Event, error) {
	return &predictions.Event{}, nil
}

type predictionFake struct {
	*publicFakeServices
}

func (f *predictionFake) GetTermsStatus(context.Context) (*predictions.PredictionMarketsTermsStatus, error) {
	return f.termsStatus, nil
}

func (f *predictionFake) GetTerms(context.Context) (*predictions.PredictionMarketsTerms, error) {
	return f.terms, nil
}

func (f *predictionFake) AcceptTerms(context.Context) (*predictions.AcceptPredictionMarketsTermsResponse, error) {
	return f.termsAccept, nil
}

func testPublicRoot(out *bytes.Buffer, factory PublicServiceFactory) *cobra.Command {
	root := newTestRootCommand(out, out)
	root.AddCommand(NewMarketsCommand(factory), NewPredictionMarketsCommand(factory))
	return root
}

func TestMarketsBookMapsLimitsAndRendersTable(t *testing.T) {
	var out bytes.Buffer
	fake := &publicFakeServices{book: &marketdata.OrderBook{}}
	root := testPublicRoot(&out, func(context.Context, GlobalOptions) (PublicServices, error) {
		return PublicServices{MarketData: fake}, nil
	})
	root.SetArgs([]string{"markets", "book", "BTCUSD", "--limit-bids", "2", "--limit-asks", "3"})
	if err := root.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if fake.bookSymbol != "BTCUSD" || fake.bookBids != 2 || fake.bookAsks != 3 {
		t.Fatalf("book request = (%q, %d, %d)", fake.bookSymbol, fake.bookBids, fake.bookAsks)
	}
	if !strings.Contains(out.String(), "SIDE") {
		t.Fatalf("table output = %q, want SIDE header", out.String())
	}
}

func TestPredictionListMapsSDKRequestTypes(t *testing.T) {
	var out bytes.Buffer
	fake := &predictionFake{publicFakeServices: &publicFakeServices{events: &predictions.EventsResponse{}}}
	root := testPublicRoot(&out, func(context.Context, GlobalOptions) (PublicServices, error) {
		return PublicServices{Predictions: fake}, nil
	})
	root.SetArgs([]string{
		"prediction-markets", "list", "--status", "active", "--category", "Sports", "--sport", "soccer",
		"--sports-market-type", "moneyline", "--sports-market-subject", "contest", "--sports-market-scope", "game",
		"--sports-market-metric", "goals", "--search", "final", "--limit", "25", "--offset", "5",
	})
	if err := root.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if fake.eventParam == nil {
		t.Fatal("GetEvents received nil params")
	}
	wantStatuses := []predictions.MarketStatus{predictions.MarketStatusActive}
	if !reflect.DeepEqual(*fake.eventParam.Status, wantStatuses) || *fake.eventParam.Category == nil || (*fake.eventParam.Category)[0] != "Sports" {
		t.Fatalf("event params = %#v", fake.eventParam)
	}
	wantSports := predictions.SportFilter{predictions.Soccer}
	wantMarketTypes := predictions.SportsMarketTypeFilter{predictions.SportsMarketTypeMoneyline}
	wantSubjects := predictions.SportsMarketSubjectFilter{predictions.SportsMarketSubjectContest}
	wantScopes := predictions.SportsMarketScopeFilter{predictions.SportsMarketScopeTypeGame}
	wantMetrics := predictions.SportsMarketMetricFilter{predictions.SportsMarketMetricGoals}
	if fake.eventParam.Sport == nil || !reflect.DeepEqual(*fake.eventParam.Sport, wantSports) ||
		fake.eventParam.SportsMarketType == nil || !reflect.DeepEqual(*fake.eventParam.SportsMarketType, wantMarketTypes) ||
		fake.eventParam.SportsMarketSubject == nil || !reflect.DeepEqual(*fake.eventParam.SportsMarketSubject, wantSubjects) ||
		fake.eventParam.SportsMarketScope == nil || !reflect.DeepEqual(*fake.eventParam.SportsMarketScope, wantScopes) ||
		fake.eventParam.SportsMarketMetric == nil || !reflect.DeepEqual(*fake.eventParam.SportsMarketMetric, wantMetrics) {
		t.Fatalf("sports-market filters = %#v", fake.eventParam)
	}
	if fake.eventParam.Limit == nil || *fake.eventParam.Limit != 25 || fake.eventParam.Offset == nil || *fake.eventParam.Offset != 5 {
		t.Fatalf("pagination params = %#v", fake.eventParam)
	}
	if fake.eventParam.Search == nil || *fake.eventParam.Search != "final" {
		t.Fatalf("search params = %#v", fake.eventParam)
	}
}

func TestPredictionListRejectsInvalidEnumFilters(t *testing.T) {
	tests := []struct {
		name  string
		flag  string
		value string
	}{
		{name: "sport", flag: "--sport", value: "not-a-sport"},
		{name: "sports-market-type", flag: "--sports-market-type", value: "not-a-type"},
		{name: "sports-market-subject", flag: "--sports-market-subject", value: "not-a-subject"},
		{name: "sports-market-scope", flag: "--sports-market-scope", value: "not-a-scope"},
		{name: "sports-market-metric", flag: "--sports-market-metric", value: "not-a-metric"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var out bytes.Buffer
			fake := &predictionFake{publicFakeServices: &publicFakeServices{events: &predictions.EventsResponse{}}}
			root := testPublicRoot(&out, func(context.Context, GlobalOptions) (PublicServices, error) {
				return PublicServices{Predictions: fake}, nil
			})
			root.SetArgs([]string{"prediction-markets", "list", test.flag, test.value})
			err := root.Execute()
			if err == nil || !strings.Contains(err.Error(), "invalid "+test.name) {
				t.Fatalf("Execute() error = %v, want invalid %s", err, test.name)
			}
			if fake.eventParam != nil {
				t.Fatalf("GetEvents called with params = %#v", fake.eventParam)
			}
		})
	}
}

func TestPublicSymbolsJSONOutput(t *testing.T) {
	var out bytes.Buffer
	fake := &publicFakeServices{symbols: []string{"BTCUSD", "ETHUSD"}}
	root := testPublicRoot(&out, func(context.Context, GlobalOptions) (PublicServices, error) {
		return PublicServices{MarketData: fake}, nil
	})
	root.SetArgs([]string{"--output", "json", "markets", "symbols"})
	if err := root.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if !strings.Contains(out.String(), `"BTCUSD"`) || !strings.Contains(out.String(), `"ETHUSD"`) {
		t.Fatalf("JSON output = %q", out.String())
	}
}

func TestCandlesValidatesOfficialTimeframes(t *testing.T) {
	tests := map[string]string{
		"1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
		"1h": "1hr", "1hr": "1hr", "6h": "6hr", "6hr": "6hr",
		"1d": "1day", "1day": "1day",
	}
	for input, want := range tests {
		t.Run(input, func(t *testing.T) {
			var out bytes.Buffer
			fake := &publicFakeServices{candles: marketdata.CandleResponse{{1, 2, 3, 4, 5, 6}}}
			root := testPublicRoot(&out, func(context.Context, GlobalOptions) (PublicServices, error) {
				return PublicServices{MarketData: fake}, nil
			})
			root.SetArgs([]string{"markets", "candles", "BTCUSD", input})
			if err := root.Execute(); err != nil {
				t.Fatalf("Execute() error = %v", err)
			}
			if fake.candleSymbol != "BTCUSD" || fake.candleTimeframe != want {
				t.Fatalf("candle request = (%q, %q), want (BTCUSD, %s)", fake.candleSymbol, fake.candleTimeframe, want)
			}
		})
	}

	var out bytes.Buffer
	root := testPublicRoot(&out, func(context.Context, GlobalOptions) (PublicServices, error) {
		return PublicServices{MarketData: &publicFakeServices{}}, nil
	})
	root.SetArgs([]string{"markets", "candles", "BTCUSD", "2h"})
	if err := root.Execute(); err == nil || !strings.Contains(err.Error(), "invalid timeframe") {
		t.Fatalf("Execute() error = %v, want invalid timeframe", err)
	}
}

func TestPredictionTermsCommandsUseExplicitSDKMethods(t *testing.T) {
	var out bytes.Buffer
	fake := &predictionFake{publicFakeServices: &publicFakeServices{
		termsStatus: &predictions.PredictionMarketsTermsStatus{HasAcceptedLatest: false},
		terms:       &predictions.PredictionMarketsTerms{Version: 3, TermsType: "prediction", Content: "Terms content"},
		termsAccept: &predictions.AcceptPredictionMarketsTermsResponse{Success: true},
	}}
	root := testPublicRoot(&out, func(context.Context, GlobalOptions) (PublicServices, error) {
		return PublicServices{Predictions: fake}, nil
	})
	root.SetArgs([]string{"prediction-markets", "terms", "show"})
	if err := root.Execute(); err != nil {
		t.Fatalf("show Execute() error = %v", err)
	}
	if !strings.Contains(out.String(), "Terms content") || !strings.Contains(out.String(), "VERSION") {
		t.Fatalf("show output = %q", out.String())
	}

	out.Reset()
	root.SetArgs([]string{"prediction-markets", "terms", "status"})
	if err := root.Execute(); err != nil {
		t.Fatalf("status Execute() error = %v", err)
	}
	if !strings.Contains(out.String(), "HAS_ACCEPTED_LATEST") {
		t.Fatalf("status output = %q", out.String())
	}

	out.Reset()
	root.SetArgs([]string{"prediction-markets", "terms", "accept", "--yes"})
	if err := root.Execute(); err != nil {
		t.Fatalf("accept Execute() error = %v", err)
	}
	if !strings.Contains(out.String(), "SUCCESS") {
		t.Fatalf("accept output = %q", out.String())
	}
}

func TestPredictionTermsAcceptRequiresExplicitConfirmation(t *testing.T) {
	var out bytes.Buffer
	called := false
	fake := &predictionFake{publicFakeServices: &publicFakeServices{termsAccept: &predictions.AcceptPredictionMarketsTermsResponse{Success: true}}}
	root := testPublicRoot(&out, func(context.Context, GlobalOptions) (PublicServices, error) {
		called = true
		return PublicServices{Predictions: fake}, nil
	})
	root.SetArgs([]string{"prediction-markets", "terms", "accept"})
	err := root.Execute()
	if err == nil || !strings.Contains(err.Error(), "requires --yes") {
		t.Fatalf("Execute() error = %v, want confirmation error", err)
	}
	if called {
		t.Fatal("service factory called before terms acceptance was confirmed")
	}
}

func TestPredictionTermsUsePublicReadAndAuthenticatedStateFactories(t *testing.T) {
	var out bytes.Buffer
	publicCalls, authenticatedCalls := 0, 0
	publicFake := &predictionFake{publicFakeServices: &publicFakeServices{
		terms: &predictions.PredictionMarketsTerms{Version: 3, Content: "Terms content"},
	}}
	authenticatedFake := &predictionFake{publicFakeServices: &publicFakeServices{
		termsStatus: &predictions.PredictionMarketsTermsStatus{HasAcceptedLatest: true},
	}}
	publicFactory := func(context.Context, GlobalOptions) (PublicServices, error) {
		publicCalls++
		return PublicServices{Predictions: publicFake}, nil
	}
	authenticatedFactory := func(context.Context, GlobalOptions) (PublicServices, error) {
		authenticatedCalls++
		return PublicServices{Predictions: authenticatedFake}, nil
	}
	root := newTestRootCommand(&out, &out)
	root.AddCommand(newPublicPredictionMarketsCommand(publicFactory, authenticatedFactory))

	root.SetArgs([]string{"prediction-markets", "terms", "show"})
	if err := root.Execute(); err != nil {
		t.Fatalf("show Execute() error = %v", err)
	}
	root.SetArgs([]string{"prediction-markets", "terms", "status"})
	if err := root.Execute(); err != nil {
		t.Fatalf("status Execute() error = %v", err)
	}
	if publicCalls != 1 || authenticatedCalls != 1 {
		t.Fatalf("factory calls = public %d, authenticated %d; want 1 each", publicCalls, authenticatedCalls)
	}
}
