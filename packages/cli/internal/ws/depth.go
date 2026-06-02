package ws

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/debug"
)

const depthSnapshotTimeout = 5 * time.Second

// DepthSnapshot returns the first order book snapshot from a depth stream.
func (m *ConnectionManager) DepthSnapshot(ctx context.Context, symbol string, levels int) (*api.OrderBook, error) {
	if levels <= 0 {
		levels = 20
	}
	if err := m.checkCircuit(); err != nil {
		return nil, err
	}

	client, err := Connect(ctx, m.config.URL)
	if err != nil {
		m.recordFailure(err)
		return nil, err
	}
	defer client.Close()

	snapshotCtx, cancel := context.WithTimeout(ctx, depthSnapshotTimeout)
	defer cancel()

	streamName := DepthStream(symbol, levels)
	stream := client.Stream(snapshotCtx)
	if err := client.Subscribe(snapshotCtx, streamName); err != nil {
		m.recordFailure(err)
		return nil, err
	}

	for {
		select {
		case <-snapshotCtx.Done():
			err := fmt.Errorf("wait for depth snapshot: %w", snapshotCtx.Err())
			m.recordFailure(err)
			return nil, err
		case msg, ok := <-stream:
			if !ok {
				err := fmt.Errorf("depth stream closed before snapshot")
				m.recordFailure(err)
				return nil, err
			}
			if msg.Stream != streamName {
				continue
			}

			book, err := parseDepthSnapshot(msg.Data)
			if err != nil {
				debug.Log("could not parse depth snapshot for %s: %v", symbol, err)
				continue
			}
			if len(book.Bids) == 0 && len(book.Asks) == 0 {
				continue
			}

			m.recordSuccess()
			return book, nil
		}
	}
}

func parseDepthSnapshot(data json.RawMessage) (*api.OrderBook, error) {
	var raw map[string]json.RawMessage
	if err := decodeJSON(data, &raw); err != nil {
		return nil, err
	}

	book := &api.OrderBook{}
	if bidsRaw, ok := raw["bids"]; ok {
		book.Bids = parseDepthLevels(bidsRaw)
	}
	if asksRaw, ok := raw["asks"]; ok {
		book.Asks = parseDepthLevels(asksRaw)
	}
	if len(book.Bids) == 0 {
		if bidsRaw, ok := raw["b"]; ok {
			book.Bids = parseDepthLevels(bidsRaw)
		}
	}
	if len(book.Asks) == 0 {
		if asksRaw, ok := raw["a"]; ok {
			book.Asks = parseDepthLevels(asksRaw)
		}
	}

	if len(book.Bids) == 0 && len(book.Asks) == 0 {
		bids, asks := parseGeminiDepthEvents(raw)
		book.Bids = bids
		book.Asks = asks
	}

	if len(book.Bids) == 0 && len(book.Asks) == 0 {
		return nil, fmt.Errorf("depth snapshot did not include bids or asks")
	}
	return book, nil
}

func parseDepthLevels(data json.RawMessage) []api.OrderBookEntry {
	if entries := parseDepthObjectLevels(data); len(entries) > 0 {
		return entries
	}
	return parseDepthArrayLevels(data)
}

func parseDepthObjectLevels(data json.RawMessage) []api.OrderBookEntry {
	var levels []map[string]any
	if err := decodeJSON(data, &levels); err != nil {
		return nil
	}

	entries := make([]api.OrderBookEntry, 0, len(levels))
	for _, level := range levels {
		entry := api.OrderBookEntry{
			Price:     firstString(level, "price", "p"),
			Amount:    firstString(level, "amount", "quantity", "qty", "size", "remaining", "q"),
			Timestamp: firstString(level, "timestamp", "time", "ts"),
		}
		if entry.Price != "" && entry.Amount != "" {
			entries = append(entries, entry)
		}
	}
	return entries
}

func parseDepthArrayLevels(data json.RawMessage) []api.OrderBookEntry {
	var levels [][]any
	if err := decodeJSON(data, &levels); err != nil {
		return nil
	}

	entries := make([]api.OrderBookEntry, 0, len(levels))
	for _, level := range levels {
		if len(level) < 2 {
			continue
		}
		entry := api.OrderBookEntry{
			Price:  anyString(level[0]),
			Amount: anyString(level[1]),
		}
		if len(level) > 2 {
			entry.Timestamp = anyString(level[2])
		}
		if entry.Price != "" && entry.Amount != "" {
			entries = append(entries, entry)
		}
	}
	return entries
}

func parseGeminiDepthEvents(raw map[string]json.RawMessage) ([]api.OrderBookEntry, []api.OrderBookEntry) {
	eventsRaw, ok := raw["events"]
	if !ok {
		return nil, nil
	}

	var events []map[string]any
	if err := decodeJSON(eventsRaw, &events); err != nil {
		return nil, nil
	}

	var bids []api.OrderBookEntry
	var asks []api.OrderBookEntry
	for _, event := range events {
		price := firstString(event, "price", "p")
		amount := firstString(event, "remaining", "amount", "quantity", "qty", "size", "q")
		if price == "" || amount == "" || amount == "0" {
			continue
		}
		entry := api.OrderBookEntry{
			Price:     price,
			Amount:    amount,
			Timestamp: firstString(event, "timestamp", "time", "ts"),
		}

		switch strings.ToLower(firstString(event, "side")) {
		case "bid", "buy":
			bids = append(bids, entry)
		case "ask", "sell":
			asks = append(asks, entry)
		}
	}
	return bids, asks
}

func decodeJSON(data json.RawMessage, dst any) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	return dec.Decode(dst)
}

func firstString(values map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := values[key]; ok {
			if s := anyString(value); s != "" {
				return s
			}
		}
	}
	return ""
}

func anyString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case json.Number:
		return v.String()
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	default:
		return ""
	}
}
