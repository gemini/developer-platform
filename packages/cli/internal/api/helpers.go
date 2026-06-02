package api

import (
	"math"
	"strconv"
)

// SpreadInfo contains spread and mid-price information.
type SpreadInfo struct {
	BidPrice  float64 `json:"bidPrice"`
	AskPrice  float64 `json:"askPrice"`
	MidPrice  float64 `json:"midPrice"`
	Spread    float64 `json:"spread"`
	SpreadBps float64 `json:"spreadBps"`
}

// CalculateSpread calculates the spread between bid and ask prices.
func CalculateSpread(book *OrderBook) *SpreadInfo {
	if len(book.Bids) == 0 || len(book.Asks) == 0 {
		return nil
	}

	bidPrice, _ := strconv.ParseFloat(book.Bids[0].Price, 64)
	askPrice, _ := strconv.ParseFloat(book.Asks[0].Price, 64)

	midPrice := (bidPrice + askPrice) / 2
	spread := askPrice - bidPrice
	spreadBps := 0.0
	if midPrice > 0 {
		spreadBps = (spread / midPrice) * 10000
	}

	return &SpreadInfo{
		BidPrice:  bidPrice,
		AskPrice:  askPrice,
		MidPrice:  roundTo(midPrice, 4),
		Spread:    roundTo(spread, 4),
		SpreadBps: roundTo(spreadBps, 2),
	}
}

// LiquidityInfo contains liquidity depth information.
type LiquidityInfo struct {
	BidLiquidity   float64 `json:"bidLiquidity"`
	AskLiquidity   float64 `json:"askLiquidity"`
	TotalLiquidity float64 `json:"totalLiquidity"`
	Imbalance      float64 `json:"imbalance"`
}

// CalculateLiquidity calculates available liquidity in the order book.
func CalculateLiquidity(book *OrderBook, levels int) *LiquidityInfo {
	bidLiq := 0.0
	askLiq := 0.0

	for i, bid := range book.Bids {
		if i >= levels {
			break
		}
		price, _ := strconv.ParseFloat(bid.Price, 64)
		amount, _ := strconv.ParseFloat(bid.Amount, 64)
		bidLiq += price * amount
	}

	for i, ask := range book.Asks {
		if i >= levels {
			break
		}
		price, _ := strconv.ParseFloat(ask.Price, 64)
		amount, _ := strconv.ParseFloat(ask.Amount, 64)
		askLiq += price * amount
	}

	total := bidLiq + askLiq
	imbalance := 0.0
	if total > 0 {
		imbalance = (bidLiq - askLiq) / total
	}

	return &LiquidityInfo{
		BidLiquidity:   roundTo(bidLiq, 2),
		AskLiquidity:   roundTo(askLiq, 2),
		TotalLiquidity: roundTo(total, 2),
		Imbalance:      roundTo(imbalance, 4),
	}
}

// FillEstimate contains estimated fill price and fees.
type FillEstimate struct {
	AveragePrice float64 `json:"averagePrice"`
	TotalCost    float64 `json:"totalCost"`
	Slippage     float64 `json:"slippage"`
	SlippageBps  float64 `json:"slippageBps"`
	Filled       float64 `json:"filled"`
	Unfilled     float64 `json:"unfilled"`
}

// EstimateFill estimates the fill price for an order given the order book.
func EstimateFill(book *OrderBook, side string, quantity float64) *FillEstimate {
	var orders []OrderBookEntry
	if side == "buy" {
		orders = book.Asks
	} else {
		orders = book.Bids
	}

	if len(orders) == 0 {
		return nil
	}

	bestPrice, _ := strconv.ParseFloat(orders[0].Price, 64)

	remaining := quantity
	totalCost := 0.0
	filled := 0.0

	for _, order := range orders {
		if remaining <= 0 {
			break
		}
		price, _ := strconv.ParseFloat(order.Price, 64)
		amount, _ := strconv.ParseFloat(order.Amount, 64)

		fillQty := math.Min(remaining, amount)
		totalCost += price * fillQty
		filled += fillQty
		remaining -= fillQty
	}

	avgPrice := 0.0
	if filled > 0 {
		avgPrice = totalCost / filled
	}

	slippage := 0.0
	slippageBps := 0.0
	if bestPrice > 0 && avgPrice > 0 {
		if side == "buy" {
			slippage = avgPrice - bestPrice
		} else {
			slippage = bestPrice - avgPrice
		}
		slippageBps = (slippage / bestPrice) * 10000
	}

	return &FillEstimate{
		AveragePrice: roundTo(avgPrice, 4),
		TotalCost:    roundTo(totalCost, 2),
		Slippage:     roundTo(slippage, 4),
		SlippageBps:  roundTo(slippageBps, 2),
		Filled:       filled,
		Unfilled:     remaining,
	}
}

func roundTo(val float64, decimals int) float64 {
	pow := math.Pow(10, float64(decimals))
	return math.Round(val*pow) / pow
}
