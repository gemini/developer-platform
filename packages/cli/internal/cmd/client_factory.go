package cmd

import (
	"context"
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/config"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
	appruntime "github.com/gemini/developer-platform/packages/cli/internal/runtime"
	"github.com/gemini/developer-platform/packages/cli/internal/ws"
)

type runtimeResolverKey struct{}

type runtimeResolver struct {
	options appruntime.Options
	public  *appruntime.Runtime
	auth    *appruntime.Runtime
}

func currentEnvironment() string {
	if sandbox {
		return "sandbox"
	}
	if env := config.ResolveEnvironment(""); env != "" {
		return env
	}
	return "production"
}

func currentRuntimeOptions() appruntime.Options {
	return appruntime.Options{
		Environment:       currentEnvironment(),
		Timeout:           time.Duration(TimeoutSeconds()) * time.Second,
		WebSocketDisabled: IsWebSocketDisabled(),
	}
}

func attachRuntimeResolver(cmd *cobra.Command, opts appruntime.Options) {
	resolver := &runtimeResolver{options: opts}
	ctx := context.WithValue(cmd.Context(), runtimeResolverKey{}, resolver)
	cmd.SetContext(ctx)
}

func resolverForCommand(cmd *cobra.Command) (*runtimeResolver, error) {
	if cmd == nil {
		return nil, fmt.Errorf("missing command context")
	}
	if resolver, ok := cmd.Context().Value(runtimeResolverKey{}).(*runtimeResolver); ok && resolver != nil {
		return resolver, nil
	}
	return nil, fmt.Errorf("runtime resolver is not initialized")
}

func runtimeWithFallback(cmd *cobra.Command) (*appruntime.Runtime, error) {
	resolver, err := resolverForCommand(cmd)
	if err != nil {
		return nil, err
	}
	if resolver.public != nil {
		return resolver.public, nil
	}
	resolver.public = appruntime.LoadWithFallback(cmd.Context(), resolver.options)
	if resolver.public.Session != nil && resolver.auth == nil {
		resolver.auth = resolver.public
	}
	return resolver.public, nil
}

func authenticatedRuntime(cmd *cobra.Command) (*appruntime.Runtime, error) {
	resolver, err := resolverForCommand(cmd)
	if err != nil {
		return nil, err
	}
	if resolver.auth != nil {
		return resolver.auth, nil
	}
	if resolver.public != nil && resolver.public.Session != nil {
		resolver.auth = resolver.public
		return resolver.auth, nil
	}
	resolver.auth, err = appruntime.LoadAuthenticated(cmd.Context(), resolver.options)
	if err != nil {
		return nil, output.NewAuthError(err.Error())
	}
	return resolver.auth, nil
}

func loadConfigWithFallback(cmd *cobra.Command) (*config.Config, error) {
	rt, err := runtimeWithFallback(cmd)
	if err != nil {
		return nil, err
	}
	return rt.Config, nil
}

func newAPIClient(cmd *cobra.Command, cfg *config.Config) (*api.Client, error) {
	rt, err := runtimeWithFallback(cmd)
	if err != nil {
		return nil, err
	}
	if rt.Config == cfg {
		return rt.API, nil
	}
	if authRT, err := authenticatedRuntime(cmd); err == nil && authRT.Config == cfg {
		return authRT.API, nil
	}
	return nil, fmt.Errorf("runtime config mismatch: command must use command-scoped runtime clients")
}

func getWSManager(cmd *cobra.Command, cfg *config.Config) (*ws.ConnectionManager, error) {
	rt, err := runtimeWithFallback(cmd)
	if err != nil {
		return nil, err
	}
	if rt.Config == cfg {
		return rt.WS, nil
	}
	if authRT, err := authenticatedRuntime(cmd); err == nil && authRT.Config == cfg {
		return authRT.WS, nil
	}
	return nil, fmt.Errorf("runtime config mismatch: command must use command-scoped runtime websocket manager")
}
