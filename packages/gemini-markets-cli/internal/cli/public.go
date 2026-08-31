package cli

import (
	"context"
	"errors"
	"fmt"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/session"
	gemini "github.com/gemini/developer-platform/packages/sdk-go"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/marketdata"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/spf13/cobra"
)

// PublicMarketData is the part of the SDK market-data service used by the
// public CLI. Keeping this interface consumer-defined makes command tests
// independent of HTTP and leaves the SDK as the only protocol implementation.
type PublicMarketData interface {
	GetSymbols(context.Context) ([]string, error)
	GetTicker(context.Context, string) (*marketdata.Ticker, error)
	GetOrderBook(context.Context, string, int, int) (*marketdata.OrderBook, error)
	GetCandles(context.Context, string, string) (marketdata.CandleResponse, error)
}

// PublicPredictions is the subset of the SDK predictions service used by this
// command group. Terms status and acceptance are authenticated operations even
// though they live alongside public prediction-market discovery commands.
type PublicPredictions interface {
	GetEvents(context.Context, *predictions.ListEventsParams) (*predictions.EventsResponse, error)
	GetEvent(context.Context, string) (*predictions.Event, error)
	GetTerms(context.Context) (*predictions.PredictionMarketsTerms, error)
	GetTermsStatus(context.Context) (*predictions.PredictionMarketsTermsStatus, error)
	AcceptTerms(context.Context) (*predictions.AcceptPredictionMarketsTermsResponse, error)
}

// PublicServices contains SDK services needed by public commands. Close is
// optional and lets a factory release transports when a command completes.
// The fields intentionally expose interfaces rather than wrapping SDK models.
type PublicServices struct {
	MarketData  PublicMarketData
	Predictions PublicPredictions
	Close       func() error
}

// PublicServiceFactory creates services for one command invocation. Options
// are read from the root command, so the environment/profile conventions stay
// shared with every other CLI command group.
type PublicServiceFactory func(context.Context, GlobalOptions) (PublicServices, error)

// NewPublicCommand creates the public market and prediction-market command tree.
func NewPublicCommand(factories ...PublicServiceFactory) *cobra.Command {
	publicFactory, authenticatedFactory := publicFactories(factories)
	command := &cobra.Command{
		Use:   "public",
		Short: "Public market and prediction-market data",
		Args:  cobra.NoArgs,
	}
	command.AddCommand(newMarketsCommand(publicFactory), newPublicPredictionMarketsCommand(publicFactory, authenticatedFactory))
	return command
}

// NewPublicCommandWithFactory is the explicit form of NewPublicCommand for
// applications and tests that need to provide their own session/service
// construction.
func NewPublicCommandWithFactory(factory PublicServiceFactory) *cobra.Command {
	return NewPublicCommand(factory)
}

// NewPublicCommandWithServices creates a complete public command tree backed
// by a fixed service set. It is useful for small embedders and unit tests.
func NewPublicCommandWithServices(services PublicServices) *cobra.Command {
	return NewPublicCommand(func(context.Context, GlobalOptions) (PublicServices, error) {
		return services, nil
	})
}

// NewMarketsCommand creates the market-data command group. It accepts an
// optional factory so root registration can use the default session while
// tests inject a deterministic SDK-service fake.
func NewMarketsCommand(factories ...PublicServiceFactory) *cobra.Command {
	return newMarketsCommand(publicFactory(factories))
}

// NewMarketsCommandWithFactory is the explicit factory-injection form of
// NewMarketsCommand.
func NewMarketsCommandWithFactory(factory PublicServiceFactory) *cobra.Command {
	return NewMarketsCommand(factory)
}

// NewPredictionMarketsCommand creates the prediction-market discovery group.
func NewPredictionMarketsCommand(factories ...PublicServiceFactory) *cobra.Command {
	publicFactory, authenticatedFactory := publicFactories(factories)
	return newPublicPredictionMarketsCommand(publicFactory, authenticatedFactory)
}

// NewPredictionMarketsCommandWithFactory is the explicit factory-injection
// form of NewPredictionMarketsCommand.
func NewPredictionMarketsCommandWithFactory(factory PublicServiceFactory) *cobra.Command {
	return NewPredictionMarketsCommand(factory)
}

func publicFactory(factories []PublicServiceFactory) PublicServiceFactory {
	if len(factories) > 0 && factories[0] != nil {
		return factories[0]
	}
	return defaultPublicServiceFactory
}

func publicFactories(factories []PublicServiceFactory) (PublicServiceFactory, PublicServiceFactory) {
	if len(factories) > 0 && factories[0] != nil {
		return factories[0], factories[0]
	}
	return defaultPublicServiceFactory, defaultAuthenticatedPublicServiceFactory
}

func defaultPublicServiceFactory(ctx context.Context, options GlobalOptions) (PublicServices, error) {
	current, err := session.New(session.Config{
		Environment: gemini.Environment(options.Environment),
	})
	if err != nil {
		return PublicServices{}, err
	}
	return PublicServices{
		MarketData:  current.Client.MarketData,
		Predictions: current.Client.Predictions,
		Close:       current.Close,
	}, nil
}

func defaultAuthenticatedPublicServiceFactory(ctx context.Context, options GlobalOptions) (PublicServices, error) {
	current, err := newPrivateSession(ctx, options)
	if err != nil {
		return PublicServices{}, err
	}
	return PublicServices{
		MarketData:  current.Client.MarketData,
		Predictions: current.Client.Predictions,
		Close:       current.Close,
	}, nil
}

func withPublicServices(cmd *cobra.Command, factory PublicServiceFactory, run func(PublicServices) error) error {
	if factory == nil {
		return errors.New("public command service factory is nil")
	}
	services, err := factory(cmd.Context(), Options(cmd))
	if err != nil {
		return fmt.Errorf("create public API session: %w", err)
	}
	if run != nil {
		err = run(services)
	}
	if services.Close != nil {
		closeErr := services.Close()
		if err == nil {
			err = closeErr
		}
	}
	return err
}
