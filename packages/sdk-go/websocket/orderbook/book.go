package orderbook

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"

	"github.com/gemini/developer-platform/packages/sdk-go/types"
)

// PriceLevel represents a price and amount pair in the order book.
type PriceLevel struct {
	Price     string
	Amount    string
	val       float64       // Convenience value for float-returning metrics
	decimal   types.Decimal // Exact price decimal used for keys, sorting, and comparisons
	amountDec types.Decimal // Exact amount decimal used for zero-level removal
}

var (
	ErrInvalidLevel    = errors.New("gemini order book: invalid price level")
	ErrInvalidSequence = errors.New("gemini order book: invalid sequence ID")
)

// OrderBook maintains an in-memory L2 sorted order book.
type OrderBook struct {
	mu           sync.RWMutex
	symbol       string
	lastUpdateID int64
	bids         []PriceLevel // Sorted descending (highest bid first)
	asks         []PriceLevel // Sorted ascending (lowest ask first)
	priceCache   decimalCache
}

const maxCachedPriceLength = 128

type decimalCache struct {
	mu     sync.RWMutex
	values map[string]types.Decimal
}

// NewOrderBook creates a new empty OrderBook for a symbol.
func NewOrderBook(symbol string) *OrderBook {
	return &OrderBook{
		symbol:     symbol,
		bids:       make([]PriceLevel, 0, 128),
		asks:       make([]PriceLevel, 0, 128),
		priceCache: decimalCache{values: make(map[string]types.Decimal)},
	}
}

// Symbol returns the market symbol of this order book.
func (b *OrderBook) Symbol() string {
	return b.symbol
}

// LastUpdateID returns the sequence ID of the latest applied update.
func (b *OrderBook) LastUpdateID() int64 {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.lastUpdateID
}

// SetLastUpdateID updates the last sequence ID.
func (b *OrderBook) SetLastUpdateID(id int64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.lastUpdateID = id
}

// Clear resets the order book state.
func (b *OrderBook) Clear() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.bids = b.bids[:0]
	b.asks = b.asks[:0]
	b.lastUpdateID = 0
}

// ApplySnapshot replaces the order book contents with a full snapshot. The
// update is atomic: malformed levels leave the existing book unchanged.
func (b *OrderBook) ApplySnapshot(lastUpdateID int64, rawBids [][]string, rawAsks [][]string) error {
	if lastUpdateID <= 0 {
		return fmt.Errorf("%w: snapshot sequence ID must be positive, got %d", ErrInvalidSequence, lastUpdateID)
	}
	bids, err := parseLevels(rawBids, false, &b.priceCache)
	if err != nil {
		return fmt.Errorf("gemini order book: invalid bid snapshot: %w", err)
	}
	asks, err := parseLevels(rawAsks, false, &b.priceCache)
	if err != nil {
		return fmt.Errorf("gemini order book: invalid ask snapshot: %w", err)
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	b.lastUpdateID = lastUpdateID
	b.bids = append(b.bids[:0], bids...)
	b.asks = append(b.asks[:0], asks...)

	// Sort bids descending, asks ascending
	slices.SortFunc(b.bids, func(a, b PriceLevel) int {
		return b.decimal.Cmp(a.decimal)
	})
	slices.SortFunc(b.asks, func(a, b PriceLevel) int {
		return a.decimal.Cmp(b.decimal)
	})
	return nil
}

func parseLevels(raw [][]string, allowZeroAmount bool, cache *decimalCache) ([]PriceLevel, error) {
	levels := make([]PriceLevel, 0, len(raw))
	for i, entry := range raw {
		if len(entry) != 2 {
			return nil, fmt.Errorf("%w at index %d: expected [price, amount]", ErrInvalidLevel, i)
		}
		level, err := parseLevel(entry[0], entry[1], allowZeroAmount, cache)
		if err != nil {
			return nil, fmt.Errorf("%w at index %d: %v", ErrInvalidLevel, i, err)
		}
		levels = append(levels, level)
	}
	return levels, nil
}

func parseLevel(priceStr, amountStr string, allowZeroAmount bool, cache *decimalCache) (PriceLevel, error) {
	price, err := cachedPrice(cache, priceStr)
	if err != nil || !price.IsPositive() {
		return PriceLevel{}, fmt.Errorf("price %q must be positive decimal", priceStr)
	}
	amount, err := types.ParseDecimal(amountStr)
	if err != nil || amount.IsNegative() || (!allowZeroAmount && !amount.IsPositive()) {
		return PriceLevel{}, fmt.Errorf("amount %q must be %s decimal", amountStr, map[bool]string{true: "non-negative", false: "positive"}[allowZeroAmount])
	}
	return PriceLevel{
		Price:     priceStr,
		Amount:    amountStr,
		val:       price.Float64(),
		decimal:   price,
		amountDec: amount,
	}, nil
}

func cachedPrice(cache *decimalCache, raw string) (types.Decimal, error) {
	key := strings.TrimSpace(raw)
	if cache != nil && len(key) <= maxCachedPriceLength {
		cache.mu.RLock()
		price, ok := cache.values[key]
		cache.mu.RUnlock()
		if ok {
			return price, nil
		}
	}

	price, err := types.ParseDecimal(raw)
	if err != nil {
		return types.Decimal{}, err
	}
	if cache != nil && len(key) <= maxCachedPriceLength {
		cache.mu.Lock()
		if len(cache.values) >= 4096 {
			clear(cache.values)
		}
		cache.values[key] = price
		cache.mu.Unlock()
	}
	return price, nil
}

// ApplyDiff atomically applies a batch of bid and ask level updates and updates the sequence ID under a single lock.
func (b *OrderBook) ApplyDiff(lastUpdateID int64, rawBids [][]string, rawAsks [][]string) error {
	if lastUpdateID <= 0 {
		return fmt.Errorf("%w: diff sequence ID must be positive, got %d", ErrInvalidSequence, lastUpdateID)
	}
	bids, err := parseLevels(rawBids, true, &b.priceCache)
	if err != nil {
		return fmt.Errorf("gemini order book: invalid bid diff: %w", err)
	}
	asks, err := parseLevels(rawAsks, true, &b.priceCache)
	if err != nil {
		return fmt.Errorf("gemini order book: invalid ask diff: %w", err)
	}

	b.mu.Lock()
	defer b.mu.Unlock()
	if lastUpdateID < b.lastUpdateID {
		return fmt.Errorf("%w: diff sequence ID %d is older than current ID %d", ErrInvalidSequence, lastUpdateID, b.lastUpdateID)
	}

	b.lastUpdateID = lastUpdateID
	for _, level := range bids {
		b.applyLevelLocked(true, level)
	}
	for _, level := range asks {
		b.applyLevelLocked(false, level)
	}
	return nil
}

// ApplyLevel updates or deletes a single price level.
func (b *OrderBook) ApplyLevel(isBid bool, priceStr, amountStr string) error {
	level, err := parseLevel(priceStr, amountStr, true, &b.priceCache)
	if err != nil {
		return fmt.Errorf("gemini order book: invalid level: %w", err)
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.applyLevelLocked(isBid, level)
	return nil
}

func (b *OrderBook) applyLevelLocked(isBid bool, level PriceLevel) {
	isZero := level.amountDec.IsZero()
	if isBid {
		// Bids are sorted descending
		idx, found := slices.BinarySearchFunc(b.bids, level.decimal, func(existing PriceLevel, target types.Decimal) int {
			return target.Cmp(existing.decimal) // Reversed for descending order
		})

		if isZero {
			if found {
				b.bids = slices.Delete(b.bids, idx, idx+1)
			}
		} else {
			if found {
				b.bids[idx] = level
			} else {
				b.bids = slices.Insert(b.bids, idx, level)
			}
		}
	} else {
		// Asks are sorted ascending
		idx, found := slices.BinarySearchFunc(b.asks, level.decimal, func(existing PriceLevel, target types.Decimal) int {
			return existing.decimal.Cmp(target)
		})

		if isZero {
			if found {
				b.asks = slices.Delete(b.asks, idx, idx+1)
			}
		} else {
			if found {
				b.asks[idx] = level
			} else {
				b.asks = slices.Insert(b.asks, idx, level)
			}
		}
	}
}

// BestBid returns the top bid price level.
func (b *OrderBook) BestBid() (PriceLevel, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if len(b.bids) == 0 {
		return PriceLevel{}, false
	}
	return b.bids[0], true
}

// BestAsk returns the top ask price level.
func (b *OrderBook) BestAsk() (PriceLevel, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if len(b.asks) == 0 {
		return PriceLevel{}, false
	}
	return b.asks[0], true
}

// IsCrossed returns true if the top bid price is greater than or equal to the top ask price.
func (b *OrderBook) IsCrossed() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if len(b.bids) == 0 || len(b.asks) == 0 {
		return false
	}
	return b.bids[0].decimal.Cmp(b.asks[0].decimal) >= 0
}

// Spread returns the bid-ask spread (best ask price minus best bid price).
func (b *OrderBook) Spread() (float64, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if len(b.bids) == 0 || len(b.asks) == 0 {
		return 0, false
	}
	return b.asks[0].val - b.bids[0].val, true
}

// Mid returns the mid-market price ((best bid + best ask) / 2).
func (b *OrderBook) Mid() (float64, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if len(b.bids) == 0 || len(b.asks) == 0 {
		return 0, false
	}
	return (b.asks[0].val + b.bids[0].val) / 2.0, true
}

// Bids returns up to depth top bids.
func (b *OrderBook) Bids(depth int) []PriceLevel {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if depth <= 0 || depth > len(b.bids) {
		depth = len(b.bids)
	}
	res := make([]PriceLevel, depth)
	copy(res, b.bids[:depth])
	return res
}

// Asks returns up to depth top asks.
func (b *OrderBook) Asks(depth int) []PriceLevel {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if depth <= 0 || depth > len(b.asks) {
		depth = len(b.asks)
	}
	res := make([]PriceLevel, depth)
	copy(res, b.asks[:depth])
	return res
}

// SimulatedFill contains the execution summary of a simulated market order swept through L2 book depth.
type SimulatedFill struct {
	FilledQuantity types.Decimal // Total base currency filled
	AveragePrice   types.Decimal // Volume-weighted average execution price (VWAP)
	TotalNotional  types.Decimal // Total quote currency proceeds or cost
	RemainingQty   types.Decimal // Unfilled quantity if book depth was insufficient
	SlippageBps    float64       // Price impact / drift relative to initial top-of-book (BBO)
	LevelsConsumed int           // Number of price levels swept
}

// VWAP calculates the volume-weighted average price and simulated fill for executing targetQty against the order book.
// Set isBuy=true to simulate a market buy order sweeping the ask book.
// Set isBuy=false to simulate a market sell order sweeping the bid book.
func (b *OrderBook) VWAP(isBuy bool, targetQty types.Decimal) (SimulatedFill, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if !targetQty.IsPositive() {
		return SimulatedFill{}, types.ErrInvalidQuantity
	}

	var levels []PriceLevel
	if isBuy {
		levels = b.asks
	} else {
		levels = b.bids
	}

	if len(levels) == 0 {
		return SimulatedFill{
			RemainingQty: targetQty,
		}, nil
	}

	topPrice := levels[0].decimal

	remaining := targetQty
	totalFilled := types.Zero()
	totalNotional := types.Zero()
	levelsConsumed := 0

	for _, level := range levels {
		if remaining.IsZero() {
			break
		}

		levelPrice := level.decimal
		levelQty := level.amountDec
		if !levelQty.IsPositive() {
			continue
		}

		fillQty := types.Min(remaining, levelQty)
		fillNotional := levelPrice.Mul(fillQty)

		totalFilled = totalFilled.Add(fillQty)
		totalNotional = totalNotional.Add(fillNotional)
		remaining = remaining.Sub(fillQty)
		levelsConsumed++
	}

	avgPrice := types.Zero()
	slippageBps := 0.0
	if totalFilled.IsPositive() {
		if div, err := totalNotional.Div(totalFilled, 8); err == nil {
			avgPrice = div
		}
		if isBuy {
			if bps, err := avgPrice.BpsDiffChecked(topPrice); err == nil {
				slippageBps = bps
			}
		} else {
			if bps, err := avgPrice.BpsDiffChecked(topPrice); err == nil {
				// A sell that fills below the top bid has positive adverse
				// slippage, matching the buy-side convention above.
				slippageBps = -bps
			}
		}
	}

	return SimulatedFill{
		FilledQuantity: totalFilled,
		AveragePrice:   avgPrice,
		TotalNotional:  totalNotional,
		RemainingQty:   remaining,
		SlippageBps:    slippageBps,
		LevelsConsumed: levelsConsumed,
	}, nil
}

// Imbalance computes the normalized Order Book Imbalance (OBI) across top N depth levels:
// (BidVolume - AskVolume) / (BidVolume + AskVolume), returning a float in [-1.0, 1.0].
// Returns (0, false) if the book has no depth.
func (b *OrderBook) Imbalance(depth int) (float64, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if len(b.bids) == 0 && len(b.asks) == 0 {
		return 0, false
	}

	bidLimit := len(b.bids)
	if depth > 0 && depth < bidLimit {
		bidLimit = depth
	}
	askLimit := len(b.asks)
	if depth > 0 && depth < askLimit {
		askLimit = depth
	}

	var bidVol, askVol types.Decimal
	for i := 0; i < bidLimit; i++ {
		bidVol = bidVol.Add(b.bids[i].amountDec)
	}
	for i := 0; i < askLimit; i++ {
		askVol = askVol.Add(b.asks[i].amountDec)
	}

	totalVol := bidVol.Add(askVol)
	if totalVol.IsZero() {
		return 0, false
	}

	imbalance, err := bidVol.Sub(askVol).Div(totalVol, 18)
	if err != nil {
		return 0, false
	}
	result, err := imbalance.Float64Checked()
	if err != nil {
		return 0, false
	}
	return result, true
}

// CumulativeDepth returns total volume and notional across up to depth levels.
func (b *OrderBook) CumulativeDepth(isBid bool, depth int) (totalQty types.Decimal, totalNotional types.Decimal) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	var levels []PriceLevel
	if isBid {
		levels = b.bids
	} else {
		levels = b.asks
	}

	limit := len(levels)
	if depth > 0 && depth < limit {
		limit = depth
	}

	totalQty = types.Zero()
	totalNotional = types.Zero()

	for i := 0; i < limit; i++ {
		p := levels[i].decimal
		q := levels[i].amountDec
		if q.IsPositive() {
			totalQty = totalQty.Add(q)
			totalNotional = totalNotional.Add(p.Mul(q))
		}
	}

	return totalQty, totalNotional
}
