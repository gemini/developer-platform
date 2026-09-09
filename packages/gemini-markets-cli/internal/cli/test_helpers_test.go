package cli

import (
	"io"

	"github.com/spf13/cobra"
)

// newTestRootCommand keeps command-injection tests focused on the command
// under test. Production roots register the complete command tree, so an
// injected command with the same name must replace that default for tests.
func newTestRootCommand(stdout, stderr io.Writer) *cobra.Command {
	root := NewRootCommand(stdout, stderr)
	root.RemoveCommand(root.Commands()...)
	return root
}
