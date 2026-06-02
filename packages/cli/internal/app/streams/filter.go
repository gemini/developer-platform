package streams

import (
	"encoding/json"
	"strings"

	"github.com/gemini/developer-platform/packages/cli/internal/ws"
)

var eventAliases = map[string]string{
	"accepted":  "accepted",
	"booked":    "booked",
	"fill":      "fill",
	"closed":    "closed",
	"rejected":  "rejected",
	"canceled":  "canceled",
	"cancelled": "canceled",
}

func ShouldFilterOrderMessage(msg ws.StreamMessage, symbols, eventTypes []string) bool {
	if len(symbols) == 0 && len(eventTypes) == 0 {
		return false
	}

	symbol, eventType, ok := extractOrderMessageMetadata(msg)
	if !ok {
		return false
	}

	if len(symbols) > 0 && !matchesAnySymbol(symbol, symbols) {
		return true
	}

	if len(eventTypes) > 0 && !matchesAnyEvent(eventType, eventTypes) {
		return true
	}

	return false
}

func NormalizeEventType(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" {
		return ""
	}
	if alias, ok := eventAliases[normalized]; ok {
		return alias
	}
	return normalized
}

func MatchSymbol(symbol, pattern string) bool {
	pattern = strings.ToUpper(strings.TrimSpace(pattern))
	symbol = strings.ToUpper(strings.TrimSpace(symbol))

	if pattern == "" {
		return false
	}
	if strings.HasSuffix(pattern, "*") {
		prefix := strings.TrimSuffix(pattern, "*")
		return strings.HasPrefix(symbol, prefix)
	}
	return symbol == pattern
}

func extractOrderMessageMetadata(msg ws.StreamMessage) (string, string, bool) {
	var data struct {
		Type   string `json:"type"`
		Symbol string `json:"symbol"`
		S      string `json:"s"`
		X      string `json:"X"`
	}
	if err := json.Unmarshal(msg.Data, &data); err != nil {
		return "", "", false
	}

	symbol := data.Symbol
	if symbol == "" {
		symbol = data.S
	}

	eventType := NormalizeEventType(data.Type)
	if eventType == "" {
		eventType = NormalizeEventType(data.X)
	}

	return symbol, eventType, true
}

func matchesAnySymbol(symbol string, patterns []string) bool {
	for _, pattern := range patterns {
		if MatchSymbol(symbol, pattern) {
			return true
		}
	}
	return false
}

func matchesAnyEvent(eventType string, filters []string) bool {
	normalizedEvent := NormalizeEventType(eventType)
	for _, filter := range filters {
		if normalizedEvent == NormalizeEventType(filter) {
			return true
		}
	}
	return false
}

// ShouldIncludeContractStatusMessage returns true if the message matches any of the given symbol patterns.
func ShouldIncludeContractStatusMessage(msg ws.StreamMessage, symbols []string) bool {
	var data struct {
		S string `json:"s"`
	}
	if err := json.Unmarshal(msg.Data, &data); err != nil {
		return true
	}
	return matchesAnySymbol(data.S, symbols)
}
