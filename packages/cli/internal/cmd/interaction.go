package cmd

import (
	"fmt"
	"os"
	"strings"
)

func confirmAction(prompt string) bool {
	if IsQuiet() {
		return true
	}
	fmt.Fprintf(os.Stderr, "%s [y/N]: ", prompt)
	var response string
	_, _ = fmt.Scanln(&response)
	return strings.EqualFold(response, "y") || strings.EqualFold(response, "yes")
}
