package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/session"
	gemini "github.com/gemini/developer-platform/packages/sdk-go"
	ws "github.com/gemini/developer-platform/packages/sdk-go/websocket"
	"github.com/spf13/cobra"
)

// PublicStreamClient is the typed public WebSocket surface consumed by the
// stream commands. Keeping this interface at the command boundary makes tests
// independent from a network transport while leaving protocol handling to the
// official SDK.
type PublicStreamClient interface {
	SubscribeTrades(context.Context, string) (<-chan *ws.TradeEvent, error)
	SubscribeBookTicker(context.Context, string) (<-chan *ws.BookTicker, error)
	SubscribeDepthWithOptions(context.Context, string, ws.DepthSubscriptionOptions) (<-chan *ws.DepthUpdate, error)
	SubscribePartialDepth(context.Context, string, ws.PartialDepthSubscriptionOptions) (<-chan *ws.OrderBookSnapshot, error)
}

// PrivateStreamClient is the typed authenticated WebSocket surface consumed
// by private stream commands.
type PrivateStreamClient interface {
	SubscribeOrderEventsWithScope(context.Context, ws.SubscriptionScope) (<-chan *ws.OrderEvent, error)
	SubscribeBalancesWithOptions(context.Context, ws.AccountStreamOptions) (<-chan *ws.BalanceUpdate, error)
	SubscribePositionsWithOptions(context.Context, ws.AccountStreamOptions) (<-chan *ws.PositionReport, error)
}

// PublicStreamFactory creates a public typed WebSocket client and its owner
// for one command invocation. The owner is closed when streaming ends.
type PublicStreamFactory func(context.Context, GlobalOptions) (PublicStreamClient, io.Closer, error)

// PrivateStreamFactory creates an authenticated typed WebSocket client and
// its owner for one command invocation. The owner is closed when streaming
// ends.
type PrivateStreamFactory func(context.Context, GlobalOptions) (PrivateStreamClient, io.Closer, error)

func defaultPublicStreamFactory(ctx context.Context, options GlobalOptions) (PublicStreamClient, io.Closer, error) {
	valueSession, err := session.New(session.Config{
		Environment:      gemini.Environment(options.Environment),
		EnableWebSockets: true,
	})
	if err != nil {
		return nil, nil, err
	}
	return valueSession.Client.PublicWebSocket(), closeSession(valueSession), nil
}

func defaultPrivateStreamFactory(ctx context.Context, options GlobalOptions) (PrivateStreamClient, io.Closer, error) {
	config, err := privateSessionConfig(ctx, options)
	if err != nil {
		return nil, nil, err
	}
	config.EnableWebSockets = true
	config.PrivateWebSockets = true
	valueSession, err := session.New(config)
	if err != nil {
		return nil, nil, err
	}
	return valueSession.Client.PrivateWebSocket(), closeSession(valueSession), nil
}

// NewStreamCommand creates the WebSocket stream command tree. Root command
// wiring intentionally remains in root.go's owner: callers should register
// the returned command with root.AddCommand(NewStreamCommand()).
func NewStreamCommand() *cobra.Command {
	return NewStreamCommandWithFactories(defaultPublicStreamFactory, defaultPrivateStreamFactory)
}

// NewStreamsCommand is a plural-name convenience alias for NewStreamCommand.
func NewStreamsCommand() *cobra.Command { return NewStreamCommand() }

// NewStreamCommandWithFactories creates the stream tree with injected typed
// SDK consumers. It is primarily useful for focused command tests.
func NewStreamCommandWithFactories(publicFactory PublicStreamFactory, privateFactory PrivateStreamFactory) *cobra.Command {
	if publicFactory == nil {
		publicFactory = defaultPublicStreamFactory
	}
	if privateFactory == nil {
		privateFactory = defaultPrivateStreamFactory
	}

	command := &cobra.Command{
		Use:     "stream",
		Aliases: []string{"streams"},
		Short:   "Stream real-time market and account data",
		Long:    "Stream real-time market and account data as newline-delimited JSON (one event per line) until interrupted. Stream output is always NDJSON; the global --output flag does not apply.",
		Args:    cobra.NoArgs,
	}
	command.AddCommand(
		newTradesStreamCommand(publicFactory),
		newTickerStreamCommand(publicFactory),
		newDepthStreamCommand(publicFactory),
		newOrdersStreamCommand(privateFactory),
		newBalancesStreamCommand(privateFactory),
		newPositionsStreamCommand(privateFactory),
	)
	return command
}

// NewStreamCommandWithFactory is the public-only injection convenience. The
// private children retain their default authenticated factory.
func NewStreamCommandWithFactory(publicFactory PublicStreamFactory) *cobra.Command {
	return NewStreamCommandWithFactories(publicFactory, nil)
}

func newTradesStreamCommand(factory PublicStreamFactory) *cobra.Command {
	return &cobra.Command{
		Use:     "trades SYMBOL",
		Aliases: []string{"trade"},
		Short:   "Stream public trades for a symbol",
		Args:    oneNonEmptyArgument("symbol"),
		RunE: func(cmd *cobra.Command, args []string) error {
			symbol := strings.TrimSpace(args[0])
			return withPublicStream(cmd, factory, func(ctx context.Context, client PublicStreamClient, output io.Writer) error {
				events, err := client.SubscribeTrades(ctx, symbol)
				if err != nil {
					return fmt.Errorf("subscribe trades for %s: %w", symbol, err)
				}
				return consumeClientStream(ctx, output, client, events)
			})
		},
	}
}

func newTickerStreamCommand(factory PublicStreamFactory) *cobra.Command {
	return &cobra.Command{
		Use:     "ticker SYMBOL",
		Aliases: []string{"book-ticker", "bookticker", "bbo"},
		Short:   "Stream public best bid and offer updates for a symbol",
		Args:    oneNonEmptyArgument("symbol"),
		RunE: func(cmd *cobra.Command, args []string) error {
			symbol := strings.TrimSpace(args[0])
			return withPublicStream(cmd, factory, func(ctx context.Context, client PublicStreamClient, output io.Writer) error {
				events, err := client.SubscribeBookTicker(ctx, symbol)
				if err != nil {
					return fmt.Errorf("subscribe book ticker for %s: %w", symbol, err)
				}
				return consumeClientStream(ctx, output, client, events)
			})
		},
	}
}

func newDepthStreamCommand(factory PublicStreamFactory) *cobra.Command {
	var levels int
	var interval time.Duration
	command := &cobra.Command{
		Use:     "depth SYMBOL",
		Aliases: []string{"order-book"},
		Short:   "Stream public order-book depth updates for a symbol",
		Args:    oneNonEmptyArgument("symbol"),
		RunE: func(cmd *cobra.Command, args []string) error {
			if levels != 0 && levels != 5 && levels != 10 && levels != 20 {
				return fmt.Errorf("depth levels must be 0, 5, 10, or 20")
			}
			if interval != 0 && interval != 100*time.Millisecond {
				return fmt.Errorf("depth interval must be 0 or 100ms")
			}
			symbol := strings.TrimSpace(args[0])
			return withPublicStream(cmd, factory, func(ctx context.Context, client PublicStreamClient, output io.Writer) error {
				if levels == 0 {
					events, err := client.SubscribeDepthWithOptions(ctx, symbol, ws.DepthSubscriptionOptions{Interval: interval})
					if err != nil {
						return fmt.Errorf("subscribe depth for %s: %w", symbol, err)
					}
					return consumeClientStream(ctx, output, client, events)
				}
				events, err := client.SubscribePartialDepth(ctx, symbol, ws.PartialDepthSubscriptionOptions{
					Levels:   ws.PartialDepthLevel(levels),
					Interval: interval,
				})
				if err != nil {
					return fmt.Errorf("subscribe depth for %s: %w", symbol, err)
				}
				return consumeClientStream(ctx, output, client, events)
			})
		},
	}
	command.Flags().IntVar(&levels, "levels", 0, "partial-depth levels (0 for differential depth; use 5, 10, or 20)")
	command.Flags().DurationVar(&interval, "interval", 0, "update interval (0 or 100ms)")
	return command
}

func newOrdersStreamCommand(factory PrivateStreamFactory) *cobra.Command {
	var scope string
	command := &cobra.Command{
		Use:     "orders",
		Aliases: []string{"order"},
		Short:   "Stream authenticated order lifecycle updates",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			normalizedScope := strings.ToLower(strings.TrimSpace(scope))
			if normalizedScope != string(ws.ScopeAccount) && normalizedScope != string(ws.ScopeSession) {
				return fmt.Errorf("order stream scope must be account or session")
			}
			return withPrivateStream(cmd, factory, func(ctx context.Context, client PrivateStreamClient, output io.Writer) error {
				events, err := client.SubscribeOrderEventsWithScope(ctx, ws.SubscriptionScope(normalizedScope))
				if err != nil {
					return fmt.Errorf("subscribe order events: %w", err)
				}
				return consumeClientStream(ctx, output, client, events)
			})
		},
	}
	command.Flags().StringVar(&scope, "scope", string(ws.ScopeAccount), "order stream scope (account or session)")
	return command
}

func newBalancesStreamCommand(factory PrivateStreamFactory) *cobra.Command {
	var interval time.Duration
	command := &cobra.Command{
		Use:   "balances",
		Short: "Stream authenticated balance updates",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if interval != 0 && interval != time.Second {
				return fmt.Errorf("balance stream interval must be 0 or 1s")
			}
			return withPrivateStream(cmd, factory, func(ctx context.Context, client PrivateStreamClient, output io.Writer) error {
				events, err := client.SubscribeBalancesWithOptions(ctx, ws.AccountStreamOptions{Interval: interval})
				if err != nil {
					return fmt.Errorf("subscribe balances: %w", err)
				}
				return consumeClientStream(ctx, output, client, events)
			})
		},
	}
	command.Flags().DurationVar(&interval, "interval", 0, "update interval (0 or 1s)")
	return command
}

func newPositionsStreamCommand(factory PrivateStreamFactory) *cobra.Command {
	var interval time.Duration
	command := &cobra.Command{
		Use:   "positions",
		Short: "Stream authenticated position updates",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if interval != 0 && interval != time.Second {
				return fmt.Errorf("position stream interval must be 0 or 1s")
			}
			return withPrivateStream(cmd, factory, func(ctx context.Context, client PrivateStreamClient, output io.Writer) error {
				events, err := client.SubscribePositionsWithOptions(ctx, ws.AccountStreamOptions{Interval: interval})
				if err != nil {
					return fmt.Errorf("subscribe positions: %w", err)
				}
				return consumeClientStream(ctx, output, client, events)
			})
		},
	}
	command.Flags().DurationVar(&interval, "interval", 0, "update interval (0 or 1s)")
	return command
}

type streamRun func(context.Context, io.Writer) error

// connectionEventSource is the terminal-status seam exposed by the SDK's
// typed WebSocket client. A feed channel carries values only, so its closure
// cannot preserve the reason a resilient connection stopped. The SDK reports
// terminal failures as a ConnectionEvent with StateDisconnected (and Err),
// which the CLI observes when the concrete client supports this API.
type connectionEventSource interface {
	SubscribeConnectionEvents(buffer int) (<-chan ws.ConnectionEvent, func())
}

func withPublicStream(cmd *cobra.Command, factory PublicStreamFactory, run func(context.Context, PublicStreamClient, io.Writer) error) error {
	if factory == nil {
		return errors.New("public stream factory is nil")
	}
	return withStreamContext(cmd, func(ctx context.Context, output io.Writer) error {
		client, owner, err := factory(ctx, Options(cmd))
		if err != nil {
			return fmt.Errorf("create public WebSocket session: %w", err)
		}
		if client == nil {
			if owner != nil {
				_ = owner.Close()
			}
			return errors.New("public WebSocket client is unavailable")
		}
		return withStreamOwner(owner, func() error { return run(ctx, client, output) })
	})
}

func withPrivateStream(cmd *cobra.Command, factory PrivateStreamFactory, run func(context.Context, PrivateStreamClient, io.Writer) error) error {
	if factory == nil {
		return errors.New("private stream factory is nil")
	}
	return withStreamContext(cmd, func(ctx context.Context, output io.Writer) error {
		client, owner, err := factory(ctx, Options(cmd))
		if err != nil {
			return fmt.Errorf("create private WebSocket session: %w", err)
		}
		if client == nil {
			if owner != nil {
				_ = owner.Close()
			}
			return errors.New("private WebSocket client is unavailable")
		}
		return withStreamOwner(owner, func() error { return run(ctx, client, output) })
	})
}

func withStreamOwner(owner io.Closer, run func() error) (err error) {
	if owner != nil {
		defer func() {
			if closeErr := owner.Close(); err == nil && closeErr != nil {
				err = fmt.Errorf("close WebSocket session: %w", closeErr)
			}
		}()
	}
	return run()
}

func withStreamContext(cmd *cobra.Command, run streamRun) error {
	parent := context.Background()
	if cmd != nil && cmd.Context() != nil {
		parent = cmd.Context()
	}
	ctx, stop := signal.NotifyContext(parent, os.Interrupt, syscall.SIGTERM)
	defer stop()
	return run(ctx, cmd.OutOrStdout())
}

func consumeClientStream[T any](ctx context.Context, output io.Writer, client any, events <-chan *T) error {
	var connectionEvents <-chan ws.ConnectionEvent
	stopConnectionEvents := func() {}
	if source, ok := client.(connectionEventSource); ok {
		connectionEvents, stopConnectionEvents = source.SubscribeConnectionEvents(16)
	}
	defer stopConnectionEvents()
	return consumeStream(ctx, output, events, connectionEvents)
}

// consumeStream emits one compact JSON value per line. A cancelled command is
// a successful end to a stream; this keeps Ctrl-C from producing a misleading
// command error while still allowing subscription failures, terminal SDK
// connection errors, and write errors to reach the caller. A closed feed
// without cancellation is always abnormal, including when a custom client
// does not expose the SDK connection-event API.
func consumeStream[T any](ctx context.Context, output io.Writer, events <-chan *T, connectionEvents ...<-chan ws.ConnectionEvent) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if events == nil {
		return errors.New("WebSocket subscription returned a nil channel")
	}
	var lifecycleEvents <-chan ws.ConnectionEvent
	if len(connectionEvents) > 0 {
		lifecycleEvents = connectionEvents[0]
	}
	encoder := json.NewEncoder(output)
	for {
		if ctx.Err() != nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return nil
		case event, ok := <-events:
			if !ok {
				if ctx.Err() != nil {
					return nil
				}
				return errors.New("WebSocket stream closed unexpectedly")
			}
			if ctx.Err() != nil {
				return nil
			}
			if err := encoder.Encode(event); err != nil {
				return fmt.Errorf("write stream event: %w", err)
			}
		case lifecycleEvent, ok := <-lifecycleEvents:
			if !ok {
				lifecycleEvents = nil
				continue
			}
			if ctx.Err() != nil {
				return nil
			}
			if lifecycleEvent.State == ws.StateDisconnected || lifecycleEvent.State == ws.StateClosed {
				if lifecycleEvent.Err != nil {
					return fmt.Errorf("WebSocket stream terminated: %w", lifecycleEvent.Err)
				}
				return errors.New("WebSocket stream closed unexpectedly")
			}
		}
	}
}
