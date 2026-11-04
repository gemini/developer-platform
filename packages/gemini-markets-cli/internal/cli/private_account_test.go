package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"strings"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/account"
	sdktypes "github.com/gemini/developer-platform/packages/sdk-go/types"
)

type privateAccountFake struct {
	request *account.GetAvailableBalancesJSONBody
	value   []account.Balance
}

func (f *privateAccountFake) GetBalances(_ context.Context, request *account.GetAvailableBalancesJSONBody) ([]account.Balance, error) {
	f.request = request
	return f.value, nil
}

type privateNopCloser struct{ closed bool }

func (c *privateNopCloser) Close() error {
	c.closed = true
	return nil
}

func TestAccountBalancesMapsRequestAndJSONOutput(t *testing.T) {
	var out bytes.Buffer
	fake := &privateAccountFake{}
	closed := &privateNopCloser{}
	root := newTestRootCommand(&out, &out)
	root.AddCommand(NewAccountCommandWithFactory(func(_ context.Context, options GlobalOptions) (AccountBalancesClient, io.Closer, error) {
		if options.Environment != "sandbox" || options.Profile != "trader" {
			t.Fatalf("options = %#v", options)
		}
		return fake, closed, nil
	}))
	root.SetArgs([]string{"--environment", "sandbox", "--profile", "trader", "--output", "json", "account", "balances", "--account", "subaccount", "--show-pending-balances"})
	if err := root.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if fake.request == nil || fake.request.Account != "subaccount" || fake.request.ShowPendingBalances == nil || !*fake.request.ShowPendingBalances {
		t.Fatalf("request = %#v", fake.request)
	}
	if !closed.closed {
		t.Fatal("factory owner was not closed")
	}
	var got []account.Balance
	if err := json.Unmarshal(out.Bytes(), &got); err != nil {
		t.Fatalf("output JSON = %q: %v", out.String(), err)
	}
}

func TestAccountBalancesTableOutput(t *testing.T) {
	var out bytes.Buffer
	currency := "USD"
	amount := sdktypes.NewDecimalNumber(125, 2)
	available := sdktypes.NewDecimalNumber(100, 2)
	fake := &privateAccountFake{value: []account.Balance{{Currency: &currency, Amount: &amount, Available: &available}}}
	root := newTestRootCommand(&out, &out)
	root.AddCommand(NewAccountCommandWithFactory(func(context.Context, GlobalOptions) (AccountBalancesClient, io.Closer, error) {
		return fake, nil, nil
	}))
	root.SetArgs([]string{"account", "balances"})
	if err := root.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if !strings.Contains(out.String(), "CURRENCY") || !strings.Contains(out.String(), "USD") || !strings.Contains(out.String(), "1.25") {
		t.Fatalf("table output = %q", out.String())
	}
}
