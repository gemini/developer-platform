package debug

import (
	"fmt"
	"os"
	"regexp"
	"sync/atomic"
)

var (
	enabled atomic.Bool
	quiet   atomic.Bool
)

// SetEnabled enables or disables debug output.
func SetEnabled(v bool) {
	enabled.Store(v)
}

// IsEnabled returns whether debug output is enabled.
func IsEnabled() bool {
	return enabled.Load()
}

// SetQuiet enables or disables quiet mode.
func SetQuiet(v bool) {
	quiet.Store(v)
}

// IsQuiet returns whether quiet mode is enabled.
func IsQuiet() bool {
	return quiet.Load()
}

var sensitivePatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(api[_-]?key|apikey|secret|password|token|auth)[=:]["']?([a-zA-Z0-9+/=_-]{8,})["']?`),
	regexp.MustCompile(`(?i)(bearer\s+)([a-zA-Z0-9+/=_.-]{20,})`),
}

func sanitize(msg string) string {
	for _, re := range sensitivePatterns {
		msg = re.ReplaceAllString(msg, "${1}[REDACTED]")
	}
	return msg
}

// Log outputs a debug message if debug mode is enabled.
func Log(format string, args ...any) {
	if enabled.Load() && !quiet.Load() {
		msg := fmt.Sprintf(format, args...)
		fmt.Fprintf(os.Stderr, "[DEBUG] %s\n", sanitize(msg))
	}
}

// Warn outputs a warning message to stderr.
func Warn(format string, args ...any) {
	if !quiet.Load() {
		msg := fmt.Sprintf(format, args...)
		fmt.Fprintf(os.Stderr, "[WARN] %s\n", sanitize(msg))
	}
}
