package cli

import (
	"context"
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
	value, err := credentials.Load(ctx, credentials.LoadOptions{Profile: options.Profile})
	if err != nil {
		return nil, fmt.Errorf("load credentials: %w", err)
	}
	return session.New(session.Config{
		Environment: gemini.Environment(options.Environment),
		Credentials: value,
	})
}

func closeSession(value *session.Session) io.Closer {
	if value == nil {
		return nil
	}
	return value
}
