package orderbook

import (
	"fmt"
	"sort"
	"testing"
)

func FuzzOrderBookApplyLevelMaintainsSortedUniqueLevels(f *testing.F) {
	f.Add([]byte{0, 1, 1, 1, 2, 0, 0, 3, 2})
	f.Add([]byte{1, 31, 3, 0, 31, 0, 1, 1, 1})

	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > 384 {
			data = data[:384]
		}
		if len(data) < 3 {
			return
		}

		book := NewOrderBook("BTCUSD")
		expected := [2]map[int]struct{}{
			make(map[int]struct{}),
			make(map[int]struct{}),
		}

		for i := 0; i+2 < len(data); i += 3 {
			isBid := data[i]&1 == 0
			bookSide := 0
			if !isBid {
				bookSide = 1
			}
			price := int(data[i+1]%32) + 1
			amount := int(data[i+2] % 4)
			priceText := fmt.Sprintf("%d.00", price)
			amountText := fmt.Sprintf("%d.00", amount)

			if err := book.ApplyLevel(isBid, priceText, amountText); err != nil {
				t.Fatalf("ApplyLevel(%t, %q, %q): %v", isBid, priceText, amountText, err)
			}
			if amount == 0 {
				delete(expected[bookSide], price)
			} else {
				expected[bookSide][price] = struct{}{}
			}

			assertOrderBookSide(t, book.Bids(0), expected[0], true)
			assertOrderBookSide(t, book.Asks(0), expected[1], false)
		}
	})
}

func assertOrderBookSide(t *testing.T, levels []PriceLevel, expected map[int]struct{}, descending bool) {
	t.Helper()
	wantPrices := make([]int, 0, len(expected))
	for price := range expected {
		wantPrices = append(wantPrices, price)
	}
	sort.Ints(wantPrices)
	if descending {
		for left, right := 0, len(wantPrices)-1; left < right; left, right = left+1, right-1 {
			wantPrices[left], wantPrices[right] = wantPrices[right], wantPrices[left]
		}
	}
	if len(levels) != len(wantPrices) {
		t.Fatalf("got %d levels, want %d: %+v", len(levels), len(wantPrices), levels)
	}
	for i, level := range levels {
		want := fmt.Sprintf("%d.00", wantPrices[i])
		if level.Price != want {
			t.Fatalf("level %d has price %q, want %q: %+v", i, level.Price, want, levels)
		}
	}
}

func TestOrderBookPriceCacheEvictsAtBound(t *testing.T) {
	book := NewOrderBook("BTCUSD")
	const uniquePrices = 4097
	for i := 1; i <= uniquePrices; i++ {
		if err := book.ApplyLevel(true, fmt.Sprintf("%d.00", i), "1.00"); err != nil {
			t.Fatalf("ApplyLevel(%d): %v", i, err)
		}
	}

	book.priceCache.mu.RLock()
	cacheSize := len(book.priceCache.values)
	_, firstPriceRetained := book.priceCache.values["1.00"]
	book.priceCache.mu.RUnlock()
	if cacheSize > 4096 {
		t.Fatalf("price cache grew beyond its bound: %d", cacheSize)
	}
	if firstPriceRetained {
		t.Fatal("expected the oldest price to be evicted after the cache limit")
	}
}
