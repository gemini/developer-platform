package main

import (
	"path"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
)

// restOperationCoverage is deliberately maintained next to the contract tests.
// Generated models track the complete API schema, while the hand-written
// services facade intentionally exposes a smaller, curated surface.
type restOperationCoverage struct {
	method string
	reason string
}

var unsupportedFacadeOperation = restOperationCoverage{
	reason: "generated request/response models exist, but no high-level services facade method is exposed yet",
}

func coverageKey(spec, operationID string) string {
	return spec + ":" + operationID
}

var sdkRESTOperationCoverage = map[string]restOperationCoverage{
	coverageKey("prediction-markets.yaml", "listEvents"):                         {method: "services.PredictionsService.GetEvents"},
	coverageKey("prediction-markets.yaml", "getEvent"):                           {method: "services.PredictionsService.GetEvent"},
	coverageKey("prediction-markets.yaml", "getCategories"):                      {method: "services.PredictionsService.GetCategories"},
	coverageKey("prediction-markets.yaml", "getPredictionMarketsTerms"):          {method: "services.PredictionsService.GetTerms"},
	coverageKey("prediction-markets.yaml", "getPredictionMarketsTermsStatus"):    {method: "services.PredictionsService.GetTermsStatus"},
	coverageKey("prediction-markets.yaml", "acceptPredictionMarketsTerms"):       {method: "services.PredictionsService.AcceptTerms"},
	coverageKey("prediction-markets.yaml", "placeOrder"):                         {method: "services.PredictionsService.NewOrder"},
	coverageKey("prediction-markets.yaml", "getEventStrike"):                     {method: "services.PredictionsService.GetEventStrike"},
	coverageKey("prediction-markets.yaml", "listNewlyListedEvents"):              {method: "services.PredictionsService.ListNewlyListedEvents"},
	coverageKey("prediction-markets.yaml", "listRecentlySettledEvents"):          {method: "services.PredictionsService.ListRecentlySettledEvents"},
	coverageKey("prediction-markets.yaml", "listUpcomingEvents"):                 {method: "services.PredictionsService.ListUpcomingEvents"},
	coverageKey("prediction-markets.yaml", "getPredictionMarketDailyVolume"):     {method: "services.PredictionsService.GetDailyVolume"},
	coverageKey("prediction-markets.yaml", "getPredictionMarketHourlyVolume"):    {method: "services.PredictionsService.GetHourlyVolume"},
	coverageKey("prediction-markets.yaml", "placeOrderBatch"):                    {method: "services.PredictionsService.PlaceOrderBatch"},
	coverageKey("prediction-markets.yaml", "cancelOrder"):                        {method: "services.PredictionsService.CancelOrder"},
	coverageKey("prediction-markets.yaml", "cancelOrderBatch"):                   {method: "services.PredictionsService.CancelOrderBatch"},
	coverageKey("prediction-markets.yaml", "getActiveOrders"):                    {method: "services.PredictionsService.GetActiveOrders"},
	coverageKey("prediction-markets.yaml", "getOrderHistory"):                    {method: "services.PredictionsService.GetOrderHistory"},
	coverageKey("prediction-markets.yaml", "getPositions"):                       {method: "services.PredictionsService.GetPositions"},
	coverageKey("prediction-markets.yaml", "getSettledPositions"):                {method: "services.PredictionsService.GetSettledPositions"},
	coverageKey("prediction-markets.yaml", "getVolumeMetrics"):                   {method: "services.PredictionsService.GetVolumeMetrics"},
	coverageKey("prediction-markets.yaml", "listCombos"):                         {method: "services.PredictionsService.ListCombos"},
	coverageKey("prediction-markets.yaml", "createCombo"):                        {method: "services.PredictionsService.CreateCombo"},
	coverageKey("prediction-markets.yaml", "getComboByInstrumentSymbol"):         {method: "services.PredictionsService.GetCombo"},
	coverageKey("prediction-markets.yaml", "getMakerRebateRates"):                {method: "services.PredictionsService.GetMakerRebateRates"},
	coverageKey("prediction-markets.yaml", "listMakerRebatePayouts"):             {method: "services.PredictionsService.ListMakerRebatePayouts"},
	coverageKey("prediction-markets.yaml", "getMakerRebateLifetimeSummary"):      {method: "services.PredictionsService.GetMakerRebateLifetimeSummary"},
	coverageKey("prediction-markets.yaml", "getLiquidityRewardsConfig"):          {method: "services.PredictionsService.GetLiquidityRewardsConfig"},
	coverageKey("prediction-markets.yaml", "listLiquidityRewardsEvents"):         {method: "services.PredictionsService.ListLiquidityRewardsEvents"},
	coverageKey("prediction-markets.yaml", "getLiquidityRewardsDailySummary"):    {method: "services.PredictionsService.GetLiquidityRewardsDailySummary"},
	coverageKey("prediction-markets.yaml", "getLiquidityRewardsLifetimeSummary"): {method: "services.PredictionsService.GetLiquidityRewardsLifetimeSummary"},

	coverageKey("rest.yaml", "listSymbols"):                 {method: "services.MarketDataService.GetSymbols"},
	coverageKey("rest.yaml", "getSymbolDetails"):            {method: "services.MarketDataService.GetSymbolDetails"},
	coverageKey("rest.yaml", "getTicker"):                   {method: "services.MarketDataService.GetTicker"},
	coverageKey("rest.yaml", "getCurrentOrderBook"):         {method: "services.MarketDataService.GetOrderBook"},
	coverageKey("rest.yaml", "listTrades"):                  {method: "services.MarketDataService.GetTrades"},
	coverageKey("rest.yaml", "listCandles"):                 {method: "services.MarketDataService.GetCandles"},
	coverageKey("rest.yaml", "getTickerV2"):                 {method: "services.MarketDataService.GetTickerV2"},
	coverageKey("rest.yaml", "getFundingAmount"):            {method: "services.PerpetualsService.GetFundingAmount"},
	coverageKey("rest.yaml", "getNextFundingTimestamp"):     {method: "services.PerpetualsService.GetNextFundingTimestamp"},
	coverageKey("rest.yaml", "listFundingPayments"):         {method: "services.PerpetualsService.GetFundingPayments"},
	coverageKey("rest.yaml", "createNewOrder"):              {method: "services.TradingService.NewOrder"},
	coverageKey("rest.yaml", "cancelOrder"):                 {method: "services.TradingService.CancelOrder"},
	coverageKey("rest.yaml", "cancelAllActiveOrders"):       {method: "services.TradingService.CancelAllOrders"},
	coverageKey("rest.yaml", "getOrderStatus"):              {method: "services.TradingService.GetOrderStatus"},
	coverageKey("rest.yaml", "listActiveOrders"):            {method: "services.TradingService.GetActiveOrders"},
	coverageKey("rest.yaml", "listPastTrades"):              {method: "services.TradingService.GetPastTrades"},
	coverageKey("rest.yaml", "getAvailableBalances"):        {method: "services.AccountService.GetBalances"},
	coverageKey("rest.yaml", "getNotionalBalances"):         {method: "services.AccountService.GetNotionalBalances"},
	coverageKey("rest.yaml", "getMarginAccount"):            {method: "services.MarginService.GetAccountSummary"},
	coverageKey("rest.yaml", "getMarginRates"):              {method: "services.MarginService.GetInterestRates"},
	coverageKey("rest.yaml", "previewMarginOrder"):          {method: "services.MarginService.PreviewOrder"},
	coverageKey("rest.yaml", "sendHeartbeat"):               {method: "services.HeartbeatService.Send"},
	coverageKey("rest.yaml", "createNewDepositAddress"):     {method: "services.AccountService.GetDepositAddress"},
	coverageKey("rest.yaml", "listPastTransfers"):           {method: "services.TransfersService.GetTransfers"},
	coverageKey("rest.yaml", "listCustodyFeeTransfers"):     {method: "services.TransfersService.GetCustodyFeeTransfers"},
	coverageKey("rest.yaml", "getGasFeeEstimation"):         {method: "services.TransfersService.GetWithdrawalFeeEstimateV2"},
	coverageKey("rest.yaml", "withdrawCryptoFunds"):         {method: "services.TransfersService.WithdrawCryptoV2"},
	coverageKey("rest.yaml", "createNewClearingOrder"):      {method: "services.ClearingService.NewClearingOrder"},
	coverageKey("rest.yaml", "getClearingOrder"):            {method: "services.ClearingService.GetClearingOrder"},
	coverageKey("rest.yaml", "cancelClearingOrder"):         {method: "services.ClearingService.CancelClearingOrder"},
	coverageKey("rest.yaml", "confirmClearingOrder"):        {method: "services.ClearingService.ConfirmClearingOrder"},
	coverageKey("rest.yaml", "addBank"):                     {method: "services.AccountService.AddBankUSD"},
	coverageKey("rest.yaml", "addBankCAD"):                  {method: "services.AccountService.AddBankCAD"},
	coverageKey("rest.yaml", "listPaymentMethods"):          {method: "services.AccountService.ListPaymentMethods"},
	coverageKey("rest.yaml", "getAccountDetail"):            {method: "services.AccountService.GetAccount"},
	coverageKey("rest.yaml", "listApprovedAddresses"):       {method: "services.AccountService.ListApprovedAddresses"},
	coverageKey("rest.yaml", "createNewApprovedAddress"):    {method: "services.AccountService.RequestApprovedAddress"},
	coverageKey("rest.yaml", "removeApprovedAddress"):       {method: "services.AccountService.RemoveApprovedAddress"},
	coverageKey("rest.yaml", "createNewAccount"):            {method: "services.AccountService.CreateAccount"},
	coverageKey("rest.yaml", "renameAccount"):               {method: "services.AccountService.RenameAccount"},
	coverageKey("rest.yaml", "listAccountsInGroup"):         {method: "services.AccountService.ListAccounts"},
	coverageKey("rest.yaml", "transferBetweenAccounts"):     {method: "services.AccountService.TransferBetweenAccounts"},
	coverageKey("rest.yaml", "listStakingBalances"):         {method: "services.StakingService.GetStakingBalances"},
	coverageKey("rest.yaml", "stakeCryptoFunds"):            {method: "services.StakingService.Stake"},
	coverageKey("rest.yaml", "listStakingEventHistory"):     {method: "services.StakingService.GetStakingHistory"},
	coverageKey("rest.yaml", "listStakingRates"):            {method: "services.StakingService.GetStakingRates"},
	coverageKey("rest.yaml", "listStakingRewards"):          {method: "services.StakingService.GetStakingRewards"},
	coverageKey("rest.yaml", "unstakeCryptoFunds"):          {method: "services.StakingService.Unstake"},
	coverageKey("rest.yaml", "getRoles"):                    {method: "services.AccountService.GetRoles"},
	coverageKey("rest.yaml", "revokeOAuthToken"):            {method: "services.AccountService.RevokeOAuthToken"},
	coverageKey("rest.yaml", "getFundingAmountReportFile"):  unsupportedFacadeOperation,
	coverageKey("rest.yaml", "cancelAllSessionOrders"):      unsupportedFacadeOperation,
	coverageKey("rest.yaml", "listPastOrders"):              unsupportedFacadeOperation,
	coverageKey("rest.yaml", "getTradingVolume"):            unsupportedFacadeOperation,
	coverageKey("rest.yaml", "getNotionalTradingVolume"):    unsupportedFacadeOperation,
	coverageKey("rest.yaml", "wrapOrder"):                   unsupportedFacadeOperation,
	coverageKey("rest.yaml", "listDepositAddresses"):        unsupportedFacadeOperation,
	coverageKey("rest.yaml", "listClearingOrders"):          unsupportedFacadeOperation,
	coverageKey("rest.yaml", "listClearingBrokers"):         unsupportedFacadeOperation,
	coverageKey("rest.yaml", "createNewBrokerOrder"):        unsupportedFacadeOperation,
	coverageKey("rest.yaml", "listClearingTrades"):          unsupportedFacadeOperation,
	coverageKey("rest.yaml", "getInstantQuote"):             unsupportedFacadeOperation,
	coverageKey("rest.yaml", "executeInstantOrder"):         unsupportedFacadeOperation,
	coverageKey("rest.yaml", "getTransactionHistory"):       unsupportedFacadeOperation,
	coverageKey("rest.yaml", "getAccountMargin"):            unsupportedFacadeOperation,
	coverageKey("rest.yaml", "getFundingPaymentReportFile"): unsupportedFacadeOperation,
	coverageKey("rest.yaml", "getFundingPaymentReportJson"): unsupportedFacadeOperation,
	coverageKey("rest.yaml", "getOpenPositions"):            unsupportedFacadeOperation,
	coverageKey("rest.yaml", "getRiskStats"):                unsupportedFacadeOperation,
	coverageKey("rest.yaml", "listDerivativeCandles"):       unsupportedFacadeOperation,
	coverageKey("rest.yaml", "getFXRate"):                   unsupportedFacadeOperation,
	coverageKey("rest.yaml", "listPrices"):                  unsupportedFacadeOperation,
	coverageKey("rest.yaml", "getAssetsForNetwork"):         unsupportedFacadeOperation,
	coverageKey("rest.yaml", "getTokenNetworkV2"):           unsupportedFacadeOperation,
	coverageKey("rest.yaml", "listFeePromos"):               unsupportedFacadeOperation,
}

func TestRESTOperationCoverageManifest(t *testing.T) {
	specs := []string{restSpecURL, predictionMarketsSpecURL}
	seen := make(map[string]struct{})

	for _, specURL := range specs {
		specName := path.Base(specURL)
		raw, err := loadPublishedSpec(specURL)
		if err != nil {
			t.Fatalf("reading spec %s: %v", specURL, err)
		}
		loader := openapi3.NewLoader()
		doc, err := loader.LoadFromData(sanitizeSpecBytes(raw))
		if err != nil {
			t.Fatalf("loading openapi doc %s: %v", specURL, err)
		}

		for path, item := range doc.Paths.Map() {
			if item == nil {
				continue
			}
			for method, operation := range item.Operations() {
				if operation == nil || operation.OperationID == "" {
					continue
				}
				key := coverageKey(specName, operation.OperationID)
				seen[key] = struct{}{}
				coverage, ok := sdkRESTOperationCoverage[key]
				if !ok {
					t.Errorf("%s %s operation %q is missing from the SDK coverage manifest", method, path, key)
					continue
				}
				if (coverage.method == "") == (coverage.reason == "") {
					t.Errorf("coverage entry %q must contain exactly one of method or reason", key)
				}
			}
		}
	}

	for key := range sdkRESTOperationCoverage {
		if _, ok := seen[key]; !ok {
			t.Errorf("coverage manifest entry %q does not match an operation in the current specs", key)
		}
	}
	if len(seen) == 0 {
		t.Fatal("no REST operations found in specs")
	}
	t.Logf("classified %d REST operations (%d high-level service methods, %d intentionally unsupported)", len(seen), supportedOperationCount(), len(seen)-supportedOperationCount())
}

func supportedOperationCount() int {
	count := 0
	for _, coverage := range sdkRESTOperationCoverage {
		if coverage.method != "" {
			count++
		}
	}
	return count
}

func TestRESTOperationCoverageKeysAreReadable(t *testing.T) {
	for key, coverage := range sdkRESTOperationCoverage {
		if strings.TrimSpace(key) == "" || (coverage.method == "" && coverage.reason == "") {
			t.Errorf("invalid REST coverage entry: %q (%+v)", key, coverage)
		}
	}
	if supportedOperationCount() == 0 {
		t.Fatal("coverage manifest has no supported operations")
	}
}
