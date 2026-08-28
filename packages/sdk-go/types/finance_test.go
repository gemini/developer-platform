package types_test

import (
	"errors"
	"math"
	"testing"

	"github.com/gemini/gemini-go/types"
)

func TestCalculateNotional(t *testing.T) {
	price := types.MustParseDecimal("50000.50")
	qty := types.MustParseDecimal("1.5")
	notional := types.CalculateNotional(price, qty)
	expected := "75000.75"
	if notional.String() != expected {
		t.Fatalf("expected notional %s, got %s", expected, notional.String())
	}
}

func TestCalculateFee(t *testing.T) {
	notional := types.MustParseDecimal("100000")
	// 10 bps = 0.10% = 0.001 -> fee should be 100
	fee := types.CalculateFee(notional, 10.0)
	if fee.String() != "100" {
		t.Fatalf("expected fee 100, got %s", fee.String())
	}

	// 25 bps = 0.25% = 0.0025 -> fee on 50000 = 125
	fee2 := types.CalculateFee(types.MustParseDecimal("50000"), 25.0)
	if fee2.String() != "125" {
		t.Fatalf("expected fee 125, got %s", fee2.String())
	}
	if got := types.CalculateFee(notional, math.NaN()); !got.IsZero() {
		t.Fatalf("expected NaN fee rate to produce zero, got %s", got)
	}
	if got := types.CalculateFee(notional, -1); !got.IsZero() {
		t.Fatalf("expected negative fee rate to produce zero, got %s", got)
	}
}

func TestCalculatePnL(t *testing.T) {
	entry := types.MustParseDecimal("60000")
	exit := types.MustParseDecimal("66000")
	qty := types.MustParseDecimal("2")

	// Long: bought at 60k, sold at 66k -> +12,000 PnL (+10% ROI)
	pnlLong, roiLong := types.CalculatePnL(entry, exit, qty, true)
	if pnlLong.String() != "12000" {
		t.Fatalf("expected long pnl 12000, got %s", pnlLong.String())
	}
	if roiLong != 10.0 {
		t.Fatalf("expected long ROI 10.0, got %f", roiLong)
	}

	// Short: shorted at 60k, bought back at 66k -> -12,000 PnL (-10% ROI)
	pnlShort, roiShort := types.CalculatePnL(entry, exit, qty, false)
	if pnlShort.String() != "-12000" {
		t.Fatalf("expected short pnl -12000, got %s", pnlShort.String())
	}
	if roiShort != -10.0 {
		t.Fatalf("expected short ROI -10.0, got %f", roiShort)
	}
}

func TestCalculateLiquidationPrice(t *testing.T) {
	entry := types.MustParseDecimal("50000")
	leverage := 10.0 // 10x leverage
	mmr := 0.005     // 0.5% maintenance margin rate

	// Long Liq: 50000 * (1 - 0.1 + 0.005) = 50000 * 0.905 = 45250
	liqLong, err := types.CalculateLiquidationPrice(entry, leverage, mmr, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if liqLong.String() != "45250" {
		t.Fatalf("expected long liquidation price 45250, got %s", liqLong.String())
	}

	// Short Liq: 50000 * (1 + 0.1 - 0.005) = 50000 * 1.095 = 54750
	liqShort, err := types.CalculateLiquidationPrice(entry, leverage, mmr, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if liqShort.String() != "54750" {
		t.Fatalf("expected short liquidation price 54750, got %s", liqShort.String())
	}
}

func TestCalculateLiquidationPriceRejectsInvalidInputs(t *testing.T) {
	entry := types.MustParseDecimal("50000")
	for _, leverage := range []float64{0.5, math.NaN(), math.Inf(1)} {
		if _, err := types.CalculateLiquidationPrice(entry, leverage, 0.005, true); !errors.Is(err, types.ErrInvalidLeverage) {
			t.Errorf("leverage %v: expected ErrInvalidLeverage, got %v", leverage, err)
		}
	}
	if _, err := types.CalculateLiquidationPrice(entry, 2, math.NaN(), true); !errors.Is(err, types.ErrInvalidRate) {
		t.Fatalf("expected ErrInvalidRate for NaN maintenance rate, got %v", err)
	}
	if _, err := types.CalculateLiquidationPrice(types.Zero(), 2, 0, true); !errors.Is(err, types.ErrInvalidPrice) {
		t.Fatalf("expected ErrInvalidPrice for zero entry, got %v", err)
	}
}

func TestPredictionMarketPayout(t *testing.T) {
	price := types.MustParseDecimal("0.60") // 60 cents
	contracts := types.MustParseDecimal("100")

	maxPayout, cost, maxProfit, roi, err := types.PredictionMarketPayout(price, contracts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if maxPayout.String() != "100" {
		t.Fatalf("expected max payout 100, got %s", maxPayout.String())
	}
	if cost.String() != "60" {
		t.Fatalf("expected cost 60, got %s", cost.String())
	}
	if maxProfit.String() != "40" {
		t.Fatalf("expected max profit 40, got %s", maxProfit.String())
	}
	// ROI: (40 / 60) * 100 = 66.6666...%
	if roi < 66.6 || roi > 66.7 {
		t.Fatalf("expected ROI ~66.67%%, got %f", roi)
	}
}
