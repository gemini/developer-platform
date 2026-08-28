package types

import (
	"errors"
	"math"
	"strconv"
)

var (
	// ErrInvalidLeverage is returned when leverage is less than 1.0.
	ErrInvalidLeverage = errors.New("gemini types: leverage must be greater than or equal to 1.0")

	// ErrInvalidPrice is returned when price is non-positive or outside required bounds.
	ErrInvalidPrice = errors.New("gemini types: price must be positive")

	// ErrInvalidQuantity is returned when quantity is non-positive.
	ErrInvalidQuantity = errors.New("gemini types: quantity must be positive")

	// ErrInvalidRate is returned when a rate is negative, NaN, or infinite.
	ErrInvalidRate = errors.New("gemini types: rate must be finite and non-negative")
)

// CalculateNotional computes the total notional value of an order or trade (Price * Quantity).
func CalculateNotional(price, quantity Decimal) Decimal {
	return price.Mul(quantity)
}

// CalculateFee computes the transaction fee in quote currency: Notional * (feeBps / 10000).
func CalculateFee(notional Decimal, feeBps float64) Decimal {
	if feeBps == 0 || notional.IsZero() || math.IsNaN(feeBps) || math.IsInf(feeBps, 0) || feeBps < 0 {
		return Zero()
	}
	bpsDec, err := ParseDecimal(strconv.FormatFloat(feeBps, 'f', -1, 64))
	if err != nil {
		return Zero()
	}
	tenThousand := NewDecimal(10000, 0)
	fee, err := notional.Mul(bpsDec).Div(tenThousand, 8)
	if err != nil {
		return Zero()
	}
	return fee
}

// CalculatePnL computes the profit/loss and ROI percentage for a position or closed trade.
// For Long:  PnL = (ExitPrice - EntryPrice) * Quantity
// For Short: PnL = (EntryPrice - ExitPrice) * Quantity
func CalculatePnL(entryPrice, exitPrice, quantity Decimal, isLong bool) (pnl Decimal, roiPercent float64) {
	if !entryPrice.IsPositive() || !quantity.IsPositive() {
		return Zero(), 0
	}
	if isLong {
		pnl = exitPrice.Sub(entryPrice).Mul(quantity)
	} else {
		pnl = entryPrice.Sub(exitPrice).Mul(quantity)
	}
	initialNotional := entryPrice.Mul(quantity)
	if !initialNotional.IsZero() {
		pnlFloat, pnlErr := pnl.Float64Checked()
		notionalFloat, notionalErr := initialNotional.Float64Checked()
		if pnlErr == nil && notionalErr == nil && notionalFloat != 0 {
			roiPercent = (pnlFloat / notionalFloat) * 100.0
		}
	}
	return pnl, roiPercent
}

// CalculateLiquidationPrice estimates the bankruptcy liquidation trigger price for a leveraged position.
//
// Long Position:  LiqPrice = EntryPrice * (1 - 1/Leverage + MaintenanceMarginRate)
// Short Position: LiqPrice = EntryPrice * (1 + 1/Leverage - MaintenanceMarginRate)
func CalculateLiquidationPrice(entryPrice Decimal, leverage float64, maintenanceMarginRate float64, isLong bool) (Decimal, error) {
	if math.IsNaN(leverage) || math.IsInf(leverage, 0) || leverage < 1.0 {
		return Decimal{}, ErrInvalidLeverage
	}
	if math.IsNaN(maintenanceMarginRate) || math.IsInf(maintenanceMarginRate, 0) || maintenanceMarginRate < 0 {
		return Decimal{}, ErrInvalidRate
	}
	if !entryPrice.IsPositive() {
		return Decimal{}, ErrInvalidPrice
	}
	leverageDec, err := ParseDecimal(strconv.FormatFloat(leverage, 'f', -1, 64))
	if err != nil {
		return Decimal{}, err
	}
	rateDec, err := ParseDecimal(strconv.FormatFloat(maintenanceMarginRate, 'f', -1, 64))
	if err != nil {
		return Decimal{}, err
	}
	one := NewDecimal(1, 0)
	inverse, err := one.Div(leverageDec, 18)
	if err != nil {
		return Decimal{}, err
	}
	factor := one.Add(inverse).Sub(rateDec)
	if isLong {
		factor = one.Sub(inverse).Add(rateDec)
		if factor.IsNegative() {
			factor = Zero()
		}
	}
	return entryPrice.Mul(factor), nil
}

// PredictionMarketPayout calculates financial returns for binary prediction contracts ($1.00 settlement per winning contract).
//
// price: purchase price per contract (e.g. 0.65 for 65 cents)
// contracts: number of contracts purchased
func PredictionMarketPayout(price Decimal, contracts Decimal) (maxPayout Decimal, cost Decimal, maxProfit Decimal, returnPercent float64, err error) {
	oneDollar := NewDecimal(1, 0)
	if !price.IsPositive() || price.GreaterThan(oneDollar) {
		return Zero(), Zero(), Zero(), 0, errors.New("gemini types: prediction contract price must be between 0.00 and 1.00")
	}
	if !contracts.IsPositive() {
		return Zero(), Zero(), Zero(), 0, ErrInvalidQuantity
	}
	maxPayout = oneDollar.Mul(contracts)
	cost = price.Mul(contracts)
	maxProfit = maxPayout.Sub(cost)
	if !cost.IsZero() {
		profitFloat, profitErr := maxProfit.Float64Checked()
		costFloat, costErr := cost.Float64Checked()
		if profitErr == nil && costErr == nil && costFloat != 0 {
			returnPercent = (profitFloat / costFloat) * 100.0
		}
	}
	return maxPayout, cost, maxProfit, returnPercent, nil
}
