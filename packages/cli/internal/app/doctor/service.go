package doctor

import (
	"context"
	"net/url"
	"strings"
	"time"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/config"
)

const (
	StatusOK   = "ok"
	StatusWarn = "warn"
	StatusFail = "fail"
	StatusSkip = "skip"
)

type APIClient interface {
	ListMarkets(context.Context, *api.ListMarketsParams) (*api.MarketsResponse, error)
	GetBalances(context.Context) ([]api.Balance, error)
}

type WebSocketProber interface {
	Probe(context.Context, string, *config.Config) error
}

type Options struct {
	WebSocketDisabled bool
}

type Report struct {
	Status           string   `json:"status"`
	Environment      string   `json:"environment"`
	AuthType         string   `json:"authType"`
	Authenticated    bool     `json:"authenticated"`
	CredentialSource string   `json:"credentialSource"`
	WebSocketEnabled bool     `json:"websocketEnabled"`
	ReadyForTrading  bool     `json:"readyForTrading"`
	BlockingChecks   []string `json:"blockingChecks,omitempty"`
	ReadyReason      string   `json:"readyForTradingReason"`
	Checks           []Check  `json:"checks"`
	Summary          Summary  `json:"summary"`
	Suggestions      []string `json:"suggestions,omitempty"`
}

type Check struct {
	Name    string         `json:"name"`
	Status  string         `json:"status"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type Summary struct {
	OK   int `json:"ok"`
	Warn int `json:"warn"`
	Fail int `json:"fail"`
	Skip int `json:"skip"`
}

type Service struct {
	api APIClient
	ws  WebSocketProber
}

func NewService(apiClient APIClient, wsProber WebSocketProber) *Service {
	return &Service{api: apiClient, ws: wsProber}
}

func (s *Service) Run(ctx context.Context, cfg *config.Config, credentialSource string, opts Options) Report {
	if cfg == nil {
		cfg = &config.Config{Environment: "production"}
	}

	report := Report{
		Environment:      cfg.Environment,
		AuthType:         cfg.AuthType,
		Authenticated:    cfg.IsAuthenticated(),
		CredentialSource: credentialSource,
		WebSocketEnabled: !opts.WebSocketDisabled,
	}

	report.Checks = append(report.Checks, s.checkConfig(cfg, credentialSource, opts))
	report.Checks = append(report.Checks, s.checkSandbox(cfg))
	report.Checks = append(report.Checks, s.checkPublicREST(ctx))
	report.Checks = append(report.Checks, s.checkWebSocket(ctx, cfg, opts))
	report.Checks = append(report.Checks, s.checkAuth(ctx, cfg))
	report.Checks = append(report.Checks, s.checkRateLimitPosture(opts))
	report.Summary = summarizeChecks(report.Checks)
	report.Status = overallStatus(report.Summary)
	report.ReadyForTrading, report.BlockingChecks = readyForTrading(report.Checks, opts)
	report.ReadyReason = readyReason(report.ReadyForTrading, report.BlockingChecks)
	report.Suggestions = buildSuggestions(report.Checks, cfg, opts)

	return report
}

func (s *Service) checkConfig(cfg *config.Config, credentialSource string, opts Options) Check {
	status := StatusOK
	message := "Configuration looks sane."

	if cfg.Environment != "production" && cfg.Environment != "sandbox" {
		status = StatusWarn
		message = "Environment is not one of the documented values; the CLI will treat it as production."
	}

	baseURL, baseErr := url.Parse(cfg.GetBaseURL())
	wsURL, wsErr := url.Parse(cfg.GetPredictionsWebSocketURL())
	if baseErr != nil || wsErr != nil || baseURL.Scheme == "" || wsURL.Scheme == "" {
		status = StatusFail
		message = "Configuration resolved invalid API or WebSocket URLs."
	}

	return Check{
		Name:    "config",
		Status:  status,
		Message: message,
		Details: map[string]any{
			"environment":       cfg.Environment,
			"baseURL":           cfg.GetBaseURL(),
			"websocketURL":      cfg.GetPredictionsWebSocketURL(),
			"credentialSource":  credentialSource,
			"websocketDisabled": opts.WebSocketDisabled,
			"authenticated":     cfg.IsAuthenticated(),
		},
	}
}

func (s *Service) checkSandbox(cfg *config.Config) Check {
	if cfg.Environment == "sandbox" {
		return Check{
			Name:    "sandbox",
			Status:  StatusOK,
			Message: "Sandbox environment is active.",
		}
	}

	return Check{
		Name:    "sandbox",
		Status:  StatusWarn,
		Message: "Production environment is active; use --sandbox for safer testing.",
	}
}

func (s *Service) checkPublicREST(ctx context.Context) Check {
	start := time.Now()
	resp, err := s.api.ListMarkets(ctx, &api.ListMarketsParams{Limit: 1})
	if err != nil {
		return Check{
			Name:    "rest_api",
			Status:  StatusFail,
			Message: "Public REST API probe failed: " + err.Error(),
			Details: map[string]any{
				"latencyMs": time.Since(start).Milliseconds(),
			},
		}
	}

	return Check{
		Name:    "rest_api",
		Status:  StatusOK,
		Message: "Public REST API is reachable.",
		Details: map[string]any{
			"marketsReturned": len(resp.Data),
			"latencyMs":       time.Since(start).Milliseconds(),
		},
	}
}

func (s *Service) checkWebSocket(ctx context.Context, cfg *config.Config, opts Options) Check {
	if opts.WebSocketDisabled {
		return Check{
			Name:    "websocket",
			Status:  StatusSkip,
			Message: "WebSocket checks skipped because --no-websocket is enabled.",
		}
	}

	if s.ws == nil {
		return Check{
			Name:    "websocket",
			Status:  StatusFail,
			Message: "No WebSocket prober is configured.",
		}
	}

	start := time.Now()
	if err := s.ws.Probe(ctx, cfg.GetPredictionsWebSocketURL(), cfg); err != nil {
		return Check{
			Name:    "websocket",
			Status:  StatusFail,
			Message: "WebSocket probe failed: " + err.Error(),
			Details: map[string]any{
				"latencyMs": time.Since(start).Milliseconds(),
			},
		}
	}

	message := "WebSocket endpoint is reachable."
	details := map[string]any{
		"latencyMs": time.Since(start).Milliseconds(),
	}
	if authKind := privateWebSocketAuthKind(cfg); authKind != "" {
		message = "Authenticated WebSocket endpoint is reachable."
		details["privateAccountStreams"] = true
		details["privateWebSocketAuth"] = authKind
	} else if cfg.IsAuthenticated() {
		message = "Public WebSocket endpoint is reachable; private account streams require account-scoped HMAC or OAuth bearer credentials."
		details["privateAccountStreams"] = false
		details["authType"] = cfg.AuthType
		details["supportedAuthTypes"] = []string{config.AuthTypeHMAC, config.AuthTypeOAuth, config.AuthTypeBearerEnv}
	}

	return Check{
		Name:    "websocket",
		Status:  StatusOK,
		Message: message,
		Details: details,
	}
}

func privateWebSocketAuthKind(cfg *config.Config) string {
	if cfg == nil {
		return ""
	}
	if cfg.AccessToken != "" {
		if cfg.AuthType == config.AuthTypeBearerEnv {
			return config.AuthTypeBearerEnv
		}
		return config.AuthTypeOAuth
	}
	if cfg.APIKey == "" || cfg.APISecret == "" {
		return ""
	}
	if strings.HasPrefix(cfg.APIKey, "master-") || strings.HasPrefix(cfg.APIKey, "group-") {
		return ""
	}
	return config.AuthTypeHMAC
}

func (s *Service) checkAuth(ctx context.Context, cfg *config.Config) Check {
	if !cfg.IsAuthenticated() {
		return Check{
			Name:    "auth",
			Status:  StatusWarn,
			Message: "Credentials are not configured; authenticated commands will fail.",
		}
	}

	if err := config.ValidateConfig(cfg); err != nil {
		return Check{
			Name:    "auth",
			Status:  StatusFail,
			Message: "Credential validation failed: " + err.Error(),
		}
	}

	start := time.Now()
	balances, err := s.api.GetBalances(ctx)
	if err != nil {
		return Check{
			Name:    "auth",
			Status:  StatusFail,
			Message: "Authenticated API probe failed: " + err.Error(),
			Details: map[string]any{
				"authType":  cfg.AuthType,
				"latencyMs": time.Since(start).Milliseconds(),
			},
		}
	}

	return Check{
		Name:    "auth",
		Status:  StatusOK,
		Message: "Authenticated API request succeeded.",
		Details: map[string]any{
			"currencies": len(balances),
			"authType":   cfg.AuthType,
			"latencyMs":  time.Since(start).Milliseconds(),
		},
	}
}

func (s *Service) checkRateLimitPosture(opts Options) Check {
	status := StatusOK
	message := "WebSocket is enabled; the CLI is positioned to avoid REST polling pressure."

	if opts.WebSocketDisabled {
		status = StatusWarn
		message = "REST-only mode increases rate-limit pressure; use WebSocket streams for active trading."
	}

	return Check{
		Name:    "rate_limits",
		Status:  status,
		Message: message,
		Details: map[string]any{
			"restLimit":      "600 requests/minute",
			"websocketLimit": "5 concurrent connections",
			"orderPlacement": "1 order per 100ms recommended",
			"circuitBreaker": "opens after 3 consecutive 429s for 30s",
		},
	}
}

func summarizeChecks(checks []Check) Summary {
	var summary Summary
	for _, check := range checks {
		switch check.Status {
		case StatusOK:
			summary.OK++
		case StatusWarn:
			summary.Warn++
		case StatusFail:
			summary.Fail++
		case StatusSkip:
			summary.Skip++
		}
	}
	return summary
}

func overallStatus(summary Summary) string {
	if summary.Fail > 0 {
		return StatusFail
	}
	if summary.Warn > 0 {
		return StatusWarn
	}
	return StatusOK
}

func readyForTrading(checks []Check, opts Options) (bool, []string) {
	required := map[string]bool{
		"config":   false,
		"rest_api": false,
		"auth":     false,
	}
	if !opts.WebSocketDisabled {
		required["websocket"] = false
	}

	for _, check := range checks {
		if _, ok := required[check.Name]; !ok {
			continue
		}
		if check.Status != StatusOK {
			return false, missingRequiredChecks(required, check.Name)
		}
		required[check.Name] = true
	}

	missing := missingRequiredChecks(required)
	if len(missing) > 0 {
		return false, missing
	}
	return true, nil
}

func missingRequiredChecks(required map[string]bool, extra ...string) []string {
	order := []string{"config", "rest_api", "auth", "websocket"}
	missing := make([]string, 0, len(required)+len(extra))
	for _, name := range order {
		ok, exists := required[name]
		if exists && !ok {
			missing = append(missing, name)
		}
	}
	missing = append(missing, extra...)
	return dedupeStrings(missing)
}

func readyReason(ready bool, blocking []string) string {
	if ready {
		return "All required trading checks passed."
	}
	if len(blocking) == 0 {
		return "One or more required trading checks did not pass."
	}
	return "Trading is blocked until these checks pass: " + joinStrings(blocking, ", ")
}

func dedupeStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	deduped := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		deduped = append(deduped, value)
	}
	return deduped
}

func joinStrings(values []string, sep string) string {
	if len(values) == 0 {
		return ""
	}
	result := values[0]
	for _, value := range values[1:] {
		result += sep + value
	}
	return result
}

func buildSuggestions(checks []Check, cfg *config.Config, opts Options) []string {
	suggestions := make([]string, 0, 4)
	for _, check := range checks {
		switch check.Name {
		case "sandbox":
			if check.Status == StatusWarn {
				suggestions = append(suggestions, "Use --sandbox while testing new workflows.")
			}
		case "auth":
			if check.Status == StatusWarn {
				suggestions = append(suggestions, "Run 'gemini-markets auth login' or 'gemini-markets auth setup' before placing orders.")
			}
		case "websocket":
			if check.Status == StatusFail {
				suggestions = append(suggestions, "Use --no-websocket temporarily if you need REST-only operation.")
			} else if supported, ok := check.Details["privateAccountStreams"].(bool); ok && !supported {
				suggestions = append(suggestions, "Use OAuth login with prediction scopes or account-scoped HMAC API keys for 'stream orders' and 'stream balances'.")
			}
		case "rate_limits":
			if check.Status == StatusWarn {
				suggestions = append(suggestions, "Prefer 'stream orders' and 'stream balances' over polling.")
			}
		}
	}

	if cfg != nil && cfg.Environment == "production" && !opts.WebSocketDisabled {
		suggestions = append(suggestions, "Run 'gemini-markets status' for a quick public health check before trading.")
	}

	return suggestions
}
