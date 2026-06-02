package runtime

import (
	"context"
	"time"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/auth"
	"github.com/gemini/developer-platform/packages/cli/internal/config"
	"github.com/gemini/developer-platform/packages/cli/internal/ws"
)

type Options struct {
	Environment       string
	Timeout           time.Duration
	WebSocketDisabled bool
}

type Runtime struct {
	Config            *config.Config
	Session           *auth.Session
	CredentialSource  string
	API               *api.Client
	WS                *ws.ConnectionManager
	Timeout           time.Duration
	WebSocketDisabled bool
}

func (rt *Runtime) WSClientOptions() []ws.ClientOption {
	if rt == nil || rt.Config == nil {
		return nil
	}
	if rt.Session != nil && rt.Session.TokenSource != nil {
		return []ws.ClientOption{ws.WithBearerTokenSource(rt.Session.TokenSource)}
	}
	if rt.Config.AccessToken != "" {
		return []ws.ClientOption{ws.WithBearerAuth(rt.Config.AccessToken)}
	}
	if rt.Config.IsAuthenticated() {
		return []ws.ClientOption{ws.WithAuth(rt.Config.APIKey, rt.Config.APISecret)}
	}
	return nil
}

func LoadAuthenticated(ctx context.Context, opts Options) (*Runtime, error) {
	session, err := auth.Load(ctx, auth.LoadOptions{Environment: opts.Environment})
	if err != nil {
		return nil, err
	}
	return buildRuntime(opts, session), nil
}

func LoadWithFallback(ctx context.Context, opts Options) *Runtime {
	session, err := auth.Load(ctx, auth.LoadOptions{Environment: opts.Environment})
	if err == nil {
		return buildRuntime(opts, session)
	}

	cfg, cfgErr := config.LoadWithOptions(config.LoadOptions{Environment: opts.Environment})
	if cfgErr != nil {
		env := opts.Environment
		if env == "" {
			env = "production"
		}
		cfg = &config.Config{Environment: env}
	}

	rt := &Runtime{
		Config:            cfg,
		CredentialSource:  config.GetCredentialSourceForEnvironment(cfg.Environment),
		Timeout:           opts.Timeout,
		WebSocketDisabled: opts.WebSocketDisabled,
	}
	rt.API = api.NewClient(cfg, api.WithTimeout(timeoutOrDefault(opts.Timeout)))
	if !opts.WebSocketDisabled {
		rt.WS = ws.GetDefaultManager(ws.ManagerConfig{URL: cfg.GetWebSocketURL()})
	}
	return rt
}

func buildRuntime(opts Options, session *auth.Session) *Runtime {
	cfg := session.Config
	rt := &Runtime{
		Config:            cfg,
		Session:           session,
		CredentialSource:  session.CredentialSource,
		Timeout:           opts.Timeout,
		WebSocketDisabled: opts.WebSocketDisabled,
	}
	rt.API = api.NewClient(cfg, api.WithTimeout(timeoutOrDefault(opts.Timeout)), api.WithAuthenticator(session.Authenticator))
	if !opts.WebSocketDisabled {
		mcfg := ws.ManagerConfig{URL: cfg.GetWebSocketURL()}
		if session.TokenSource != nil {
			mcfg.BearerTokenSource = session.TokenSource
		} else if cfg.AccessToken != "" {
			mcfg.BearerToken = cfg.AccessToken
		} else {
			mcfg.APIKey = cfg.APIKey
			mcfg.APISecret = cfg.APISecret
		}
		rt.WS = ws.GetDefaultManager(mcfg)
	}
	return rt
}

func timeoutOrDefault(timeout time.Duration) time.Duration {
	if timeout <= 0 {
		return 30 * time.Second
	}
	return timeout
}
