package orders

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/contracts"
	"github.com/gemini/developer-platform/packages/cli/internal/debug"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
	"github.com/gemini/developer-platform/packages/cli/internal/ws"
)

const (
	predictDollarDepthLevels  = 20
	predictDollarDepthTimeout = 5 * time.Second
	predictionMaxContracts    = 10000
)

var (
	predictionMakerFeeRate = predictionFeeRate{name: "maker", display: "0.0175", denominator: 40000}
	predictionTakerFeeRate = predictionFeeRate{name: "taker", display: "0.07", denominator: 10000}
)

type predictionFeeRate struct {
	name        string
	display     string
	denominator int64
}

type predictDollarSizing struct {
	contracts     int
	budgetCents   int64
	notionalCents int64
	feeCents      int64
	totalCents    int64
	method        string
	feeRate       predictionFeeRate
}

type APIClient interface {
	GetNotionalVolume(context.Context) (*api.NotionalVolumeResponse, error)
	PlacePredictOrder(context.Context, *api.PredictOrderRequest) (*api.PredictOrderResponse, error)
	PlaceSpotOrder(context.Context, *api.SpotOrderRequest) (*api.SpotOrderResponse, error)
	CancelPredictOrder(context.Context, string) (*api.PredictOrderResponse, error)
	CancelSpotOrder(context.Context, string) (*api.SpotOrderResponse, error)
	ListOpenPredictOrders(context.Context, api.ListPredictOrdersParams) (*api.PredictOrdersResponse, error)
	ListSpotOrders(context.Context, api.ListSpotOrdersParams) ([]api.SpotOrderResponse, error)
	CancelAllOrders(context.Context) (*api.CancelAllResult, error)
	CancelAllSpotOrders(context.Context, string) (*api.CancelAllResult, error)
}

type WSManager interface {
	DepthSnapshot(context.Context, string, int) (*api.OrderBook, error)
	PlaceOrder(context.Context, *ws.OrderParams) (*ws.OrderResult, error)
	CancelOrder(context.Context, ws.CancelParams) (*ws.OrderResult, error)
	CancelAllOrders(context.Context, *ws.CancelAllParams) (*ws.CancelAllResult, error)
}

type Service struct {
	api        APIClient
	ws         WSManager
	wsDisabled bool
}

type PredictPlaceInput struct {
	Symbol        string
	Side          string
	Outcome       string
	Type          string
	Quantity      string
	Price         string
	Dollars       string
	StopPrice     string
	TimeInForce   string
	ClientOrderID string
	MakerOrCancel bool
}

type SpotPlaceInput struct {
	Symbol        string
	Side          string
	Type          string
	Amount        string
	Price         string
	Dollars       string
	StopPrice     string
	ClientOrderID string
	MakerOrCancel bool
	IOC           bool
	FOK           bool
	Account       string
}

func NewService(apiClient APIClient, wsManager WSManager, wsDisabled bool) *Service {
	return &Service{
		api:        apiClient,
		ws:         wsManager,
		wsDisabled: wsDisabled,
	}
}

func (s *Service) PreparePredictPlace(ctx context.Context, in PredictPlaceInput) (*api.PredictOrderRequest, *contracts.PredictPlaceDryRun, error) {
	quantity := in.Quantity
	price := in.Price
	var sizing *predictDollarSizing

	if in.Dollars != "" {
		var err error
		quantity, sizing, err = s.preparePredictDollarQuantity(ctx, in, price, quantity)
		if err != nil {
			return nil, nil, err
		}
	}

	var invalidParams []string
	if in.Symbol == "" {
		invalidParams = append(invalidParams, "symbol")
	}
	if in.Side == "" {
		invalidParams = append(invalidParams, "side")
	}
	if in.Outcome == "" {
		invalidParams = append(invalidParams, "outcome")
	}
	if quantity == "" {
		invalidParams = append(invalidParams, "quantity")
	}
	if in.Type == "limit" && price == "" {
		invalidParams = append(invalidParams, "price")
	}
	if len(invalidParams) > 0 {
		return nil, nil, output.NewInputErrorWithContext(
			"missing required parameters: "+strings.Join(invalidParams, ", "),
			map[string]any{
				"symbol":   in.Symbol,
				"side":     in.Side,
				"outcome":  in.Outcome,
				"quantity": quantity,
				"price":    price,
				"type":     in.Type,
			},
			invalidParams,
			"gemini-markets predict order place --symbol GEMI-OSCARBP26-OSBP26ONEB --side buy --outcome yes --quantity 100 --price 0.75 --client-order-id agent-123",
		)
	}

	clientOrderID := in.ClientOrderID
	if clientOrderID == "" {
		clientOrderID = uuid.New().String()
		debug.Log("auto-generated client-order-id: %s", clientOrderID)
	}

	tif := in.TimeInForce
	makerOrCancel := in.MakerOrCancel
	if strings.EqualFold(tif, "post-only") {
		makerOrCancel = true
		tif = "good-til-cancel"
	}

	req := &api.PredictOrderRequest{
		Symbol:        in.Symbol,
		Side:          in.Side,
		Outcome:       in.Outcome,
		OrderType:     in.Type,
		Quantity:      quantity,
		Price:         price,
		StopPrice:     in.StopPrice,
		TimeInForce:   tif,
		ClientOrderID: clientOrderID,
		MakerOrCancel: makerOrCancel,
	}

	dryRun := &contracts.PredictPlaceDryRun{
		DryRun:        true,
		Action:        contracts.ActionPredictOrderPlace,
		Symbol:        req.Symbol,
		Side:          req.Side,
		Outcome:       req.Outcome,
		Type:          req.OrderType,
		Quantity:      req.Quantity,
		Price:         req.Price,
		TimeInForce:   req.TimeInForce,
		ClientOrderID: req.ClientOrderID,
		StopPrice:     req.StopPrice,
		MakerOrCancel: req.MakerOrCancel,
	}
	if sizing != nil {
		dryRun.DollarBudget = formatCents(sizing.budgetCents)
		dryRun.SizingMethod = sizing.method
		dryRun.FeeType = sizing.feeRate.name
		dryRun.FeeRate = sizing.feeRate.display
		dryRun.FeesIncluded = true
		dryRun.EstimatedNotional = formatCents(sizing.notionalCents)
		dryRun.EstimatedFee = formatCents(sizing.feeCents)
		if strings.EqualFold(req.Side, "sell") {
			dryRun.EstimatedNet = formatCents(sizing.notionalCents - sizing.feeCents)
		} else {
			dryRun.EstimatedTotal = formatCents(sizing.totalCents)
		}
	}

	return req, dryRun, nil
}

func (s *Service) preparePredictDollarQuantity(ctx context.Context, in PredictPlaceInput, price, quantity string) (string, *predictDollarSizing, error) {
	if quantity != "" {
		return "", nil, output.NewInputError("--dollars and --quantity are mutually exclusive")
	}
	if in.Symbol == "" || in.Side == "" || in.Outcome == "" {
		return "", nil, output.NewInputError("--symbol, --side, and --outcome are required when using --dollars")
	}
	side := strings.ToLower(in.Side)
	if side != "buy" && side != "sell" {
		return "", nil, output.NewInputError("--side must be buy or sell when using --dollars")
	}
	budgetCents, err := parseDollarCents(in.Dollars)
	if err != nil {
		return "", nil, output.NewInputError("--dollars must be a positive dollar amount")
	}

	var limitPriceCents int
	if price != "" {
		limitPriceCents, err = parsePredictionPriceCents(price)
		if err != nil {
			return "", nil, output.NewInputError("--price must be between 0.01 and 0.99 when using --dollars")
		}
	} else if strings.EqualFold(in.Type, "limit") {
		return "", nil, output.NewInputError("--price is required when using --dollars for limit orders")
	}

	feeRate := predictionFeeRateForInput(in)
	var sizing predictDollarSizing
	if predictionDollarUsesExecutableDepth(in) {
		if s.wsDisabled || s.ws == nil {
			return "", nil, output.NewInputError("--dollars for market/IOC/FOK prediction orders requires WebSocket depth snapshots; remove --no-websocket or use --quantity")
		}

		snapshotCtx, cancel := context.WithTimeout(ctx, predictDollarDepthTimeout)
		defer cancel()

		book, err := s.ws.DepthSnapshot(snapshotCtx, in.Symbol, predictDollarDepthLevels)
		if err != nil {
			return "", nil, fmt.Errorf("get depth snapshot for %s: %w", in.Symbol, err)
		}

		sizing, err = contractsForExecutableDollarAmount(book, side, budgetCents, limitPriceCents, feeRate)
		if err != nil {
			return "", nil, output.NewInputError(err.Error())
		}
	} else {
		if limitPriceCents == 0 {
			return "", nil, output.NewInputError("--price is required when using --dollars")
		}
		sizing, err = contractsForLimitDollarAmount(side, budgetCents, limitPriceCents, feeRate)
		if err != nil {
			return "", nil, output.NewInputError(err.Error())
		}
	}

	qty := sizing.contracts
	debug.Log("converted prediction --dollars %s to quantity %d using %s (notional %s, fee %s, total %s)",
		in.Dollars, qty, sizing.method, formatCents(sizing.notionalCents), formatCents(sizing.feeCents), formatCents(sizing.totalCents))
	return strconv.Itoa(qty), &sizing, nil
}

func predictionFeeRateForInput(in PredictPlaceInput) predictionFeeRate {
	if strings.EqualFold(in.Type, "market") ||
		strings.EqualFold(in.TimeInForce, "immediate-or-cancel") ||
		strings.EqualFold(in.TimeInForce, "fill-or-kill") {
		return predictionTakerFeeRate
	}
	if in.MakerOrCancel || strings.EqualFold(in.TimeInForce, "post-only") {
		return predictionMakerFeeRate
	}
	return predictionTakerFeeRate
}

func predictionDollarUsesExecutableDepth(in PredictPlaceInput) bool {
	return strings.EqualFold(in.Type, "market") ||
		strings.EqualFold(in.TimeInForce, "immediate-or-cancel") ||
		strings.EqualFold(in.TimeInForce, "fill-or-kill")
}

func contractsForLimitDollarAmount(side string, budgetCents int64, priceCents int, feeRate predictionFeeRate) (predictDollarSizing, error) {
	hi := int(budgetCents / int64(priceCents))
	if hi > predictionMaxContracts {
		hi = predictionMaxContracts
	}

	lo := 0
	if side == "buy" {
		for lo < hi {
			mid := (lo + hi + 1) / 2
			notionalCents := int64(mid * priceCents)
			feeCents := predictionFeeCents(feeRate, mid, priceCents)
			if notionalCents+feeCents <= budgetCents {
				lo = mid
			} else {
				hi = mid - 1
			}
		}
	} else {
		lo = hi
	}

	if lo < 1 {
		return predictDollarSizing{}, fmt.Errorf("--dollars %s at price %s yields 0 contracts", formatCents(budgetCents), formatCents(int64(priceCents)))
	}

	notionalCents := int64(lo * priceCents)
	feeCents := predictionFeeCents(feeRate, lo, priceCents)
	method := "limit_price_fee_cap"
	totalCents := notionalCents + feeCents
	if side == "sell" {
		method = "limit_price_target_notional"
		totalCents = notionalCents - feeCents
	}
	return predictDollarSizing{
		contracts:     lo,
		budgetCents:   budgetCents,
		notionalCents: notionalCents,
		feeCents:      feeCents,
		totalCents:    totalCents,
		method:        method,
		feeRate:       feeRate,
	}, nil
}

func contractsForExecutableDollarAmount(book *api.OrderBook, side string, budgetCents int64, limitPriceCents int, feeRate predictionFeeRate) (predictDollarSizing, error) {
	if book == nil {
		return predictDollarSizing{}, fmt.Errorf("depth snapshot is empty")
	}

	if side == "sell" {
		levels := append([]api.OrderBookEntry(nil), book.Bids...)
		sort.SliceStable(levels, func(i, j int) bool {
			return parseLevelPrice(levels[i]) > parseLevelPrice(levels[j])
		})
		return contractsForExecutableLevels(levels, side, budgetCents, limitPriceCents, feeRate)
	}
	levels := append([]api.OrderBookEntry(nil), book.Asks...)
	sort.SliceStable(levels, func(i, j int) bool {
		return parseLevelPrice(levels[i]) < parseLevelPrice(levels[j])
	})
	return contractsForExecutableLevels(levels, side, budgetCents, limitPriceCents, feeRate)
}

func contractsForExecutableLevels(levels []api.OrderBookEntry, side string, budgetCents int64, limitPriceCents int, feeRate predictionFeeRate) (predictDollarSizing, error) {
	contracts := 0
	notionalCents := int64(0)
	feeNumerator := int64(0)

	for _, level := range levels {
		if contracts >= predictionMaxContracts {
			break
		}

		priceCents, err := parsePredictionPriceCents(level.Price)
		if err != nil {
			continue
		}
		if limitPriceCents > 0 {
			if side == "buy" && priceCents > limitPriceCents {
				break
			}
			if side == "sell" && priceCents < limitPriceCents {
				break
			}
		}

		amount, err := strconv.ParseFloat(level.Amount, 64)
		if err != nil || amount <= 0 {
			continue
		}

		available := int(math.Floor(amount))
		if available <= 0 {
			continue
		}
		if contracts+available > predictionMaxContracts {
			available = predictionMaxContracts - contracts
		}

		take := maxContractsAtExecutableLevel(side, available, budgetCents, notionalCents, feeNumerator, priceCents, feeRate)
		if take <= 0 {
			break
		}
		contracts += take
		notionalCents += int64(take * priceCents)
		feeNumerator += predictionFeeNumerator(take, priceCents)
	}

	if contracts < 1 {
		return predictDollarSizing{}, fmt.Errorf("--dollars %s cannot %s any contracts from the current depth snapshot", formatCents(budgetCents), side)
	}

	feeCents := ceilDiv(feeNumerator, feeRate.denominator)
	method := "depth_snapshot_fee_cap"
	totalCents := notionalCents + feeCents
	if side == "sell" {
		method = "depth_snapshot_target_notional"
		totalCents = notionalCents - feeCents
	}
	return predictDollarSizing{
		contracts:     contracts,
		budgetCents:   budgetCents,
		notionalCents: notionalCents,
		feeCents:      feeCents,
		totalCents:    totalCents,
		method:        method,
		feeRate:       feeRate,
	}, nil
}

func maxContractsAtExecutableLevel(side string, available int, budgetCents, notionalCents, feeNumerator int64, priceCents int, feeRate predictionFeeRate) int {
	lo, hi := 0, available
	for lo < hi {
		mid := (lo + hi + 1) / 2
		nextNotionalCents := notionalCents + int64(mid*priceCents)
		nextFeeCents := ceilDiv(feeNumerator+predictionFeeNumerator(mid, priceCents), feeRate.denominator)
		nextTotalCents := nextNotionalCents + nextFeeCents
		if side == "sell" {
			nextTotalCents = nextNotionalCents
		}
		if nextTotalCents <= budgetCents {
			lo = mid
		} else {
			hi = mid - 1
		}
	}
	return lo
}

func predictionFeeCents(feeRate predictionFeeRate, contracts, priceCents int) int64 {
	return ceilDiv(predictionFeeNumerator(contracts, priceCents), feeRate.denominator)
}

func predictionFeeNumerator(contracts, priceCents int) int64 {
	return 7 * int64(contracts) * int64(priceCents) * int64(100-priceCents)
}

func parseDollarCents(input string) (int64, error) {
	value, err := strconv.ParseFloat(input, 64)
	if err != nil || value <= 0 {
		return 0, fmt.Errorf("invalid dollars")
	}
	cents := int64(math.Floor(value*100 + 1e-9))
	if cents < 1 {
		return 0, fmt.Errorf("dollars must be at least 0.01")
	}
	return cents, nil
}

func parsePredictionPriceCents(input string) (int, error) {
	price := strings.TrimSpace(input)
	if price == "" {
		return 0, fmt.Errorf("empty price")
	}

	price = strings.TrimPrefix(price, "+")

	parts := strings.Split(price, ".")
	if len(parts) > 2 {
		return 0, fmt.Errorf("invalid price")
	}

	whole := parts[0]
	if whole == "" {
		whole = "0"
	}
	if !isDecimalDigits(whole) {
		return 0, fmt.Errorf("invalid price")
	}

	fractional := ""
	if len(parts) == 2 {
		fractional = parts[1]
		if len(fractional) > 2 || !isDecimalDigits(fractional) {
			return 0, fmt.Errorf("invalid price")
		}
	}
	for len(fractional) < 2 {
		fractional += "0"
	}

	wholeDollars, err := strconv.Atoi(whole)
	if err != nil {
		return 0, err
	}
	fractionalCents, err := strconv.Atoi(fractional)
	if err != nil {
		return 0, err
	}

	priceCents := wholeDollars*100 + fractionalCents
	if priceCents < 1 || priceCents > 99 {
		return 0, fmt.Errorf("price out of range")
	}
	return priceCents, nil
}

func isDecimalDigits(value string) bool {
	if value == "" {
		return true
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func ceilDiv(numerator, denominator int64) int64 {
	if numerator <= 0 {
		return 0
	}
	return (numerator + denominator - 1) / denominator
}

func formatCents(cents int64) string {
	return strconv.FormatFloat(float64(cents)/100, 'f', 2, 64)
}

func parseLevelPrice(level api.OrderBookEntry) float64 {
	price, err := strconv.ParseFloat(level.Price, 64)
	if err != nil {
		return 0
	}
	return price
}

func (s *Service) ExecutePredictPlace(ctx context.Context, req *api.PredictOrderRequest) (*api.PredictOrderResponse, error) {
	if s.wsDisabled || s.ws == nil {
		return s.api.PlacePredictOrder(ctx, req)
	}

	wsParams := predictRequestToWSParams(req)
	wsResult, wsErr := s.ws.PlaceOrder(ctx, &wsParams)
	if wsErr != nil {
		debug.Log("WebSocket order failed: %v", wsErr)
		return nil, fmt.Errorf("websocket order placement failed; use --no-websocket to place via REST explicitly: %w", wsErr)
	}

	return wsOrderResultToPredictResponse(wsResult), nil
}

func (s *Service) PreviewPredictCancelAll(ctx context.Context) ([]api.PredictOrderResponse, *contracts.CancelAllDryRun, error) {
	orders, err := s.api.ListOpenPredictOrders(ctx, api.ListPredictOrdersParams{Limit: 100})
	if err != nil {
		return nil, nil, err
	}

	return orders.Data, &contracts.CancelAllDryRun{
		DryRun:     true,
		Action:     contracts.ActionPredictCancelAll,
		OrderCount: len(orders.Data),
		Orders:     orders.Data,
	}, nil
}

func (s *Service) CancelPredictOrder(ctx context.Context, orderID string) (*api.PredictOrderResponse, error) {
	if s.wsDisabled || s.ws == nil {
		resp, err := s.api.CancelPredictOrder(ctx, orderID)
		return normalizePredictCancelResponse(orderID, resp), err
	}

	wsResult, wsErr := s.ws.CancelOrder(ctx, ws.CancelParams{OrderID: orderID})
	if wsErr != nil {
		debug.Log("WebSocket cancel failed, using REST fallback: %v", wsErr)
		resp, err := s.api.CancelPredictOrder(ctx, orderID)
		return normalizePredictCancelResponse(orderID, resp), err
	}

	return normalizePredictCancelResponse(orderID, wsOrderResultToPredictResponse(wsResult)), nil
}

func normalizePredictCancelResponse(orderID string, resp *api.PredictOrderResponse) *api.PredictOrderResponse {
	if resp == nil {
		return nil
	}
	if resp.OrderID == "" {
		resp.OrderID = orderID
	}
	if resp.Status == "" {
		resp.Status = "cancelled"
	}
	return resp
}

func (s *Service) CancelAllPredictOrders(ctx context.Context) (*contracts.CancelAllResponse, error) {
	var canceledIDs []string

	if s.wsDisabled || s.ws == nil {
		result, err := s.api.CancelAllOrders(ctx)
		if err != nil {
			return nil, err
		}
		return canceledResponseFromAPI(result), nil
	}

	wsResult, wsErr := s.ws.CancelAllOrders(ctx, &ws.CancelAllParams{})
	if wsErr != nil {
		debug.Log("WebSocket cancel-all failed, using REST fallback: %v", wsErr)
		result, err := s.api.CancelAllOrders(ctx)
		if err != nil {
			return nil, err
		}
		return canceledResponseFromAPI(result), nil
	}

	canceledIDs = append(canceledIDs, wsResult.CancelledOrders...)
	return &contracts.CancelAllResponse{CanceledOrders: canceledIDs}, nil
}

func (s *Service) PrepareSpotPlace(ctx context.Context, in SpotPlaceInput) (*api.SpotOrderRequest, *contracts.SpotPlaceDryRun, error) {
	amount := in.Amount

	if in.Dollars != "" {
		if amount != "" {
			return nil, nil, output.NewInputError("--dollars and --amount are mutually exclusive")
		}
		if in.Price == "" {
			return nil, nil, output.NewInputError("--price is required when using --dollars")
		}
		dollars, err := strconv.ParseFloat(in.Dollars, 64)
		if err != nil || dollars <= 0 {
			return nil, nil, output.NewInputError("--dollars must be a positive number")
		}
		price, err := strconv.ParseFloat(in.Price, 64)
		if err != nil || price <= 0 {
			return nil, nil, output.NewInputError("--price must be a positive number")
		}

		feeMultiplier := 1.0
		vol, volErr := s.api.GetNotionalVolume(ctx)
		if volErr == nil && vol.APITakerFeeBps > 0 {
			feeMultiplier = 1.0 + float64(vol.APITakerFeeBps)/10000.0
			debug.Log("spot taker fee: %d bps (multiplier: %.4f)", vol.APITakerFeeBps, feeMultiplier)
		} else {
			debug.Log("could not fetch fee rate, using pre-fee calculation: %v", volErr)
		}

		amount = strconv.FormatFloat(dollars/(price*feeMultiplier), 'f', -1, 64)
		debug.Log("converted --dollars %s at price %s to amount %s (fee-adjusted)", in.Dollars, in.Price, amount)
	}

	orderType := in.Type
	if orderType == "" {
		orderType = "exchange limit"
	}

	var invalidParams []string
	if in.Symbol == "" {
		invalidParams = append(invalidParams, "symbol")
	}
	if in.Side == "" {
		invalidParams = append(invalidParams, "side")
	}
	if amount == "" {
		invalidParams = append(invalidParams, "amount")
	}
	if strings.Contains(orderType, "limit") && in.Price == "" {
		invalidParams = append(invalidParams, "price")
	}
	if len(invalidParams) > 0 {
		return nil, nil, output.NewInputErrorWithContext(
			"missing required parameters: "+strings.Join(invalidParams, ", "),
			map[string]any{
				"symbol": in.Symbol,
				"side":   in.Side,
				"amount": amount,
				"price":  in.Price,
				"type":   orderType,
			},
			invalidParams,
			"gemini-markets spot order place --symbol btcusd --side buy --amount 0.1 --price 50000 --client-order-id agent-123",
		)
	}

	options := make([]string, 0, 3)
	if in.MakerOrCancel {
		options = append(options, "maker-or-cancel")
	}
	if in.IOC {
		options = append(options, "immediate-or-cancel")
	}
	if in.FOK {
		options = append(options, "fill-or-kill")
	}

	clientOrderID := in.ClientOrderID
	if clientOrderID == "" {
		clientOrderID = uuid.New().String()
		debug.Log("auto-generated client-order-id: %s", clientOrderID)
	}

	req := &api.SpotOrderRequest{
		Symbol:        in.Symbol,
		Side:          in.Side,
		Type:          orderType,
		Amount:        amount,
		Price:         in.Price,
		StopPrice:     in.StopPrice,
		ClientOrderID: clientOrderID,
		Options:       options,
		Account:       in.Account,
	}

	return req, &contracts.SpotPlaceDryRun{
		DryRun:        true,
		Action:        contracts.ActionSpotOrderPlace,
		Symbol:        req.Symbol,
		Side:          req.Side,
		Type:          req.Type,
		Amount:        req.Amount,
		Price:         req.Price,
		ClientOrderID: req.ClientOrderID,
		StopPrice:     req.StopPrice,
		Options:       req.Options,
		Account:       req.Account,
	}, nil
}

func (s *Service) ExecuteSpotPlace(ctx context.Context, req *api.SpotOrderRequest) (*api.SpotOrderResponse, error) {
	if s.wsDisabled || s.ws == nil {
		return s.api.PlaceSpotOrder(ctx, req)
	}

	wsParams := spotRequestToWSParams(req)
	wsResult, wsErr := s.ws.PlaceOrder(ctx, &wsParams)
	if wsErr != nil {
		debug.Log("WebSocket order failed: %v", wsErr)
		return nil, fmt.Errorf("websocket order placement failed; use --no-websocket to place via REST explicitly: %w", wsErr)
	}

	return wsOrderResultToSpotResponse(wsResult), nil
}

func (s *Service) PreviewSpotCancelAll(ctx context.Context, account string) ([]api.SpotOrderResponse, *contracts.CancelAllDryRun, error) {
	orders, err := s.api.ListSpotOrders(ctx, api.ListSpotOrdersParams{Account: account})
	if err != nil {
		return nil, nil, err
	}

	return orders, &contracts.CancelAllDryRun{
		DryRun:     true,
		Action:     contracts.ActionSpotCancelAll,
		OrderCount: len(orders),
		Orders:     orders,
	}, nil
}

func (s *Service) CancelSpotOrder(ctx context.Context, orderID string) (*api.SpotOrderResponse, error) {
	if s.wsDisabled || s.ws == nil {
		return s.api.CancelSpotOrder(ctx, orderID)
	}

	wsResult, wsErr := s.ws.CancelOrder(ctx, ws.CancelParams{OrderID: orderID})
	if wsErr != nil {
		debug.Log("WebSocket cancel failed, using REST fallback: %v", wsErr)
		return s.api.CancelSpotOrder(ctx, orderID)
	}

	return wsOrderResultToSpotResponse(wsResult), nil
}

func (s *Service) CancelAllSpotOrders(ctx context.Context, account string) (*contracts.CancelAllResponse, error) {
	if s.wsDisabled || s.ws == nil {
		result, err := s.api.CancelAllSpotOrders(ctx, account)
		if err != nil {
			return nil, err
		}
		return canceledResponseFromAPI(result), nil
	}

	wsResult, wsErr := s.ws.CancelAllOrders(ctx, &ws.CancelAllParams{})
	if wsErr != nil {
		debug.Log("WebSocket cancel-all failed, using REST fallback: %v", wsErr)
		result, err := s.api.CancelAllSpotOrders(ctx, account)
		if err != nil {
			return nil, err
		}
		return canceledResponseFromAPI(result), nil
	}

	return &contracts.CancelAllResponse{CanceledOrders: append([]string(nil), wsResult.CancelledOrders...)}, nil
}

func predictRequestToWSParams(req *api.PredictOrderRequest) ws.OrderParams {
	orderType := "LIMIT"
	if strings.EqualFold(req.OrderType, "market") {
		orderType = "MARKET"
	}

	timeInForce := "GTC"
	switch strings.ToLower(req.TimeInForce) {
	case "immediate-or-cancel", "ioc":
		timeInForce = "IOC"
	case "fill-or-kill", "fok":
		timeInForce = "FOK"
	}

	return ws.OrderParams{
		Symbol:        strings.ToLower(req.Symbol),
		Side:          strings.ToUpper(req.Side),
		Type:          orderType,
		TimeInForce:   timeInForce,
		Price:         req.Price,
		Quantity:      req.Quantity,
		ClientOrderID: req.ClientOrderID,
		EventOutcome:  strings.ToUpper(req.Outcome),
		MakerOrCancel: req.MakerOrCancel,
	}
}

func wsOrderResultToPredictResponse(r *ws.OrderResult) *api.PredictOrderResponse {
	return &api.PredictOrderResponse{
		OrderID:        r.OrderID,
		ClientOrderID:  r.ClientOrderID,
		Symbol:         r.Symbol,
		Side:           r.Side,
		Outcome:        r.EventOutcome,
		OrderType:      r.Type,
		Price:          r.Price,
		Quantity:       r.OrigQty,
		FilledQuantity: r.ExecutedQty,
		Status:         strings.ToLower(r.Status),
	}
}

func spotRequestToWSParams(req *api.SpotOrderRequest) ws.OrderParams {
	orderType := "LIMIT"
	if strings.Contains(strings.ToLower(req.Type), "market") {
		orderType = "MARKET"
	}

	timeInForce := "GTC"
	for _, opt := range req.Options {
		switch opt {
		case "immediate-or-cancel":
			timeInForce = "IOC"
		case "fill-or-kill":
			timeInForce = "FOK"
		}
	}

	return ws.OrderParams{
		Symbol:        strings.ToLower(req.Symbol),
		Side:          strings.ToUpper(req.Side),
		Type:          orderType,
		TimeInForce:   timeInForce,
		Price:         req.Price,
		Quantity:      req.Amount,
		ClientOrderID: req.ClientOrderID,
	}
}

func wsOrderResultToSpotResponse(r *ws.OrderResult) *api.SpotOrderResponse {
	return &api.SpotOrderResponse{
		OrderID:         r.OrderID,
		ClientOrderID:   r.ClientOrderID,
		Symbol:          r.Symbol,
		Side:            r.Side,
		Type:            r.Type,
		Price:           r.Price,
		OriginalAmount:  r.OrigQty,
		ExecutedAmount:  r.ExecutedQty,
		RemainingAmount: "",
		IsLive:          r.Status == "OPEN" || r.Status == "NEW" || r.Status == "PARTIALLY_FILLED",
		IsCancelled:     r.Status == "CANCELLED" || r.Status == "CANCELED", //nolint:misspell // API status values
	}
}

func canceledResponseFromAPI(result *api.CancelAllResult) *contracts.CancelAllResponse {
	ids := make([]string, 0, len(result.Details.CancelledOrders))
	for _, o := range result.Details.CancelledOrders {
		ids = append(ids, o.OrderID)
	}
	return &contracts.CancelAllResponse{CanceledOrders: ids}
}
