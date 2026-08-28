package services_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gemini/gemini-go/generated/account"
	"github.com/gemini/gemini-go/services"
	"github.com/gemini/gemini-go/transport"
)

func TestTransfersService_Methods(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v2/withdraw/solana/sol":
			_ = json.NewEncoder(w).Encode(map[string]string{
				"withdrawalId": "wd-123",
				"address":      "soladdr",
				"amount":       "10.0",
				"currency":     "SOL",
				"fee":          "0.001",
			})
		case "/v2/withdraw/solana/sol/feeEstimate":
			fee := 0.0005
			_ = json.NewEncoder(w).Encode(map[string]any{"currency": "SOL", "fee": fee})
		case "/v2/transfers":
			amt := "10.0"
			curr := "ETH"
			_ = json.NewEncoder(w).Encode([]account.V2Transfer{
				{Amount: &amt, Currency: &curr},
			})
		case "/v1/custodyaccountfees":
			txTime := int64(1657236174056)
			feeAmount := "50.00"
			feeCurrency := "USD"
			eid := int64(256627)
			eventType := "Withdrawal"
			_ = json.NewEncoder(w).Encode([]services.CustodyFeeTransfer{
				{TxTime: &txTime, FeeAmount: &feeAmount, FeeCurrency: &feeCurrency, EID: &eid, EventType: &eventType},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	trans := transport.NewClient(transport.WithHTTPClient(server.Client()))
	svc := services.NewTransfersService(trans, server.URL)
	ctx := context.Background()

	// 1. WithdrawCryptoV2
	w2, err := svc.WithdrawCryptoV2(ctx, "solana", "sol", "soladdr", "10.0", "memo-1")
	if err != nil || w2 == nil || w2.WithdrawalId == nil || *w2.WithdrawalId != "wd-123" || w2.Address == nil || *w2.Address != "soladdr" || w2.Fee == nil || *w2.Fee != "0.001" {
		t.Fatalf("WithdrawCryptoV2 failed: %v", err)
	}

	// 2. GetWithdrawalFeeEstimateV2
	f2, err := svc.GetWithdrawalFeeEstimateV2(ctx, "solana", "sol", "soladdr", "10.0")
	if err != nil || f2.Fee == nil || f2.Fee.String() != "0.0005" {
		t.Fatalf("GetWithdrawalFeeEstimateV2 failed: %v", err)
	}

	// 3. GetTransfers
	limit := 10
	transfers, err := svc.GetTransfers(ctx, &account.ListPastTransfersJSONBody{LimitTransfers: &limit})
	if err != nil || len(transfers) != 1 {
		t.Fatalf("GetTransfers failed: %v", err)
	}

	// 4. GetCustodyFeeTransfers
	fees, err := svc.GetCustodyFeeTransfers(ctx, nil)
	if err != nil || len(fees) != 1 {
		t.Fatalf("GetCustodyFeeTransfers failed: %v", err)
	}
	if fees[0].FeeCurrency == nil || *fees[0].FeeCurrency != "USD" {
		t.Fatalf("unexpected typed custody fee response: %+v", fees[0])
	}
}
