package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/cli"
	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/output"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	command := cli.NewRootCommand(os.Stdout, os.Stderr)
	if err := command.ExecuteContext(ctx); err != nil {
		format := cli.Options(command).Format
		if writeErr := output.WriteError(os.Stderr, err, format); writeErr != nil {
			_, _ = os.Stderr.WriteString(err.Error() + "\n")
		}
		os.Exit(1)
	}
}
