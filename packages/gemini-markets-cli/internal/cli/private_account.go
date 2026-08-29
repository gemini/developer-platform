package cli

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/output"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/account"
	sdktypes "github.com/gemini/developer-platform/packages/sdk-go/types"
	"github.com/spf13/cobra"
)

// AccountBalancesClient is the narrow part of the SDK AccountService used by
// the balances command. Keeping this interface at the consumer boundary
// makes command tests independent from transport and credentials.
type AccountBalancesClient interface {
	GetBalances(context.Context, *account.GetAvailableBalancesJSONBody) ([]account.Balance, error)
}

// AccountBalancesFactory creates the authenticated account service and its
// owner. The owner is closed after each command invocation.
type AccountBalancesFactory func(context.Context, GlobalOptions) (AccountBalancesClient, io.Closer, error)

func defaultAccountBalancesFactory(ctx context.Context, options GlobalOptions) (AccountBalancesClient, io.Closer, error) {
	value, err := newPrivateSession(ctx, options)
	if err != nil {
		return nil, nil, err
	}
	return value.Client.Account, closeSession(value), nil
}

// NewAccountCommand creates the authenticated account command group.
//
// Root command wiring intentionally remains in root.go's owner: callers should
// add the returned command with root.AddCommand(NewAccountCommand()).
func NewAccountCommand(factories ...AccountBalancesFactory) *cobra.Command {
	if len(factories) > 0 && factories[0] != nil {
		return NewAccountCommandWithFactory(factories[0])
	}
	return NewAccountCommandWithFactory(defaultAccountBalancesFactory)
}

// NewAccountCommandWithFactory creates the account command with an injected
// SDK consumer. It is primarily useful for focused command tests.
func NewAccountCommandWithFactory(factory AccountBalancesFactory) *cobra.Command {
	if factory == nil {
		factory = defaultAccountBalancesFactory
	}

	accountCommand := &cobra.Command{
		Use:     "account",
		Aliases: []string{"accounts"},
		Short:   "Authenticated account operations",
		Args:    cobra.NoArgs,
	}
	accountCommand.AddCommand(newBalancesCommand(factory))
	return accountCommand
}

// NewAccountBalancesCommand is a convenience constructor for callers that
// want to register only the balances leaf command.
func NewAccountBalancesCommand(factories ...AccountBalancesFactory) *cobra.Command {
	if len(factories) > 0 && factories[0] != nil {
		return newBalancesCommand(factories[0])
	}
	return newBalancesCommand(defaultAccountBalancesFactory)
}

func newBalancesCommand(factory AccountBalancesFactory) *cobra.Command {
	var accountName string
	var showPending bool

	command := &cobra.Command{
		Use:   "balances",
		Short: "Show available balances",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			accountName = strings.TrimSpace(accountName)
			if accountName == "" {
				return fmt.Errorf("account is required")
			}
			client, closer, err := factory(cmd.Context(), Options(cmd))
			if err != nil {
				return fmt.Errorf("create account client: %w", err)
			}
			if closer != nil {
				defer func() { _ = closer.Close() }()
			}
			request := &account.GetAvailableBalancesJSONBody{Account: accountName}
			if showPending {
				request.ShowPendingBalances = &showPending
			}
			balances, err := client.GetBalances(cmd.Context(), request)
			if err != nil {
				return fmt.Errorf("get account balances: %w", err)
			}
			return writeBalances(cmd.OutOrStdout(), balances, Options(cmd).Format)
		},
	}
	command.Flags().StringVarP(&accountName, "account", "a", "primary", "account or subaccount name")
	command.Flags().BoolVar(&showPending, "show-pending-balances", false, "include pending deposits and withdrawals")
	return command
}

func writeBalances(w io.Writer, balances []account.Balance, format output.Format) error {
	if format == output.JSON {
		return output.Write(w, balances, format)
	}
	rows := make([][]string, 0, len(balances))
	for _, balance := range balances {
		rows = append(rows, []string{
			balanceString(balance.Currency),
			balanceDecimalString(balance.Amount),
			balanceDecimalString(balance.Available),
			balanceDecimalString(balance.AvailableForWithdrawal),
		})
	}
	return output.Write(w, output.TableData{
		Headers: []string{"CURRENCY", "AMOUNT", "AVAILABLE", "AVAILABLE FOR WITHDRAWAL"},
		Rows:    rows,
	}, format)
}

func balanceString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func balanceDecimalString(value *sdktypes.DecimalNumber) string {
	if value == nil {
		return ""
	}
	return value.String()
}
