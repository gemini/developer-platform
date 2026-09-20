package conformance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go/auth"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
)

func TestWebSocketEventConformance(t *testing.T) {
	manifest := LoadManifest(t)
	found := false
	for _, suite := range manifest.Suites {
		if suite.Kind != "wsEvent" {
			continue
		}
		found = true
		suiteID := suite.ID
		for _, caseID := range suite.Cases {
			caseID := caseID
			t.Run(caseID, func(t *testing.T) {
				var fixture FixtureWSEvent
				if err := json.Unmarshal(LoadCase(t, suiteID, caseID), &fixture); err != nil {
					t.Fatalf("decode fixture: %v", err)
				}
				if fixture.Kind != "wsEvent" {
					t.Fatalf("fixture kind = %q, want wsEvent", fixture.Kind)
				}
				if fixture.Frame == "" {
					t.Fatal("fixture frame is empty")
				}

				conn := newConformanceWSConn()
				dialer := &conformanceWSDialer{conn: conn}
				private := fixture.Stream == "orders" || fixture.Stream == "order" || fixture.Stream == "balances"
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
				event, err := subscribeAndReceiveEvent(client, conn, fixture, ctx)
				if err != nil {
					t.Fatalf("receive %q event: %v", fixture.Stream, err)
				}
				for wireField, expected := range fixture.Expect.Fields {
					got, ok := eventFieldText(event, wireField)
					if !ok {
						t.Errorf("typed %T event has no wire field %q", event, wireField)
						continue
					}
					if expected.Compare == "caseInsensitive" {
						if !strings.EqualFold(got, expected.Text) {
							t.Errorf("event field %s = %q, want case-insensitive match for %q", wireField, got, expected.Text)
						}
					} else if got != expected.Text {
						t.Errorf("event field %s = %q, want %q", wireField, got, expected.Text)
					}
				}
			})
		}
	}
	if !found {
		t.Fatal("manifest has no wsEvent suite")
	}
}

func subscribeAndReceiveEvent(client *websocket.Client, conn *conformanceWSConn, fixture FixtureWSEvent, ctx context.Context) (any, error) {
	symbol := fixture.Symbol
	var event any
	var err error
	switch fixture.Stream {
	case "trade", "trades":
		var ch <-chan *websocket.TradeEvent
		ch, err = client.SubscribeTrades(ctx, symbol)
		if err == nil {
			conn.feed([]byte(fixture.Frame))
			select {
			case event = <-ch:
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
	case "depth", "depthUpdates":
		var ch <-chan *websocket.DepthUpdate
		ch, err = client.SubscribeDepth(ctx, symbol)
		if err == nil {
			conn.feed([]byte(fixture.Frame))
			select {
			case event = <-ch:
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
	case "order", "orders":
		var ch <-chan *websocket.OrderEvent
		ch, err = client.SubscribeOrderEvents(ctx)
		if err == nil {
			conn.feed([]byte(fixture.Frame))
			select {
			case event = <-ch:
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
	case "balance", "balances":
		var ch <-chan *websocket.BalanceUpdate
		ch, err = client.SubscribeBalances(ctx)
		if err == nil {
			conn.feed([]byte(fixture.Frame))
			select {
			case event = <-ch:
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
	default:
		return nil, fmt.Errorf("unsupported WebSocket event stream %q", fixture.Stream)
	}
	if err != nil {
		return nil, err
	}
	if event == nil {
		return nil, errors.New("typed WebSocket event was nil")
	}
	return event, nil
}

func eventFieldText(event any, wireField string) (string, bool) {
	encoded, err := json.Marshal(event)
	if err != nil {
		return "", false
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &fields); err != nil {
		return "", false
	}
	raw, ok := fields[wireField]
	if !ok {
		return "", false
	}
	if len(raw) > 0 && raw[0] == '"' {
		var text string
		if json.Unmarshal(raw, &text) != nil {
			return "", false
		}
		return text, true
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	var value any
	if decoder.Decode(&value) != nil {
		return "", false
	}
	switch typed := value.(type) {
	case json.Number:
		return typed.String(), true
	case bool:
		return strconv.FormatBool(typed), true
	case nil:
		return "null", true
	default:
		return "", false
	}
}
