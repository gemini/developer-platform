package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"go/format"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/oapi-codegen/oapi-codegen/v2/pkg/codegen"
	"gopkg.in/yaml.v3"
)

type ModuleConfig struct {
	ID      string
	Package string
	SpecID  string
	Tags    []string
}

const (
	restSpecID              = "rest"
	predictionMarketsSpecID = "predictionMarkets"
	websocketSpecID         = "websocket"
)

type specSource struct {
	ID      string `json:"id"`
	Path    string `json:"path"`
	SHA256  string `json:"sha256"`
}

type specSourcesManifest struct {
	Version int          `json:"version"`
	Specs   []specSource `json:"specs"`
}
type numericOverlay struct {
	Version           int                     `yaml:"version"`
	FormatAliases     numericFormatAliases    `yaml:"formatAliases"`
	DecimalFormat     numericDecimalFormat    `yaml:"decimalFormat"`
	WideIntegers      numericWideIntegers     `yaml:"wideIntegers"`
	UnsignedIntegers  numericUnsignedIntegers `yaml:"unsignedIntegers"`
	SchemaOverrides   numericSchemaOverrides `yaml:"schemaOverrides"`
}

type numericFormatAliases struct {
	AppliesTo []string             `yaml:"appliesTo"`
	Reason    string               `yaml:"reason"`
	Rules     []numericFormatAlias `yaml:"rules"`
}

type numericFormatAlias struct {
	From string `yaml:"from"`
	To   string `yaml:"to"`
}

type numericDecimalFormat struct {
	AppliesTo  []string            `yaml:"appliesTo"`
	Format     string              `yaml:"format"`
	Go         numericDecimalGo    `yaml:"go"`
	TypeScript numericDecimalTS    `yaml:"typescript"`
}

type numericDecimalGo struct {
	NumberSchema string `yaml:"numberSchema"`
	StringSchema string `yaml:"stringSchema"`
	ImportPath   string `yaml:"importPath"`
	ImportAlias  string `yaml:"importAlias"`
}

type numericDecimalTS struct {
	NumberSchema   string `yaml:"numberSchema"`
	StringSchema   string `yaml:"stringSchema"`
	ExactArithmetic string `yaml:"exactArithmetic"`
}

type numericWideIntegers struct {
	AppliesTo            []string `yaml:"appliesTo"`
	Reason               string   `yaml:"reason"`
	Matches              []string `yaml:"matches"`
	SkipComposedSchemas  bool     `yaml:"skipComposedSchemas"`
	Properties           []string `yaml:"properties"`
}

type numericUnsignedIntegers struct {
	AppliesTo  []string                   `yaml:"appliesTo"`
	Extension  string                     `yaml:"extension"`
	Locations  []numericUnsignedLocation  `yaml:"locations"`
}

type numericUnsignedLocation struct {
	Schema   string `yaml:"schema"`
	Property string `yaml:"property"`
}

type numericSchemaOverrides struct {
	AppliesTo          []string                  `yaml:"appliesTo"`
	Reason             string                    `yaml:"reason"`
	DecimalFields      []numericDecimalField     `yaml:"decimalFields"`
	Int64Fields        []numericInt64Field       `yaml:"int64Fields"`
	Int64OneOfVariants []numericSchemaReference  `yaml:"int64OneOfVariants"`
}

type numericDecimalField struct {
	Schema     string   `yaml:"schema"`
	Properties []string `yaml:"properties"`
}

type numericInt64Field struct {
	Schema   string `yaml:"schema"`
	Property string `yaml:"property"`
}

type numericSchemaReference struct {
	Schema string `yaml:"schema"`
}

type numericFormatRegex struct {
	regex       *regexp.Regexp
	replacement []byte
}

type numericPolicy struct {
	overlay                 numericOverlay
	formatAliases           []numericFormatRegex
	integerFormats           map[string]struct{}
	wideIntegerPropertyNames map[string]struct{}
	integerFormat            string
}

var numericOverlayCache struct {
	sync.Once
	value *numericPolicy
	err   error
}

func loadNumericOverlay() (*numericPolicy, error) {
	numericOverlayCache.Do(func() {
		root, err := specsRoot()
		if err != nil {
			numericOverlayCache.err = fmt.Errorf("loading numeric overlay: %w", err)
			return
		}
		raw, err := os.ReadFile(filepath.Join(root, "overlays", "numeric-types.yaml"))
		if err != nil {
			numericOverlayCache.err = fmt.Errorf("loading numeric overlay: %w", err)
			return
		}
		var overlay numericOverlay
		if err := yaml.Unmarshal(raw, &overlay); err != nil {
			numericOverlayCache.err = fmt.Errorf("loading numeric overlay: %w", err)
			return
		}

		policy := &numericPolicy{
			overlay:                 overlay,
			integerFormats:           make(map[string]struct{}),
			wideIntegerPropertyNames: make(map[string]struct{}, len(overlay.WideIntegers.Properties)),
		}
		for _, propertyName := range overlay.WideIntegers.Properties {
			policy.wideIntegerPropertyNames[propertyName] = struct{}{}
		}
		for _, alias := range overlay.FormatAliases.Rules {
			pattern := fmt.Sprintf(`(?m)^(\s*)format:\s*%s\s*$`, regexp.QuoteMeta(alias.From))
			re, err := regexp.Compile(pattern)
			if err != nil {
				numericOverlayCache.err = fmt.Errorf("loading numeric overlay: %w", err)
				return
			}
			policy.formatAliases = append(policy.formatAliases, numericFormatRegex{
				regex:       re,
				replacement: []byte("${1}format: " + alias.To),
			})
			if alias.To != "" {
				policy.integerFormats[alias.To] = struct{}{}
				if policy.integerFormat == "" {
					policy.integerFormat = alias.To
				}
			}
		}
		numericOverlayCache.value = policy
	})
	return numericOverlayCache.value, numericOverlayCache.err
}

var publishedSpecCache = struct {
	sync.Mutex
	values map[string][]byte
}{values: make(map[string][]byte)}

var Modules = []ModuleConfig{
	{
		ID:      "marketdata",
		Package: "marketdata",
		SpecID:  restSpecID,
		Tags:    []string{"Market Data"},
	},
	{
		ID:      "trading",
		Package: "trading",
		SpecID:  restSpecID,
		Tags:    []string{"Orders", "Session"},
	},
	{
		ID:      "margin",
		Package: "margin",
		SpecID:  restSpecID,
		Tags:    []string{"Margin Trading"},
	},
	{
		ID:      "perpetuals",
		Package: "perpetuals",
		SpecID:  restSpecID,
		Tags:    []string{"Derivatives"},
	},
	{
		ID:      "account",
		Package: "account",
		SpecID:  restSpecID,
		Tags:    []string{"Account Administration", "Fund Management", "OAuth", "Staking"},
	},
	{
		ID:      "clearing",
		Package: "clearing",
		SpecID:  restSpecID,
		Tags:    []string{"Clearing", "Instant"},
	},
	{
		ID:      "predictions",
		Package: "predictions",
		SpecID:  predictionMarketsSpecID,
		Tags:    []string{"Combos", "Markets", "Positions", "Rewards", "Terms", "Trading", "Volume"},
	},
}

func specsRoot() (string, error) {
	startDir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	dir := startDir
	for {
		manifestPath := filepath.Join(dir, "specs", "SOURCES.json")
		if _, err := os.Stat(manifestPath); err == nil {
			return filepath.Join(dir, "specs"), nil
		} else if !os.IsNotExist(err) {
			return "", err
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("specs/SOURCES.json not found above %s", startDir)
}

func loadVendoredSpec(specID string) ([]byte, error) {
	if specID != restSpecID && specID != predictionMarketsSpecID && specID != websocketSpecID {
		return nil, fmt.Errorf("unknown specification id: %s", specID)
	}

	publishedSpecCache.Lock()
	cached := publishedSpecCache.values[specID]
	publishedSpecCache.Unlock()
	if cached != nil {
		return cached, nil
	}

	root, err := specsRoot()
	if err != nil {
		return nil, err
	}
	manifestBytes, err := os.ReadFile(filepath.Join(root, "SOURCES.json"))
	if err != nil {
		return nil, err
	}
	var manifest specSourcesManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return nil, err
	}

	var entry *specSource
	for i := range manifest.Specs {
		if manifest.Specs[i].ID == specID {
			entry = &manifest.Specs[i]
			break
		}
	}
	if entry == nil {
		return nil, fmt.Errorf("unknown specification id: %s", specID)
	}

	raw, err := os.ReadFile(filepath.Join(root, entry.Path))
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(raw)
	actualHash := hex.EncodeToString(digest[:])
	if actualHash != entry.SHA256 {
		return nil, fmt.Errorf("vendored specification digest mismatch for %s: expected %s, got %s; run node specs/refresh.mjs", entry.Path, entry.SHA256, actualHash)
	}

	publishedSpecCache.Lock()
	if existing := publishedSpecCache.values[specID]; existing != nil {
		raw = existing
	} else {
		publishedSpecCache.values[specID] = raw
	}
	publishedSpecCache.Unlock()

	return raw, nil
}

func specBasename(specID string) string {
	switch specID {
	case restSpecID:
		return "rest.yaml"
	case predictionMarketsSpecID:
		return "prediction-markets.yaml"
	case websocketSpecID:
		return "websocket.yaml"
	default:
		return ""
	}
}

func sanitizeSpecBytes(data []byte, policy *numericPolicy) []byte {
	out := data
	for _, alias := range policy.formatAliases {
		out = alias.regex.ReplaceAll(out, alias.replacement)
	}
	return out
}

func isComposedSchema(s *openapi3.Schema) bool {
	return len(s.AllOf) > 0 || len(s.AnyOf) > 0 || len(s.OneOf) > 0
}

func setInt64Override(s *openapi3.Schema, policy *numericPolicy) {
	if s == nil {
		return
	}
	s.Type = &openapi3.Types{"integer"}
	s.Format = policy.integerFormat
}

func fixSchema(s *openapi3.Schema, policy *numericPolicy) {
	if s == nil || policy == nil {
		return
	}
	if s.Extensions != nil {
		if unsigned, ok := s.Extensions[policy.overlay.UnsignedIntegers.Extension].(bool); ok && unsigned {
			setGoTypeOverride(s, "uint64")
		}
	}
	if s.Type != nil {
		if _, wide := policy.integerFormats[s.Format]; wide && s.Type.Is("number") {
			setInt64Override(s, policy)
		} else if s.Type.Is("number") && s.Format == policy.overlay.DecimalFormat.Format {
			setDecimalOverride(s, policy)
		}
	}
	for propertyName, prop := range s.Properties {
		if prop.Value != nil {
			setWideIntegerOverride(propertyName, prop.Value, policy)
			fixSchema(prop.Value, policy)
		}
	}
	for _, allOf := range s.AllOf {
		if allOf.Value != nil {
			fixSchema(allOf.Value, policy)
		}
	}
	for _, anyOf := range s.AnyOf {
		if anyOf.Value != nil {
			fixSchema(anyOf.Value, policy)
		}
	}
	for _, oneOf := range s.OneOf {
		if oneOf.Value != nil {
			fixSchema(oneOf.Value, policy)
		}
	}
	if s.Items != nil && s.Items.Value != nil {
		fixSchema(s.Items.Value, policy)
	}
	if s.AdditionalProperties.Schema != nil && s.AdditionalProperties.Schema.Value != nil {
		fixSchema(s.AdditionalProperties.Schema.Value, policy)
	}
}

func setWideIntegerOverride(propertyName string, s *openapi3.Schema, policy *numericPolicy) {
	if _, ok := policy.wideIntegerPropertyNames[propertyName]; !ok || s == nil || s.Type == nil {
		return
	}
	if s.Type.Is("array") && s.Items != nil && s.Items.Value != nil {
		setWideIntegerOverride(propertyName, s.Items.Value, policy)
		return
	}
	if policy.overlay.WideIntegers.SkipComposedSchemas && isComposedSchema(s) {
		return
	}
	if s.Type.Is("integer") || s.Type.Is("number") {
		setInt64Override(s, policy)
	}
}

func setGoTypeOverride(s *openapi3.Schema, goType string) {
	if s.Extensions == nil {
		s.Extensions = make(map[string]any)
	}
	s.Extensions["x-go-type"] = goType
}

func setDecimalOverride(s *openapi3.Schema, policy *numericPolicy) {
	goType := policy.overlay.DecimalFormat.Go.StringSchema
	if s.Type != nil && s.Type.Is("number") {
		goType = policy.overlay.DecimalFormat.Go.NumberSchema
	}
	setGoTypeOverride(s, goType)
	if s.Extensions == nil {
		s.Extensions = make(map[string]any)
	}
	s.Extensions["x-go-type-import"] = map[string]any{
		"path": policy.overlay.DecimalFormat.Go.ImportPath,
		"name": policy.overlay.DecimalFormat.Go.ImportAlias,
	}
}

func fixDoc(doc *openapi3.T, policy *numericPolicy) {
	if doc == nil || policy == nil {
		return
	}
	if doc.Components != nil {
		for _, schemaRef := range doc.Components.Schemas {
			if schemaRef != nil && schemaRef.Value != nil {
				fixSchema(schemaRef.Value, policy)
			}
		}
		for _, paramRef := range doc.Components.Parameters {
			if paramRef != nil && paramRef.Value != nil && paramRef.Value.Schema != nil && paramRef.Value.Schema.Value != nil {
				setWideIntegerOverride(paramRef.Value.Name, paramRef.Value.Schema.Value, policy)
				fixSchema(paramRef.Value.Schema.Value, policy)
			}
		}
		for _, respRef := range doc.Components.Responses {
			if respRef != nil && respRef.Value != nil {
				for _, content := range respRef.Value.Content {
					if content != nil && content.Schema != nil && content.Schema.Value != nil {
						fixSchema(content.Schema.Value, policy)
					}
				}
			}
		}
	}
	if doc.Paths != nil {
		for _, pathItem := range doc.Paths.Map() {
			if pathItem == nil {
				continue
			}
			for _, op := range pathItem.Operations() {
				if op == nil {
					continue
				}
				for _, paramRef := range op.Parameters {
					if paramRef != nil && paramRef.Value != nil && paramRef.Value.Schema != nil && paramRef.Value.Schema.Value != nil {
						setWideIntegerOverride(paramRef.Value.Name, paramRef.Value.Schema.Value, policy)
						fixSchema(paramRef.Value.Schema.Value, policy)
					}
				}
				if op.RequestBody != nil && op.RequestBody.Value != nil {
					for _, content := range op.RequestBody.Value.Content {
						if content != nil && content.Schema != nil && content.Schema.Value != nil {
							fixSchema(content.Schema.Value, policy)
						}
					}
				}
				if op.Responses != nil {
					for _, respRef := range op.Responses.Map() {
						if respRef != nil && respRef.Value != nil {
							for _, content := range respRef.Value.Content {
								if content != nil && content.Schema != nil && content.Schema.Value != nil {
									fixSchema(content.Schema.Value, policy)
								}
							}
						}
					}
				}
			}
		}
	}
	applySDKTypeOverrides(doc, policy)
}

// applySDKTypeOverrides contains Go-specific model decisions that are owned by
// this SDK repository rather than the shared REST description. Keeping these
// transformations here makes generation reproducible without changing the
// API source specification.
func applySDKTypeOverrides(doc *openapi3.T, policy *numericPolicy) {
	if doc == nil || doc.Components == nil || policy == nil {
		return
	}
	for _, override := range policy.overlay.SchemaOverrides.DecimalFields {
		schema := doc.Components.Schemas[override.Schema]
		if schema == nil || schema.Value == nil {
			continue
		}
		for _, field := range override.Properties {
			if prop := schema.Value.Properties[field]; prop != nil && prop.Value != nil {
				setDecimalOverride(prop.Value, policy)
			}
		}
	}
	for _, override := range policy.overlay.SchemaOverrides.Int64Fields {
		schema := doc.Components.Schemas[override.Schema]
		if schema == nil || schema.Value == nil {
			continue
		}
		if prop := schema.Value.Properties[override.Property]; prop != nil && prop.Value != nil {
			setInt64Override(prop.Value, policy)
		}
	}
	for _, override := range policy.overlay.SchemaOverrides.Int64OneOfVariants {
		schema := doc.Components.Schemas[override.Schema]
		if schema == nil || schema.Value == nil {
			continue
		}
		for _, variant := range schema.Value.OneOf {
			if variant.Value != nil && variant.Value.Type != nil && variant.Value.Type.Is("integer") {
				setInt64Override(variant.Value, policy)
			}
		}
	}
}

// preserveContractTotalShares keeps the field that older versions of the
// prediction-markets API exposed even when the current schema omits it.
func preserveContractTotalShares(code string, predictionMarkets bool) string {
	if !predictionMarkets {
		return code
	}
	const marker = "type Contract struct {\n"
	start := strings.Index(code, marker)
	if start < 0 {
		return code
	}
	bodyStart := start + len(marker)
	bodyEnd := strings.Index(code[bodyStart:], "\n}")
	if bodyEnd < 0 {
		return code
	}
	bodyEnd += bodyStart
	if strings.Contains(code[bodyStart:bodyEnd], "TotalShares ") {
		return code
	}
	return code[:bodyStart] +
		"\t// TotalShares Total shares available for the contract.\n" +
		"\tTotalShares *string `json:\"totalShares,omitempty\"`\n" +
		code[bodyStart:]
}

// rewriteDecimalImportsAndTypes rewrites decimal references and deduplicates
// the generated import for the configured decimal package.
func rewriteDecimalImportsAndTypes(code string, decimalGo numericDecimalGo) string {
	const runtimeTypesPath = "github.com/oapi-codegen/runtime/types"
	importPath := decimalGo.ImportPath
	if importPath == "" {
		return code
	}

	// oapi-codegen uses the existing runtime/types import alias for generated
	targetAlias := "openapi_" + strings.TrimPrefix(decimalGo.ImportAlias, "openapi_")
	if decimalGo.ImportAlias == "" {
		targetAlias = "openapi_types"
	}
	runtimeImport := regexp.MustCompile(`(?m)^[ \t]*([[:alnum:]_]+)[ \t]+` + regexp.QuoteMeta(fmt.Sprintf("%q", runtimeTypesPath)) + `[ \t]*\r?\n`)
	if match := runtimeImport.FindStringSubmatch(code); len(match) == 2 {
		targetAlias = match[1]
	}

	quotedImportPath := fmt.Sprintf("%q", importPath)
	code = strings.ReplaceAll(code, fmt.Sprintf("%q", runtimeTypesPath), quotedImportPath)

	// Keep exactly one import for the configured package. Depending on which
	// generated model first requires it, codegen may emit several aliases for
	// the same path (for example, openapi_types and openapi_openapi_types).
	importLine := regexp.MustCompile(`(?m)^[ \t]*(?:[[:alnum:]_]+[ \t]+)?` + regexp.QuoteMeta(quotedImportPath) + `[ \t]*\r?\n`)
	seenImport := false
	code = importLine.ReplaceAllStringFunc(code, func(string) string {
		if seenImport {
			return ""
		}
		seenImport = true
		return "\t" + targetAlias + " " + quotedImportPath + "\n"
	})

	for _, configuredType := range []string{decimalGo.NumberSchema, decimalGo.StringSchema} {
		if configuredType == "" {
			continue
		}
		typeQualifier := decimalGo.ImportAlias
		typeName := configuredType
		if dot := strings.LastIndex(configuredType, "."); dot >= 0 {
			typeQualifier = configuredType[:dot]
			typeName = configuredType[dot+1:]
		}

		// Match complete qualified identifiers. An unbounded replacement of
		// "types.Decimal" also matches the suffix of "openapi_types.Decimal",
		// producing the invalid "openapi_openapi_types.Decimal".
		qualifiers := []string{
			typeQualifier + "." + typeName,
			decimalGo.ImportAlias + "." + typeName,
			targetAlias + "." + typeName,
			"openapi_" + typeQualifier + "." + typeName,
			"openapi_" + decimalGo.ImportAlias + "." + typeName,
			"openapi_" + targetAlias + "." + typeName,
		}
		seenQualifiers := make(map[string]struct{}, len(qualifiers))
		for _, qualifier := range qualifiers {
			if _, seen := seenQualifiers[qualifier]; seen || qualifier == "" {
				continue
			}
			seenQualifiers[qualifier] = struct{}{}
			qualifiedType := regexp.MustCompile(`(^|[^[:alnum:]_])` + regexp.QuoteMeta(qualifier) + `([^[:alnum:]_]|$)`)
			code = qualifiedType.ReplaceAllString(code, `${1}`+targetAlias+"."+typeName+`${2}`)
		}
	}
	return code
}

// RenderModule generates the Go code for a given module configuration from its OpenAPI spec.
func RenderModule(mod ModuleConfig) (string, error) {
	policy, err := loadNumericOverlay()
	if err != nil {
		return "", err
	}
	raw, err := loadVendoredSpec(mod.SpecID)
	if err != nil {
		return "", err
	}

	sanitized := sanitizeSpecBytes(raw, policy)

	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = false
	doc, err := loader.LoadFromData(sanitized)
	if err != nil {
		return "", fmt.Errorf("loading openapi doc: %w", err)
	}

	fixDoc(doc, policy)

	cfg := codegen.Configuration{
		PackageName: mod.Package,
		Generate: codegen.GenerateOptions{
			Models: true,
		},
		OutputOptions: codegen.OutputOptions{
			SkipPrune:   true,
			IncludeTags: mod.Tags,
		},
	}

	code, err := codegen.Generate(doc, cfg)
	if err != nil {
		return "", fmt.Errorf("generating code for %s: %w", mod.ID, err)
	}

	// Rewire third-party runtime imports to stdlib-backed internal packages.
	code = strings.ReplaceAll(code, "\"github.com/oapi-codegen/runtime\"", "\"github.com/gemini/developer-platform/packages/sdk-go/internal/runtime\"")
	code = rewriteDecimalImportsAndTypes(code, policy.overlay.DecimalFormat.Go)
	code = preserveContractTotalShares(code, mod.SpecID == predictionMarketsSpecID)

	// Normalize tool version comment line to ensure deterministic comparison across environments.
	versionRegex := regexp.MustCompile(`(?m)^// Code generated by .* DO NOT EDIT\.\r?\n`)
	code = versionRegex.ReplaceAllString(code, "// Code generated by oapi-codegen. DO NOT EDIT.\n")

	header := fmt.Sprintf("// Code generated from %s (%s). DO NOT EDIT.\n\n", specBasename(mod.SpecID), strings.Join(mod.Tags, ", "))
	formatted, err := format.Source([]byte(header + code))
	if err != nil {
		return "", fmt.Errorf("formatting generated code for %s: %w", mod.ID, err)
	}
	return string(formatted), nil
}

// GenerateModule generates and writes Go code for a given module to disk.
func GenerateModule(mod ModuleConfig) error {
	finalCode, err := RenderModule(mod)
	if err != nil {
		return err
	}
	outDir := filepath.Join("..", "generated", mod.Package)
	if err := os.MkdirAll(outDir, 0750); err != nil {
		return fmt.Errorf("creating dir %s: %w", outDir, err)
	}

	outFile := filepath.Join(outDir, "types.gen.go")
	if err := os.WriteFile(outFile, []byte(finalCode), 0600); err != nil {
		return fmt.Errorf("writing file %s: %w", outFile, err)
	}

	fmt.Printf("✓ Generated %s (%d bytes) -> %s\n", mod.ID, len(finalCode), outFile)
	return nil
}

func main() {
	for _, mod := range Modules {
		if err := GenerateModule(mod); err != nil {
			fmt.Fprintf(os.Stderr, "Error generating %s: %v\n", mod.ID, err)
			os.Exit(1)
		}
	}
	fmt.Println("All modules successfully generated!")
}
