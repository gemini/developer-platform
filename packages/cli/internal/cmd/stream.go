package cmd

import (
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/spf13/cobra"

	appstreams "github.com/gemini/developer-platform/packages/cli/internal/app/streams"
	"github.com/gemini/developer-platform/packages/cli/internal/config"
	"github.com/gemini/developer-platform/packages/cli/internal/debug"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
	"github.com/gemini/developer-platform/packages/cli/internal/ws"
)

var streamCmd = &cobra.Command{
	Use:   "stream",
	Short: "Real-time WebSocket streams",
	Long: `Subscribe to real-time market data via WebSocket.

Streams run until interrupted (Ctrl+C). Data is output as JSON, one message per line.

Examples:
  gemini-markets stream ticker GEMI-NBA-LAL-BOS
  gemini-markets stream trades GEMI-NBA-LAL-BOS
  gemini-markets stream depth GEMI-NBA-LAL-BOS`,
}

var streamTickerCmd = &cobra.Command{
	Use:   "ticker <symbol>...",
	Short: "Stream best bid/ask prices",
	Example: `  gemini-markets stream ticker BTCUSD
  gemini-markets stream ticker GEMI-NBA-LAL-BOS GEMI-FED250319 -q`,
	Long: `Stream best bid/ask prices in real-time for one or more symbols.

Outputs one JSON object per line on each price update. Runs until Ctrl+C.

Examples:
  gemini-markets stream ticker GEMI-NBA-LAL-BOS
  gemini-markets stream ticker GEMI-NBA-LAL-BOS GEMI-FED250319
  gemini-markets stream ticker GEMI-NBA-LAL-BOS -q`,
	Args: cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := loadConfigWithFallback(cmd)
		if err != nil {
			return handleCommandError(err)
		}

		ctx, cancel := signal.NotifyContext(cmd.Context(), syscall.SIGINT, syscall.SIGTERM)
		defer cancel()

		wsURL := cfg.GetPredictionsWebSocketURL()
		debug.Log("connecting to %s for symbols %v", wsURL, args)

		client, err := ws.Connect(ctx, wsURL, ws.WithReconnect(5))
		if err != nil {
			return handleCommandError(err)
		}
		defer client.Close()

		streams := make([]string, len(args))
		for i, symbol := range args {
			streams[i] = ws.TickerStream(symbol)
		}

		if err := client.Subscribe(ctx, streams...); err != nil {
			return handleCommandError(err)
		}

		if !IsQuiet() {
			fmt.Fprintln(os.Stderr, "Streaming ticker data, press Ctrl+C to stop...")
		}

		for msg := range client.Stream(ctx) {
			_ = output.PrintJSONCompact(msg)
		}

		return nil
	},
}

var streamDepthLimit int

var streamDepthCmd = &cobra.Command{
	Use:   "depth <symbol>",
	Short: "Stream order book updates",
	Example: `  gemini-markets stream depth BTCUSD
  gemini-markets stream depth GEMI-NBA-LAL-BOS --limit 5 -q`,
	Long: `Stream order book depth updates for a symbol.

Outputs one JSON object per line on each book update. Default 10 price levels.

Examples:
  gemini-markets stream depth GEMI-NBA-LAL-BOS
  gemini-markets stream depth GEMI-NBA-LAL-BOS --limit 5
  gemini-markets stream depth GEMI-NBA-LAL-BOS -q`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := loadConfigWithFallback(cmd)
		if err != nil {
			return handleCommandError(err)
		}

		ctx, cancel := signal.NotifyContext(cmd.Context(), syscall.SIGINT, syscall.SIGTERM)
		defer cancel()

		wsURL := cfg.GetPredictionsWebSocketURL()
		symbol := args[0]

		debug.Log("connecting to %s for %s (limit=%d)", wsURL, symbol, streamDepthLimit)

		client, err := ws.Connect(ctx, wsURL, ws.WithReconnect(5))
		if err != nil {
			return handleCommandError(err)
		}
		defer client.Close()

		stream := ws.DepthStream(symbol, streamDepthLimit)
		if err := client.Subscribe(ctx, stream); err != nil {
			return handleCommandError(err)
		}

		if !IsQuiet() {
			fmt.Fprintln(os.Stderr, "Streaming depth data, press Ctrl+C to stop...")
		}

		for msg := range client.Stream(ctx) {
			_ = output.PrintJSONCompact(msg)
		}

		return nil
	},
}

var streamTradesCmd = &cobra.Command{
	Use:   "trades <symbol>...",
	Short: "Stream trades",
	Example: `  gemini-markets stream trades BTCUSD
  gemini-markets stream trades GEMI-NBA-LAL-BOS GEMI-FED250319 -q`,
	Long: `Stream executed trades in real-time for one or more symbols.

Outputs one JSON object per line on each trade. Runs until Ctrl+C.

Examples:
  gemini-markets stream trades GEMI-NBA-LAL-BOS
  gemini-markets stream trades GEMI-NBA-LAL-BOS GEMI-FED250319
  gemini-markets stream trades GEMI-NBA-LAL-BOS -q`,
	Args: cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := loadConfigWithFallback(cmd)
		if err != nil {
			return handleCommandError(err)
		}

		ctx, cancel := signal.NotifyContext(cmd.Context(), syscall.SIGINT, syscall.SIGTERM)
		defer cancel()

		wsURL := cfg.GetPredictionsWebSocketURL()
		debug.Log("connecting to %s for symbols %v", wsURL, args)

		client, err := ws.Connect(ctx, wsURL, ws.WithReconnect(5))
		if err != nil {
			return handleCommandError(err)
		}
		defer client.Close()

		streams := make([]string, len(args))
		for i, symbol := range args {
			streams[i] = ws.TradesStream(symbol)
		}

		if err := client.Subscribe(ctx, streams...); err != nil {
			return handleCommandError(err)
		}

		if !IsQuiet() {
			fmt.Fprintln(os.Stderr, "Streaming trades, press Ctrl+C to stop...")
		}

		for msg := range client.Stream(ctx) {
			_ = output.PrintJSONCompact(msg)
		}

		return nil
	},
}

var (
	streamOrdersSymbols     []string
	streamOrdersEventTypes  []string
	streamOrdersSessionOnly bool
)

var streamOrdersCmd = &cobra.Command{
	Use:   "orders",
	Short: "Stream order updates (authenticated)",
	Example: `  gemini-markets stream orders
  gemini-markets stream orders --event-type fill --symbol GEMI-BTC*
  gemini-markets stream orders --session-only -q`,
	Long: `Stream real-time order updates for your account.

Requires API credentials. Shows order status changes including:
accepted, booked, fill, canceled/cancelled, closed, rejected

Examples:
  # All order events
  gemini-markets stream orders

  # Only fills (executions)
  gemini-markets stream orders --event-type fill

  # Only specific symbols
  gemini-markets stream orders --symbol GEMI-FED260318-MAINTAIN

  # Multiple filters
  gemini-markets stream orders --symbol GEMI-BTC* --event-type fill,booked

  # Only orders from this session
  gemini-markets stream orders --session-only`,
	RunE: func(cmd *cobra.Command, args []string) error {
		rt, err := authenticatedRuntime(cmd)
		if err != nil {
			return handleCommandError(err)
		}

		stream := ws.OrdersStream()
		if streamOrdersSessionOnly {
			stream = ws.OrdersSessionStream()
		}
		if err := validatePrivateWebSocketAuth(rt.Config, stream); err != nil {
			return handleCommandError(err)
		}

		ctx, cancel := signal.NotifyContext(cmd.Context(), syscall.SIGINT, syscall.SIGTERM)
		defer cancel()

		cfg := rt.Config
		wsURL := cfg.GetPredictionsWebSocketURL()
		debug.Log("connecting to %s (authenticated)", wsURL)

		opts := append(rt.WSClientOptions(), ws.WithReconnect(5))
		client, err := ws.Connect(ctx, wsURL, opts...)
		if err != nil {
			return handleCommandError(err)
		}
		defer client.Close()

		if err := client.Subscribe(ctx, stream); err != nil {
			return handleCommandError(err)
		}

		if !IsQuiet() {
			fmt.Fprintln(os.Stderr, "Streaming order updates, press Ctrl+C to stop...")
		}

		for msg := range client.Stream(ctx) {
			if appstreams.ShouldFilterOrderMessage(msg, streamOrdersSymbols, streamOrdersEventTypes) {
				continue
			}
			_ = output.PrintJSONCompact(msg)
		}

		return nil
	},
}

var streamBalancesCmd = &cobra.Command{
	Use:   "balances",
	Short: "Stream balance updates (authenticated)",
	Example: `  gemini-markets stream balances
  gemini-markets stream balances -q`,
	Long: `Stream real-time balance updates for your account.

Requires API credentials. Outputs one JSON object per line on each balance change.

Examples:
  gemini-markets stream balances
  gemini-markets stream balances -q`,
	RunE: func(cmd *cobra.Command, args []string) error {
		rt, err := authenticatedRuntime(cmd)
		if err != nil {
			return handleCommandError(err)
		}
		if err := validatePrivateWebSocketAuth(rt.Config, ws.BalancesStream()); err != nil {
			return handleCommandError(err)
		}

		ctx, cancel := signal.NotifyContext(cmd.Context(), syscall.SIGINT, syscall.SIGTERM)
		defer cancel()

		cfg := rt.Config
		wsURL := cfg.GetPredictionsWebSocketURL()
		debug.Log("connecting to %s (authenticated)", wsURL)

		opts := append(rt.WSClientOptions(), ws.WithReconnect(5))
		client, err := ws.Connect(ctx, wsURL, opts...)
		if err != nil {
			return handleCommandError(err)
		}
		defer client.Close()

		if err := client.Subscribe(ctx, ws.BalancesStream()); err != nil {
			return handleCommandError(err)
		}

		if !IsQuiet() {
			fmt.Fprintln(os.Stderr, "Streaming balance updates, press Ctrl+C to stop...")
		}

		for msg := range client.Stream(ctx) {
			_ = output.PrintJSONCompact(msg)
		}

		return nil
	},
}

var streamPositionsCmd = &cobra.Command{
	Use:   "positions",
	Short: "Stream position updates (authenticated)",
	Example: `  gemini-markets stream positions
  gemini-markets stream positions -q`,
	Long: `Stream real-time position updates for your account.

Requires API credentials. Outputs one JSON object per line on each position change.

Examples:
  gemini-markets stream positions
  gemini-markets stream positions -q`,
	RunE: func(cmd *cobra.Command, args []string) error {
		rt, err := authenticatedRuntime(cmd)
		if err != nil {
			return handleCommandError(err)
		}
		if err := validatePrivateWebSocketAuth(rt.Config, ws.PositionsStream()); err != nil {
			return handleCommandError(err)
		}

		ctx, cancel := signal.NotifyContext(cmd.Context(), syscall.SIGINT, syscall.SIGTERM)
		defer cancel()

		cfg := rt.Config
		wsURL := cfg.GetPredictionsWebSocketURL()
		debug.Log("connecting to %s (authenticated)", wsURL)

		opts := append(rt.WSClientOptions(), ws.WithReconnect(5))
		client, err := ws.Connect(ctx, wsURL, opts...)
		if err != nil {
			return handleCommandError(err)
		}
		defer client.Close()

		if err := client.Subscribe(ctx, ws.PositionsStream()); err != nil {
			return handleCommandError(err)
		}

		if !IsQuiet() {
			fmt.Fprintln(os.Stderr, "Streaming position updates, press Ctrl+C to stop...")
		}

		for msg := range client.Stream(ctx) {
			_ = output.PrintJSONCompact(msg)
		}

		return nil
	},
}

var streamContractStatusSymbols []string

var streamContractStatusCmd = &cobra.Command{
	Use:   "contract-status",
	Short: "Stream contract lifecycle events",
	Example: `  gemini-markets stream contract-status
  gemini-markets stream contract-status --symbol GEMI-BTC* -q`,
	Long: `Stream real-time contract lifecycle and strike-price events (public).

Emits an event whenever a contract changes status (e.g., Approved → Active)
or when a strike price is set for an Up/Down contract.

Examples:
  gemini-markets stream contract-status
  gemini-markets stream contract-status --symbol GEMI-NBA-2605270030-SAS-OKC-M-OKC
  gemini-markets stream contract-status --symbol GEMI-BTC* -q`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := loadConfigWithFallback(cmd)
		if err != nil {
			return handleCommandError(err)
		}

		ctx, cancel := signal.NotifyContext(cmd.Context(), syscall.SIGINT, syscall.SIGTERM)
		defer cancel()

		wsURL := cfg.GetPredictionsWebSocketURL()
		debug.Log("connecting to %s for contractStatus", wsURL)

		client, err := ws.Connect(ctx, wsURL, ws.WithReconnect(5))
		if err != nil {
			return handleCommandError(err)
		}
		defer client.Close()

		if err := client.Subscribe(ctx, ws.ContractStatusStream()); err != nil {
			return handleCommandError(err)
		}

		if !IsQuiet() {
			fmt.Fprintln(os.Stderr, "Streaming contract status events, press Ctrl+C to stop...")
		}

		for msg := range client.Stream(ctx) {
			if len(streamContractStatusSymbols) > 0 && !appstreams.ShouldIncludeContractStatusMessage(msg, streamContractStatusSymbols) {
				continue
			}
			_ = output.PrintJSONCompact(msg)
		}

		return nil
	},
}

func init() {
	streamDepthCmd.Flags().IntVar(&streamDepthLimit, "limit", 10, "number of price levels")

	streamOrdersCmd.Flags().StringSliceVar(&streamOrdersSymbols, "symbol", nil, "filter by symbol(s), supports wildcards (e.g., GEMI-BTC*)")
	streamOrdersCmd.Flags().StringSliceVar(&streamOrdersEventTypes, "event-type", nil, "filter by event type(s): accepted, booked, fill, canceled/cancelled, closed, rejected")
	streamOrdersCmd.Flags().BoolVar(&streamOrdersSessionOnly, "session-only", false, "only show orders from current session")

	streamContractStatusCmd.Flags().StringSliceVar(&streamContractStatusSymbols, "symbol", nil, "filter by symbol(s), supports wildcards (e.g., GEMI-BTC*)")

	streamCmd.AddCommand(streamTickerCmd)
	streamCmd.AddCommand(streamDepthCmd)
	streamCmd.AddCommand(streamTradesCmd)
	streamCmd.AddCommand(streamOrdersCmd)
	streamCmd.AddCommand(streamBalancesCmd)
	streamCmd.AddCommand(streamPositionsCmd)
	streamCmd.AddCommand(streamContractStatusCmd)
}

func validatePrivateWebSocketAuth(cfg *config.Config, stream string) error {
	if cfg == nil {
		return privateWebSocketAuthError("Private WebSocket " + stream + " requires account-scoped HMAC API-key credentials or an OAuth bearer token, but no credentials are loaded.")
	}

	if cfg.AccessToken != "" {
		return nil
	}

	if cfg.APIKey == "" || cfg.APISecret == "" {
		authType := cfg.AuthType
		if authType == "" {
			authType = "none"
		}
		return privateWebSocketAuthError(fmt.Sprintf(
			"Private WebSocket %s requires account-scoped HMAC API-key credentials or an OAuth bearer token; current auth type is %s.",
			stream,
			authType,
		))
	}

	keyPrefix := privateWebSocketRejectedKeyPrefix(cfg.APIKey)
	if keyPrefix != "" {
		return privateWebSocketAuthError(fmt.Sprintf(
			"Private WebSocket %s requires an account-scoped API key; %s keys are rejected by wsapi private operations.",
			stream,
			keyPrefix,
		))
	}

	return nil
}

func privateWebSocketRejectedKeyPrefix(apiKey string) string {
	switch {
	case strings.HasPrefix(apiKey, "master-"):
		return "master-"
	case strings.HasPrefix(apiKey, "group-"):
		return "group-"
	default:
		return ""
	}
}

func privateWebSocketAuthError(message string) *output.CLIError {
	return &output.CLIError{
		Code:       output.ErrCodeAuthRequired,
		Message:    message,
		Retryable:  false,
		Suggestion: "Run 'gemini-markets auth login' for OAuth bearer auth, or use an account-scoped API key (prefix account-) with GEMINI_API_KEY and GEMINI_API_SECRET.",
	}
}
