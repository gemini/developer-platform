package auth

import (
	"context"
	"fmt"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/config"
	"github.com/gemini/developer-platform/packages/cli/internal/oauth"
)

type LoadOptions struct {
	Environment string
}

type Session struct {
	Config           *config.Config
	AuthType         string
	CredentialSource string
	TokenSource      api.TokenSource
	Authenticator    api.Authenticator
}

func Load(ctx context.Context, opts LoadOptions) (*Session, error) {
	cfg, err := config.LoadWithOptions(config.LoadOptions{
		Environment: opts.Environment,
	})
	if err != nil {
		return nil, err
	}
	if err := config.ValidateConfig(cfg); err != nil {
		return nil, err
	}

	session := &Session{
		Config:           cfg,
		AuthType:         cfg.AuthType,
		CredentialSource: config.GetCredentialSourceForEnvironment(cfg.Environment),
	}

	switch cfg.AuthType {
	case config.AuthTypeOAuth:
		tm := oauth.NewTokenManager(cfg.Environment)
		session.TokenSource = func(ctx context.Context) (string, error) {
			return tm.GetValidAccessToken(ctx)
		}
	case config.AuthTypeBearerEnv:
		session.TokenSource = func(context.Context) (string, error) {
			return cfg.AccessToken, nil
		}
	}

	session.Authenticator = api.NewAuthenticator(cfg, session.TokenSource)
	if session.Authenticator == nil {
		return nil, fmt.Errorf("failed to create authenticator")
	}

	return session, nil
}

func (s *Session) IsAuthenticated() bool {
	return s != nil && s.Config != nil && s.Config.IsAuthenticated()
}
