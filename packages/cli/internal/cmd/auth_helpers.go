package cmd

import (
	"errors"
	"net/http"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/config"
	"github.com/gemini/developer-platform/packages/cli/internal/oauth"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
	"github.com/gemini/developer-platform/packages/cli/internal/ws"
)

func requireAuth(cmd *cobra.Command) *config.Config {
	rt, err := authenticatedRuntime(cmd)
	if err != nil {
		output.ExitWithError(output.NewAuthError(err.Error()))
	}
	return rt.Config
}

func handleAPIError(err error) error {
	if errors.Is(err, oauth.ErrReauthRequired) {
		return output.FormatError(output.NewAuthError(err.Error()))
	}

	var wsErr *ws.Error
	if errors.As(err, &wsErr) {
		return output.FormatError(parseWebSocketError(wsErr))
	}

	var wsHTTPError *ws.HTTPError
	if errors.As(err, &wsHTTPError) {
		return output.FormatError(parseWebSocketHTTPError(wsHTTPError))
	}

	var apiErr *api.APIError
	if errors.As(err, &apiErr) {
		cliErr := output.ParseAPIError(apiErr.Code, apiErr.Message, apiErr.Reason)
		return output.FormatError(cliErr)
	}
	cliErr := output.NewNetworkError(err)
	return output.FormatError(cliErr)
}

func parseWebSocketError(err *ws.Error) *output.CLIError {
	message := err.Msg
	if message == "" {
		message = err.Error()
	}

	switch err.Code {
	case http.StatusUnauthorized, -1002:
		return privateWebSocketAuthError(message)
	case -1004:
		return &output.CLIError{
			Code:       output.ErrCodeAuthFailed,
			Message:    message,
			Retryable:  false,
			Suggestion: "Your OAuth token lacks the required scope for this stream. Run 'gemini-markets auth login' to re-authenticate and grant the necessary scopes.",
		}
	default:
		return output.NewNetworkError(err)
	}
}

func parseWebSocketHTTPError(err *ws.HTTPError) *output.CLIError {
	if err.StatusCode == http.StatusUnauthorized || err.StatusCode == http.StatusForbidden {
		return privateWebSocketAuthError(err.Error())
	}
	return output.NewNetworkError(err)
}

func handleCommandError(err error) error {
	var cliErr *output.CLIError
	if errors.As(err, &cliErr) {
		return output.FormatError(cliErr)
	}
	return handleAPIError(err)
}
