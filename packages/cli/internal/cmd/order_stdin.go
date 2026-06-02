package cmd

import (
	"encoding/json"
	"io"
	"os"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

type predictOrderStdinInput struct {
	Symbol        string `json:"symbol"`
	Side          string `json:"side"`
	Outcome       string `json:"outcome"`
	Type          string `json:"type"`
	Quantity      string `json:"quantity"`
	Price         string `json:"price"`
	Dollars       string `json:"dollars"`
	StopPrice     string `json:"stop_price"`
	TimeInForce   string `json:"tif"`
	ClientOrderID string `json:"client_order_id"`
	MakerOrCancel bool   `json:"maker_or_cancel"`
}

type spotOrderStdinInput struct {
	Symbol        string `json:"symbol"`
	Side          string `json:"side"`
	Type          string `json:"type"`
	Amount        string `json:"amount"`
	Price         string `json:"price"`
	Dollars       string `json:"dollars"`
	StopPrice     string `json:"stop_price"`
	ClientOrderID string `json:"client_order_id"`
	MakerOrCancel bool   `json:"maker_or_cancel"`
	IOC           bool   `json:"ioc"`
	FOK           bool   `json:"fok"`
	Account       string `json:"account"`
}

func readJSONStdin(dst any) error {
	data, err := io.ReadAll(io.LimitReader(os.Stdin, 1<<20))
	if err != nil {
		return output.NewInputError("failed to read stdin: " + err.Error())
	}
	if err := json.Unmarshal(data, dst); err != nil {
		return output.NewInputError("invalid JSON on stdin: " + err.Error())
	}
	return nil
}

func applyPredictOrderStdin(cmd *cobra.Command) error {
	var stdinReq predictOrderStdinInput
	if err := readJSONStdin(&stdinReq); err != nil {
		return err
	}

	if predictOrderSymbol == "" {
		predictOrderSymbol = stdinReq.Symbol
	}
	if predictOrderSide == "" {
		predictOrderSide = stdinReq.Side
	}
	if predictOrderOutcome == "" {
		predictOrderOutcome = stdinReq.Outcome
	}
	if predictOrderQuantity == "" {
		predictOrderQuantity = stdinReq.Quantity
	}
	if predictOrderPrice == "" {
		predictOrderPrice = stdinReq.Price
	}
	if predictOrderStopPrice == "" {
		predictOrderStopPrice = stdinReq.StopPrice
	}
	if predictOrderClientOrderID == "" {
		predictOrderClientOrderID = stdinReq.ClientOrderID
	}
	if predictOrderDollars == "" {
		predictOrderDollars = stdinReq.Dollars
	}
	if !cmd.Flags().Changed("type") && stdinReq.Type != "" {
		predictOrderType = stdinReq.Type
	}
	if !cmd.Flags().Changed("tif") && stdinReq.TimeInForce != "" {
		predictOrderTimeInForce = stdinReq.TimeInForce
	}
	if !predictOrderMakerOrCancel {
		predictOrderMakerOrCancel = stdinReq.MakerOrCancel
	}

	return nil
}

func applySpotOrderStdin(cmd *cobra.Command) error {
	var stdinReq spotOrderStdinInput
	if err := readJSONStdin(&stdinReq); err != nil {
		return err
	}

	if spotOrderSymbol == "" {
		spotOrderSymbol = stdinReq.Symbol
	}
	if spotOrderSide == "" {
		spotOrderSide = stdinReq.Side
	}
	if spotOrderAmount == "" {
		spotOrderAmount = stdinReq.Amount
	}
	if spotOrderPrice == "" {
		spotOrderPrice = stdinReq.Price
	}
	if spotOrderStopPrice == "" {
		spotOrderStopPrice = stdinReq.StopPrice
	}
	if spotOrderClientOrderID == "" {
		spotOrderClientOrderID = stdinReq.ClientOrderID
	}
	if spotOrderAccount == "" {
		spotOrderAccount = stdinReq.Account
	}
	if spotOrderDollars == "" {
		spotOrderDollars = stdinReq.Dollars
	}
	if !cmd.Flags().Changed("type") && stdinReq.Type != "" {
		spotOrderType = stdinReq.Type
	}
	if !spotOrderMakerOrCancel {
		spotOrderMakerOrCancel = stdinReq.MakerOrCancel
	}
	if !spotOrderIOC {
		spotOrderIOC = stdinReq.IOC
	}
	if !spotOrderFOK {
		spotOrderFOK = stdinReq.FOK
	}

	return nil
}
