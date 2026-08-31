package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	ws "github.com/gemini/developer-platform/packages/sdk-go/websocket"
)

type streamPublicFake struct {
	trades       chan *ws.TradeEvent
	ticker       chan *ws.BookTicker
	depth        chan *ws.DepthUpdate
	partialDepth chan *ws.OrderBookSnapshot

	tradesSymbol string
	tickerSymbol string
	depthSymbol  string
	depthOptions ws.DepthSubscriptionOptions
	partialSym   string
	partialOpts  ws.PartialDepthSubscriptionOptions
}

func (f *streamPublicFake) SubscribeTrades(_ context.Context, symbol string) (<-chan *ws.TradeEvent, error) {
	f.tradesSymbol = symbol
	return f.trades, nil
}

func (f *streamPublicFake) SubscribeBookTicker(_ context.Context, symbol string) (<-chan *ws.BookTicker, error) {
	f.tickerSymbol = symbol
	return f.ticker, nil
}

func (f *streamPublicFake) SubscribeDepthWithOptions(_ context.Context, symbol string, options ws.DepthSubscriptionOptions) (<-chan *ws.DepthUpdate, error) {
	f.depthSymbol, f.depthOptions = symbol, options
	return f.depth, nil
}

func (f *streamPublicFake) SubscribePartialDepth(_ context.Context, symbol string, options ws.PartialDepthSubscriptionOptions) (<-chan *ws.OrderBookSnapshot, error) {
	f.partialSym, f.partialOpts = symbol, options
	return f.partialDepth, nil
}

type streamPrivateFake struct {
	orders    chan *ws.OrderEvent
	balances  chan *ws.BalanceUpdate
	positions chan *ws.PositionReport

	orderScope   ws.SubscriptionScope
	balanceOpts  ws.AccountStreamOptions
	positionOpts ws.AccountStreamOptions
}

func (f *streamPrivateFake) SubscribeOrderEventsWithScope(_ context.Context, scope ws.SubscriptionScope) (<-chan *ws.OrderEvent, error) {
	f.orderScope = scope
	return f.orders, nil
}

func (f *streamPrivateFake) SubscribeBalancesWithOptions(_ context.Context, options ws.AccountStreamOptions) (<-chan *ws.BalanceUpdate, error) {
	f.balanceOpts = options
	return f.balances, nil
}

func (f *streamPrivateFake) SubscribePositionsWithOptions(_ context.Context, options ws.AccountStreamOptions) (<-chan *ws.PositionReport, error) {
	f.positionOpts = options
	return f.positions, nil
}

type streamCloser struct{ closed bool }

func (c *streamCloser) Close() error {
	c.closed = true
	return nil
}

type cancelOnWrite struct {
	io.Writer
	cancel    context.CancelFunc
	cancelOne sync.Once
}

func (w *cancelOnWrite) Write(value []byte) (int, error) {
	n, err := w.Writer.Write(value)
	w.cancelOne.Do(w.cancel)
	return n, err
}

func TestStreamTradesUsesTypedSubscriptionAndNDJSON(t *testing.T) {
	var out bytes.Buffer
	trades := make(chan *ws.TradeEvent, 1)
	event := &ws.TradeEvent{EventType: "trade", Symbol: "BTCUSD", Price: "100", Quantity: "0.5"}
	trades <- event
	fake := &streamPublicFake{trades: trades}
	owner := &streamCloser{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	writer := &cancelOnWrite{Writer: &out, cancel: cancel}
	root := newTestRootCommand(writer, writer)
	root.SetContext(ctx)
	root.AddCommand(NewStreamCommandWithFactories(func(_ context.Context, options GlobalOptions) (PublicStreamClient, io.Closer, error) {
		if options.Environment != "sandbox" || options.Profile != "trader" {
			t.Fatalf("options = %#v", options)
		}
		return fake, owner, nil
	}, nil))
	root.SetArgs([]string{"--environment", "sandbox", "--profile", "trader", "stream", "trades", " btcusd "})

	if err := root.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if fake.tradesSymbol != "btcusd" {
		t.Fatalf("trades symbol = %q", fake.tradesSymbol)
	}
	if !owner.closed {
		t.Fatal("stream owner was not closed")
	}
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 1 {
		t.Fatalf("output lines = %q", out.String())
	}
	var got ws.TradeEvent
	if err := json.Unmarshal([]byte(lines[0]), &got); err != nil {
		t.Fatalf("output = %q: %v", out.String(), err)
	}
	if got.Symbol != event.Symbol || got.Price != event.Price {
		t.Fatalf("event = %#v", got)
	}
}

func TestStreamDepthMapsPartialDepthOptions(t *testing.T) {
	var out bytes.Buffer
	partial := make(chan *ws.OrderBookSnapshot)
	fake := &streamPublicFake{partialDepth: partial}
	root := newTestRootCommand(&out, &out)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	root.SetContext(ctx)
	root.AddCommand(NewStreamCommandWithFactory(func(context.Context, GlobalOptions) (PublicStreamClient, io.Closer, error) {
		return fake, nil, nil
	}))
	root.SetArgs([]string{"stream", "depth", "ethusd", "--levels", "20", "--interval", "100ms"})

	if err := root.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if fake.partialSym != "ethusd" || fake.partialOpts.Levels != ws.DepthLevel20 || fake.partialOpts.Interval != 100*time.Millisecond {
		t.Fatalf("partial subscription = (%q, %#v)", fake.partialSym, fake.partialOpts)
	}
}

func TestStreamCancellationClosesOwnerWithoutError(t *testing.T) {
	var out bytes.Buffer
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	trades := make(chan *ws.TradeEvent)
	fake := &streamPublicFake{trades: trades}
	owner := &streamCloser{}
	root := newTestRootCommand(&out, &out)
	root.SetContext(ctx)
	root.AddCommand(NewStreamCommandWithFactory(func(context.Context, GlobalOptions) (PublicStreamClient, io.Closer, error) {
		return fake, owner, nil
	}))
	root.SetArgs([]string{"stream", "trades", "BTCUSD"})

	if err := root.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if !owner.closed {
		t.Fatal("stream owner was not closed after cancellation")
	}
}

func TestStreamPrivateCommandsMapScopeAndInterval(t *testing.T) {
	tests := []struct {
		name  string
		args  []string
		check func(*streamPrivateFake) bool
	}{
		{name: "orders", args: []string{"stream", "orders", "--scope", "session"}, check: func(fake *streamPrivateFake) bool {
			return fake.orderScope == ws.ScopeSession
		}},
		{name: "balances", args: []string{"stream", "balances", "--interval", "1s"}, check: func(fake *streamPrivateFake) bool {
			return fake.balanceOpts.Interval == time.Second
		}},
		{name: "positions", args: []string{"stream", "positions", "--interval", "1s"}, check: func(fake *streamPrivateFake) bool {
			return fake.positionOpts.Interval == time.Second
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var out bytes.Buffer
			fake := &streamPrivateFake{
				orders: make(chan *ws.OrderEvent), balances: make(chan *ws.BalanceUpdate), positions: make(chan *ws.PositionReport),
			}
			close(fake.orders)
			close(fake.balances)
			close(fake.positions)
			root := newTestRootCommand(&out, &out)
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			root.SetContext(ctx)
			root.AddCommand(NewStreamCommandWithFactories(nil, func(context.Context, GlobalOptions) (PrivateStreamClient, io.Closer, error) {
				return fake, nil, nil
			}))
			root.SetArgs(test.args)
			if err := root.Execute(); err != nil {
				t.Fatalf("Execute() error = %v", err)
			}
			if !test.check(fake) {
				t.Fatalf("private subscription = %#v", fake)
			}
		})
	}
}

func TestConsumeStreamClosedChannelReturnsError(t *testing.T) {
	events := make(chan *ws.TradeEvent)
	close(events)
	if err := consumeStream(context.Background(), io.Discard, events); err == nil {
		t.Fatal("consumeStream() error = nil, want unexpected closure error")
	}
}

func TestConsumeStreamCancellationIsClean(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	events := make(chan *ws.TradeEvent)
	if err := consumeStream(ctx, io.Discard, events); err != nil {
		t.Fatalf("consumeStream() error = %v, want nil after cancellation", err)
	}
}

func TestConsumeStreamPropagatesSDKTerminalError(t *testing.T) {
	terminalErr := errors.New("socket failed permanently")
	events := make(chan *ws.TradeEvent)
	connectionEvents := make(chan ws.ConnectionEvent, 1)
	connectionEvents <- ws.ConnectionEvent{State: ws.StateDisconnected, Err: terminalErr}
	err := consumeStream(context.Background(), io.Discard, events, connectionEvents)
	if !errors.Is(err, terminalErr) {
		t.Fatalf("consumeStream() error = %v, want terminal error %v", err, terminalErr)
	}
}
