package services

import (
	"regexp"
	"strings"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
)

// Sports event tickers use a stable market-family suffix followed by an
// optional contract outcome. Player props intentionally use the documented
// PP{STAT} grammar rather than a finite allowlist: the API can add a stat
// without changing the contest identity format.
var contestSuffixPattern = regexp.MustCompile(`-(M|S|T|TT|ML|SPREAD|TOTAL|REGS|REGT|1HS|1HT|2HS|2HT|1QS|1QT|2QS|2QT|3QS|3QT|4QS|4QT|WIN|T5|T10|T20|MC|A|CS|PP[A-Z0-9]+)(-[A-Z0-9]+)?$`)

// SportsContestCluster groups the prediction-market events that represent one
// sports contest. It is a domain view over generated Event models; the REST
// service continues to return the raw spec-shaped events.
type SportsContestCluster struct {
	ContestID   string
	Title       string
	Sport       predictions.SportsMarketSport
	Category    string
	Tags        []string
	Moneyline   *predictions.Event
	Spreads     []predictions.Event
	Totals      []predictions.Event
	TeamTotals  []predictions.Event
	PlayerProps []predictions.Event
	Outrights   []predictions.Event
	Events      []predictions.Event
	ByScope     map[predictions.SportsMarketScopeType][]predictions.Event
}

// NormalizeContestRoot converts an event ticker or contract symbol into a
// stable contest key. It accepts the GEMI-prefixed symbols used by the API and
// removes common market-type and outcome suffixes.
func NormalizeContestRoot(identifier string) string {
	clean := strings.TrimSpace(identifier)
	if len(clean) >= len("GEMI-") && strings.EqualFold(clean[:len("GEMI-")], "GEMI-") {
		clean = clean[len("GEMI-"):]
	}
	parts := strings.Split(clean, "-")
	if len(parts) >= 4 {
		switch strings.ToUpper(parts[len(parts)-2]) {
		case "WIN", "T5", "T10", "T20", "MC":
			return strings.Join([]string{parts[0], parts[1], parts[len(parts)-1]}, "-")
		}
	}
	return contestSuffixPattern.ReplaceAllString(clean, "")
}

// ExtractCleanContestTitle removes common market-family suffixes from an
// event title, preferring the moneyline event when one is available.
func ExtractCleanContestTitle(events []predictions.Event, moneyline *predictions.Event) string {
	title := ""
	if moneyline != nil && moneyline.Title != nil {
		title = *moneyline.Title
	} else {
		for i := range events {
			if events[i].Title != nil {
				title = *events[i].Title
				break
			}
		}
	}
	if title == "" {
		return ""
	}
	for _, suffix := range []string{
		": Total Points",
		": Point Spread",
		": Total Goals",
		": Spread",
		": Match Winner",
		" Winner",
		": Quarterback Passing Yards",
	} {
		if index := strings.Index(title, suffix); index >= 0 {
			return strings.TrimSpace(title[:index])
		}
	}
	if index := strings.IndexByte(title, ':'); index >= 0 {
		return strings.TrimSpace(title[:index])
	}
	return strings.TrimSpace(title)
}

// BuildSportsContestCluster groups related events into the Python SDK's
// moneyline/spread/total/prop/period view. Events without sports metadata are
// retained only when their category is Sports, matching the cross-SDK helper.
func BuildSportsContestCluster(contestID string, events []predictions.Event) SportsContestCluster {
	cluster := SportsContestCluster{
		ContestID: contestID,
		Category:  "Sports",
		Events:    append([]predictions.Event(nil), events...),
		ByScope:   make(map[predictions.SportsMarketScopeType][]predictions.Event),
	}
	if len(events) == 0 {
		return cluster
	}

	for i := range cluster.Events {
		event := cluster.Events[i]
		if event.SportsMarket != nil && cluster.Sport == "" {
			cluster.Sport = event.SportsMarket.Sport
		}
		if event.Tags != nil {
			for _, tag := range *event.Tags {
				if !containsString(cluster.Tags, tag) {
					cluster.Tags = append(cluster.Tags, tag)
				}
			}
		}
		if event.SportsMarket != nil {
			scope := event.SportsMarket.Scope.Type
			if scope != "" && scope != "full_contest" {
				cluster.ByScope[scope] = append(cluster.ByScope[scope], event)
			}
		}

		marketType := ""
		subject := ""
		if event.SportsMarket != nil {
			marketType = string(event.SportsMarket.Type)
			subject = string(event.SportsMarket.Subject)
		}
		contractCount := 0
		if event.Contracts != nil {
			contractCount = len(*event.Contracts)
		}

		switch {
		case marketType == "moneyline" || (subject == "contest" && marketType == "" && (contractCount == 2 || contractCount == 3)):
			if cluster.Moneyline == nil {
				cluster.Moneyline = &cluster.Events[i]
			}
		case marketType == "spread":
			cluster.Spreads = append(cluster.Spreads, event)
		case marketType == "total":
			if subject == "team" {
				cluster.TeamTotals = append(cluster.TeamTotals, event)
			} else {
				cluster.Totals = append(cluster.Totals, event)
			}
		case marketType == "futures" || (marketType == "prop" && (subject == "participant" || subject == "other") && strings.Contains(strings.ToUpper(eventTicker(event)), "WIN")):
			cluster.Outrights = append(cluster.Outrights, event)
		case subject == "player" || marketType == "prop":
			cluster.PlayerProps = append(cluster.PlayerProps, event)
		default:
			cluster.Outrights = append(cluster.Outrights, event)
		}
	}
	cluster.Title = ExtractCleanContestTitle(cluster.Events, cluster.Moneyline)
	return cluster
}

// ClusterSportsEvents groups sports events by normalized contest root while
// preserving the first-seen order of the roots.
func ClusterSportsEvents(events []predictions.Event) []SportsContestCluster {
	groups := make(map[string][]predictions.Event)
	order := make([]string, 0)
	for _, event := range events {
		if !isSportsEvent(event) {
			continue
		}
		root := NormalizeContestRoot(eventTicker(event))
		if _, exists := groups[root]; !exists {
			order = append(order, root)
		}
		groups[root] = append(groups[root], event)
	}
	clusters := make([]SportsContestCluster, 0, len(order))
	for _, root := range order {
		clusters = append(clusters, BuildSportsContestCluster(root, groups[root]))
	}
	return clusters
}

// ResolveSportsContest resolves an event, contract symbol, contest root, or
// search result from an already-fetched event set. It deliberately performs no
// network requests; callers can use PredictionsService.GetEvents or one of the
// specialized list methods to obtain candidates first.
func ResolveSportsContest(events []predictions.Event, identifier string) (*SportsContestCluster, bool) {
	if strings.TrimSpace(identifier) == "" {
		return nil, false
	}
	root := NormalizeContestRoot(identifier)
	for _, event := range events {
		if isSportsEvent(event) && eventHasDirectContractMatch(event, identifier) {
			root = NormalizeContestRoot(eventTicker(event))
			break
		}
	}
	matching := make([]predictions.Event, 0)
	for _, event := range events {
		if isSportsEvent(event) && strings.EqualFold(NormalizeContestRoot(eventTicker(event)), root) {
			matching = append(matching, event)
		}
	}
	if len(matching) == 0 {
		return nil, false
	}
	actualRoot := NormalizeContestRoot(eventTicker(matching[0]))
	cluster := BuildSportsContestCluster(actualRoot, matching)
	return &cluster, true
}

func isSportsEvent(event predictions.Event) bool {
	return event.SportsMarket != nil || (event.Category != nil && strings.EqualFold(*event.Category, "sports"))
}

func eventTicker(event predictions.Event) string {
	if event.Ticker == nil {
		return ""
	}
	return *event.Ticker
}

func eventHasDirectContractMatch(event predictions.Event, identifier string) bool {
	if event.Contracts == nil {
		return false
	}
	for _, contract := range *event.Contracts {
		for _, candidate := range []*string{contract.InstrumentSymbol, contract.Ticker} {
			if candidate != nil && strings.EqualFold(strings.TrimSpace(*candidate), strings.TrimSpace(identifier)) {
				return true
			}
		}
	}
	return false
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
