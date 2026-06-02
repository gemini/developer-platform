package main

import (
	"log"

	appcmd "github.com/gemini/developer-platform/packages/cli/internal/cmd"
)

func main() {
	if err := appcmd.GenerateManpages("docs/man"); err != nil {
		log.Fatal(err)
	}
}
