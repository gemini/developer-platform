package cmd

import (
	"github.com/spf13/cobra"
)

var spotCmd = &cobra.Command{
	Use:   "spot",
	Short: "Spot trading",
	Long:  "Commands for spot trading on Gemini Exchange.",
}

func init() {
	rootCmd.AddCommand(spotCmd)
}
