package cmd

import (
	"fmt"
	"os"

	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

func renderCancelAllDryRun[T any](orders []T, dryRun any, renderLine func(T) string) error {
	if !IsTableOutput() {
		return output.PrintJSON(dryRun)
	}

	fmt.Printf("[DRY RUN] Would cancel %d orders:\n", len(orders))
	for _, order := range orders {
		fmt.Println(renderLine(order))
	}
	return nil
}

func confirmCancelAllOrders[T any](orders []T, renderLine func(T) string) (hasOrders bool, confirmed bool) {
	if len(orders) == 0 {
		fmt.Fprintln(os.Stderr, "No open orders to cancel.")
		return false, false
	}

	fmt.Fprintf(os.Stderr, "Found %d open orders:\n", len(orders))
	for _, order := range orders {
		fmt.Fprintln(os.Stderr, renderLine(order))
	}

	if !confirmAction(fmt.Sprintf("Cancel %d orders?", len(orders))) {
		fmt.Fprintln(os.Stderr, "Aborted.")
		return true, false
	}

	return true, true
}

func printCanceledOrderSummary(orderIDs []string) {
	fmt.Printf("Canceled: %d orders\n", len(orderIDs))
	if len(orderIDs) > 0 && len(orderIDs) <= 10 {
		for _, id := range orderIDs {
			fmt.Printf("  - %s\n", id)
		}
	}
}
