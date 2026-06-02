package cmd

import (
	"context"
	"strings"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	appmarkets "github.com/gemini/developer-platform/packages/cli/internal/app/markets"
)

var (
	predictMarketStatusCompletions = []string{"active", "closed", "settled"}
	predictOrderSideCompletions    = []string{"buy", "sell"}
	predictOrderOutcomeCompletions = []string{"yes", "no"}
	predictOrderTypeCompletions    = []string{"limit", "market"}
	predictOrderTIFCompletions     = []string{"good-til-cancel", "immediate-or-cancel", "fill-or-kill", "post-only"}
	spotOrderTypeCompletions       = []string{"exchange limit", "exchange market", "exchange stop limit"}
	streamOrderEventCompletions    = []string{"accepted", "booked", "fill", "canceled", "cancelled", "closed", "rejected"}
)

func noFileCompletion(values []string) ([]string, cobra.ShellCompDirective) {
	return values, cobra.ShellCompDirectiveNoFileComp
}

func registerCoreCompletions() {
	_ = predictOrderPlaceCmd.RegisterFlagCompletionFunc("side", staticCompletion(predictOrderSideCompletions))
	_ = predictOrderPlaceCmd.RegisterFlagCompletionFunc("outcome", staticCompletion(predictOrderOutcomeCompletions))
	_ = predictOrderPlaceCmd.RegisterFlagCompletionFunc("type", staticCompletion(predictOrderTypeCompletions))
	_ = predictOrderPlaceCmd.RegisterFlagCompletionFunc("tif", staticCompletion(predictOrderTIFCompletions))
	_ = predictOrderPlaceCmd.RegisterFlagCompletionFunc("symbol", predictSymbolCompletion)

	_ = spotOrderPlaceCmd.RegisterFlagCompletionFunc("side", staticCompletion(predictOrderSideCompletions))
	_ = spotOrderPlaceCmd.RegisterFlagCompletionFunc("type", staticCompletion(spotOrderTypeCompletions))
	_ = spotOrderPlaceCmd.RegisterFlagCompletionFunc("symbol", spotSymbolCompletion)

	_ = predictMarketsListCmd.RegisterFlagCompletionFunc("status", staticCompletion(predictMarketStatusCompletions))
	_ = predictMarketsListCmd.RegisterFlagCompletionFunc("category", predictCategoryCompletion)
	predictMarketsGetCmd.ValidArgsFunction = predictMarketTickerCompletion
	_ = predictCategoriesCmd.RegisterFlagCompletionFunc("status", staticCompletion(predictMarketStatusCompletions))
	_ = predictNewlyListedCmd.RegisterFlagCompletionFunc("category", predictCategoryCompletion)
	_ = predictRecentlySettledCmd.RegisterFlagCompletionFunc("category", predictCategoryCompletion)
	_ = predictUpcomingCmd.RegisterFlagCompletionFunc("category", predictCategoryCompletion)
	_ = streamOrdersCmd.RegisterFlagCompletionFunc("event-type", staticCompletion(streamOrderEventCompletions))

	spotSymbolCmd.ValidArgsFunction = spotSymbolCompletion
	streamTickerCmd.ValidArgsFunction = anySymbolCompletion
	streamDepthCmd.ValidArgsFunction = anySymbolCompletion
	streamTradesCmd.ValidArgsFunction = anySymbolCompletion
}

func staticCompletion(values []string) func(*cobra.Command, []string, string) ([]string, cobra.ShellCompDirective) {
	return func(_ *cobra.Command, _ []string, _ string) ([]string, cobra.ShellCompDirective) {
		return noFileCompletion(values)
	}
}

func predictSymbolCompletion(cmd *cobra.Command, _ []string, toComplete string) ([]string, cobra.ShellCompDirective) {
	return dynamicCompletion(cmd, toComplete, "predict-symbols", func(ctx context.Context, svc *appmarkets.Service) ([]string, error) {
		return svc.ListPredictSymbols(ctx)
	})
}

func spotSymbolCompletion(cmd *cobra.Command, _ []string, toComplete string) ([]string, cobra.ShellCompDirective) {
	return dynamicCompletion(cmd, toComplete, "spot-symbols", func(ctx context.Context, svc *appmarkets.Service) ([]string, error) {
		return svc.ListSpotSymbols(ctx)
	})
}

func predictCategoryCompletion(cmd *cobra.Command, _ []string, toComplete string) ([]string, cobra.ShellCompDirective) {
	return dynamicCompletion(cmd, toComplete, "predict-categories", func(ctx context.Context, svc *appmarkets.Service) ([]string, error) {
		resp, err := svc.ListPredictCategories(ctx, nil)
		if err != nil {
			return nil, err
		}
		return resp.Categories, nil
	})
}

func predictMarketTickerCompletion(cmd *cobra.Command, _ []string, toComplete string) ([]string, cobra.ShellCompDirective) {
	return dynamicCompletion(cmd, toComplete, "predict-market-tickers", func(ctx context.Context, svc *appmarkets.Service) ([]string, error) {
		resp, err := svc.ListPredictMarkets(ctx, api.ListMarketsParams{
			Status: []string{"active"},
			Limit:  500,
		})
		if err != nil {
			return nil, err
		}

		tickers := make([]string, 0, len(resp.Data))
		for _, market := range resp.Data {
			tickers = append(tickers, market.Ticker)
		}
		return tickers, nil
	})
}

func anySymbolCompletion(cmd *cobra.Command, _ []string, toComplete string) ([]string, cobra.ShellCompDirective) {
	predictSymbols := loadCachedCompletionValues(cmd, "predict-symbols", func(ctx context.Context, svc *appmarkets.Service) ([]string, error) {
		return svc.ListPredictSymbols(ctx)
	})
	spotSymbols := loadCachedCompletionValues(cmd, "spot-symbols", func(ctx context.Context, svc *appmarkets.Service) ([]string, error) {
		return svc.ListSpotSymbols(ctx)
	})
	return noFileCompletion(filterCompletionValues(append(predictSymbols, spotSymbols...), toComplete))
}

func dynamicCompletion(
	cmd *cobra.Command,
	toComplete string,
	cacheKey string,
	load func(context.Context, *appmarkets.Service) ([]string, error),
) ([]string, cobra.ShellCompDirective) {
	return noFileCompletion(filterCompletionValues(loadCachedCompletionValues(cmd, cacheKey, load), toComplete))
}

func filterCompletionValues(values []string, toComplete string) []string {
	if toComplete == "" {
		return uniqueCompletionValues(values)
	}

	matches := make([]string, 0, len(values))
	prefix := strings.ToLower(toComplete)
	for _, value := range values {
		if strings.HasPrefix(strings.ToLower(value), prefix) {
			matches = append(matches, value)
		}
	}
	return uniqueCompletionValues(matches)
}

func uniqueCompletionValues(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	unique := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		unique = append(unique, value)
	}
	return unique
}
