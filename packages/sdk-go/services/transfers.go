package services

import (
	"context"
	"net/url"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/account"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

// TransfersService provides access to crypto withdrawals, fee estimates, multi-network past transfers, and custody fees.
type TransfersService struct {
	baseService
}

// CustodyFeeTransfer describes a custody fee charged to the account.
// The endpoint is represented as an inline schema in the API specification,
// so the SDK owns this small typed model rather than exposing a map.
type CustodyFeeTransfer struct {
	TxTime      *int64  `json:"txTime,omitempty"`
	FeeAmount   *string `json:"feeAmount,omitempty"`
	FeeCurrency *string `json:"feeCurrency,omitempty"`
	EID         *int64  `json:"eid,omitempty"`
	EventType   *string `json:"eventType,omitempty"`
}

// NewTransfersService creates a new TransfersService.
func NewTransfersService(client *transport.Client, baseURL string) *TransfersService {
	return &TransfersService{
		baseService: newBaseService(client, baseURL),
	}
}

// WithdrawCryptoV2 submits a cryptocurrency withdrawal request with multichain network support.
// The response is intentionally distinct from V2Transfer: this endpoint
// returns address and fee, while V2Transfer is the historical transfer-list
// shape with destination and feeAmount.
func (s *TransfersService) WithdrawCryptoV2(ctx context.Context, network, ticker, address, amount string, memo ...string) (*account.WithdrawCryptoFundsResponse, error) {
	payload := account.WithdrawCryptoFundsJSONBody{
		Address: address,
		Amount:  amount,
	}
	if len(memo) > 0 && memo[0] != "" {
		m := memo[0]
		payload.Memo = &m
	}
	var res account.WithdrawCryptoFundsResponse
	if err := s.post(ctx, "/v2/withdraw/"+url.PathEscape(network)+"/"+url.PathEscape(ticker), payload, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetWithdrawalFeeEstimateV2 returns estimated fee for a multichain v2 withdrawal.
func (s *TransfersService) GetWithdrawalFeeEstimateV2(ctx context.Context, network, ticker, address, amount string, memo ...string) (*account.FeeEstimateV2Response, error) {
	payload := account.FeeEstimateV2Request{
		Address: address,
		Amount:  amount,
	}
	if len(memo) > 0 && memo[0] != "" {
		m := memo[0]
		payload.Memo = &m
	}
	var res account.FeeEstimateV2Response
	if err := s.post(ctx, "/v2/withdraw/"+url.PathEscape(network)+"/"+url.PathEscape(ticker)+"/feeEstimate", payload, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// 5. GetTransfers lists historical deposits, withdrawals, and administrative transfers across all networks.
func (s *TransfersService) GetTransfers(ctx context.Context, req *account.ListPastTransfersJSONBody) ([]account.V2Transfer, error) {
	if req == nil {
		req = &account.ListPastTransfersJSONBody{}
	}
	var res []account.V2Transfer
	if err := s.post(ctx, "/v2/transfers", req, &res); err != nil {
		return nil, err
	}
	return res, nil
}

// 6. GetCustodyFeeTransfers lists custody fee deductions for the account.
func (s *TransfersService) GetCustodyFeeTransfers(ctx context.Context, req *account.ListCustodyFeeTransfersJSONBody) ([]CustodyFeeTransfer, error) {
	if req == nil {
		req = &account.ListCustodyFeeTransfersJSONBody{}
	}
	var res []CustodyFeeTransfer
	if err := s.post(ctx, "/v1/custodyaccountfees", req, &res); err != nil {
		return nil, err
	}
	return res, nil
}
