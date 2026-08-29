package transport

import (
	"context"
	"errors"
	"iter"
)

// PageFetcher is a function that fetches a page of items at a given offset and limit.
type PageFetcher[T any] func(ctx context.Context, offset, limit int) (items []T, hasMore bool, err error)

// NewPaginator creates a native Go 1.23+ iter.Seq2 iterator for paginated endpoints.
func NewPaginator[T any](ctx context.Context, initialOffset, pageSize int, fetcher PageFetcher[T]) iter.Seq2[T, error] {
	if ctx == nil {
		ctx = context.Background()
	}
	if pageSize <= 0 {
		pageSize = 50
	}

	return func(yield func(T, error) bool) {
		if fetcher == nil {
			var zero T
			yield(zero, errors.New("gemini transport: paginator fetcher is nil"))
			return
		}
		if initialOffset < 0 {
			var zero T
			yield(zero, errors.New("gemini transport: paginator offset must be non-negative"))
			return
		}
		offset := initialOffset
		for {
			if ctx.Err() != nil {
				var zero T
				yield(zero, ctx.Err())
				return
			}

			items, hasMore, err := fetcher(ctx, offset, pageSize)
			if err != nil {
				var zero T
				yield(zero, err)
				return
			}

			for _, item := range items {
				if !yield(item, nil) {
					return // Caller broke out of the for-range loop
				}
			}

			if !hasMore || len(items) == 0 {
				return
			}

			offset += len(items)
		}
	}
}
