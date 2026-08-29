package services

import (
	"context"
	"errors"
	"net/url"
	"strings"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/account"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

// AccountService provides access to account management, banking, deposit addresses, and role information.
type AccountService struct {
	baseService
}

// AddBankResponse is returned when a bank account is submitted for linking.
type AddBankResponse = account.AddBankResponse

// ApprovedAddressMessage is returned when an approved address is requested or removed.
type ApprovedAddressMessage = account.ApprovedAddressMessage

// PaymentMethodsResponse contains linked payment balances and bank accounts.
type PaymentMethodsResponse = account.PaymentMethodsResponse

// RevokeOAuthTokenResponse confirms that the access token used for the
// request was revoked.
type RevokeOAuthTokenResponse struct {
	Message string `json:"message,omitempty"`
}

// CreateAccountResponse is returned when a subaccount is created. Account is
// the shortname used to target the new account with a Master API key.
type CreateAccountResponse struct {
	Account string `json:"account"`
	Type    string `json:"type"`
}

// AccountListItem is an account descriptor returned by the group account list
// endpoint. Account is the shortname required when a Master API key targets a
// subaccount.
type AccountListItem struct {
	Name           string                `json:"name"`
	Account        string                `json:"account"`
	Type           string                `json:"type"`
	CounterpartyID *string               `json:"counterparty_id"`
	Created        account.TimestampType `json:"created"`
	Status         string                `json:"status"`
}

// AccountDetailResponse is the response shape returned by /v1/account.
type AccountDetailResponse struct {
	Account              AccountDetail `json:"account"`
	Users                []AccountUser `json:"users,omitempty"`
	MemoReferenceCode    string        `json:"memo_reference_code,omitempty"`
	VirtualAccountNumber string        `json:"virtual_account_number,omitempty"`
}

// AccountDetail contains the account metadata returned by /v1/account.
type AccountDetail struct {
	AccountName string                `json:"accountName,omitempty"`
	ShortName   string                `json:"shortName,omitempty"`
	Type        string                `json:"type,omitempty"`
	Created     account.TimestampType `json:"created,omitempty"`
}

// AccountUser contains an account user's status and verification information.
type AccountUser struct {
	Name        string `json:"name,omitempty"`
	LastSignIn  string `json:"lastSignIn,omitempty"`
	Status      string `json:"status,omitempty"`
	CountryCode string `json:"countryCode,omitempty"`
	IsVerified  bool   `json:"isVerified,omitempty"`
}

// RenameAccountResponse contains the fields changed by /v1/account/rename.
type RenameAccountResponse struct {
	Name    string `json:"name,omitempty"`
	Account string `json:"account,omitempty"`
}

// NewAccountService creates a new AccountService.
func NewAccountService(client *transport.Client, baseURL string) *AccountService {
	return &AccountService{
		baseService: newBaseService(client, baseURL),
	}
}

// 1. GetBalances returns the available and amount balances for all currencies
// in the selected account. The REST contract requires Account.
func (s *AccountService) GetBalances(ctx context.Context, req *account.GetAvailableBalancesJSONBody) ([]account.Balance, error) {
	if req == nil || strings.TrimSpace(req.Account) == "" {
		return nil, errors.New("gemini account: account is required for GetBalances")
	}
	var balances []account.Balance
	if err := s.post(ctx, "/v1/balances", req, &balances); err != nil {
		return nil, err
	}
	return balances, nil
}

// 2. GetNotionalBalances returns account balances valued in a specified fiat currency (e.g. USD).
func (s *AccountService) GetNotionalBalances(ctx context.Context, currency string, req *account.GetNotionalBalancesJSONBody) ([]account.NotionalBalance, error) {
	if req == nil {
		req = &account.GetNotionalBalancesJSONBody{}
	}
	var balances []account.NotionalBalance
	if err := s.post(ctx, "/v1/notionalbalances/"+url.PathEscape(currency), req, &balances); err != nil {
		return nil, err
	}
	return balances, nil
}

// 3. GetAccount retrieves account details. Set Account in req when using a
// Master API key to select a subaccount; account-level keys may omit it.
func (s *AccountService) GetAccount(ctx context.Context, req *account.GetAccountDetailJSONBody) (*AccountDetailResponse, error) {
	if req == nil {
		req = &account.GetAccountDetailJSONBody{}
	}
	var res AccountDetailResponse
	if err := s.post(ctx, "/v1/account", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// 4. CreateAccount creates a new subaccount in the account group.
func (s *AccountService) CreateAccount(ctx context.Context, req *account.CreateNewAccountJSONBody) (*CreateAccountResponse, error) {
	var res CreateAccountResponse
	if err := s.post(ctx, "/v1/account/create", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// CreateAccountByName creates a new subaccount in the account group by name and optional type.
func (s *AccountService) CreateAccountByName(ctx context.Context, name, accountType string) (*CreateAccountResponse, error) {
	req := &account.CreateNewAccountJSONBody{Name: name}
	if accountType != "" {
		req.Type = &accountType
	}
	return s.CreateAccount(ctx, req)
}

// 5. RenameAccount renames an existing subaccount.
func (s *AccountService) RenameAccount(ctx context.Context, req *account.RenameAccountJSONBody) (*RenameAccountResponse, error) {
	var res RenameAccountResponse
	if err := s.post(ctx, "/v1/account/rename", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// 6. ListAccounts returns all subaccounts in the account group.
func (s *AccountService) ListAccounts(ctx context.Context, req *account.ListAccountsInGroupJSONBody) ([]AccountListItem, error) {
	if req == nil {
		req = &account.ListAccountsInGroupJSONBody{}
	}
	var res []AccountListItem
	if err := s.post(ctx, "/v1/account/list", req, &res); err != nil {
		return nil, err
	}
	return res, nil
}

// 7. TransferBetweenAccounts moves funds between subaccounts in the same account group.
func (s *AccountService) TransferBetweenAccounts(ctx context.Context, currency string, req *account.TransferBetweenAccountsJSONBody) (*account.Transfer, error) {
	var res account.Transfer
	if err := s.post(ctx, "/v1/account/transfer/"+url.PathEscape(currency), req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// 8. GetDepositAddress generates or retrieves the crypto deposit address for a
// currency. Set Account in req when using a Master API key.
func (s *AccountService) GetDepositAddress(ctx context.Context, currency string, req *account.CreateNewDepositAddressJSONBody) (*account.Address, error) {
	if req == nil {
		req = &account.CreateNewDepositAddressJSONBody{}
	}
	var res account.Address
	if err := s.post(ctx, "/v1/deposit/"+url.PathEscape(currency)+"/newAddress", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// 9. ListApprovedAddresses retrieves the list of whitelisted withdrawal
// addresses for a network. Set Account in req when using a Master API key.
func (s *AccountService) ListApprovedAddresses(ctx context.Context, network string, req *account.ListApprovedAddressesJSONBody) ([]account.ApprovedAddress, error) {
	if req == nil {
		req = &account.ListApprovedAddressesJSONBody{}
	}
	var res account.ApprovedAddressesResponse
	if err := s.post(ctx, "/v1/approvedAddresses/account/"+url.PathEscape(network), req, &res); err != nil {
		return nil, err
	}
	if res.ApprovedAddresses == nil {
		return nil, nil
	}
	return *res.ApprovedAddresses, nil
}

// 10. RequestApprovedAddress requests addition of a new approved withdrawal
// address. Set Account in req when a Master API key targets a subaccount.
func (s *AccountService) RequestApprovedAddress(ctx context.Context, network string, req *account.CreateNewApprovedAddressJSONBody) (*account.ApprovedAddressMessage, error) {
	var res account.ApprovedAddressMessage
	if err := s.post(ctx, "/v1/approvedAddresses/"+url.PathEscape(network)+"/request", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// 11. RemoveApprovedAddress requests removal of an approved withdrawal address.
// Set Account in req when a Master API key targets a subaccount.
func (s *AccountService) RemoveApprovedAddress(ctx context.Context, network string, req *account.RemoveApprovedAddressJSONBody) (*account.ApprovedAddressMessage, error) {
	var res account.ApprovedAddressMessage
	if err := s.post(ctx, "/v1/approvedAddresses/"+url.PathEscape(network)+"/remove", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// 12. AddBankUSD links a new US bank account.
func (s *AccountService) AddBankUSD(ctx context.Context, req *account.AddBankJSONBody) (*account.AddBankResponse, error) {
	var res account.AddBankResponse
	if err := s.post(ctx, "/v1/payments/addbank", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// 13. AddBankCAD links a new Canadian bank account.
func (s *AccountService) AddBankCAD(ctx context.Context, req *account.AddBankCADJSONBody) (*account.AddBankResponse, error) {
	var res account.AddBankResponse
	if err := s.post(ctx, "/v1/payments/addbank/cad", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// 14. ListPaymentMethods returns all linked payment methods (bank accounts, wire instructions).
func (s *AccountService) ListPaymentMethods(ctx context.Context, req *account.ListPaymentMethodsJSONBody) (*PaymentMethodsResponse, error) {
	if req == nil {
		req = &account.ListPaymentMethodsJSONBody{}
	}
	var res PaymentMethodsResponse
	if err := s.post(ctx, "/v1/payments/methods", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// 15. GetRoles returns API key roles and permission scopes.
func (s *AccountService) GetRoles(ctx context.Context, req *account.GetRolesJSONBody) (*account.RoleResponse, error) {
	if req == nil {
		req = &account.GetRolesJSONBody{}
	}
	var res account.RoleResponse
	if err := s.post(ctx, "/v1/roles", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// RevokeOAuthToken revokes the OAuth access token used for this request. The
// endpoint only accepts OAuth bearer authentication; configure the client with
// WithBearerToken or WithTokenSource before calling it.
func (s *AccountService) RevokeOAuthToken(ctx context.Context) (*RevokeOAuthTokenResponse, error) {
	var res RevokeOAuthTokenResponse
	req := &account.RevokeOAuthTokenJSONBody{Request: "/v1/oauth/revokeByToken"}
	if err := s.post(ctx, "/v1/oauth/revokeByToken", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}
