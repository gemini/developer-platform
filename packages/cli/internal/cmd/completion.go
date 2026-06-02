package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

var completionCmd = &cobra.Command{
	Use:   "completion [bash|zsh|fish|powershell]",
	Short: "Generate shell completion scripts",
	Long: `Generate shell completion scripts for gemini-markets.

To load completions:

Bash:
  $ source <(gemini-markets completion bash)
  # To load completions for each session, execute once:
  # Linux:
  $ gemini-markets completion bash > /etc/bash_completion.d/gemini-markets
  # macOS:
  $ gemini-markets completion bash > $(brew --prefix)/etc/bash_completion.d/gemini-markets

Zsh:
  # If shell completion is not already enabled in your environment,
  # you will need to enable it. You can execute the following once:
  $ echo "autoload -U compinit; compinit" >> ~/.zshrc

  # To load completions for each session, execute once:
  $ gemini-markets completion zsh > "${fpath[1]}/_gemini-markets"

Fish:
  $ gemini-markets completion fish | source
  # To load completions for each session, execute once:
  $ gemini-markets completion fish > ~/.config/fish/completions/gemini-markets.fish

PowerShell:
  PS> gemini-markets completion powershell | Out-String | Invoke-Expression
`,
	DisableFlagsInUseLine: true,
	ValidArgs:             []string{"bash", "zsh", "fish", "powershell"},
	Args:                  cobra.MatchAll(cobra.ExactArgs(1), cobra.OnlyValidArgs),
	RunE: func(cmd *cobra.Command, args []string) error {
		switch args[0] {
		case "bash":
			return rootCmd.GenBashCompletion(os.Stdout)
		case "zsh":
			return rootCmd.GenZshCompletion(os.Stdout)
		case "fish":
			return rootCmd.GenFishCompletion(os.Stdout, true)
		case "powershell":
			return rootCmd.GenPowerShellCompletionWithDesc(os.Stdout)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(completionCmd)
	registerCoreCompletions()
}
