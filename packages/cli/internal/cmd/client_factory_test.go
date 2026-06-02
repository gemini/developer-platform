package cmd

import (
	"context"
	"testing"
	"time"

	"github.com/spf13/cobra"

	appruntime "github.com/gemini/developer-platform/packages/cli/internal/runtime"
)

func TestAttachRuntimeResolverProvidesCommandScopedResolver(t *testing.T) {
	cmd := &cobra.Command{Use: "leaf"}
	cmd.SetContext(context.Background())
	attachRuntimeResolver(cmd, appruntime.Options{
		Environment:       "sandbox",
		Timeout:           42 * time.Second,
		WebSocketDisabled: true,
	})

	resolver, err := resolverForCommand(cmd)
	if err != nil {
		t.Fatalf("resolverForCommand() error = %v", err)
	}
	if resolver.options.Environment != "sandbox" {
		t.Fatalf("Environment = %q, want sandbox", resolver.options.Environment)
	}
	if resolver.options.Timeout.Seconds() != 42 {
		t.Fatalf("Timeout = %v, want 42s", resolver.options.Timeout)
	}
	if !resolver.options.WebSocketDisabled {
		t.Fatal("WebSocketDisabled = false, want true")
	}
}
