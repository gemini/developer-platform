package cmd

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/config"
	"github.com/gemini/developer-platform/packages/cli/internal/debug"
	"github.com/gemini/developer-platform/packages/cli/internal/oauth"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

func runLogout(cmd *cobra.Command) error {
	rt, err := runtimeWithFallback(cmd)
	if err != nil {
		return handleCommandError(err)
	}
	cfg := rt.Config
	if cfg == nil || !cfg.IsAuthenticated() {
		return output.FormatError(&output.CLIError{
			Code:       output.ErrCodeAuthRequired,
			Message:    "no active authentication state found",
			Suggestion: "Use 'gemini-markets auth login' or configure credentials first",
		})
	}

	switch cfg.AuthType {
	case config.AuthTypeOAuth:
		return revokeOAuthSession(cfg.Environment)
	case config.AuthTypeBearerEnv:
		return output.FormatError(&output.CLIError{
			Code:       output.ErrCodeAuthRequired,
			Message:    "authentication is coming from GEMINI_ACCESS_TOKEN",
			Suggestion: "Unset GEMINI_ACCESS_TOKEN in your shell or CI environment to log out",
		})
	case config.AuthTypeHMAC:
		if os.Getenv("GEMINI_API_KEY") != "" {
			return output.FormatError(&output.CLIError{
				Code:       output.ErrCodeAuthRequired,
				Message:    "authentication is coming from GEMINI_API_KEY and GEMINI_API_SECRET",
				Suggestion: "Unset GEMINI_API_KEY and GEMINI_API_SECRET in your shell or CI environment to log out",
			})
		}
		return clearStoredAPIKeys()
	default:
		return output.FormatError(&output.CLIError{
			Code:       output.ErrCodeAuthRequired,
			Message:    "no stored authentication state found",
			Suggestion: "Use 'gemini-markets auth login' or 'gemini-markets auth setup' to authenticate",
		})
	}
}

func revokeOAuthSession(env string) error {
	tokens, err := oauth.LoadTokens(env)
	if err != nil || tokens == nil {
		return output.FormatError(&output.CLIError{
			Code:       output.ErrCodeAuthRequired,
			Message:    "no OAuth session found for the active environment",
			Suggestion: "Use 'gemini-markets auth login' to authenticate",
		})
	}

	endpoints := oauth.EndpointsForEnvironment(env)

	fmt.Fprint(os.Stderr, "Revoking tokens... ")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if tokens.RefreshToken != "" {
		if err := oauth.RevokeToken(ctx, endpoints, tokens.RefreshToken); err != nil {
			debug.Log("refresh token revocation failed: %v", err)
		}
	}
	if err := oauth.RevokeToken(ctx, endpoints, tokens.AccessToken); err != nil {
		debug.Log("access token revocation failed: %v", err)
	}
	fmt.Fprintln(os.Stderr, "done.")

	if err := oauth.DeleteTokens(env); err != nil {
		return output.FormatError(&output.CLIError{
			Code:    output.ErrCodeUnknown,
			Message: fmt.Sprintf("failed to remove stored tokens: %v", err),
		})
	}

	resp := map[string]any{
		"success":   true,
		"auth_type": config.AuthTypeOAuth,
		"message":   "OAuth tokens revoked and stored authentication state cleared",
	}
	if warnings := deleteStoredAPIKeys(); len(warnings) > 0 {
		resp["warnings"] = warnings
	}
	return output.PrintJSON(resp)
}

func clearStoredAPIKeys() error {
	resp := map[string]any{
		"success":   true,
		"auth_type": config.AuthTypeHMAC,
		"message":   "Stored API credentials removed",
	}
	if warnings := deleteStoredAPIKeys(); len(warnings) > 0 {
		resp["warnings"] = warnings
	}
	return output.PrintJSON(resp)
}

func deleteStoredAPIKeys() []string {
	var warnings []string
	if err := config.DeleteFromKeyring(); err != nil {
		warnings = append(warnings, err.Error())
		fmt.Fprintf(os.Stderr, "Warning: %v\n", err)
	}
	if err := config.DeleteConfigFile(); err != nil {
		warnings = append(warnings, err.Error())
		fmt.Fprintf(os.Stderr, "Warning: %v\n", err)
	}
	return warnings
}
