package websocket

import "testing"

var dispatchBenchPayloads = map[string][]byte{
	"depth": []byte(
		`{"e":"depthUpdate","E":1720000000000,"s":"BTCUSD","U":100,"u":101,"b":[["65000.00","1.25"],["64999.50","2.50"]],"a":[["65001.00","0.75"],["65002.00","3.00"]]}`,
	),
	"trade": []byte(
		`{"e":"trade","E":1720000000000,"s":"BTCUSD","t":123456,"p":"65000.50","q":"0.125","T":1720000000000,"m":false}`,
	),
	"ticker": []byte(
		`{"e":"bookTicker","E":1720000000000,"s":"BTCUSD","b":"65000.00","B":"1.25","a":"65001.00","A":"0.75"}`,
	),
	"order": []byte(
		`{"e":"orderUpdate","E":1720000000000,"s":"BTCUSD","i":12345,"t":777,"S":"BUY","X":"NEW","p":"65000.00","q":"0.10"}`,
	),
}

func newDispatchBenchClient() *Client {
	client := NewClient("wss://ws.gemini.com")
	client.state.Store(int32(StateConnected))
	return client
}

func BenchmarkDispatchFrame(b *testing.B) {
	for name, payload := range dispatchBenchPayloads {
		b.Run(name, func(b *testing.B) {
			client := newDispatchBenchClient()
			stop := make(chan struct{})

			b.ReportAllocs()
			b.SetBytes(int64(len(payload)))
			b.ResetTimer()

			for i := 0; i < b.N; i++ {
				if err := client.dispatchFrame(stop, payload, 0); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
