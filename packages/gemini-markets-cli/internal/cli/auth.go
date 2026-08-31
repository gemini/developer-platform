package cli

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/credentials"
	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/output"
	gemini "github.com/gemini/developer-platform/packages/sdk-go"
	geminioauth "github.com/gemini/developer-platform/packages/sdk-go/oauth"
	"github.com/spf13/cobra"
)

const (
	defaultOAuthClientID = "6a03a47b-1bb4-491a-b0a7-35ad17473e71"
	oauthRedirectURL     = "http://localhost:8787/callback"
)

var defaultOAuthScopes = []string{"account:read", "balances:read", "orders:read", "orders:create", "history:read"}

// OAuthConfigFactory constructs the SDK OAuth configuration for one CLI
// invocation. It is injectable so command tests never need to contact the
// authorization service.
type OAuthConfigFactory func(GlobalOptions) (geminioauth.Config, error)

// OAuthLoginFunc runs the official SDK's PKCE loopback login. The seam keeps
// browser and process behavior out of command tests while production always
// delegates to oauth.Config.Login.
type OAuthLoginFunc func(context.Context, geminioauth.Config, geminioauth.BrowserOpener) (*geminioauth.Token, error)

// AuthCommandDependencies contains the side effects owned by auth commands.
// A nil Keyring, Browser, OAuthConfigFactory, or OAuthLogin uses the secure
// production implementation.
type AuthCommandDependencies struct {
	Keyring            credentials.Keyring
	Browser            geminioauth.BrowserOpener
	OAuthConfigFactory OAuthConfigFactory
	OAuthLogin         OAuthLoginFunc
}

// NewAuthCommand creates the auth command group.
//
// The optional dependency value exists for focused tests and embedders. Root
// command registration remains the caller's responsibility:
// root.AddCommand(NewAuthCommand()).
func NewAuthCommand(dependencies ...AuthCommandDependencies) *cobra.Command {
	var dependency AuthCommandDependencies
	if len(dependencies) > 0 {
		dependency = dependencies[0]
	}

	command := &cobra.Command{
		Use:   "auth",
		Short: "Manage Gemini authentication",
		Args:  cobra.NoArgs,
	}
	command.AddCommand(
		newAuthLoginCommand(dependency),
		newAuthLogoutCommand(dependency),
		newAuthStatusCommand(dependency),
	)
	return command
}

// NewAuthCommandWithDependencies is the explicit dependency-injection form
// of NewAuthCommand.
func NewAuthCommandWithDependencies(dependencies AuthCommandDependencies) *cobra.Command {
	return NewAuthCommand(dependencies)
}

func newAuthLoginCommand(dependency AuthCommandDependencies) *cobra.Command {
	return &cobra.Command{
		Use:   "login",
		Short: "Authorize with OAuth and save credentials",
		Args:  cobra.NoArgs,
		RunE: func(command *cobra.Command, _ []string) error {
			options := Options(command)
			configFactory := dependency.OAuthConfigFactory
			if configFactory == nil {
				configFactory = defaultOAuthConfig
			}
			config, err := configFactory(options)
			if err != nil {
				return fmt.Errorf("configure OAuth login: %w", err)
			}

			login := dependency.OAuthLogin
			if login == nil {
				login = func(ctx context.Context, config geminioauth.Config, browser geminioauth.BrowserOpener) (*geminioauth.Token, error) {
					return config.Login(ctx, browser)
				}
			}
			browser := dependency.Browser
			if browser == nil {
				browser = openAuthBrowser
			}
			token, err := login(command.Context(), config, browser)
			if err != nil {
				return fmt.Errorf("OAuth login failed: %w", err)
			}
			if token == nil || strings.TrimSpace(token.AccessToken) == "" {
				return errors.New("OAuth login returned no access token")
			}

			keyring := dependency.Keyring
			if keyring == nil {
				keyring, err = credentials.NewOSKeyring()
				if err != nil {
					return fmt.Errorf("open credential keyring: %w", err)
				}
			}
			value := credentials.Credentials{
				AccessToken:       token.AccessToken,
				RefreshToken:      token.RefreshToken,
				OAuthClientID:     config.ClientID,
				OAuthClientSecret: config.ClientSecret,
				ExpiresAt:         token.ExpiresAt,
			}
			if err := keyring.Set(command.Context(), options.Profile, value); err != nil {
				return fmt.Errorf("save credentials: %w", err)
			}
			return writeAuthMessage(command.OutOrStdout(), options.Format, authMessage{
				Profile: options.Profile,
				Message: "OAuth login completed; credentials saved securely",
			})
		},
	}
}

func newAuthLogoutCommand(dependency AuthCommandDependencies) *cobra.Command {
	return &cobra.Command{
		Use:   "logout",
		Short: "Remove saved credentials",
		Args:  cobra.NoArgs,
		RunE: func(command *cobra.Command, _ []string) error {
			options := Options(command)
			keyring := dependency.Keyring
			if keyring == nil {
				var err error
				keyring, err = credentials.NewOSKeyring()
				if err != nil {
					if errors.Is(err, credentials.ErrUnavailable) {
						return writeAuthMessage(command.OutOrStdout(), options.Format, authMessage{
							Profile: options.Profile,
							Message: "no saved credentials found",
						})
					}
					return fmt.Errorf("open credential keyring: %w", err)
				}
			}
			err := keyring.Delete(command.Context(), options.Profile)
			if err != nil && !errors.Is(err, credentials.ErrNotFound) {
				return fmt.Errorf("remove saved credentials: %w", err)
			}
			return writeAuthMessage(command.OutOrStdout(), options.Format, authMessage{
				Profile: options.Profile,
				Message: "saved credentials removed",
			})
		},
	}
}

func newAuthStatusCommand(dependency AuthCommandDependencies) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show authentication status without secrets",
		Args:  cobra.NoArgs,
		RunE: func(command *cobra.Command, _ []string) error {
			options := Options(command)
			loadOptions := credentials.LoadOptions{Profile: options.Profile}
			if dependency.Keyring != nil {
				loadOptions.Keyring = dependency.Keyring
			}
			value, err := credentials.Load(command.Context(), loadOptions)
			if err != nil {
				return fmt.Errorf("load credentials: %w", err)
			}
			return writeAuthStatus(command.OutOrStdout(), options.Format, newAuthStatus(options, value))
		},
	}
}

type authMessage struct {
	Profile string `json:"profile"`
	Message string `json:"message"`
}

func writeAuthMessage(writer io.Writer, format output.Format, message authMessage) error {
	if format == output.JSON {
		return output.Write(writer, message, format)
	}
	return output.Write(writer, output.TableData{
		Headers: []string{"PROFILE", "STATUS"},
		Rows:    [][]string{{message.Profile, message.Message}},
	}, format)
}

// AuthStatus is the secret-free representation emitted by auth status. It
// reports only presence and authentication mode, never credential contents.
type AuthStatus struct {
	Profile             string `json:"profile"`
	Environment         string `json:"environment"`
	Configured          bool   `json:"configured"`
	Authentication      string `json:"authentication"`
	APIKeyPresent       bool   `json:"api_key_present"`
	APISecretPresent    bool   `json:"api_secret_present"`
	AccessTokenPresent  bool   `json:"access_token_present"`
	RefreshTokenPresent bool   `json:"refresh_token_present"`
}

func newAuthStatus(options GlobalOptions, value credentials.Credentials) AuthStatus {
	authentication := "none"
	switch {
	case value.AccessToken != "" || value.RefreshToken != "":
		if value.RefreshToken != "" {
			authentication = "oauth"
		} else {
			authentication = "bearer"
		}
	case value.APIKey != "" || value.APISecret != "":
		authentication = "hmac"
	}
	return AuthStatus{
		Profile:             options.Profile,
		Environment:         options.Environment,
		Configured:          authentication != "none",
		Authentication:      authentication,
		APIKeyPresent:       value.APIKey != "",
		APISecretPresent:    value.APISecret != "",
		AccessTokenPresent:  value.AccessToken != "",
		RefreshTokenPresent: value.RefreshToken != "",
	}
}

func writeAuthStatus(writer io.Writer, format output.Format, status AuthStatus) error {
	if format == output.JSON {
		return output.Write(writer, status, format)
	}
	authentication := status.Authentication
	if authentication == "none" {
		authentication = "not configured"
	}
	configured := "no"
	if status.Configured {
		configured = "yes"
	}
	return output.Write(writer, output.TableData{
		Headers: []string{"PROFILE", "ENVIRONMENT", "CONFIGURED", "AUTHENTICATION"},
		Rows:    [][]string{{status.Profile, status.Environment, configured, authentication}},
	}, format)
}

func defaultOAuthConfig(options GlobalOptions) (geminioauth.Config, error) {
	environment := gemini.Environment(strings.ToLower(strings.TrimSpace(options.Environment)))
	if environment == "" {
		environment = gemini.Production
	}
	endpoints, ok := gemini.EndpointsFor(environment)
	if !ok {
		return geminioauth.Config{}, fmt.Errorf("unknown Gemini environment %q", environment)
	}
	clientID := strings.TrimSpace(os.Getenv("GEMINI_OAUTH_CLIENT_ID"))
	if clientID == "" {
		clientID = defaultOAuthClientID
	}
	return geminioauth.Config{
		ClientID:     clientID,
		ClientSecret: strings.TrimSpace(os.Getenv("GEMINI_OAUTH_CLIENT_SECRET")),
		Endpoint: geminioauth.Endpoint{
			AuthURL:  endpoints.OAuthAuthorization,
			TokenURL: endpoints.OAuthToken,
		},
		RedirectURL: oauthRedirectURL,
		Scopes:      append([]string(nil), defaultOAuthScopes...),
	}, nil
}

func openAuthBrowser(rawURL string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", rawURL).Start()
	case "linux":
		return exec.Command("xdg-open", rawURL).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", rawURL).Start()
	default:
		return fmt.Errorf("unsupported operating system %q", runtime.GOOS)
	}
}
