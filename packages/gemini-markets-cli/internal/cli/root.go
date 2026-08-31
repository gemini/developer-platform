// Package cli defines the root command and global flags. Domain command
// groups should be added by composing children here; they should create a
// session and call SDK services directly in their RunE functions.
package cli

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/output"
	"github.com/spf13/cobra"
)

// Version is replaced by release builds when desired.
var Version = "dev"

// GlobalOptions are the values shared by all command groups.
type GlobalOptions struct {
	Environment string
	Profile     string
	Format      output.Format
}

// NewRootCommand creates the standalone gemini-markets command and registers
// all command groups supported by the CLI.
func NewRootCommand(stdout, stderr io.Writer) *cobra.Command {
	var options GlobalOptions
	options.Environment = "production"
	options.Profile = "default"
	options.Format = output.Table

	command := &cobra.Command{
		Use:   "gemini-markets",
		Short: "Gemini Markets command-line client",
		Long:  "Gemini Markets command-line client for public market data, authenticated trading, account inspection, and real-time streams.",
		Example: "  gemini-markets markets ticker BTCUSD\n" +
			"  gemini-markets --environment sandbox --profile trader account balances\n" +
			"  gemini-markets orders spot place --symbol BTCUSD --side buy --amount 0.01 --price 60000 --dry-run\n" +
			"  gemini-markets stream trades BTCUSD",
		Version:       Version,
		SilenceErrors: true,
		SilenceUsage:  true,
		Args:          cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return cmd.Help()
		},
		PersistentPreRunE: func(cmd *cobra.Command, _ []string) error {
			format, err := output.ParseFormat(string(options.Format))
			if err != nil {
				return err
			}
			options.Format = format
			options.Environment = strings.ToLower(strings.TrimSpace(options.Environment))
			if options.Environment == "" {
				options.Environment = "production"
			}
			if options.Environment != "production" && options.Environment != "sandbox" {
				return fmt.Errorf("invalid environment %q (want production or sandbox)", options.Environment)
			}
			options.Profile = strings.TrimSpace(options.Profile)
			if options.Profile == "" {
				options.Profile = "default"
			}
			return nil
		},
	}
	if stdout != nil {
		command.SetOut(stdout)
	}
	if stderr != nil {
		command.SetErr(stderr)
	}
	command.PersistentFlags().StringVarP(&options.Environment, "environment", "e", options.Environment, "Gemini environment (production or sandbox)")
	command.PersistentFlags().StringVarP(&options.Profile, "profile", "p", options.Profile, "credential profile")
	command.PersistentFlags().Var(formatValue{value: &options.Format}, "output", "output format (table or json)")
	command.AddCommand(
		NewMarketsCommand(),
		NewPredictionMarketsCommand(),
		NewAccountCommand(),
		NewOrdersCommand(),
		NewStreamCommand(),
		NewAuthCommand(),
	)
	command.AddCommand(&cobra.Command{
		Use:   "version",
		Short: "Print the CLI version",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if options.Format == output.JSON {
				return output.Write(cmd.OutOrStdout(), struct {
					Name    string `json:"name"`
					Version string `json:"version"`
				}{"gemini-markets", Version}, output.JSON)
			}
			_, err := fmt.Fprintln(cmd.OutOrStdout(), Version)
			return err
		},
	})
	return command
}

// Options returns the parsed global values. It is intended for future child
// commands and does not perform credential loading itself.
func Options(command *cobra.Command) GlobalOptions {
	options := GlobalOptions{Environment: "production", Profile: "default", Format: output.Table}
	if value, err := command.Flags().GetString("environment"); err == nil {
		options.Environment = value
	}
	if value, err := command.Flags().GetString("profile"); err == nil {
		options.Profile = value
	}
	if flag := command.Flags().Lookup("output"); flag != nil {
		if format, parseErr := output.ParseFormat(flag.Value.String()); parseErr == nil {
			options.Format = format
		}
	}
	return options
}

type formatValue struct{ value *output.Format }

func (f formatValue) String() string { return string(*f.value) }

func (f formatValue) Set(value string) error {
	format, err := output.ParseFormat(value)
	if err != nil {
		return err
	}
	*f.value = format
	return nil
}

func (f formatValue) Type() string { return "format" }

// Execute is a convenience for embedders that want a context and argument
// slice without managing Cobra's command object directly.
func Execute(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	command := NewRootCommand(stdout, stderr)
	command.SetArgs(args)
	return command.ExecuteContext(ctx)
}
