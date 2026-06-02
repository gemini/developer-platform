package cmd

import (
	"github.com/spf13/cobra"
)

var predictCmd = &cobra.Command{
	Use:   "predict",
	Short: "Prediction market trading",
	Long:  "Commands for trading on Gemini Prediction Markets.",
}

func init() {
	rootCmd.AddCommand(predictCmd)
}
