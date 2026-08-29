package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"go/format"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/oapi-codegen/oapi-codegen/v2/pkg/codegen"
)

type ModuleConfig struct {
	ID      string
	Package string
	SpecURL string
	Tags    []string
}

const (
	restSpecURL              = "https://developer.gemini.com/specs/openapi/rest.yaml"
	predictionMarketsSpecURL = "https://developer.gemini.com/specs/openapi/prediction-markets.yaml"
	websocketSpecURL         = "https://developer.gemini.com/specs/asyncapi/websocket.yaml"
)

// Update these values only in a reviewed change that also updates generated output.
var publishedSpecSHA256 = map[string]string{
	restSpecURL:              "79a0dc4061f3942dca8b30a589bbd406c781d2c6c19283d87cb21177afdcab5e",
	predictionMarketsSpecURL: "0c70a976f4553ae39d14d6851416cb974f081919216b94ebd851f044d108cfe7",
	websocketSpecURL:         "904160ee9d2f5ba4c4a789e0173877ca936019fefa83a2eba1dcf2a1fef2a796",
}

var (
	publishedSpecClient = &http.Client{
		Timeout: 30 * time.Second,
		// The specification URLs are allowlisted and pinned by digest. Do not
		// follow redirects because that would permit an allowlisted HTTPS URL to
		// fetch from an unexpected host or downgrade to HTTP.
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	publishedSpecCache = struct {
		sync.Mutex
		values map[string][]byte
	}{values: make(map[string][]byte)}
)

const maxPublishedSpecBytes int64 = 16 << 20

var Modules = []ModuleConfig{
	{
		ID:      "marketdata",
		Package: "marketdata",
		SpecURL: restSpecURL,
		Tags:    []string{"Market Data"},
	},
	{
		ID:      "trading",
		Package: "trading",
		SpecURL: restSpecURL,
		Tags:    []string{"Orders", "Session"},
	},
	{
		ID:      "margin",
		Package: "margin",
		SpecURL: restSpecURL,
		Tags:    []string{"Margin Trading"},
	},
	{
		ID:      "perpetuals",
		Package: "perpetuals",
		SpecURL: restSpecURL,
		Tags:    []string{"Derivatives"},
	},
	{
		ID:      "account",
		Package: "account",
		SpecURL: restSpecURL,
		Tags:    []string{"Account Administration", "Fund Management", "OAuth", "Staking"},
	},
	{
		ID:      "clearing",
		Package: "clearing",
		SpecURL: restSpecURL,
		Tags:    []string{"Clearing", "Instant"},
	},
	{
		ID:      "predictions",
		Package: "predictions",
		SpecURL: predictionMarketsSpecURL,
		Tags:    []string{"Combos", "Markets", "Positions", "Rewards", "Terms", "Trading", "Volume"},
	},
}

var (
	longFormatRegex    = regexp.MustCompile(`(?m)^(\s*)format:\s*long\s*$`)
	integerFormatRegex = regexp.MustCompile(`(?m)^(\s*)format:\s*integer\s*$`)
)

// These fields are identifiers or timestamps whose valid values are wider
// than the native int on 32-bit builds. Keep bounded collection sizes and
// other API limits as int because callers use them as local slice/request
// sizes, but never represent wire-level wide integers with a platform-sized
// type.
var wideIntegerPropertyNames = map[string]struct{}{
	"cancelRejects":   {},
	"cancelledOrders": {},
	"eid":             {},
	"last_updated_ms": {},
	"order_id":        {},
	"quoteId":         {},
	"tid":             {},
	"timestamp_nanos": {},
	"timestampms":     {},
	"txTime":          {},
}

func sanitizeSpecBytes(data []byte) []byte {
	out := longFormatRegex.ReplaceAll(data, []byte("${1}format: int64"))
	out = integerFormatRegex.ReplaceAll(out, []byte("${1}format: int64"))
	return out
}

func fixSchema(s *openapi3.Schema) {
	if s == nil {
		return
	}
	if s.Type != nil {
		if s.Type.Is("number") {
			if s.Format == "long" || s.Format == "integer" || s.Format == "int64" {
				s.Type = &openapi3.Types{"integer"}
				s.Format = "int64"
			} else if s.Format == "decimal" {
				setDecimalOverride(s)
			}
		} else if s.Type.Is("integer") {
			if s.Format == "long" || s.Format == "integer" {
				s.Format = "int64"
			}
		}
	}
	for propertyName, prop := range s.Properties {
		if prop.Value != nil {
			setWideIntegerOverride(propertyName, prop.Value)
			fixSchema(prop.Value)
		}
	}
	for _, allOf := range s.AllOf {
		if allOf.Value != nil {
			fixSchema(allOf.Value)
		}
	}
	for _, anyOf := range s.AnyOf {
		if anyOf.Value != nil {
			fixSchema(anyOf.Value)
		}
	}
	for _, oneOf := range s.OneOf {
		if oneOf.Value != nil {
			fixSchema(oneOf.Value)
		}
	}
	if s.Items != nil && s.Items.Value != nil {
		fixSchema(s.Items.Value)
	}
	if s.AdditionalProperties.Schema != nil && s.AdditionalProperties.Schema.Value != nil {
		fixSchema(s.AdditionalProperties.Schema.Value)
	}
}

func setWideIntegerOverride(propertyName string, s *openapi3.Schema) {
	if _, ok := wideIntegerPropertyNames[propertyName]; !ok || s == nil || s.Type == nil {
		return
	}
	if s.Type.Is("array") && s.Items != nil && s.Items.Value != nil {
		setWideIntegerOverride(propertyName, s.Items.Value)
		return
	}
	// Do not replace unions such as timestamp aliases. The generated type may
	// intentionally support both numeric and string representations.
	if len(s.AllOf) > 0 || len(s.AnyOf) > 0 || len(s.OneOf) > 0 {
		return
	}
	if s.Type.Is("integer") || s.Type.Is("number") {
		s.Type = &openapi3.Types{"integer"}
		s.Format = "int64"
	}
}

func setGoTypeOverride(s *openapi3.Schema, goType string) {
	if s.Extensions == nil {
		s.Extensions = make(map[string]any)
	}
	s.Extensions["x-go-type"] = goType
}

func setDecimalOverride(s *openapi3.Schema) {
	goType := "types.Decimal"
	if s.Type != nil && s.Type.Is("number") {
		goType = "types.DecimalNumber"
	}
	setGoTypeOverride(s, goType)
	if s.Extensions == nil {
		s.Extensions = make(map[string]any)
	}
	s.Extensions["x-go-type-import"] = map[string]any{
		"path": "github.com/gemini/developer-platform/packages/sdk-go/types",
		"name": "types",
	}
}

func loadPublishedSpec(specURL string) ([]byte, error) {
	expectedHash, ok := publishedSpecSHA256[specURL]
	if !ok {
		return nil, fmt.Errorf("unallowlisted published specification URL: %s", specURL)
	}

	publishedSpecCache.Lock()
	cached := publishedSpecCache.values[specURL]
	publishedSpecCache.Unlock()
	if cached != nil {
		return cached, nil
	}

	response, err := publishedSpecClient.Get(specURL)
	if err != nil {
		return nil, fmt.Errorf("fetching spec %s: %w", specURL, err)
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("fetching spec %s: HTTP %s", specURL, response.Status)
	}
	if response.ContentLength > maxPublishedSpecBytes {
		return nil, fmt.Errorf("published specification %s exceeds %d-byte limit", specURL, maxPublishedSpecBytes)
	}

	raw, err := io.ReadAll(io.LimitReader(response.Body, maxPublishedSpecBytes+1))
	if err != nil {
		return nil, fmt.Errorf("reading spec %s: %w", specURL, err)
	}
	if int64(len(raw)) > maxPublishedSpecBytes {
		return nil, fmt.Errorf("published specification %s exceeds %d-byte limit", specURL, maxPublishedSpecBytes)
	}

	digest := sha256.Sum256(raw)
	actualHash := hex.EncodeToString(digest[:])
	if actualHash != expectedHash {
		return nil, fmt.Errorf("published specification hash mismatch for %s: expected %s, got %s", specURL, expectedHash, actualHash)
	}

	publishedSpecCache.Lock()
	if existing := publishedSpecCache.values[specURL]; existing != nil {
		raw = existing
	} else {
		publishedSpecCache.values[specURL] = raw
	}
	publishedSpecCache.Unlock()

	return raw, nil
}

func fixDoc(doc *openapi3.T) {
	if doc == nil {
		return
	}
	if doc.Components != nil {
		for _, schemaRef := range doc.Components.Schemas {
			if schemaRef != nil && schemaRef.Value != nil {
				fixSchema(schemaRef.Value)
			}
		}
		for _, paramRef := range doc.Components.Parameters {
			if paramRef != nil && paramRef.Value != nil && paramRef.Value.Schema != nil && paramRef.Value.Schema.Value != nil {
				fixSchema(paramRef.Value.Schema.Value)
			}
		}
		for _, respRef := range doc.Components.Responses {
			if respRef != nil && respRef.Value != nil {
				for _, content := range respRef.Value.Content {
					if content != nil && content.Schema != nil && content.Schema.Value != nil {
						fixSchema(content.Schema.Value)
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
						fixSchema(paramRef.Value.Schema.Value)
					}
				}
				if op.RequestBody != nil && op.RequestBody.Value != nil {
					for _, content := range op.RequestBody.Value.Content {
						if content != nil && content.Schema != nil && content.Schema.Value != nil {
							fixSchema(content.Schema.Value)
						}
					}
				}
				if op.Responses != nil {
					for _, respRef := range op.Responses.Map() {
						if respRef != nil && respRef.Value != nil {
							for _, content := range respRef.Value.Content {
								if content != nil && content.Schema != nil && content.Schema.Value != nil {
									fixSchema(content.Schema.Value)
								}
							}
						}
					}
				}
			}
		}
	}
	applySDKTypeOverrides(doc)
}

// applySDKTypeOverrides contains Go-specific model decisions that are owned by
// this SDK repository rather than the shared REST description. Keeping these
// transformations here makes generation reproducible without changing the
// API source specification.
func applySDKTypeOverrides(doc *openapi3.T) {
	if doc.Components == nil {
		return
	}
	if balance := doc.Components.Schemas["Balance"]; balance != nil && balance.Value != nil {
		for _, field := range []string{"amount", "available", "availableForWithdrawal", "pendingWithdrawal", "pendingDeposit"} {
			if prop := balance.Value.Properties[field]; prop != nil && prop.Value != nil {
				setDecimalOverride(prop.Value)
			}
		}
	}
	if order := doc.Components.Schemas["NewOrderRequest"]; order != nil && order.Value != nil {
		if nonce := order.Value.Properties["nonce"]; nonce != nil && nonce.Value != nil {
			nonce.Value.Type = &openapi3.Types{"integer"}
			nonce.Value.Format = "int64"
		}
	}
	if cancel := doc.Components.Schemas["CancelOrderRequest"]; cancel != nil && cancel.Value != nil {
		if orderID := cancel.Value.Properties["order_id"]; orderID != nil && orderID.Value != nil {
			// Order IDs are unsigned 64-bit wire values. Using uint64 avoids
			// rejecting valid IDs above MaxInt64 in cancellation helpers.
			setGoTypeOverride(orderID.Value, "uint64")
		}
	}
	if status := doc.Components.Schemas["OrderStatusRequest"]; status != nil && status.Value != nil {
		if orderID := status.Value.Properties["order_id"]; orderID != nil && orderID.Value != nil {
			setGoTypeOverride(orderID.Value, "uint64")
		}
	}
	if nonce := doc.Components.Schemas["Nonce"]; nonce != nil && nonce.Value != nil {
		for _, variant := range nonce.Value.OneOf {
			if variant.Value != nil && variant.Value.Type != nil && variant.Value.Type.Is("integer") {
				variant.Value.Type = &openapi3.Types{"integer"}
				variant.Value.Format = "int64"
			}
		}
	}
}

// RenderModule generates the Go code for a given module configuration from its OpenAPI spec.
func RenderModule(mod ModuleConfig) (string, error) {
	raw, err := loadPublishedSpec(mod.SpecURL)
	if err != nil {
		return "", err
	}

	sanitized := sanitizeSpecBytes(raw)

	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = false
	doc, err := loader.LoadFromData(sanitized)
	if err != nil {
		return "", fmt.Errorf("loading openapi doc: %w", err)
	}

	fixDoc(doc)

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

	// Rewire third-party runtime imports to stdlib-backed internal packages
	code = strings.ReplaceAll(code, "\"github.com/oapi-codegen/runtime/types\"", "\"github.com/gemini/developer-platform/packages/sdk-go/types\"")
	code = strings.ReplaceAll(code, "\"github.com/oapi-codegen/runtime\"", "\"github.com/gemini/developer-platform/packages/sdk-go/internal/runtime\"")
	// The generated files already import the shared types package as
	// openapi_types for dates and UUIDs. Reuse that alias for Decimal fields so
	// generation does not emit two imports of the same package under different
	// names.
	code = strings.ReplaceAll(code, "types.Decimal", "openapi_types.Decimal")
	code = strings.ReplaceAll(code, "\ttypes \"github.com/gemini/developer-platform/packages/sdk-go/types\"\n", "")

	// Normalize tool version comment line to ensure deterministic comparison across environments
	versionRegex := regexp.MustCompile(`(?m)^// Code generated by .* DO NOT EDIT\.\r?\n`)
	code = versionRegex.ReplaceAllString(code, "// Code generated by oapi-codegen. DO NOT EDIT.\n")

	header := fmt.Sprintf("// Code generated from %s (%s). DO NOT EDIT.\n\n", path.Base(mod.SpecURL), strings.Join(mod.Tags, ", "))
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
