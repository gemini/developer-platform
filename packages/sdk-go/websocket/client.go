package websocket

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gemini/gemini-go/auth"
	"github.com/gemini/gemini-go/transport"
)

// ErrAuthenticationRequired is returned when an authenticated WebSocket operation
// is attempted on an unauthenticated client.
var ErrAuthenticationRequired = transport.ErrAuthenticationRequired

// ErrInvalidURL indicates that the WebSocket endpoint is not an absolute URL
// with a host and the required WSS scheme.
var ErrInvalidURL = errors.New("gemini websocket: invalid endpoint URL")

// ErrRequestFailed is returned when the WebSocket server rejects a correlated
// request with a non-success status.
var ErrRequestFailed = errors.New("gemini websocket: request failed")

// ErrResubscribeFailed indicates that one or more active feeds could not be
// restored after reconnecting. Existing subscription channels are closed so
// callers cannot mistake a connected socket for a healthy stream.
var ErrResubscribeFailed = errors.New("gemini websocket: feed resubscription failed")

// ErrSlowConsumer indicates that a subscriber did not drain its bounded
// channel quickly enough and the inbound dispatch queue filled. The client
// reports this through ConnectionEvent.Err and reconnects when enabled.
var ErrSlowConsumer = errors.New("gemini websocket: subscriber too slow")

// RequestError describes a failed correlated WebSocket request.
type RequestError struct {
	ID      string
	Status  int
	Code    int
	Message string
}

func (e *RequestError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("gemini websocket: request %s failed (status %d): %s", e.ID, e.Status, e.Message)
	}
	return fmt.Sprintf("gemini websocket: request %s failed (status %d)", e.ID, e.Status)
}

func (e *RequestError) Unwrap() error {
	return ErrRequestFailed
}

// ConnectionState represents the lifecycle status of the WebSocket connection.
type ConnectionState int32

const (
	StateDisconnected ConnectionState = iota
	StateConnecting
	StateConnected
	StateReconnecting
	StateClosed
)

func (s ConnectionState) String() string {
	switch s {
	case StateDisconnected:
		return "Disconnected"
	case StateConnecting:
		return "Connecting"
	case StateConnected:
		return "Connected"
	case StateReconnecting:
		return "Reconnecting"
	case StateClosed:
		return "Closed"
	default:
		return "Unknown"
	}
}

// ConnectionEvent is published on state transitions.
type ConnectionEvent struct {
	State ConnectionState
	Err   error
}

// Client manages a resilient, multiplexed WebSocket connection to Gemini.
type Client struct {
	url           string
	dialer        Dialer
	logger        *slog.Logger
	headers       http.Header
	auth          auth.Strategy
	privateOnly   bool
	autoReconnect bool
	maxReconnects int
	snapshotValue int
	configErr     error
	// isolateSnapshots gives snapshot-capable depth feeds a connection per
	// symbol. Some environments return partial-depth snapshots without a
	// symbol, so sharing one connection would make those frames ambiguous.
	isolateSnapshots        bool
	isolatePartialSnapshots bool
	maxMessageSize          int64
	livenessInterval        time.Duration
	livenessTimeout         time.Duration

	mu                  sync.RWMutex
	lifecycleGate       chan struct{}
	writeMu             sync.Mutex // Serializes gorilla websocket writes
	conn                Conn
	state               atomic.Int32
	lifecycle           atomic.Uint64
	doneChan            chan struct{}
	closeOnce           sync.Once
	closeErr            error
	eventChan           chan ConnectionEvent
	eventMu             sync.Mutex
	pendingEvent        *ConnectionEvent
	eventPumpRunning    bool
	eventClosed         bool
	eventWg             sync.WaitGroup
	eventSubscribers    map[uint64]chan ConnectionEvent
	nextEventSubscriber uint64
	pumpWg              sync.WaitGroup
	connectDone         chan struct{}
	connectErr          error
	pendingMu           sync.Mutex
	pending             map[string]chan requestResult

	subsMu                 sync.Mutex
	rfqScopeMu             sync.Mutex
	subscriptionWireMu     sync.Mutex
	subscriptionGates      map[string]chan struct{}
	subscriptionReplayGate chan struct{}
	activeFeeds            map[string]RequestFrame
	snapshotMode           bool
	snapshotPending        map[string]uint64
	subscriptionGeneration atomic.Uint64
	replayInProgress       bool
	subTables              atomic.Pointer[subTables]
	snapshotMu             sync.Mutex
	snapshotClients        map[string]*Client
	snapshotClientRefs     map[string]int
	partialSnapshotClients map[string]*Client
	partialSnapshotRefs    map[string]int
}

func newTokenGate() chan struct{} {
	gate := make(chan struct{}, 1)
	gate <- struct{}{}
	return gate
}

type requestResult struct {
	response ResponseFrame
	err      error
}

type subTables struct {
	depthSubs        map[string][]*subscription[DepthUpdate]
	partialDepthSubs map[string][]*subscription[OrderBookSnapshot]
	tradeSubs        map[string][]*subscription[TradeEvent]
	tickerSubs       map[string][]*subscription[BookTicker]
	contractSubs     map[string][]*subscription[ContractStatusEvent]
	orderSubs        map[string][]*subscription[OrderEvent]
	balanceSubs      map[string][]*subscription[BalanceUpdate]
	positionSubs     map[string][]*subscription[PositionReport]
	settleSubs       map[string][]*subscription[SettlementUpdate]
	rfqPublicSubs    map[string][]*subscription[RFQPublicEvent]
	rfqPrivateSubs   map[string][]*subscription[RFQPrivateDelivery]
}

// subscription coordinates delivery with channel closure without requiring
// the client-wide subscription table lock to remain held while a consumer is
// draining a bounded channel.
type subscription[T any] struct {
	ch        chan *T
	done      chan struct{}
	mu        sync.Mutex
	sends     sync.WaitGroup
	closed    bool
	closeOnce sync.Once
}

func newSubscription[T any](buffer int) *subscription[T] {
	return &subscription[T]{
		ch:   make(chan *T, buffer),
		done: make(chan struct{}),
	}
}

func (s *subscription[T]) send(stop <-chan struct{}, value *T) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.sends.Add(1)
	s.mu.Unlock()
	defer s.sends.Done()

	select {
	case s.ch <- value:
	case <-s.done:
	case <-stop:
	}
}

func (s *subscription[T]) close() {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closed = true
		close(s.done)
		s.mu.Unlock()
		s.sends.Wait()
		close(s.ch)
	})
}

func newSubTables() *subTables {
	return &subTables{
		depthSubs:        make(map[string][]*subscription[DepthUpdate]),
		partialDepthSubs: make(map[string][]*subscription[OrderBookSnapshot]),
		tradeSubs:        make(map[string][]*subscription[TradeEvent]),
		tickerSubs:       make(map[string][]*subscription[BookTicker]),
		contractSubs:     make(map[string][]*subscription[ContractStatusEvent]),
		orderSubs:        make(map[string][]*subscription[OrderEvent]),
		balanceSubs:      make(map[string][]*subscription[BalanceUpdate]),
		positionSubs:     make(map[string][]*subscription[PositionReport]),
		settleSubs:       make(map[string][]*subscription[SettlementUpdate]),
		rfqPublicSubs:    make(map[string][]*subscription[RFQPublicEvent]),
		rfqPrivateSubs:   make(map[string][]*subscription[RFQPrivateDelivery]),
	}
}

func (t *subTables) clone() *subTables {
	if t == nil {
		return &subTables{}
	}
	cp := *t
	return &cp
}

func (t *subTables) closeAll() {
	if t == nil {
		return
	}
	closeMapSubscriptions(t.depthSubs)
	closeMapSubscriptions(t.partialDepthSubs)
	closeMapSubscriptions(t.tradeSubs)
	closeMapSubscriptions(t.tickerSubs)
	closeMapSubscriptions(t.contractSubs)
	closeMapSubscriptions(t.orderSubs)
	closeMapSubscriptions(t.balanceSubs)
	closeMapSubscriptions(t.positionSubs)
	closeMapSubscriptions(t.settleSubs)
	closeMapSubscriptions(t.rfqPublicSubs)
	closeMapSubscriptions(t.rfqPrivateSubs)
}

func closeMapSubscriptions[T any](m map[string][]*subscription[T]) {
	for _, subs := range m {
		for _, sub := range subs {
			sub.close()
		}
	}
}

func closeSubscriptions[T any](subs []*subscription[T]) {
	for _, sub := range subs {
		sub.close()
	}
}

func cloneMapSlice[T any](src map[string][]*subscription[T]) map[string][]*subscription[T] {
	dst := make(map[string][]*subscription[T], len(src))
	for k, v := range src {
		cp := make([]*subscription[T], len(v))
		copy(cp, v)
		dst[k] = cp
	}
	return dst
}

func addMapSub[T any](src map[string][]*subscription[T], key string, sub *subscription[T]) map[string][]*subscription[T] {
	dst := cloneMapSlice(src)
	dst[key] = append(dst[key], sub)
	return dst
}

func removeMapSub[T any](src map[string][]*subscription[T], key string) (map[string][]*subscription[T], []*subscription[T], bool) {
	subs, exists := src[key]
	if !exists {
		return src, nil, false
	}
	dst := cloneMapSlice(src)
	delete(dst, key)
	return dst, subs, true
}

func appendSubscription[T any](src []*subscription[T], sub *subscription[T]) []*subscription[T] {
	dst := make([]*subscription[T], len(src)+1)
	copy(dst, src)
	dst[len(src)] = sub
	return dst
}

type ClientOption func(*Client)

// WithConfigurationError makes every connection attempt fail with the supplied
// configuration error. It lets higher-level facades preserve source-compatible
// constructors while rejecting invalid endpoint configuration before dialing.
func WithConfigurationError(err error) ClientOption {
	return func(c *Client) {
		c.configErr = err
	}
}

func WithDialer(d Dialer) ClientOption {
	return func(c *Client) {
		c.dialer = d
	}
}

func WithClientLogger(l *slog.Logger) ClientOption {
	return func(c *Client) {
		if l == nil {
			l = slog.Default()
		}
		c.logger = l
	}
}

func WithHeaders(h http.Header) ClientOption {
	return func(c *Client) {
		c.headers = h.Clone()
	}
}

// WithAuth configures an authentication strategy (e.g. HMAC or Bearer token) for WebSocket connection upgrade.
func WithAuth(a auth.Strategy) ClientOption {
	return func(c *Client) {
		c.auth = a
	}
}

// WithAutoReconnect enables or disables automatic connection resumption (default: true).
func WithAutoReconnect(enabled bool) ClientOption {
	return func(c *Client) {
		c.autoReconnect = enabled
	}
}

// WithMaxReconnects sets the maximum reconnection attempts (0 or negative means infinite retries).
func WithMaxReconnects(max int) ClientOption {
	return func(c *Client) {
		c.maxReconnects = max
	}
}

// WithSnapshot requests an initial order-book snapshot on the WebSocket
// connection. A value of -1 requests the full book; positive values request
// the corresponding top-N partial snapshot. The setting is opt-in for the
// low-level WebSocket client.
func WithSnapshot(snapshot int) ClientOption {
	return func(c *Client) {
		parsed, err := url.Parse(c.url)
		if err != nil {
			return
		}
		query := parsed.Query()
		if snapshot == 0 {
			query.Del("snapshot")
		} else {
			query.Set("snapshot", strconv.Itoa(snapshot))
		}
		parsed.RawQuery = query.Encode()
		c.url = parsed.String()
		c.snapshotValue = snapshot
		c.snapshotMode = snapshot != 0
	}
}

// WithIsolatedSnapshots makes snapshot-capable depth subscriptions use one
// underlying public connection per symbol. It is retained for compatibility
// with callers that need to isolate both differential and partial-depth feeds.
// New code should prefer WithIsolatedPartialSnapshots, which preserves
// multiplexing for differential depth streams whose snapshots include symbols.
func WithIsolatedSnapshots() ClientOption {
	return func(c *Client) {
		c.isolateSnapshots = true
		c.isolatePartialSnapshots = true
	}
}

// WithIsolatedPartialSnapshots makes partial-depth subscriptions use one
// underlying public connection per symbol. Partial-depth snapshot envelopes
// may omit the symbol, so sharing a connection could make those frames
// ambiguous. Differential depth subscriptions remain multiplexed.
func WithIsolatedPartialSnapshots() ClientOption {
	return func(c *Client) {
		c.isolatePartialSnapshots = true
	}
}

// NewClient creates a new Gemini WebSocket client.
func NewClient(url string, opts ...ClientOption) *Client {
	lifecycleGate := make(chan struct{}, 1)
	lifecycleGate <- struct{}{}
	c := &Client{
		url:                    url,
		logger:                 slog.Default(),
		autoReconnect:          true,
		maxMessageSize:         DefaultMaxMessageSize,
		lifecycleGate:          lifecycleGate,
		activeFeeds:            make(map[string]RequestFrame),
		doneChan:               make(chan struct{}),
		eventChan:              make(chan ConnectionEvent, 32),
		eventSubscribers:       make(map[uint64]chan ConnectionEvent),
		pending:                make(map[string]chan requestResult),
		subscriptionGates:      make(map[string]chan struct{}),
		subscriptionReplayGate: newTokenGate(),
		snapshotPending:        make(map[string]uint64),
		snapshotClients:        make(map[string]*Client),
		snapshotClientRefs:     make(map[string]int),
		partialSnapshotClients: make(map[string]*Client),
		partialSnapshotRefs:    make(map[string]int),
	}
	c.subTables.Store(newSubTables())
	c.state.Store(int32(StateDisconnected))

	for _, opt := range opts {
		opt(c)
	}
	if c.configErr == nil {
		c.configErr = validateWebSocketURL(c.url)
	}
	return c
}

// NewClientWithError creates a WebSocket client and validates its endpoint
// before returning it.
func NewClientWithError(endpoint string, opts ...ClientOption) (*Client, error) {
	c := NewClient(endpoint, opts...)
	if c.configErr != nil {
		return nil, c.configErr
	}
	return c, nil
}

func validateWebSocketURL(endpoint string) error {
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidURL, err)
	}
	if parsed.Host == "" || !strings.EqualFold(parsed.Scheme, "wss") {
		return fmt.Errorf("%w: expected absolute URL with a wss scheme", ErrInvalidURL)
	}
	if parsed.User != nil || parsed.Fragment != "" {
		return fmt.Errorf("%w: endpoint must not include userinfo or fragment", ErrInvalidURL)
	}
	return nil
}

// NewPublicClient creates a dedicated unauthenticated Gemini WebSocket client for market data streaming.
func NewPublicClient(url string, opts ...ClientOption) *Client {
	c := NewClient(url, opts...)
	c.auth = nil
	return c
}

// NewPrivateClient creates a dedicated authenticated Gemini WebSocket client for private account feeds and order execution.
func NewPrivateClient(url string, strategy auth.Strategy, opts ...ClientOption) *Client {
	opts = append(opts, WithAuth(strategy))
	c := NewClient(url, opts...)
	c.privateOnly = true
	return c
}

// State returns the current connection lifecycle state.
func (c *Client) State() ConnectionState {
	return ConnectionState(c.state.Load())
}

// Events returns a channel streaming connection lifecycle events. The channel
// is buffered and coalesces notifications when a consumer falls behind; State
// is authoritative. The channel is closed after Close has stopped the read
// and reconnect pumps.
// A subscriber that does not drain its bounded feed channel can cause an
// ErrSlowConsumer event; applications must treat that as a data-recovery
// signal and resync the affected state.
func (c *Client) Events() <-chan ConnectionEvent {
	return c.eventChan
}

// SubscribeConnectionEvents registers an independent lifecycle-event
// subscriber. Unlike Events, this does not consume the client's shared event
// stream, so libraries can observe reconnect boundaries without interfering
// with application consumers.
//
// Events are delivered without blocking connection state transitions. If the
// buffer is full, the subscriber is closed so it cannot miss a lifecycle
// boundary silently. The returned stop function is idempotent.
func (c *Client) SubscribeConnectionEvents(buffer int) (<-chan ConnectionEvent, func()) {
	if buffer < 1 {
		buffer = 1
	}
	ch := make(chan ConnectionEvent, buffer)

	c.eventMu.Lock()
	if c.eventClosed {
		close(ch)
		c.eventMu.Unlock()
		return ch, func() {}
	}
	c.nextEventSubscriber++
	id := c.nextEventSubscriber
	c.eventSubscribers[id] = ch
	c.eventMu.Unlock()

	var stopOnce sync.Once
	stop := func() {
		stopOnce.Do(func() {
			c.eventMu.Lock()
			if subscriber, ok := c.eventSubscribers[id]; ok {
				delete(c.eventSubscribers, id)
				close(subscriber)
			}
			c.eventMu.Unlock()
		})
	}
	return ch, stop
}

func (c *Client) setState(s ConnectionState, err error) {
	c.state.Store(int32(s))
	c.publishEvent(ConnectionEvent{State: s, Err: err})
}

func (c *Client) publishEvent(event ConnectionEvent) {
	c.eventMu.Lock()
	if c.eventClosed {
		c.eventMu.Unlock()
		return
	}
	for _, subscriber := range c.eventSubscribers {
		select {
		case subscriber <- event:
		default:
			for id, current := range c.eventSubscribers {
				if current == subscriber {
					close(current)
					delete(c.eventSubscribers, id)
					break
				}
			}
		}
	}
	if c.eventPumpRunning {
		c.pendingEvent = &event
		c.eventMu.Unlock()
		return
	}
	select {
	case c.eventChan <- event:
		c.eventMu.Unlock()
		return
	default:
	}
	c.pendingEvent = &event
	if !c.eventPumpRunning {
		c.eventPumpRunning = true
		c.eventWg.Add(1)
		go c.drainEvents()
	}
	c.eventMu.Unlock()
}

// drainEvents coalesces backpressure to the latest lifecycle state rather
// than silently dropping every event after the buffer fills. State() remains
// authoritative if a consumer does not drain Events promptly.
func (c *Client) drainEvents() {
	defer c.eventWg.Done()
	for {
		c.eventMu.Lock()
		if c.pendingEvent == nil {
			c.eventPumpRunning = false
			c.eventMu.Unlock()
			return
		}
		event := *c.pendingEvent
		c.pendingEvent = nil
		c.eventMu.Unlock()

		select {
		case c.eventChan <- event:
		case <-c.doneChan:
			c.eventMu.Lock()
			c.pendingEvent = nil
			c.eventPumpRunning = false
			c.eventMu.Unlock()
			return
		}
	}
}
