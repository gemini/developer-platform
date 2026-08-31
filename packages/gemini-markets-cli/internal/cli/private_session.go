package cli

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/credentials"
	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/session"
	gemini "github.com/gemini/developer-platform/packages/sdk-go"
)

// newPrivateSession loads the selected profile's environment credentials and
// creates the official SDK client. Private commands deliberately share this
// small construction path so authentication remains owned by the session and
// SDK packages.
func newPrivateSession(ctx context.Context, options GlobalOptions) (*session.Session, error) {
	config, err := privateSessionConfig(ctx, options)
	if err != nil {
		return nil, err
	}
	return session.New(config)
}

func privateSessionConfig(ctx context.Context, options GlobalOptions) (session.Config, error) {
	keyring := credentials.NewDefaultKeyring()
	value, origin, err := credentials.LoadWithOrigin(ctx, credentials.LoadOptions{Profile: options.Profile, Keyring: keyring})
	if err != nil {
		return session.Config{}, fmt.Errorf("load credentials: %w", err)
	}
	if err := requirePrivateCredentials(value); err != nil {
		return session.Config{}, err
	}
	if value.RefreshToken != "" && origin != credentials.OriginKeyring {
		return session.Config{}, errors.New("environment refresh tokens cannot be rotated safely; run `gemini-markets auth login` to store refreshable OAuth credentials, or set only GEMINI_ACCESS_TOKEN")
	}
	config := session.Config{Environment: gemini.Environment(options.Environment), Credentials: value}
	if origin == credentials.OriginKeyring {
		config.CredentialStore = keyring
		config.CredentialProfile = options.Profile
	}
	return config, nil
}

// requirePrivateCredentials keeps authenticated commands from constructing an
// unauthenticated SDK client and only discovering the missing credentials
// after a network request. Public commands intentionally do not use this
// check.
func requirePrivateCredentials(value credentials.Credentials) error {
	if value.AccessToken != "" || value.RefreshToken != "" || value.APIKey != "" || value.APISecret != "" {
		return nil
	}
	return errors.New("authenticated command requires credentials; run `gemini-markets auth login` or set GEMINI_API_KEY and GEMINI_API_SECRET")
}

func closeSession(value *session.Session) io.Closer {
	if value == nil {
		return nil
	}
	return value
}
