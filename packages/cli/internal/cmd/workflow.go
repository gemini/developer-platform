package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

var workflowCmd = &cobra.Command{
	Use:   "workflow",
	Short: "Execute pre-built workflows",
	Long:  "List and execute pre-built workflows for common trading tasks.",
}

var workflowListCmd = &cobra.Command{
	Use:   "list",
	Short: "List available workflows",
	RunE: func(cmd *cobra.Command, args []string) error {
		workflows := buildWorkflows()

		if IsTableOutput() {
			table := output.NewTableWriter("NAME", "DESCRIPTION", "STEPS")
			for _, w := range workflows {
				table.AddRow(w.Name, w.Description, fmt.Sprintf("%d", len(w.Steps)))
			}
			table.Render()
			return nil
		}

		type workflowSummary struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Steps       int    `json:"steps"`
		}
		summaries := make([]workflowSummary, len(workflows))
		for i, w := range workflows {
			summaries[i] = workflowSummary{
				Name:        w.Name,
				Description: w.Description,
				Steps:       len(w.Steps),
			}
		}
		return output.PrintJSON(summaries)
	},
}

var workflowShowCmd = &cobra.Command{
	Use:   "show <name>",
	Short: "Show workflow steps",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]
		workflows := buildWorkflows()

		var workflow *WorkflowSpec
		for i := range workflows {
			if workflows[i].Name == name {
				workflow = &workflows[i]
				break
			}
		}

		if workflow == nil {
			return output.FormatError(output.NewInputError(
				fmt.Sprintf("workflow not found: %s (use 'workflow list' to see available workflows)", name),
			))
		}

		if IsTableOutput() {
			fmt.Printf("\nWorkflow: %s\n", workflow.Name)
			fmt.Printf("Description: %s\n\n", workflow.Description)

			table := output.NewTableWriter("STEP", "ACTION", "COMMAND")
			for _, step := range workflow.Steps {
				table.AddRow(
					fmt.Sprintf("%d", step.Step),
					step.Action,
					truncateCommand(step.Command, 60),
				)
			}
			table.Render()
			fmt.Println()
			return nil
		}

		return output.PrintJSON(workflow)
	},
}

var workflowRunCmd = &cobra.Command{
	Use:   "run <name>",
	Short: "Display workflow steps for execution",
	Long: `Display the commands for a workflow in executable format.

The output can be reviewed and then piped to bash for execution:
  gemini-markets workflow run predict_place_order | bash

Or copy individual commands to execute step by step.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]
		workflows := buildWorkflows()

		var workflow *WorkflowSpec
		for i := range workflows {
			if workflows[i].Name == name {
				workflow = &workflows[i]
				break
			}
		}

		if workflow == nil {
			return output.FormatError(output.NewInputError(
				fmt.Sprintf("workflow not found: %s (use 'workflow list' to see available workflows)", name),
			))
		}

		if IsTableOutput() {
			fmt.Printf("# Workflow: %s\n", workflow.Name)
			fmt.Printf("# %s\n\n", workflow.Description)

			for _, step := range workflow.Steps {
				fmt.Printf("# Step %d: %s\n", step.Step, step.Description)
				fmt.Printf("%s\n\n", step.Command)
			}
			return nil
		}

		type executableWorkflow struct {
			Name     string   `json:"name"`
			Commands []string `json:"commands"`
		}
		commands := make([]string, len(workflow.Steps))
		for i, step := range workflow.Steps {
			commands[i] = step.Command
		}
		return output.PrintJSON(executableWorkflow{
			Name:     workflow.Name,
			Commands: commands,
		})
	},
}

func truncateCommand(s string, maxLen int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) > maxLen {
		return s[:maxLen-3] + "..."
	}
	return s
}

func init() {
	workflowCmd.AddCommand(workflowListCmd)
	workflowCmd.AddCommand(workflowShowCmd)
	workflowCmd.AddCommand(workflowRunCmd)
	rootCmd.AddCommand(workflowCmd)
}
