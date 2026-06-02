package cmd

import (
	"context"
	"fmt"
	"os"

	"github.com/gemini/developer-platform/packages/cli/internal/debug"
	"github.com/gemini/developer-platform/packages/cli/internal/oauth"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

func runLogin() error {
	env := currentEnvironment()
	endpoints := oauth.EndpointsForEnvironment(env)

	pkce, err := oauth.GeneratePKCE()
	if err != nil {
		return output.FormatError(&output.CLIError{
			Code:    output.ErrCodeUnknown,
			Message: fmt.Sprintf("failed to generate PKCE: %v", err),
		})
	}

	state, err := oauth.GenerateState()
	if err != nil {
		return output.FormatError(&output.CLIError{
			Code:    output.ErrCodeUnknown,
			Message: fmt.Sprintf("failed to generate state: %v", err),
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), oauth.LoginTimeout)
	defer cancel()

	callbackPort, err := oauth.CallbackPort()
	if err != nil {
		return output.FormatError(output.NewInputError(err.Error()))
	}

	port, resultCh, shutdown, err := oauth.StartCallbackServerOnPort(callbackPort)
	if err != nil {
		return output.FormatError(&output.CLIError{
			Code:    output.ErrCodeUnknown,
			Message: fmt.Sprintf("failed to start callback server: %v", err),
		})
	}
	defer shutdown()

	clientID := oauth.ClientID()
	clientSecret := oauth.ClientSecret()
	authURL := oauth.BuildAuthorizationURL(endpoints, clientID, pkce, state, port)

	if oauth.IsHeadless() {
		fmt.Fprintln(os.Stderr, "Open this URL in a browser to authenticate:")
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, " ", authURL)
		fmt.Fprintln(os.Stderr)
	} else {
		fmt.Fprintln(os.Stderr, "Opening browser to authenticate with Gemini...")
		if err := oauth.OpenBrowser(authURL); err != nil {
			fmt.Fprintln(os.Stderr, "Could not open browser. Open this URL manually:")
			fmt.Fprintln(os.Stderr)
			fmt.Fprintln(os.Stderr, " ", authURL)
			fmt.Fprintln(os.Stderr)
		}
	}

	fmt.Fprintln(os.Stderr, "Waiting for authorization (press Ctrl+C to cancel)...")

	var result oauth.CallbackResult
	select {
	case result = <-resultCh:
	case <-ctx.Done():
		return output.FormatError(&output.CLIError{
			Code:       output.ErrCodeAuthRequired,
			Message:    "login timed out — no authorization callback received",
			Retryable:  true,
			Suggestion: "Run 'gemini-markets auth login' to try again",
		})
	}

	if result.Error != "" {
		return output.FormatError(&output.CLIError{
			Code:    output.ErrCodeAuthFailed,
			Message: fmt.Sprintf("authorization denied: %s", result.Error),
		})
	}

	if result.State != state {
		return output.FormatError(&output.CLIError{
			Code:    output.ErrCodeAuthFailed,
			Message: "state mismatch — possible CSRF attack",
		})
	}

	debug.Log("received authorization code, exchanging for tokens...")

	tokenResp, err := oauth.ExchangeCode(ctx, endpoints, clientID, clientSecret, result.Code, pkce, port)
	if err != nil {
		return output.FormatError(&output.CLIError{
			Code:    output.ErrCodeAuthFailed,
			Message: fmt.Sprintf("token exchange failed: %v", err),
		})
	}

	clientType := oauth.ClientType(clientSecret)
	stored := oauth.TokenResponseToStored(tokenResp, env, clientID, clientSecret)
	if err := oauth.SaveTokens(stored); err != nil {
		return output.FormatError(&output.CLIError{
			Code:    output.ErrCodeUnknown,
			Message: fmt.Sprintf("failed to save tokens: %v", err),
		})
	}

	fmt.Fprintln(os.Stderr)
	fmt.Fprintln(os.Stderr, "  Authenticated successfully.")
	fmt.Fprintf(os.Stderr, "  Token expires in: %d minutes (auto-refresh enabled)\n", tokenResp.ExpiresIn/60)
	fmt.Fprintln(os.Stderr)

	return output.PrintJSON(map[string]any{
		"success":           true,
		"auth_type":         "oauth",
		"oauth_client_type": clientType,
		"pkce":              true,
		"expires_in":        tokenResp.ExpiresIn,
		"token_type":        tokenResp.TokenType,
	})
}
