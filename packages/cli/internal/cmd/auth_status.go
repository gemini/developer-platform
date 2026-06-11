package cmd

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/config"
	"github.com/gemini/developer-platform/packages/cli/internal/oauth"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Manage authentication and session health",
	Long: `Commands for authentication lifecycle management.

Use this command family to log in (OAuth or API key), inspect the active
auth mode, validate authenticated API access, and clear stored credentials.`,
}

var authLoginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with Gemini via browser",
	Long: `Authenticate with Gemini Exchange using OAuth browser login.

Register your OAuth application with this redirect URL:
  http://localhost:8787/callback

For a custom Gemini OAuth application, set GEMINI_OAUTH_CLIENT_ID and
GEMINI_OAUTH_CALLBACK_PORT if your registered redirect URL uses a
different localhost port. Public PKCE clients do not use a client
secret; set GEMINI_OAUTH_CLIENT_SECRET only for confidential OAuth apps.
The CLI requests account, balance, history, and order scopes. Those trading
scopes currently cover prediction trading for REST and private WebSocket
operations.`,
	Example: `  export GEMINI_OAUTH_CLIENT_ID="your-client-id"
  gemini-markets auth login
  gemini-markets --sandbox auth login`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runLogin()
	},
}

var authStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show active authentication source and session metadata",
	Example: `  gemini-markets auth status
  gemini-markets --sandbox auth status -q`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return printAuthStatus(cmd)
	},
}

var authTestCmd = &cobra.Command{
	Use:   "test",
	Short: "Validate authenticated API access",
	Example: `  gemini-markets auth test
  gemini-markets --sandbox auth test -q`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runAuthTest(cmd)
	},
}

var authLogoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Clear the active stored authentication state",
	Example: `  gemini-markets auth logout
  gemini-markets --sandbox auth logout`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runLogout(cmd)
	},
}

var authSetupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Configure API key credentials",
	Long: `Run the interactive setup wizard to store API key credentials.

For browser-based OAuth login (recommended), use 'gemini-markets auth login' instead.`,
	Example: `  gemini-markets auth setup
  gemini-markets --sandbox auth setup`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return config.RunSetupWizard()
	},
}

var authShowCmd = &cobra.Command{
	Use:   "show",
	Short: "Show stored credentials (secrets masked)",
	Example: `  gemini-markets auth show
  gemini-markets auth show -o table`,
	RunE: func(cmd *cobra.Command, args []string) error {
		rt, err := runtimeWithFallback(cmd)
		if err != nil {
			return handleCommandError(err)
		}
		cfg := rt.Config
		source := rt.CredentialSource

		masked := map[string]string{
			"api_key":     maskSecret(cfg.APIKey),
			"api_secret":  maskSecret(cfg.APISecret),
			"auth_type":   cfg.AuthType,
			"token":       maskSecret(cfg.AccessToken),
			"environment": cfg.Environment,
			"source":      source,
		}

		if IsTableOutput() {
			fmt.Printf("Auth Type:   %s\n", masked["auth_type"])
			if cfg.AccessToken != "" {
				fmt.Printf("Token:       %s\n", masked["token"])
			} else {
				fmt.Printf("API Key:     %s\n", masked["api_key"])
				fmt.Printf("API Secret:  %s\n", masked["api_secret"])
			}
			fmt.Printf("Environment: %s\n", masked["environment"])
			fmt.Printf("Source:      %s\n", masked["source"])
			return nil
		}
		return output.PrintJSON(masked)
	},
}

func maskSecret(s string) string {
	if len(s) <= 8 {
		return "***"
	}
	return s[:4] + "..." + s[len(s)-4:]
}

func runAuthTest(cmd *cobra.Command) error {
	rt, err := authenticatedRuntime(cmd)
	if err != nil {
		return handleCommandError(err)
	}

	cfg := rt.Config
	if err := config.ValidateConfig(cfg); err != nil {
		return err
	}

	balances, err := rt.API.GetBalances(cmd.Context())
	if err != nil {
		authErr := &output.CLIError{
			Code:       output.ErrCodeAuthFailed,
			Message:    err.Error(),
			Retryable:  false,
			Suggestion: "Verify your credentials are valid, or run 'gemini-markets auth login' to re-authenticate",
		}
		if IsTableOutput() {
			fmt.Println("Status: FAILED")
			fmt.Printf("Error: %v\n", err)
			return authErr
		}
		return output.FormatError(authErr)
	}

	if IsTableOutput() {
		fmt.Println("Status: OK")
		fmt.Printf("Auth Type: %s\n", cfg.AuthType)
		fmt.Printf("Environment: %s\n", cfg.Environment)
		if cfg.AccessToken != "" {
			fmt.Printf("Token: %s\n", maskSecret(cfg.AccessToken))
		} else {
			fmt.Printf("API Key: %s\n", maskSecret(cfg.APIKey))
		}
		fmt.Printf("Currencies: %d\n", len(balances))
		return nil
	}
	return output.PrintJSON(map[string]any{
		"success":     true,
		"authType":    cfg.AuthType,
		"environment": cfg.Environment,
		"apiKey":      maskSecret(cfg.APIKey),
		"token":       maskSecret(cfg.AccessToken),
		"currencies":  len(balances),
	})
}

func printAuthStatus(cmd *cobra.Command) error {
	rt, err := runtimeWithFallback(cmd)
	if err != nil {
		return handleCommandError(err)
	}
	cfg := rt.Config

	status := map[string]any{
		"authenticated":      false,
		"auth_type":          "none",
		"environment":        currentEnvironment(),
		"credential_source":  rt.CredentialSource,
		"status_scope":       "metadata",
		"validation_command": "gemini-markets auth test",
	}

	if cfg == nil {
		return output.PrintJSON(status)
	}

	status["environment"] = cfg.Environment
	if cfg.AuthType != "" {
		status["auth_type"] = cfg.AuthType
	}
	if cfg.IsAuthenticated() {
		status["authenticated"] = true
	}

	switch cfg.AuthType {
	case config.AuthTypeOAuth:
		tokens, err := oauth.LoadTokens(cfg.Environment)
		if err == nil && tokens != nil {
			status["token_type"] = tokens.TokenType
			status["expires_at"] = tokens.ExpiresAt.Format(time.RFC3339)
			status["expired"] = tokens.IsExpired()
			status["has_refresh"] = tokens.RefreshToken != ""
			status["pkce"] = true
			if tokens.ClientID != "" {
				status["oauth_client_id"] = tokens.ClientID
			}
			if scopes := splitOAuthScopes(tokens.Scope); len(scopes) > 0 {
				status["oauth_scopes"] = scopes
			}
			clientType := tokens.ClientType
			if clientType == "" {
				clientType = oauth.ClientType(oauth.ClientSecret())
			}
			status["oauth_client_type"] = clientType
			status["session_state"] = "active"
			if tokens.IsExpired() {
				status["session_state"] = "expired"
			}
		}
	case config.AuthTypeBearerEnv:
		status["token_source"] = "GEMINI_ACCESS_TOKEN"
		status["session_state"] = "not_applicable"
	case config.AuthTypeHMAC:
		if cfg.APIKey != "" {
			status["api_key"] = maskSecret(cfg.APIKey)
		}
		status["session_state"] = "not_applicable"
	}

	return output.PrintJSON(status)
}

func splitOAuthScopes(scope string) []string {
	fields := strings.FieldsFunc(scope, func(r rune) bool {
		return r == ',' || r == ' ' || r == '\t' || r == '\n'
	})
	scopes := fields[:0]
	for _, field := range fields {
		if field != "" {
			scopes = append(scopes, field)
		}
	}
	return scopes
}

func init() {
	authCmd.AddCommand(authLoginCmd)
	authCmd.AddCommand(authSetupCmd)
	authCmd.AddCommand(authShowCmd)
	authCmd.AddCommand(authStatusCmd)
	authCmd.AddCommand(authTestCmd)
	authCmd.AddCommand(authLogoutCmd)
	rootCmd.AddCommand(authCmd)
}
