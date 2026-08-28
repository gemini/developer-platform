package services

import (
	"context"
	"errors"
	"fmt"
	"iter"

	"github.com/gemini/gemini-go/generated/predictions"
	"github.com/gemini/gemini-go/transport"
)

// ErrTimeBoundedOrderHistoryPagination indicates that an iterator was asked
// to use offset pagination with a date-bounded order-history request. The API
// ignores offset when either bound is present, so advancing offset would
// repeatedly return the same page.
var ErrTimeBoundedOrderHistoryPagination = errors.New("gemini predictions: time-bounded order history cannot be offset-paginated")

// ErrInvalidPagination indicates that a caller supplied an invalid offset or
// limit to a lazy prediction-market iterator.
var ErrInvalidPagination = errors.New("gemini predictions: invalid pagination")

// IteratePositions lazily fetches all current positions using the endpoint's
// offset/limit pagination. The input filters are preserved for every page.
func (s *PredictionsService) IteratePositions(ctx context.Context, params *predictions.GetPositionsParams) iter.Seq2[predictions.Position, error] {
	base := predictions.GetPositionsParams{}
	if params != nil {
		base = *params
	}
	if err := validatePredictionPagination(base.Limit, base.Offset); err != nil {
		return paginationError[predictions.Position](err)
	}
	pageSize := predictionPageSize(base.Limit, 1000)
	initialOffset := predictionPageOffset(base.Offset)
	return newPredictionPaginator(ctx, initialOffset, pageSize, func(ctx context.Context, offset, limit int) ([]predictions.Position, bool, error) {
		page := base
		page.Limit = &limit
		page.Offset = &offset
		res, err := s.GetPositions(ctx, &page)
		if err != nil {
			return nil, false, err
		}
		items := dereferencePositions(res.Positions)
		return items, hasMoreByTotal(offset, len(items), res.Total, limit), nil
	})
}

// IterateSettledPositions lazily fetches all settled positions using the
// endpoint's offset/limit pagination.
func (s *PredictionsService) IterateSettledPositions(ctx context.Context, params *predictions.GetSettledPositionsParams) iter.Seq2[predictions.SettledPosition, error] {
	base := predictions.GetSettledPositionsParams{}
	if params != nil {
		base = *params
	}
	if err := validatePredictionPagination(base.Limit, base.Offset); err != nil {
		return paginationError[predictions.SettledPosition](err)
	}
	pageSize := predictionPageSize(base.Limit, 1000)
	initialOffset := predictionPageOffset(base.Offset)
	return newPredictionPaginator(ctx, initialOffset, pageSize, func(ctx context.Context, offset, limit int) ([]predictions.SettledPosition, bool, error) {
		page := base
		page.Limit = &limit
		page.Offset = &offset
		res, err := s.GetSettledPositions(ctx, &page)
		if err != nil {
			return nil, false, err
		}
		items := dereferenceSettledPositions(res.Positions)
		return items, hasMoreByTotal(offset, len(items), res.Total, limit), nil
	})
}

// IterateActiveOrders lazily fetches active prediction-market orders.
func (s *PredictionsService) IterateActiveOrders(ctx context.Context, params *predictions.GetActiveOrdersJSONRequestBody) iter.Seq2[predictions.OrderResponse, error] {
	base := predictions.GetActiveOrdersJSONRequestBody{}
	if params != nil {
		base = *params
	}
	if err := validatePredictionPagination(base.Limit, base.Offset); err != nil {
		return paginationError[predictions.OrderResponse](err)
	}
	pageSize := predictionPageSize(base.Limit, 100)
	initialOffset := predictionPageOffset(base.Offset)
	return newPredictionPaginator(ctx, initialOffset, pageSize, func(ctx context.Context, offset, limit int) ([]predictions.OrderResponse, bool, error) {
		page := base
		page.Limit = &limit
		page.Offset = &offset
		res, err := s.GetActiveOrders(ctx, &page)
		if err != nil {
			return nil, false, err
		}
		items := dereferenceOrders(res.Orders)
		return items, len(items) == limit, nil
	})
}

// IterateOrderHistory lazily fetches historical prediction-market orders. The
// API ignores offset when From or To is set, so time-bounded requests return
// ErrTimeBoundedOrderHistoryPagination instead of risking an infinite loop.
func (s *PredictionsService) IterateOrderHistory(ctx context.Context, params *predictions.GetOrderHistoryJSONRequestBody) iter.Seq2[predictions.OrderResponse, error] {
	base := predictions.GetOrderHistoryJSONRequestBody{}
	if params != nil {
		base = *params
	}
	if err := validatePredictionPagination(base.Limit, base.Offset); err != nil {
		return paginationError[predictions.OrderResponse](err)
	}
	if base.From != nil || base.To != nil {
		return func(yield func(predictions.OrderResponse, error) bool) {
			var zero predictions.OrderResponse
			yield(zero, ErrTimeBoundedOrderHistoryPagination)
		}
	}
	pageSize := predictionPageSize(base.Limit, 1000)
	initialOffset := predictionPageOffset(base.Offset)
	return newPredictionPaginator(ctx, initialOffset, pageSize, func(ctx context.Context, offset, limit int) ([]predictions.OrderResponse, bool, error) {
		page := base
		page.Limit = &limit
		page.Offset = &offset
		res, err := s.GetOrderHistory(ctx, &page)
		if err != nil {
			return nil, false, err
		}
		items := dereferenceOrders(res.Orders)
		return items, len(items) == limit, nil
	})
}

// IterateCombos lazily fetches combo contracts.
func (s *PredictionsService) IterateCombos(ctx context.Context, params *predictions.ListCombosParams) iter.Seq2[predictions.ComboResponse, error] {
	base := predictions.ListCombosParams{}
	if params != nil {
		base = *params
	}
	if err := validatePredictionPagination(base.Limit, base.Offset); err != nil {
		return paginationError[predictions.ComboResponse](err)
	}
	pageSize := predictionPageSize(base.Limit, 500)
	initialOffset := predictionPageOffset(base.Offset)
	return newPredictionPaginator(ctx, initialOffset, pageSize, func(ctx context.Context, offset, limit int) ([]predictions.ComboResponse, bool, error) {
		page := base
		page.Limit = &limit
		page.Offset = &offset
		res, err := s.ListCombos(ctx, &page)
		if err != nil {
			return nil, false, err
		}
		return res.Combos, hasMoreByTotal(offset, len(res.Combos), res.Pagination.Total, limit), nil
	})
}

// IterateEvents lazily fetches prediction-market events.
func (s *PredictionsService) IterateEvents(ctx context.Context, params *predictions.ListEventsParams) iter.Seq2[predictions.Event, error] {
	base := predictions.ListEventsParams{}
	if params != nil {
		base = *params
	}
	return s.iterateEvents(ctx, func(page *predictions.ListEventsParams) (*predictions.EventsResponse, error) {
		return s.GetEvents(ctx, page)
	}, base, 500)
}

// IterateNewlyListedEvents lazily fetches newly listed events.
func (s *PredictionsService) IterateNewlyListedEvents(ctx context.Context, params *predictions.ListNewlyListedEventsParams) iter.Seq2[predictions.Event, error] {
	base := predictions.ListNewlyListedEventsParams{}
	if params != nil {
		base = *params
	}
	return s.iterateEvents(ctx, func(page *predictions.ListEventsParams) (*predictions.EventsResponse, error) {
		converted := newlyListedParamsFromEventsParams(page)
		return s.ListNewlyListedEvents(ctx, converted)
	}, eventsParamsAsListEvents(base.Category, base.Sport, base.SportsMarketType, base.SportsMarketSubject, base.SportsMarketScope, base.SportsMarketMetric, base.Limit, base.Offset), 500)
}

// IterateRecentlySettledEvents lazily fetches recently settled events.
func (s *PredictionsService) IterateRecentlySettledEvents(ctx context.Context, params *predictions.ListRecentlySettledEventsParams) iter.Seq2[predictions.Event, error] {
	base := predictions.ListRecentlySettledEventsParams{}
	if params != nil {
		base = *params
	}
	return s.iterateEvents(ctx, func(page *predictions.ListEventsParams) (*predictions.EventsResponse, error) {
		converted := recentlySettledParamsFromEventsParams(page)
		return s.ListRecentlySettledEvents(ctx, converted)
	}, eventsParamsAsListEvents(base.Category, base.Sport, base.SportsMarketType, base.SportsMarketSubject, base.SportsMarketScope, base.SportsMarketMetric, base.Limit, base.Offset), 500)
}

// IterateUpcomingEvents lazily fetches upcoming events.
func (s *PredictionsService) IterateUpcomingEvents(ctx context.Context, params *predictions.ListUpcomingEventsParams) iter.Seq2[predictions.Event, error] {
	base := predictions.ListUpcomingEventsParams{}
	if params != nil {
		base = *params
	}
	return s.iterateEvents(ctx, func(page *predictions.ListEventsParams) (*predictions.EventsResponse, error) {
		converted := upcomingParamsFromEventsParams(page)
		return s.ListUpcomingEvents(ctx, converted)
	}, eventsParamsAsListEvents(base.Category, base.Sport, base.SportsMarketType, base.SportsMarketSubject, base.SportsMarketScope, base.SportsMarketMetric, base.Limit, base.Offset), 500)
}

// IterateLiquidityRewardsEvents lazily fetches liquidity-rewards events.
func (s *PredictionsService) IterateLiquidityRewardsEvents(ctx context.Context, params *predictions.ListLiquidityRewardsEventsParams) iter.Seq2[predictions.LiquidityRewardEvent, error] {
	base := predictions.ListLiquidityRewardsEventsParams{}
	if params != nil {
		base = *params
	}
	if err := validatePredictionPagination(base.Limit, base.Offset); err != nil {
		return paginationError[predictions.LiquidityRewardEvent](err)
	}
	pageSize := predictionPageSize(base.Limit, 100)
	initialOffset := predictionPageOffset(base.Offset)
	return newPredictionPaginator(ctx, initialOffset, pageSize, func(ctx context.Context, offset, limit int) ([]predictions.LiquidityRewardEvent, bool, error) {
		page := base
		page.Limit = &limit
		page.Offset = &offset
		res, err := s.ListLiquidityRewardsEvents(ctx, &page)
		if err != nil {
			return nil, false, err
		}
		return res.Events, hasMoreByTotal(offset, len(res.Events), res.Pagination.Total, limit), nil
	})
}

func (s *PredictionsService) iterateEvents(ctx context.Context, fetch func(*predictions.ListEventsParams) (*predictions.EventsResponse, error), base predictions.ListEventsParams, defaultPageSize int) iter.Seq2[predictions.Event, error] {
	if err := validatePredictionPagination(base.Limit, base.Offset); err != nil {
		return paginationError[predictions.Event](err)
	}
	pageSize := predictionPageSize(base.Limit, defaultPageSize)
	initialOffset := predictionPageOffset(base.Offset)
	return newPredictionPaginator(ctx, initialOffset, pageSize, func(_ context.Context, offset, limit int) ([]predictions.Event, bool, error) {
		page := base
		page.Limit = &limit
		page.Offset = &offset
		res, err := fetch(&page)
		if err != nil {
			return nil, false, err
		}
		items := dereferenceEvents(res.Data)
		return items, hasMoreByPagination(offset, len(items), res.Pagination, limit), nil
	})
}

func newPredictionPaginator[T any](ctx context.Context, initialOffset, pageSize int, fetch func(context.Context, int, int) ([]T, bool, error)) iter.Seq2[T, error] {
	return transport.NewPaginator(ctx, initialOffset, pageSize, transport.PageFetcher[T](fetch))
}

func predictionPageSize(value *int, defaultSize int) int {
	if value != nil && *value > 0 {
		return *value
	}
	return defaultSize
}

func predictionPageOffset(value *int) int {
	if value != nil && *value > 0 {
		return *value
	}
	return 0
}

func validatePredictionPagination(limit, offset *int) error {
	if limit != nil && *limit <= 0 {
		return fmt.Errorf("%w: limit must be positive", ErrInvalidPagination)
	}
	if offset != nil && *offset < 0 {
		return fmt.Errorf("%w: offset must be non-negative", ErrInvalidPagination)
	}
	return nil
}

func paginationError[T any](err error) iter.Seq2[T, error] {
	return func(yield func(T, error) bool) {
		var zero T
		yield(zero, err)
	}
}

func hasMoreByTotal(offset, count int, total *int, limit int) bool {
	if total != nil {
		return offset+count < *total
	}
	return count == limit
}

func hasMoreByPagination(offset, count int, pagination *predictions.Pagination, limit int) bool {
	if pagination != nil && pagination.Total != nil {
		return offset+count < *pagination.Total
	}
	return count == limit
}

func dereferencePositions(value *[]predictions.Position) []predictions.Position {
	if value == nil {
		return nil
	}
	return *value
}

func dereferenceSettledPositions(value *[]predictions.SettledPosition) []predictions.SettledPosition {
	if value == nil {
		return nil
	}
	return *value
}

func dereferenceOrders(value *[]predictions.OrderResponse) []predictions.OrderResponse {
	if value == nil {
		return nil
	}
	return *value
}

func dereferenceEvents(value *[]predictions.Event) []predictions.Event {
	if value == nil {
		return nil
	}
	return *value
}

func eventsParamsAsListEvents(category *[]string, sport *predictions.SportFilter, marketType *predictions.SportsMarketTypeFilter, subject *predictions.SportsMarketSubjectFilter, scope *predictions.SportsMarketScopeFilter, metric *predictions.SportsMarketMetricFilter, limit, offset *int) predictions.ListEventsParams {
	return predictions.ListEventsParams{
		Category:            category,
		Sport:               sport,
		SportsMarketType:    marketType,
		SportsMarketSubject: subject,
		SportsMarketScope:   scope,
		SportsMarketMetric:  metric,
		Limit:               limit,
		Offset:              offset,
	}
}

func newlyListedParamsFromEventsParams(params *predictions.ListEventsParams) *predictions.ListNewlyListedEventsParams {
	return &predictions.ListNewlyListedEventsParams{Category: params.Category, Sport: params.Sport, SportsMarketType: params.SportsMarketType, SportsMarketSubject: params.SportsMarketSubject, SportsMarketScope: params.SportsMarketScope, SportsMarketMetric: params.SportsMarketMetric, Limit: params.Limit, Offset: params.Offset}
}

func recentlySettledParamsFromEventsParams(params *predictions.ListEventsParams) *predictions.ListRecentlySettledEventsParams {
	return &predictions.ListRecentlySettledEventsParams{Category: params.Category, Sport: params.Sport, SportsMarketType: params.SportsMarketType, SportsMarketSubject: params.SportsMarketSubject, SportsMarketScope: params.SportsMarketScope, SportsMarketMetric: params.SportsMarketMetric, Limit: params.Limit, Offset: params.Offset}
}

func upcomingParamsFromEventsParams(params *predictions.ListEventsParams) *predictions.ListUpcomingEventsParams {
	return &predictions.ListUpcomingEventsParams{Category: params.Category, Sport: params.Sport, SportsMarketType: params.SportsMarketType, SportsMarketSubject: params.SportsMarketSubject, SportsMarketScope: params.SportsMarketScope, SportsMarketMetric: params.SportsMarketMetric, Limit: params.Limit, Offset: params.Offset}
}
