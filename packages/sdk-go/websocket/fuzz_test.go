package websocket_test

import (
	"encoding/json"
	"testing"

	"github.com/gemini/gemini-go/websocket"
)

func FuzzWebSocket_FrameParsing(f *testing.F) {
	// Seed initial valid JSON frames
	f.Add([]byte(`{"e":"depthUpdate","E":1700000000000,"s":"BTCUSD","U":100,"u":101,"b":[["65000.00","1.5"]],"a":[["65001.00","2.0"]]}`))
	f.Add([]byte(`{"e":"trade","E":1700000000000,"s":"ETHUSD","t":12345,"p":"3500.00","q":"0.5","T":1700000000000,"m":true}`))
	f.Add([]byte(`{"e":"bookTicker","u":105,"s":"SOLUSD","b":"150.00","B":"10.0","a":"150.10","A":"12.5"}`))
	f.Add([]byte(`{"result":"error","reason":"InvalidSymbol","message":"Unknown symbol"}`))

	f.Fuzz(func(t *testing.T, data []byte) {
		var probe struct {
			EventType string `json:"e"`
			Symbol    string `json:"s"`
		}
		_ = json.Unmarshal(data, &probe)

		var depth websocket.DepthUpdate
		_ = json.Unmarshal(data, &depth)

		var trade websocket.TradeEvent
		_ = json.Unmarshal(data, &trade)

		var ticker websocket.BookTicker
		_ = json.Unmarshal(data, &ticker)
	})
}

func FuzzWebSocket_ResponseParsing(f *testing.F) {
	f.Add([]byte(`{"id":42,"status":200,"result":{"value":9007199254740993}}`))
	f.Add([]byte(`{"id":"request-1","status":400,"error":{"code":400,"message":"invalid request"}}`))
	f.Add([]byte(`{"id":null,"status":200,"result":null}`))

	f.Fuzz(func(t *testing.T, data []byte) {
		var frame websocket.ResponseFrame
		if err := json.Unmarshal(data, &frame); err != nil {
			return
		}
		var result map[string]any
		_ = frame.DecodeResult(&result)
	})
}
