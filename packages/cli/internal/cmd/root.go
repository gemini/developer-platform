package cmd

import (
	"os"

	"github.com/spf13/cobra"

	appupdate "github.com/gemini/developer-platform/packages/cli/internal/app/update"
	"github.com/gemini/developer-platform/packages/cli/internal/debug"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
	"github.com/gemini/developer-platform/packages/cli/internal/ws"
)

var (
	debugFlag    bool
	sandbox      bool
	outputFormat string
	quietFlag    bool
	rawFlag      bool
	verboseFlag  bool
	timeoutSecs  int
	noWebsocket  bool
)

// OutputFormat returns the configured output format.
func OutputFormat() string {
	return outputFormat
}

// IsTableOutput returns whether table output is enabled.
func IsTableOutput() bool {
	return outputFormat == "table" || outputFormat == "csv"
}

// IsCSVOutput returns whether CSV output is enabled.
func IsCSVOutput() bool {
	return outputFormat == "csv"
}

// IsQuiet returns whether quiet mode is enabled.
func IsQuiet() bool {
	return quietFlag
}

// IsRawOutput returns whether raw output is enabled.
func IsRawOutput() bool {
	return rawFlag
}

// IsVerbose returns whether verbose output is enabled (full field names).
func IsVerbose() bool {
	return verboseFlag
}

// TimeoutSeconds returns the configured timeout in seconds.
func TimeoutSeconds() int {
	if timeoutSecs <= 0 {
		return 30
	}
	return timeoutSecs
}

// IsWebSocketDisabled returns whether WebSocket is disabled.
func IsWebSocketDisabled() bool {
	return noWebsocket
}

var rootCmd = &cobra.Command{
	Use:           "gemini-markets",
	Short:         "Gemini Trading CLI",
	Version:       Version,
	SilenceErrors: true,
	SilenceUsage:  true,
	Long: `A command-line interface for trading on Gemini Exchange.

Supports both spot trading and prediction markets.
Designed for AI agents with JSON output by default. Use -o table for human-readable output.

	Authentication:
	  Run 'gemini-markets auth login' for browser-based OAuth login,
	  run 'gemini-markets auth setup' for API key setup,
	  run 'gemini-markets auth status' to inspect the active auth mode.
	  Environment variables: GEMINI_ACCESS_TOKEN or GEMINI_API_KEY + GEMINI_API_SECRET.

Examples:
  # Spot trading
  gemini-markets spot symbols                     # List tradeable pairs
  gemini-markets spot symbol btcusd               # Get symbol details
  gemini-markets spot order place --symbol btcusd --side buy --amount 0.1 --price 50000

  # Prediction markets
  gemini-markets predict markets list --status active
  gemini-markets predict order place --symbol NVDA260225 --side buy --outcome yes \
    --type limit --quantity 100 --price 0.62

  # Shared commands (work for both)
  gemini-markets book BTCUSD                      # Order book
  gemini-markets balance                          # Account balances
  gemini-markets stream ticker BTCUSD             # Real-time prices`,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		if !cmd.Flags().Changed("output") {
			if env := os.Getenv("GEMINI_OUTPUT"); env != "" {
				outputFormat = env
			}
		}
		if quietFlag {
			debug.SetQuiet(true)
		}
		if rawFlag {
			output.RawOutput = true
		}
		if outputFormat == "csv" {
			output.CSVOutput = true
		}
		if debugFlag {
			debug.SetEnabled(true)
			debug.Log("debug mode enabled")
		}
		attachRuntimeResolver(cmd, currentRuntimeOptions())
		if sandbox {
			debug.Log("using sandbox environment")
		}

		cmdName := cmd.Name()
		if !skipUpdateChecks() && cmdName != "update" && cmdName != "version" && cmdName != "completion" && cmdName != "help" {
			CheckForUpdateBackground()
		}
	},
	PersistentPostRun: func(cmd *cobra.Command, args []string) {
		PrintPendingUpdateNotice()
		ws.ResetDefaultManager()
	},
}

func skipUpdateChecks() bool {
	return os.Getenv("GEMINI_SKIP_UPDATE_CHECK") == "1"
}

func init() {
	rootCmd.PersistentFlags().BoolVar(&debugFlag, "debug", false, "enable debug logging")
	rootCmd.PersistentFlags().BoolVar(&sandbox, "sandbox", false, "use sandbox environment")
	rootCmd.PersistentFlags().StringVarP(&outputFormat, "output", "o", "json", "output format: json, table, or csv")
	rootCmd.PersistentFlags().BoolVarP(&quietFlag, "quiet", "q", false, "suppress stderr output for pure JSON piping")
	rootCmd.PersistentFlags().BoolVar(&rawFlag, "raw", false, "output compact JSON without pretty-printing")
	rootCmd.PersistentFlags().BoolVar(&verboseFlag, "verbose", false, "use full field names in JSON output (default: abbreviated)")
	rootCmd.PersistentFlags().IntVar(&timeoutSecs, "timeout", 30, "request timeout in seconds")
	rootCmd.PersistentFlags().BoolVar(&noWebsocket, "no-websocket", false, "disable WebSocket and use REST API only")

	rootCmd.AddCommand(streamCmd)
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(doctorCmd)
	rootCmd.AddCommand(specCmd)
	rootCmd.AddCommand(versionCmd)
}

// RootCommand exposes the configured Cobra root for docs and shell generation.
func RootCommand() *cobra.Command {
	return rootCmd
}

// Execute runs the root command.
func Execute() error {
	if appupdate.ApplyPendingUpdate() {
		appupdate.ReExecAfterUpdate()
	}
	return rootCmd.Execute()
}
