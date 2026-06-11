package schema

// CLISpec contains the complete CLI specification for agents.
type CLISpec struct {
	Name               string            `json:"name"`
	Description        string            `json:"description"`
	Version            string            `json:"version"`
	Commands           []CommandSpec     `json:"commands"`
	Workflows          []WorkflowSpec    `json:"workflows"`
	Schemas            map[string]Schema `json:"schemas"`
	ErrorCodes         []ErrorCodeSpec   `json:"errorCodes"`
	RateLimits         RateLimitSpec     `json:"rateLimits"`
	Constraints        ConstraintsSpec   `json:"constraints"`
	RetryStrategy      RetryStrategySpec `json:"retryStrategy"`
	FieldAbbreviations map[string]string `json:"fieldAbbreviations"`
}

// CommandSpec describes a single CLI command.
type CommandSpec struct {
	Name         string        `json:"name"`
	Description  string        `json:"description"`
	Usage        string        `json:"usage"`
	RequiresAuth bool          `json:"requiresAuth"`
	Flags        []FlagSpec    `json:"flags,omitempty"`
	Subcommands  []CommandSpec `json:"subcommands,omitempty"`
}

// FlagSpec describes a command flag.
type FlagSpec struct {
	Name        string `json:"name"`
	Shorthand   string `json:"shorthand,omitempty"`
	Type        string `json:"type"`
	Default     string `json:"default,omitempty"`
	Description string `json:"description"`
	Required    bool   `json:"required,omitempty"`
}

// WorkflowSpec describes a workflow for achieving a goal.
type WorkflowSpec struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Steps       []WorkflowStep `json:"steps"`
}

// WorkflowStep describes a single step in a workflow.
type WorkflowStep struct {
	Step        int    `json:"step"`
	Action      string `json:"action"`
	Command     string `json:"command"`
	Description string `json:"description"`
	Output      string `json:"output,omitempty"`
}

// Schema describes the structure of command output.
type Schema struct {
	Description string                 `json:"description"`
	Fields      map[string]SchemaField `json:"fields"`
	Example     any                    `json:"example,omitempty"`
}

// SchemaField describes a single field in a schema.
//
//revive:disable-next-line:exported -- schema.SchemaField is part of the generated spec terminology.
type SchemaField struct {
	Type        string `json:"type"`
	Description string `json:"description"`
}

// ErrorCodeSpec describes an error code and handling strategy.
type ErrorCodeSpec struct {
	Code            string `json:"code"`
	Retryable       bool   `json:"retryable"`
	HTTPStatus      int    `json:"httpStatus,omitempty"`
	Category        string `json:"category"`
	SuggestedAction string `json:"suggestedAction"`
}

// RateLimitSpec describes API rate limits.
type RateLimitSpec struct {
	RestAPI          string `json:"restAPI"`
	WebSocket        string `json:"webSocket"`
	OrderPlacement   string `json:"orderPlacement"`
	CircuitBreaker   string `json:"circuitBreaker"`
	RetryAfterHeader string `json:"retryAfterHeader"`
}

// ConstraintsSpec describes API constraints.
type ConstraintsSpec struct {
	Prediction PredictionConstraints `json:"prediction"`
	Spot       SpotConstraints       `json:"spot"`
}

// PredictionConstraints describes prediction market constraints.
type PredictionConstraints struct {
	MinQuantity    string `json:"minQuantity"`
	MaxQuantity    string `json:"maxQuantity"`
	PriceIncrement string `json:"priceIncrement"`
	PriceRange     string `json:"priceRange"`
	OutcomeValues  string `json:"outcomeValues"`
}

// SpotConstraints describes spot trading constraints.
type SpotConstraints struct {
	MinOrderSize   string `json:"minOrderSize"`
	TickSize       string `json:"tickSize"`
	PricePrecision string `json:"pricePrecision"`
}

// RetryStrategySpec describes retry strategies for different error types.
type RetryStrategySpec map[string]RetryStrategy

// RetryStrategy describes how to handle a specific error.
type RetryStrategy struct {
	Retry             bool   `json:"retry"`
	Backoff           string `json:"backoff,omitempty"`
	BaseDelay         string `json:"baseDelay,omitempty"`
	MaxDelay          string `json:"maxDelay,omitempty"`
	MaxAttempts       int    `json:"maxAttempts,omitempty"`
	RespectRetryAfter bool   `json:"respectRetryAfter,omitempty"`
	Action            string `json:"action,omitempty"`
}

// MCPTool represents a tool in Model Context Protocol format.
type MCPTool struct {
	Name         string           `json:"name"`
	Description  string           `json:"description"`
	InputSchema  MCPInputSchema   `json:"inputSchema"`
	OutputSchema *MCPOutputSchema `json:"outputSchema,omitempty"`
}

// MCPInputSchema is the JSON Schema for tool inputs.
type MCPInputSchema struct {
	Type       string              `json:"type"`
	Properties map[string]MCPParam `json:"properties"`
	Required   []string            `json:"required"`
	AnyOf      []MCPRequiredSet    `json:"anyOf,omitempty"`
}

// MCPRequiredSet describes an alternate set of required fields.
type MCPRequiredSet struct {
	Required []string `json:"required"`
}

// MCPOutputSchema describes the expected output of a tool.
type MCPOutputSchema struct {
	Type        string `json:"type"`
	Description string `json:"description"`
	Schema      string `json:"$ref,omitempty"`
}

// MCPParam describes a single parameter.
type MCPParam struct {
	Type        string   `json:"type"`
	Description string   `json:"description"`
	Enum        []string `json:"enum,omitempty"`
	Default     string   `json:"default,omitempty"`
	Example     string   `json:"example,omitempty"`
}

// MCPToolsOutput is the root output for MCP format.
type MCPToolsOutput struct {
	Schema    string    `json:"$schema"`
	Name      string    `json:"name"`
	Version   string    `json:"version"`
	ToolCount int       `json:"toolCount"`
	Tools     []MCPTool `json:"tools"`
}

// OpenAI function calling format.
type OpenAIFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type OpenAIFunctionsOutput struct {
	Functions []OpenAIFunction `json:"functions"`
}

// Anthropic tool use format.
type AnthropicTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
}

type AnthropicToolsOutput struct {
	Tools []AnthropicTool `json:"tools"`
}
