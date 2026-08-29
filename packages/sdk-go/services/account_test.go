package services_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/account"
	"github.com/gemini/developer-platform/packages/sdk-go/services"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

func TestAccountService_Methods(t *testing.T) {
	var capturedPath string
	requestPayloads := make(map[string]map[string]any)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		if r.Method != http.MethodPost {
			t.Errorf("expected POST for %s, got %s", r.URL.Path, r.Method)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("reading request body for %s: %v", r.URL.Path, err)
		} else if len(body) > 0 && string(body) != "null" {
			var payload map[string]any
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Errorf("decoding request body for %s: %v", r.URL.Path, err)
			} else {
				requestPayloads[r.URL.Path] = payload
			}
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/balances":
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"currency": "USD", "amount": 1000.0, "available": 900.0, "type": "exchange"},
			})
		case "/v1/notionalbalances/USD":
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"currency": "USD", "amountNotional": "1000.0"},
			})
		case "/v1/account":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"account": map[string]any{
					"accountName": "Primary",
					"shortName":   "primary",
					"type":        "exchange",
				},
				"users": []map[string]any{{"name": "Satoshi Nakamoto", "isVerified": true}},
			})
		case "/v1/account/create":
			_ = json.NewEncoder(w).Encode(map[string]any{"account": "trading-2", "type": "exchange"})
		case "/v1/account/rename":
			_ = json.NewEncoder(w).Encode(map[string]any{"name": "Trading Renamed", "account": "trading-renamed"})
		case "/v1/account/list":
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"name": "Primary", "account": "primary", "type": "exchange", "counterparty_id": "EMONNYXH", "created": int64(1495127793000), "status": "open"},
				{"name": "Trading Renamed", "account": "trading-renamed", "type": "exchange", "counterparty_id": nil, "created": int64(1565970772000), "status": "closed"},
			})
		case "/v1/account/transfer/USD":
			amt := "500.00"
			status := account.TransferStatus("Complete")
			_ = json.NewEncoder(w).Encode(account.Transfer{Amount: &amt, Status: &status})
		case "/v1/deposit/BTC/newAddress":
			_ = json.NewEncoder(w).Encode(map[string]any{"address": "bc1qtestaddress", "network": "bitcoin"})
		case "/v1/approvedAddresses/account/ethereum":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"approvedAddresses": []map[string]any{
					{"address": "0x1234567890abcdef", "network": "ethereum", "status": "active"},
				},
			})
		case "/v1/approvedAddresses/ethereum/request":
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "ok", "status": "pending-time"})
		case "/v1/approvedAddresses/ethereum/remove":
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "ok"})
		case "/v1/payments/addbank":
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "ok"})
		case "/v1/payments/addbank/cad":
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "ok"})
		case "/v1/payments/methods":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"balances": []map[string]any{{"type": "exchange", "currency": "USD", "amount": "1000"}},
				"banks":    []map[string]any{{"bank": "Test Bank", "bankId": "bank-1"}},
			})
		case "/v1/roles":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"isTrader":      true,
				"isFundManager": true,
				"isAuditor":     false,
			})
		case "/v1/oauth/revokeByToken":
			_ = json.NewEncoder(w).Encode(map[string]any{"message": "token revoked"})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	trans := transport.NewClient(transport.WithHTTPClient(server.Client()))
	svc := services.NewAccountService(trans, server.URL)
	ctx := context.Background()
	accountName := "primary"
	label := "MyLabel"

	// The balances contract requires an account selector. Rejecting invalid
	// input locally prevents an authenticated request with an unusable payload.
	for _, req := range []*account.GetAvailableBalancesJSONBody{
		nil,
		{Account: "   "},
	} {
		if _, err := svc.GetBalances(ctx, req); err == nil {
			t.Fatalf("GetBalances(%#v) accepted a missing account selector", req)
		}
	}
	if capturedPath != "" {
		t.Fatalf("invalid GetBalances input made an HTTP request to %s", capturedPath)
	}

	assertPayloadField := func(path, field, want string) {
		t.Helper()
		payload, ok := requestPayloads[path]
		if !ok {
			t.Fatalf("no request payload captured for %s", path)
		}
		if got := payload[field]; got != want {
			t.Fatalf("%s payload field %s: got %v, want %q", path, field, got, want)
		}
	}

	// 1. GetBalances
	balances, err := svc.GetBalances(ctx, &account.GetAvailableBalancesJSONBody{Account: accountName})
	if err != nil || len(balances) != 1 || capturedPath != "/v1/balances" {
		t.Fatalf("GetBalances failed: %v", err)
	}
	assertPayloadField("/v1/balances", "account", accountName)

	// 2. GetNotionalBalances
	notional, err := svc.GetNotionalBalances(ctx, "USD", &account.GetNotionalBalancesJSONBody{Account: &accountName})
	if err != nil || len(notional) != 1 || capturedPath != "/v1/notionalbalances/USD" {
		t.Fatalf("GetNotionalBalances failed: %v", err)
	}
	assertPayloadField("/v1/notionalbalances/USD", "account", accountName)

	// 3. GetAccount
	acc, err := svc.GetAccount(ctx, &account.GetAccountDetailJSONBody{Account: &accountName})
	if err != nil || acc == nil || acc.Account.AccountName != "Primary" || len(acc.Users) != 1 {
		t.Fatalf("GetAccount failed: %v", err)
	}
	assertPayloadField("/v1/account", "account", accountName)

	// 4. CreateAccount
	created, err := svc.CreateAccountByName(ctx, "Trading 2", "exchange")
	if err != nil || created == nil || created.Account != "trading-2" || created.Type != "exchange" {
		t.Fatalf("CreateAccount failed: %v", err)
	}

	// 5. RenameAccount
	newName := "Trading Renamed"
	renamed, err := svc.RenameAccount(ctx, &account.RenameAccountJSONBody{
		Account: &accountName,
		NewName: &newName,
	})
	if err != nil || renamed == nil || renamed.Name != "Trading Renamed" || renamed.Account != "trading-renamed" {
		t.Fatalf("RenameAccount failed: %v", err)
	}
	assertPayloadField("/v1/account/rename", "account", accountName)
	assertPayloadField("/v1/account/rename", "newName", newName)

	// 6. ListAccounts
	limit := 100
	list, err := svc.ListAccounts(ctx, &account.ListAccountsInGroupJSONBody{LimitAccounts: &limit})
	if err != nil || len(list) != 2 || list[0].Account != "primary" || list[0].Type != "exchange" || list[1].CounterpartyID != nil {
		t.Fatalf("ListAccounts failed: %v", err)
	}
	if got := requestPayloads["/v1/account/list"]["limit_accounts"]; got != float64(limit) {
		t.Fatalf("ListAccounts did not serialize limit: got %v", got)
	}
	createdAt, err := list[0].Created.AsTimestampType1()
	if err != nil || createdAt != 1495127793000 {
		t.Fatalf("ListAccounts decoded created timestamp incorrectly: %d, %v", createdAt, err)
	}

	// 7. TransferBetweenAccounts
	transferRes, err := svc.TransferBetweenAccounts(ctx, "USD", &account.TransferBetweenAccountsJSONBody{
		Amount:        "500.00",
		SourceAccount: "acc-123",
		TargetAccount: "acc-456",
	})
	if err != nil || transferRes.Status == nil || string(*transferRes.Status) != "Complete" {
		t.Fatalf("TransferBetweenAccounts failed: %v", err)
	}

	// 8. GetDepositAddress
	addr, err := svc.GetDepositAddress(ctx, "BTC", &account.CreateNewDepositAddressJSONBody{Account: &accountName, Label: &label})
	if err != nil || addr.Address == nil || *addr.Address != "bc1qtestaddress" {
		t.Fatalf("GetDepositAddress failed: %v", err)
	}
	assertPayloadField("/v1/deposit/BTC/newAddress", "account", accountName)
	assertPayloadField("/v1/deposit/BTC/newAddress", "label", label)

	// 9. ListApprovedAddresses
	approved, err := svc.ListApprovedAddresses(ctx, "ethereum", &account.ListApprovedAddressesJSONBody{Account: &accountName})
	if err != nil || len(approved) != 1 {
		t.Fatalf("ListApprovedAddresses failed: %v", err)
	}
	assertPayloadField("/v1/approvedAddresses/account/ethereum", "account", accountName)

	// 10. RequestApprovedAddress
	reqRes, err := svc.RequestApprovedAddress(ctx, "ethereum", &account.CreateNewApprovedAddressJSONBody{
		Account: &accountName,
		Address: "0x123",
		Label:   "MyEth",
	})
	if err != nil || reqRes.Result == nil || *reqRes.Result != "ok" {
		t.Fatalf("RequestApprovedAddress failed: %v", err)
	}
	assertPayloadField("/v1/approvedAddresses/ethereum/request", "account", accountName)

	// 11. RemoveApprovedAddress
	remRes, err := svc.RemoveApprovedAddress(ctx, "ethereum", &account.RemoveApprovedAddressJSONBody{
		Account: &accountName,
		Address: "0x123",
	})
	if err != nil || remRes.Result == nil || *remRes.Result != "ok" {
		t.Fatalf("RemoveApprovedAddress failed: %v", err)
	}
	assertPayloadField("/v1/approvedAddresses/ethereum/remove", "account", accountName)

	// 12. AddBankUSD
	bankRes, err := svc.AddBankUSD(ctx, &account.AddBankJSONBody{
		Account:       &accountName,
		Accountnumber: "123",
		Routing:       "021000021",
		Name:          "Checking Account",
		Type:          account.AddBankJSONBodyTypeChecking,
	})
	if err != nil || bankRes.Result == nil || *bankRes.Result != "ok" {
		t.Fatalf("AddBankUSD failed: %v", err)
	}
	assertPayloadField("/v1/payments/addbank", "account", accountName)

	// 13. AddBankCAD
	institutionNumber := "001"
	branchNumber := "12345"
	bankCADRes, err := svc.AddBankCAD(ctx, &account.AddBankCADJSONBody{
		Account:           &accountName,
		AccountNumber:     "456",
		InstitutionNumber: &institutionNumber,
		Branchnnumber:     &branchNumber,
		Swiftcode:         "swift-code",
		Name:              "Canadian Account",
		Type:              account.AddBankCADJSONBodyTypeChecking,
	})
	if err != nil || bankCADRes.Result == nil || *bankCADRes.Result != "ok" {
		t.Fatalf("AddBankCAD failed: %v", err)
	}
	assertPayloadField("/v1/payments/addbank/cad", "account", accountName)

	// 14. ListPaymentMethods
	methods, err := svc.ListPaymentMethods(ctx, &account.ListPaymentMethodsJSONBody{Account: &accountName})
	if err != nil || methods == nil || methods.Balances == nil || methods.Banks == nil || len(*methods.Balances) != 1 || len(*methods.Banks) != 1 {
		t.Fatalf("ListPaymentMethods failed: %v", err)
	}
	assertPayloadField("/v1/payments/methods", "account", accountName)

	// 15. GetRoles
	roles, err := svc.GetRoles(ctx, nil)
	if err != nil || roles == nil || !roles.IsTrader || !roles.IsFundManager || roles.IsAuditor {
		t.Fatalf("GetRoles failed: %v", err)
	}

	// 16. RevokeOAuthToken
	revoked, err := svc.RevokeOAuthToken(ctx)
	if err != nil || revoked == nil || revoked.Message != "token revoked" {
		t.Fatalf("RevokeOAuthToken failed: %v", err)
	}
	assertPayloadField("/v1/oauth/revokeByToken", "request", "/v1/oauth/revokeByToken")

}
