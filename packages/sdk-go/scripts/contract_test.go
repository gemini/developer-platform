package main

import (
	"bytes"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"gopkg.in/yaml.v3"
)

func TestGeneratedDecimalFieldsPreserveWireType(t *testing.T) {
	for _, mod := range Modules {
		t.Run(mod.ID, func(t *testing.T) {
			raw, err := loadPublishedSpec(mod.SpecURL)
			if err != nil {
				t.Fatalf("reading spec %s: %v", mod.SpecURL, err)
			}
			loader := openapi3.NewLoader()
			doc, err := loader.LoadFromData(sanitizeSpecBytes(raw))
			if err != nil {
				t.Fatalf("loading spec %s: %v", mod.SpecURL, err)
			}
			code, err := RenderModule(mod)
			if err != nil {
				t.Fatalf("rendering module %s: %v", mod.ID, err)
			}
			fields, err := generatedFieldTypes(code)
			if err != nil {
				t.Fatalf("parsing generated module %s: %v", mod.ID, err)
			}
			for schemaName, schemaRef := range doc.Components.Schemas {
				if schemaRef == nil || schemaRef.Value == nil {
					continue
				}
				for field, property := range schemaRef.Value.Properties {
					if property.Value == nil || property.Value.Type == nil || !property.Value.Type.Is("number") || property.Value.Format != "decimal" {
						continue
					}
					want := "*openapi_types.DecimalNumber"
					got, ok := fields[schemaName][field]
					if !ok {
						t.Errorf("%s.%s was not found in generated code", schemaName, field)
					} else if got != want {
						t.Errorf("%s.%s generated as %s, want %s", schemaName, field, got, want)
					}
				}
			}
		})
	}
}

func generatedFieldTypes(code string) (map[string]map[string]string, error) {
	file, err := parser.ParseFile(token.NewFileSet(), "generated.go", code, 0)
	if err != nil {
		return nil, err
	}
	fields := make(map[string]map[string]string)
	for _, declaration := range file.Decls {
		genDecl, ok := declaration.(*ast.GenDecl)
		if !ok || genDecl.Tok != token.TYPE {
			continue
		}
		for _, spec := range genDecl.Specs {
			typeSpec, ok := spec.(*ast.TypeSpec)
			if !ok {
				continue
			}
			structType, ok := typeSpec.Type.(*ast.StructType)
			if !ok {
				continue
			}
			byJSONName := make(map[string]string)
			for _, field := range structType.Fields.List {
				if field.Tag == nil {
					continue
				}
				jsonTag := reflect.StructTag(strings.Trim(field.Tag.Value, "`")).Get("json")
				jsonName := strings.Split(jsonTag, ",")[0]
				if jsonName == "" || jsonName == "-" {
					continue
				}
				var typeText bytes.Buffer
				if err := format.Node(&typeText, token.NewFileSet(), field.Type); err != nil {
					return nil, err
				}
				byJSONName[jsonName] = typeText.String()
			}
			fields[typeSpec.Name.Name] = byJSONName
		}
	}
	return fields, nil
}

func TestOpenAPIContractDrift(t *testing.T) {
	for _, mod := range Modules {
		t.Run(mod.ID, func(t *testing.T) {
			expectedCode, err := RenderModule(mod)
			if err != nil {
				t.Fatalf("failed to render module %s from spec %s: %v", mod.ID, mod.SpecURL, err)
			}

			committedFile := filepath.Join("..", "generated", mod.Package, "types.gen.go")
			committedBytes, err := os.ReadFile(committedFile)
			if err != nil {
				t.Fatalf("missing committed generated file %s. Run 'go run ./scripts/generate.go': %v", committedFile, err)
			}

			committedStr := string(committedBytes)
			if committedStr != expectedCode {
				t.Logf("committed len=%d, expected len=%d", len(committedStr), len(expectedCode))
				// Find first difference
				minLen := len(committedStr)
				if len(expectedCode) < minLen {
					minLen = len(expectedCode)
				}
				for i := 0; i < minLen; i++ {
					if committedStr[i] != expectedCode[i] {
						start := i - 20
						if start < 0 {
							start = 0
						}
						end := i + 40
						if end > minLen {
							end = minLen
						}
						t.Logf("diff at char %d:\ncommitted: %q\nexpected:  %q", i, committedStr[start:end], expectedCode[start:end])
						break
					}
				}
				t.Fatalf("Contract drift detected in %s! The committed code in %s does not match the current OpenAPI specification %s.\n"+
					"Run 'go run ./scripts/generate.go' to regenerate and commit the updated models.",
					mod.ID, committedFile, mod.SpecURL)
			}
		})
	}
}

func TestNoOrphanedEndpoints(t *testing.T) {
	specs := []string{restSpecURL, predictionMarketsSpecURL}

	allMappedTags := make(map[string]bool)
	for _, mod := range Modules {
		for _, tag := range mod.Tags {
			allMappedTags[tag] = true
		}
	}

	for _, specURL := range specs {
		t.Run(path.Base(specURL), func(t *testing.T) {
			raw, err := loadPublishedSpec(specURL)
			if err != nil {
				t.Fatalf("reading spec %s: %v", specURL, err)
			}

			loader := openapi3.NewLoader()
			doc, err := loader.LoadFromData(sanitizeSpecBytes(raw))
			if err != nil {
				t.Fatalf("loading openapi doc %s: %v", specURL, err)
			}

			if doc.Paths == nil {
				t.Fatalf("spec %s has no paths", specURL)
			}

			var orphanedOps []string
			for pathStr, pathItem := range doc.Paths.Map() {
				if pathItem == nil {
					continue
				}
				for method, op := range pathItem.Operations() {
					if op == nil {
						continue
					}
					isCovered := false
					for _, tag := range op.Tags {
						if allMappedTags[tag] {
							isCovered = true
							break
						}
					}
					if !isCovered {
						orphanedOps = append(orphanedOps, method+" "+pathStr+" (operationId: "+op.OperationID+")")
					}
				}
			}

			if len(orphanedOps) > 0 {
				t.Errorf("Found %d orphaned operations in %s not covered by any SDK module tags:\n  - %s",
					len(orphanedOps), path.Base(specURL), strings.Join(orphanedOps, "\n  - "))
			}
		})
	}
}

func TestOperationIDsUnique(t *testing.T) {
	specs := []string{restSpecURL, predictionMarketsSpecURL}

	for _, specURL := range specs {
		t.Run(path.Base(specURL), func(t *testing.T) {
			raw, err := loadPublishedSpec(specURL)
			if err != nil {
				t.Fatalf("reading spec %s: %v", specURL, err)
			}

			loader := openapi3.NewLoader()
			doc, err := loader.LoadFromData(sanitizeSpecBytes(raw))
			if err != nil {
				t.Fatalf("loading openapi doc %s: %v", specURL, err)
			}

			seenIDs := make(map[string]string)
			for pathStr, pathItem := range doc.Paths.Map() {
				if pathItem == nil {
					continue
				}
				for method, op := range pathItem.Operations() {
					if op == nil || op.OperationID == "" {
						continue
					}
					if existing, exists := seenIDs[op.OperationID]; exists {
						t.Errorf("Duplicate operationId '%s' found in %s %s and %s", op.OperationID, method, pathStr, existing)
					}
					seenIDs[op.OperationID] = method + " " + pathStr
				}
			}
		})
	}
}

func TestAsyncAPIWebSocketStreams(t *testing.T) {
	specURL := websocketSpecURL
	raw, err := loadPublishedSpec(specURL)
	if err != nil {
		t.Fatalf("reading websocket spec %s: %v", specURL, err)
	}

	var root struct {
		XGeminiCoverage struct {
			Streams []struct {
				Name   string `yaml:"name"`
				Status string `yaml:"status"`
				Auth   string `yaml:"auth"`
			} `yaml:"streams"`
		} `yaml:"x-gemini-coverage"`
	}

	if err := yaml.Unmarshal(raw, &root); err != nil {
		t.Fatalf("unmarshaling asyncapi yaml: %v", err)
	}

	if len(root.XGeminiCoverage.Streams) == 0 {
		t.Fatal("no streams found in x-gemini-coverage")
	}

	machineReadableCount := 0
	for _, stream := range root.XGeminiCoverage.Streams {
		if stream.Status == "machine-readable" {
			machineReadableCount++
		}
	}

	if machineReadableCount < 8 {
		t.Fatalf("expected at least 8 machine-readable streams, found %d", machineReadableCount)
	}
}
