package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/cobra/doc"
)

// GenerateManpages renders command manpages and removes hidden alias commands
// from the published docs surface.
func GenerateManpages(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	// Keep generated docs reproducible so docs drift checks only fail on real
	// command/help changes.
	manpageDate := time.Date(2026, time.April, 25, 0, 0, 0, 0, time.UTC)
	header := &doc.GenManHeader{
		Title:   "GEMINI-MARKETS",
		Section: "1",
		Date:    &manpageDate,
	}

	root := RootCommand()
	if err := doc.GenManTree(root, header, dir); err != nil {
		return err
	}

	return pruneHiddenCommandManpages(root, dir)
}

func pruneHiddenCommandManpages(root *cobra.Command, dir string) error {
	for _, sub := range root.Commands() {
		if err := pruneHiddenCommandTree(sub, dir); err != nil {
			return err
		}
	}
	return nil
}

func pruneHiddenCommandTree(cmd *cobra.Command, dir string) error {
	if cmd.Hidden {
		if err := removeCommandManpageTree(cmd, dir); err != nil {
			return err
		}
		return nil
	}

	for _, sub := range cmd.Commands() {
		if err := pruneHiddenCommandTree(sub, dir); err != nil {
			return err
		}
	}
	return nil
}

func removeCommandManpageTree(cmd *cobra.Command, dir string) error {
	name := strings.ReplaceAll(cmd.CommandPath(), " ", "-") + ".1"
	path := filepath.Join(dir, name)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}

	for _, sub := range cmd.Commands() {
		if err := removeCommandManpageTree(sub, dir); err != nil {
			return err
		}
	}
	return nil
}
