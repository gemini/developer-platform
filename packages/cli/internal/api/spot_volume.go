package api

import (
	"context"
	"encoding/json"
)

// VolumeEntry contains volume information for a trading pair.
type VolumeEntry struct {
	Symbol            string `json:"symbol"`
	BaseCurrency      string `json:"base_currency"`
	NotionalCurrency  string `json:"notional_currency"`
	DataDate          string `json:"data_date"`
	TotalVolumeBase   string `json:"total_volume_base"`
	MakerBuySellRatio string `json:"maker_buy_sell_ratio"`
	BuyMakerBase      string `json:"buy_maker_base"`
	BuyMakerNotional  string `json:"buy_maker_notional"`
	BuyMakerCount     string `json:"buy_maker_count"`
	SellMakerBase     string `json:"sell_maker_base"`
	SellMakerNotional string `json:"sell_maker_notional"`
	SellMakerCount    string `json:"sell_maker_count"`
	BuyTakerBase      string `json:"buy_taker_base"`
	BuyTakerNotional  string `json:"buy_taker_notional"`
	BuyTakerCount     string `json:"buy_taker_count"`
	SellTakerBase     string `json:"sell_taker_base"`
	SellTakerNotional string `json:"sell_taker_notional"`
	SellTakerCount    string `json:"sell_taker_count"`
}

// TradeVolumeResponse contains a list of volume entries for trading pairs.
type TradeVolumeResponse [][]VolumeEntry

type DecimalString string

func (s *DecimalString) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		*s = ""
		return nil
	}

	var text string
	if err := json.Unmarshal(data, &text); err == nil {
		*s = DecimalString(text)
		return nil
	}

	var number json.Number
	if err := json.Unmarshal(data, &number); err != nil {
		return err
	}
	*s = DecimalString(number.String())
	return nil
}

// NotionalVolumeResponse contains notional volume data.
type NotionalVolumeResponse struct {
	Date                    string        `json:"date"`
	LastUpdatedMs           int64         `json:"last_updated_ms"`
	WebMakerFeeBps          int           `json:"web_maker_fee_bps"`
	WebTakerFeeBps          int           `json:"web_taker_fee_bps"`
	WebAuctionFeeBps        int           `json:"web_auction_fee_bps"`
	APIMakerFeeBps          int           `json:"api_maker_fee_bps"`
	APITakerFeeBps          int           `json:"api_taker_fee_bps"`
	APIAuctionFeeBps        int           `json:"api_auction_fee_bps"`
	FixMakerFeeBps          int           `json:"fix_maker_fee_bps"`
	FixTakerFeeBps          int           `json:"fix_taker_fee_bps"`
	FixAuctionFeeBps        int           `json:"fix_auction_fee_bps"`
	BlockMakerFeeBps        int           `json:"block_maker_fee_bps"`
	BlockTakerFeeBps        int           `json:"block_taker_fee_bps"`
	NotionalThirtyDayVolume DecimalString `json:"notional_30d_volume"`
	NotionalOneYearVolume   DecimalString `json:"notional_1y_volume"`
}

// GetTradeVolume retrieves trading volume statistics.
func (c *Client) GetTradeVolume(ctx context.Context) (TradeVolumeResponse, error) {
	var resp TradeVolumeResponse
	err := c.doPrivateRequest(ctx, "/v1/tradevolume", map[string]any{}, &resp)
	return resp, err
}

// GetNotionalVolume retrieves notional volume statistics.
func (c *Client) GetNotionalVolume(ctx context.Context) (*NotionalVolumeResponse, error) {
	var resp NotionalVolumeResponse
	err := c.doPrivateRequest(ctx, "/v1/notionalvolume", map[string]any{}, &resp)
	return &resp, err
}
