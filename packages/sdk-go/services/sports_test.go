package services_test

import (
	"reflect"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/gemini/developer-platform/packages/sdk-go/services"
)

func TestNormalizeContestRoot(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"GEMI-NBA-2026-LAL-BOS-M", "NBA-2026-LAL-BOS"},
		{"NBA-2026-LAL-BOS-SPREAD-3", "NBA-2026-LAL-BOS"},
		{"NBA-2026-LAL-BOS-PPYDS-25", "NBA-2026-LAL-BOS"},
		{"NBA-2026-LAL-BOS-PPPTS-25", "NBA-2026-LAL-BOS"},
		{"NBA-2026-LAL-BOS-PPREB-8", "NBA-2026-LAL-BOS"},
		{"NBA-2026-LAL-BOS-PPAST-7", "NBA-2026-LAL-BOS"},
		{"NBA-2026-LAL-BOS-PP3PM-3", "NBA-2026-LAL-BOS"},
		{"NFL-2026-KC-SF-PPRYDS-50", "NFL-2026-KC-SF"},
		{"EPL-2026-ARS-CHE-A-ARS", "EPL-2026-ARS-CHE"},
		{"FIFAWC-2026-BRA-ARG-CS-BRA21", "FIFAWC-2026-BRA-ARG"},
		{"  GEMI-NFL-2026-KC-SF-WIN-KC ", "NFL-2026-KC"},
		{"NBA-2026-LAL-BOS", "NBA-2026-LAL-BOS"},
	}
	for _, test := range tests {
		t.Run(test.input, func(t *testing.T) {
			if got := services.NormalizeContestRoot(test.input); got != test.want {
				t.Fatalf("NormalizeContestRoot(%q) = %q, want %q", test.input, got, test.want)
			}
		})
	}
}

func TestClusterSportsEvents(t *testing.T) {
	category := "Sports"
	tags := []string{"NBA", "Basketball"}
	titleMoneyline := "Lakers vs Celtics: Match Winner"
	titleSpread := "Lakers vs Celtics: Point Spread"
	titleProp := "Lakers vs Celtics: Player Points"
	moneylineTicker := "GEMI-NBA-2026-LAL-BOS-M"
	spreadTicker := "GEMI-NBA-2026-LAL-BOS-SPREAD-3"
	propTicker := "GEMI-NBA-2026-LAL-BOS-PPYDS-25"
	contractSymbol := "GEMI-NBA-2026-LAL-BOS-LAL"

	events := []predictions.Event{
		{
			Category: &category, Ticker: &moneylineTicker, Title: &titleMoneyline, Tags: &tags,
			Contracts: &[]predictions.Contract{{InstrumentSymbol: &contractSymbol}, {}},
			SportsMarket: &predictions.SportsMarket{
				Sport: predictions.Basketball, Type: predictions.SportsMarketTypeMoneyline,
				Subject: predictions.SportsMarketSubjectContest,
				Scope:   predictions.SportsMarketScope{Type: predictions.SportsMarketScopeTypeFullContest},
			},
		},
		{
			Category: &category, Ticker: &spreadTicker, Title: &titleSpread, Tags: &tags,
			SportsMarket: &predictions.SportsMarket{
				Sport: predictions.Basketball, Type: predictions.SportsMarketTypeSpread,
				Subject: predictions.SportsMarketSubjectContest,
				Scope:   predictions.SportsMarketScope{Type: predictions.SportsMarketScopeTypeGame},
			},
		},
		{
			Category: &category, Ticker: &propTicker, Title: &titleProp,
			SportsMarket: &predictions.SportsMarket{
				Sport: predictions.Basketball, Type: predictions.SportsMarketTypeProp,
				Subject: predictions.SportsMarketSubjectPlayer,
				Scope:   predictions.SportsMarketScope{Type: predictions.SportsMarketScopeTypeGame},
			},
		},
		{Category: stringPointer("Crypto"), Ticker: stringPointer("BTC-PRICE-M")},
	}

	clusters := services.ClusterSportsEvents(events)
	if len(clusters) != 1 {
		t.Fatalf("expected one sports cluster, got %d", len(clusters))
	}
	cluster := clusters[0]
	if cluster.Title != "Lakers vs Celtics" || cluster.Sport != predictions.Basketball || cluster.Moneyline == nil {
		t.Fatalf("unexpected cluster identity: %+v", cluster)
	}
	if len(cluster.Spreads) != 1 || len(cluster.PlayerProps) != 1 || len(cluster.ByScope[predictions.SportsMarketScopeTypeGame]) != 2 {
		t.Fatalf("unexpected cluster buckets: %+v", cluster)
	}
	if !reflect.DeepEqual(cluster.Tags, []string{"NBA", "Basketball"}) {
		t.Fatalf("unexpected deduplicated tags: %v", cluster.Tags)
	}

	resolved, ok := services.ResolveSportsContest(events, "GEMI-NBA-2026-LAL-BOS-SPREAD-3")
	if !ok || resolved == nil || resolved.ContestID != "NBA-2026-LAL-BOS" || len(resolved.Events) != 3 {
		t.Fatalf("ResolveSportsContest failed: ok=%v cluster=%+v", ok, resolved)
	}
	if resolved, ok := services.ResolveSportsContest(events, contractSymbol); !ok || resolved == nil || len(resolved.Events) != 3 {
		t.Fatalf("contract-symbol resolution failed: ok=%v cluster=%+v", ok, resolved)
	}
	if _, ok := services.ResolveSportsContest(events, "NFL-2026-KC-SF"); ok {
		t.Fatal("expected unknown contest to remain unresolved")
	}
}

func TestExtractCleanContestTitle(t *testing.T) {
	title := "French Open: Total Games"
	event := predictions.Event{Title: &title}
	if got := services.ExtractCleanContestTitle([]predictions.Event{event}, nil); got != "French Open" {
		t.Fatalf("unexpected cleaned title: %q", got)
	}
}
