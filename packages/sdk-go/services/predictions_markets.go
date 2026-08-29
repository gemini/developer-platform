package services

import (
	"context"
	"net/url"
	"strconv"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
)

// GetEventStrike returns the strike metadata for an event.
func (s *PredictionsService) GetEventStrike(ctx context.Context, eventTicker string) (*predictions.Strike, error) {
	var res predictions.Strike
	if err := s.public.get(ctx, "/v1/prediction-markets/events/"+url.PathEscape(eventTicker)+"/strike", &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ListNewlyListedEvents returns events created in the last 24 hours.
func (s *PredictionsService) ListNewlyListedEvents(ctx context.Context, params *predictions.ListNewlyListedEventsParams) (*predictions.EventsResponse, error) {
	var res predictions.EventsResponse
	if err := s.public.get(ctx, withQuery("/v1/prediction-markets/events/newly-listed", listNewlyListedEventsQuery(params)), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ListRecentlySettledEvents returns events settled in the last 24 hours.
func (s *PredictionsService) ListRecentlySettledEvents(ctx context.Context, params *predictions.ListRecentlySettledEventsParams) (*predictions.EventsResponse, error) {
	var res predictions.EventsResponse
	if err := s.public.get(ctx, withQuery("/v1/prediction-markets/events/recently-settled", listRecentlySettledEventsQuery(params)), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ListUpcomingEvents returns approved events that have not started yet.
func (s *PredictionsService) ListUpcomingEvents(ctx context.Context, params *predictions.ListUpcomingEventsParams) (*predictions.EventsResponse, error) {
	var res predictions.EventsResponse
	if err := s.public.get(ctx, withQuery("/v1/prediction-markets/events/upcoming", listUpcomingEventsQuery(params)), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetDailyVolume returns prediction-market volume by category for a completed
// UTC day in YYYY-MM-DD format.
func (s *PredictionsService) GetDailyVolume(ctx context.Context, date string) ([]predictions.PredictionMarketVolumeCategory, error) {
	var res []predictions.PredictionMarketVolumeCategory
	if err := s.public.get(ctx, "/v1/prediction-markets/volume/"+url.PathEscape(date), &res); err != nil {
		return nil, err
	}
	return res, nil
}

// GetHourlyVolume returns prediction-market volume by category and UTC hour
// for a completed UTC day in YYYY-MM-DD format.
func (s *PredictionsService) GetHourlyVolume(ctx context.Context, date string) ([]predictions.PredictionMarketHourlyVolumeCategory, error) {
	var res []predictions.PredictionMarketHourlyVolumeCategory
	if err := s.public.get(ctx, "/v1/prediction-markets/volume/"+url.PathEscape(date)+"/hourly", &res); err != nil {
		return nil, err
	}
	return res, nil
}

func listNewlyListedEventsQuery(params *predictions.ListNewlyListedEventsParams) url.Values {
	if params == nil {
		return url.Values{}
	}
	return listSportsEventsQuery(params.Category, params.Sport, params.SportsMarketType, params.SportsMarketSubject, params.SportsMarketScope, params.SportsMarketMetric, params.Limit, params.Offset)
}

func listRecentlySettledEventsQuery(params *predictions.ListRecentlySettledEventsParams) url.Values {
	if params == nil {
		return url.Values{}
	}
	return listSportsEventsQuery(params.Category, params.Sport, params.SportsMarketType, params.SportsMarketSubject, params.SportsMarketScope, params.SportsMarketMetric, params.Limit, params.Offset)
}

func listUpcomingEventsQuery(params *predictions.ListUpcomingEventsParams) url.Values {
	if params == nil {
		return url.Values{}
	}
	return listSportsEventsQuery(params.Category, params.Sport, params.SportsMarketType, params.SportsMarketSubject, params.SportsMarketScope, params.SportsMarketMetric, params.Limit, params.Offset)
}

func listSportsEventsQuery(categories *[]string, sports *predictions.SportFilter, marketTypes *predictions.SportsMarketTypeFilter, subjects *predictions.SportsMarketSubjectFilter, scopes *predictions.SportsMarketScopeFilter, metrics *predictions.SportsMarketMetricFilter, limit, offset *int) url.Values {
	q := url.Values{}
	addSportsMarketFilters(q, categories, sports, marketTypes, subjects, scopes, metrics)
	addLimitOffset(q, limit, offset)
	return q
}

func addSportsMarketFilters(q url.Values, categories *[]string, sports *predictions.SportFilter, marketTypes *predictions.SportsMarketTypeFilter, subjects *predictions.SportsMarketSubjectFilter, scopes *predictions.SportsMarketScopeFilter, metrics *predictions.SportsMarketMetricFilter) {
	for _, category := range valueOrEmpty(categories) {
		q.Add("category", category)
	}
	for _, sport := range valueOrEmpty(sports) {
		q.Add("sport", string(sport))
	}
	for _, marketType := range valueOrEmpty(marketTypes) {
		q.Add("sports_market_type", string(marketType))
	}
	for _, subject := range valueOrEmpty(subjects) {
		q.Add("sports_market_subject", string(subject))
	}
	for _, scope := range valueOrEmpty(scopes) {
		q.Add("sports_market_scope", string(scope))
	}
	for _, metric := range valueOrEmpty(metrics) {
		q.Add("sports_market_metric", string(metric))
	}
}

func addLimitOffset(q url.Values, limit, offset *int) {
	if limit != nil {
		q.Set("limit", strconv.Itoa(*limit))
	}
	if offset != nil {
		q.Set("offset", strconv.Itoa(*offset))
	}
}

func withQuery(path string, q url.Values) string {
	if len(q) == 0 {
		return path
	}
	return path + "?" + q.Encode()
}
