package orderbook_test

import (
	"fmt"
	"testing"

	"github.com/gemini/gemini-go/websocket"
	"github.com/gemini/gemini-go/websocket/orderbook"
)

func BenchmarkOrderBook_ApplyLevel_Insert(b *testing.B) {
	prices := make([]string, 500)
	for i := 0; i < 500; i++ {
		prices[i] = fmt.Sprintf("%d.00", 60000+i)
	}

	book := orderbook.NewOrderBook("BTCUSD")
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		book.ApplyLevel(true, prices[i%500], "1.5")
	}
}

func BenchmarkOrderBook_ApplyLevel_Update(b *testing.B) {
	prices := make([]string, 100)
	for i := 0; i < 100; i++ {
		prices[i] = fmt.Sprintf("%d.00", 60000+i)
	}

	book := orderbook.NewOrderBook("BTCUSD")
	// Pre-fill 100 levels
	for i := 0; i < 100; i++ {
		book.ApplyLevel(true, prices[i], "1.0")
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		book.ApplyLevel(true, prices[i%100], "2.5")
	}
}

func BenchmarkOrderBook_BestBid(b *testing.B) {
	book := orderbook.NewOrderBook("BTCUSD")
	for i := 0; i < 100; i++ {
		price := fmt.Sprintf("%d.00", 60000+i)
		book.ApplyLevel(true, price, "1.0")
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_, _ = book.BestBid()
	}
}

func BenchmarkLiveOrderBook_IngestDiff(b *testing.B) {
	liveBook := orderbook.NewLiveOrderBook("BTCUSD")
	liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 100,
		Bids:         [][]string{{"65000.00", "1.0"}},
		Asks:         [][]string{{"65001.00", "1.5"}},
	})

	diff := &websocket.DepthUpdate{
		FirstUpdateID: 101,
		LastUpdateID:  102,
		Bids:          [][]string{{"65000.50", "2.0"}},
		Asks:          [][]string{{"65001.50", "0.5"}},
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		diff.FirstUpdateID = int64(100 + i*2 + 1)
		diff.LastUpdateID = int64(100 + i*2 + 2)
		_ = liveBook.IngestDiff(diff)
	}
}
