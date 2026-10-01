package conformance

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go/auth"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
)

// conformanceWSConn is an in-memory WebSocket transport. It records every
// client frame and returns the protocol acknowledgement expected by the
// subscription request path, so these tests never require a network socket.
type conformanceWSConn struct {
	mu       sync.Mutex
	closed   bool
	closedCh chan struct{}
	readCh   chan []byte
	written  [][]byte
}

func newConformanceWSConn() *conformanceWSConn {
	return &conformanceWSConn{
		closedCh: make(chan struct{}),
		readCh:   make(chan []byte, 128),
	}
}

func (c *conformanceWSConn) ReadMessage(ctx context.Context) (int, []byte, error) {
	select {
	case <-ctx.Done():
		return 0, nil, ctx.Err()
	case <-c.closedCh:
		return 0, nil, errors.New("conformance websocket connection closed")
	case payload := <-c.readCh:
		return websocket.TextMessage, payload, nil
	}
}

func (c *conformanceWSConn) WriteMessage(ctx context.Context, _ int, payload []byte) error {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return errors.New("conformance websocket connection closed")
	}
	c.written = append(c.written, append([]byte(nil), payload...))
	c.mu.Unlock()

	var request struct {
		ID     int64  `json:"id"`
		Method string `json:"method"`
	}
	if err := json.Unmarshal(payload, &request); err != nil || request.ID <= 0 || request.Method == "" {
		return nil
	}
	ack, err := json.Marshal(struct {
		ID     int64          `json:"id"`
		Status int            `json:"status"`
		Result map[string]any `json:"result"`
	}{ID: request.ID, Status: http.StatusOK, Result: map[string]any{}})
	if err != nil {
		return err
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-c.closedCh:
		return errors.New("conformance websocket connection closed")
	case c.readCh <- ack:
		return nil
	}
}

func (c *conformanceWSConn) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.closed {
		c.closed = true
		close(c.closedCh)
	}
	return nil
}

func (c *conformanceWSConn) feed(payload []byte) {
	select {
	case <-c.closedCh:
	case c.readCh <- append([]byte(nil), payload...):
	}
}

func (c *conformanceWSConn) frames() [][]byte {
	c.mu.Lock()
	defer c.mu.Unlock()
	frames := make([][]byte, len(c.written))
	for i, frame := range c.written {
		frames[i] = append([]byte(nil), frame...)
	}
	return frames
}

type conformanceWSDialer struct {
	conn *conformanceWSConn
}

func (d *conformanceWSDialer) Dial(context.Context, string, http.Header) (websocket.Conn, *http.Response, error) {
	return d.conn, &http.Response{StatusCode: http.StatusSwitchingProtocols}, nil
}

func TestWebSocketSubscriptionConformance(t *testing.T) {
	manifest := LoadManifest(t)
	found := false
	for _, suite := range manifest.Suites {
		if suite.Kind != "wsSubscription" {
			continue
		}
		found = true
		suiteID := suite.ID
		for _, caseID := range suite.Cases {
			caseID := caseID
			t.Run(caseID, func(t *testing.T) {
				var fixture FixtureWSSubscription
				if err := json.Unmarshal(LoadCase(t, suiteID, caseID), &fixture); err != nil {
					t.Fatalf("decode fixture: %v", err)
				}
			if fixture.Kind != "wsSubscription" {
					t.Fatalf("fixture kind = %q, want wsSubscription", fixture.Kind)
				}

				conn := newConformanceWSConn()
				dialer := &conformanceWSDialer{conn: conn}
				private := fixture.Stream == "orders" || fixture.Stream == "balances" || fixture.Stream == "positions"
				var client *websocket.Client
				if private {
					client = websocket.NewPrivateClient(
						"wss://ws.gemini.com",
						auth.NewTimeBasedHMAC(auth.APIKey("conformance-api-key"), auth.APISecret("conformance-api-secret")),
						websocket.WithDialer(dialer),
						websocket.WithAutoReconnect(false),
					)
				} else {
					client = websocket.NewPublicClient(
						"wss://ws.gemini.com",
						websocket.WithDialer(dialer),
						websocket.WithAutoReconnect(false),
					)
				}
				defer client.Close()

				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				if err := subscribeFixture(t, client, fixture, ctx); err != nil {
					t.Fatalf("subscribe %q: %v", fixture.Stream, err)
				}

				frames := conn.frames()
				if len(frames) != 1 {
					t.Fatalf("recorded %d wire frames, want one", len(frames))
				}
				var wire struct {
					ID     int64    `json:"id"`
					Method string   `json:"method"`
					Params []string `json:"params"`
				}
				if err := json.Unmarshal(frames[0], &wire); err != nil {
					t.Fatalf("decode SUBSCRIBE frame: %v", err)
				}
				if wire.ID <= 0 {
					t.Fatalf("SUBSCRIBE id = %d, want positive integer", wire.ID)
				}
				if wire.Method != fixture.Expect.Method {
					t.Fatalf("SUBSCRIBE method = %q, want %q", wire.Method, fixture.Expect.Method)
				}
				if !reflect.DeepEqual(wire.Params, fixture.Expect.Params) {
					t.Fatalf("SUBSCRIBE params = %#v, want %#v", wire.Params, fixture.Expect.Params)
				}
			})
		}
	}
	if !found {
		t.Fatal("manifest has no wsSubscription suite")
	}
}

func subscribeFixture(t *testing.T, client *websocket.Client, fixture FixtureWSSubscription, ctx context.Context) error {
	t.Helper()
	symbol := fixture.Symbol
	interval, err := fixtureInterval(fixture.Options)
	if err != nil {
		return err
	}
	switch fixture.Stream {
	case "trades":
		_, err = client.SubscribeTrades(ctx, symbol)
	case "bookTicker":
		_, err = client.SubscribeBookTicker(ctx, symbol)
	case "depthUpdates":
		_, err = client.SubscribeDepthWithOptions(ctx, symbol, websocket.DepthSubscriptionOptions{Interval: interval})
	case "partialDepth":
		levels, levelErr := fixtureOptionInt(fixture.Options, "levels")
		if levelErr != nil {
			return levelErr
		}
		var level websocket.PartialDepthLevel
		switch levels {
		case 0:
			level = 0
		case 5:
			level = websocket.DepthLevel5
		case 10:
			level = websocket.DepthLevel10
		case 20:
			level = websocket.DepthLevel20
		default:
			return errors.New("invalid partial-depth fixture level")
		}
		_, err = client.SubscribePartialDepth(ctx, symbol, websocket.PartialDepthSubscriptionOptions{Levels: level, Interval: interval})
	case "contractStatus":
		_, err = client.SubscribeContractStatus(ctx, symbol)
	case "orders":
		scope, scopeErr := fixtureOptionString(fixture.Options, "scope")
		if scopeErr != nil {
			return scopeErr
		}
		var subscriptionScope websocket.SubscriptionScope
		switch scope {
		case "account":
			subscriptionScope = websocket.ScopeAccount
		case "session":
			subscriptionScope = websocket.ScopeSession
		default:
			return errors.New("invalid order scope fixture")
		}
		_, err = client.SubscribeOrderEventsWithScope(ctx, subscriptionScope)
	case "balances":
		_, err = client.SubscribeBalancesWithOptions(ctx, websocket.AccountStreamOptions{Interval: interval})
	case "positions":
		_, err = client.SubscribePositionsWithOptions(ctx, websocket.AccountStreamOptions{Interval: interval})
	default:
		return errors.New("unsupported WebSocket stream fixture: " + fixture.Stream)
	}
	return err
}

func fixtureInterval(options map[string]json.RawMessage) (time.Duration, error) {
	intervalMs, err := fixtureOptionInt(options, "intervalMs")
	if err != nil {
		return 0, err
	}
	return time.Duration(intervalMs) * time.Millisecond, nil
}

func fixtureOptionInt(options map[string]json.RawMessage, key string) (int, error) {
	raw, ok := options[key]
	if !ok {
		return 0, nil
	}
	var value int
	if err := json.Unmarshal(raw, &value); err != nil {
		return 0, err
	}
	return value, nil
}

func fixtureOptionString(options map[string]json.RawMessage, key string) (string, error) {
	raw, ok := options[key]
	if !ok {
		return "", nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", err
	}
	return value, nil
}
