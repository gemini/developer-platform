package websocket

import (
	"context"
	"errors"
	"net/http"
)

// Standard WebSocket frame types according to RFC 6455
const (
	TextMessage   = 1
	BinaryMessage = 2
	CloseMessage  = 8
	PingMessage   = 9
	PongMessage   = 10
)

// ErrNoDialerConfigured is returned when a caller attempts to use WebSocket without configuring a dialer.
var ErrNoDialerConfigured = errors.New("gemini websocket: no dialer configured; import 'github.com/gemini/developer-platform/packages/sdk-go/websocket/gorilla' and pass gemini.WithWebSocketDialer(gorilla.NewDialer()), or provide a custom websocket.Dialer")

// Conn represents an abstract bidirectional WebSocket connection.
type Conn interface {
	// ReadMessage reads the next message payload from the wire. Implementations
	// must allow Close to interrupt a blocked read.
	ReadMessage(ctx context.Context) (messageType int, payload []byte, err error)

	// WriteMessage sends a payload frame over the wire. Implementations must
	// allow Close to interrupt a blocked write.
	WriteMessage(ctx context.Context, messageType int, payload []byte) error

	// Close terminates the connection and may be called concurrently with
	// ReadMessage and WriteMessage.
	Close() error
}

// ReadLimitSetter is an optional transport capability for enforcing the
// inbound message limit before the transport allocates the complete payload.
// Clients that do not implement it are still protected by Client's
// post-read size check.
type ReadLimitSetter interface {
	SetReadLimit(limit int64)
}

// Dialer abstracts the establishment of a WebSocket connection.
type Dialer interface {
	Dial(ctx context.Context, url string, headers http.Header) (Conn, *http.Response, error)
}
