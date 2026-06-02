package cmd

import (
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"

	"github.com/gemini/developer-platform/packages/cli/internal/output"
	internalschema "github.com/gemini/developer-platform/packages/cli/internal/schema"
)

type (
	CLISpec               = internalschema.CLISpec
	CommandSpec           = internalschema.CommandSpec
	FlagSpec              = internalschema.FlagSpec
	WorkflowSpec          = internalschema.WorkflowSpec
	WorkflowStep          = internalschema.WorkflowStep
	Schema                = internalschema.Schema
	SchemaField           = internalschema.SchemaField
	ErrorCodeSpec         = internalschema.ErrorCodeSpec
	RateLimitSpec         = internalschema.RateLimitSpec
	ConstraintsSpec       = internalschema.ConstraintsSpec
	PredictionConstraints = internalschema.PredictionConstraints
	SpotConstraints       = internalschema.SpotConstraints
	RetryStrategySpec     = internalschema.RetryStrategySpec
	RetryStrategy         = internalschema.RetryStrategy
)

var (
	specSection string
)

var specCmd = &cobra.Command{
	Use:   "spec",
	Short: "Output CLI specification as JSON",
	Long:  "Output a machine-readable JSON specification of all commands, workflows, and response schemas. Designed for agent discovery.",
	RunE: func(cmd *cobra.Command, args []string) error {
		spec := buildSpec(rootCmd)
		if specSection != "" {
			return outputSpecSection(&spec, specSection)
		}
		return output.PrintJSON(spec)
	},
}

func init() {
	specCmd.Flags().StringVar(&specSection, "section", "", "output specific section: errors, schemas, workflows, commands, limits, retry")
}

func outputSpecSection(spec *CLISpec, section string) error {
	switch section {
	case "errors":
		return output.PrintJSON(spec.ErrorCodes)
	case "schemas":
		return output.PrintJSON(spec.Schemas)
	case "workflows":
		return output.PrintJSON(spec.Workflows)
	case "commands":
		return output.PrintJSON(spec.Commands)
	case "limits":
		type LimitsSection struct {
			RateLimits  RateLimitSpec   `json:"rateLimits"`
			Constraints ConstraintsSpec `json:"constraints"`
		}
		return output.PrintJSON(LimitsSection{RateLimits: spec.RateLimits, Constraints: spec.Constraints})
	case "retry":
		return output.PrintJSON(spec.RetryStrategy)
	default:
		return output.FormatError(output.NewInputError("invalid section: must be errors, schemas, workflows, commands, limits, or retry"))
	}
}

func buildSpec(root *cobra.Command) CLISpec {
	spec := CLISpec{
		Name:               "gemini-markets",
		Description:        "Gemini Trading CLI - Spot and Prediction Markets with JSON output",
		Version:            Version,
		Commands:           []CommandSpec{},
		Workflows:          internalschema.BuildWorkflows(),
		Schemas:            internalschema.BuildSchemas(),
		ErrorCodes:         internalschema.BuildErrorCodes(),
		RateLimits:         internalschema.BuildRateLimits(),
		Constraints:        internalschema.BuildConstraints(),
		RetryStrategy:      internalschema.BuildRetryStrategy(),
		FieldAbbreviations: internalschema.BuildFieldAbbreviations(),
	}

	for _, cmd := range root.Commands() {
		if cmd.Hidden || cmd.Name() == "help" || cmd.Name() == "completion" {
			continue
		}
		spec.Commands = append(spec.Commands, buildCommandSpec(cmd))
	}

	return spec
}

func buildCommandSpec(cmd *cobra.Command) CommandSpec {
	requiresAuth := commandRequiresAuth(cmd)

	spec := CommandSpec{
		Name:         cmd.Name(),
		Description:  cmd.Short,
		Usage:        cmd.UseLine(),
		RequiresAuth: requiresAuth,
		Flags:        buildFlagSpecs(cmd),
		Subcommands:  []CommandSpec{},
	}

	for _, sub := range cmd.Commands() {
		if sub.Hidden || sub.Name() == "help" {
			continue
		}
		subSpec := buildCommandSpec(sub)
		spec.Subcommands = append(spec.Subcommands, subSpec)
	}

	return spec
}

func commandRequiresAuth(cmd *cobra.Command) bool {
	path := cmd.CommandPath()
	switch path {
	case "gemini-markets auth test",
		"gemini-markets balance",
		"gemini-markets spot fees",
		"gemini-markets spot trades",
		"gemini-markets stream balances",
		"gemini-markets stream orders":
		return true
	}

	for _, prefix := range []string{
		"gemini-markets predict order",
		"gemini-markets predict positions",
		"gemini-markets spot order",
	} {
		if path == prefix || strings.HasPrefix(path, prefix+" ") {
			return true
		}
	}

	return false
}

func buildFlagSpecs(cmd *cobra.Command) []FlagSpec {
	var flags []FlagSpec

	cmd.Flags().VisitAll(func(f *pflag.Flag) {
		if f.Hidden || f.Name == "help" {
			return
		}

		flagSpec := FlagSpec{
			Name:        f.Name,
			Shorthand:   f.Shorthand,
			Type:        f.Value.Type(),
			Description: f.Usage,
		}

		if f.DefValue != "" && f.DefValue != "false" && f.DefValue != "0" && f.DefValue != "[]" {
			flagSpec.Default = f.DefValue
		}

		if annotations := f.Annotations; annotations != nil {
			if _, ok := annotations[cobra.BashCompOneRequiredFlag]; ok {
				flagSpec.Required = true
			}
		}

		flags = append(flags, flagSpec)
	})

	return flags
}

func buildWorkflows() []WorkflowSpec {
	return internalschema.BuildWorkflows()
}
