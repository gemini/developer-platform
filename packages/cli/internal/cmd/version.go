package cmd

import (
	"fmt"
	"runtime"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

// Version is the current build version, set at compile time.
var (
	Version   = "0.1.0"
	GitCommit = "unknown"
	BuildDate = "unknown"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Show version information",
	RunE: func(cmd *cobra.Command, args []string) error {
		info := map[string]string{
			"version":   Version,
			"commit":    GitCommit,
			"buildDate": BuildDate,
			"go":        runtime.Version(),
			"os":        runtime.GOOS,
			"arch":      runtime.GOARCH,
		}

		if IsTableOutput() {
			fmt.Printf("gemini-markets %s\n", Version)
			fmt.Printf("  Commit:     %s\n", GitCommit)
			fmt.Printf("  Built:      %s\n", BuildDate)
			fmt.Printf("  Go:         %s\n", runtime.Version())
			fmt.Printf("  OS/Arch:    %s/%s\n", runtime.GOOS, runtime.GOARCH)
			return nil
		}
		return output.PrintJSON(info)
	},
}
