package ws

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/gemini/developer-platform/packages/cli/internal/debug"
)

const (
	// DefaultWSURL is the production WebSocket endpoint.
	DefaultWSURL = "wss://ws.gemini.com"

	// Circuit breaker settings.
	circuitBreakerThreshold = 3
	circuitBreakerCooldown  = 30 * time.Second
)

// Error categories for fallback decisions.
var (
	ErrCircuitOpen    = errors.New("circuit breaker open")
	ErrWSDisabled     = errors.New("websocket disabled")
	ErrAuthFailure    = errors.New("authentication failed")
	ErrInvalidRequest = errors.New("invalid request parameters")
)

type circuitState int

const (
	circuitClosed circuitState = iota
	circuitOpen
	circuitHalfOpen
)

// ConnectionManager manages WebSocket connections with reconnection.
type ConnectionManager struct {
	mu     sync.RWMutex
	client *Client
	config ManagerConfig

	// Circuit breaker state
	circuitMu           sync.RWMutex
	circuitState        circuitState
	consecutiveFailures int
	lastFailureTime     time.Time
}

// ManagerConfig contains configuration for the connection manager.
type ManagerConfig struct {
	APIKey            string
	APISecret         string
	BearerToken       string
	BearerTokenSource func(context.Context) (string, error)
	URL               string
}

var (
	defaultManager     *ConnectionManager
	defaultManagerOnce sync.Once
)

// GetDefaultManager returns the singleton default connection manager.
func GetDefaultManager(cfg ManagerConfig) *ConnectionManager {
	defaultManagerOnce.Do(func() {
		defaultManager = NewConnectionManager(cfg)
	})
	return defaultManager
}

// ResetDefaultManager closes and resets the default manager.
func ResetDefaultManager() {
	defaultManagerOnce = sync.Once{}
	if defaultManager != nil {
		defaultManager.Close()
		defaultManager = nil
	}
}

// NewConnectionManager creates a new connection manager.
func NewConnectionManager(cfg ManagerConfig) *ConnectionManager {
	if cfg.URL == "" {
		cfg.URL = DefaultWSURL
	}
	return &ConnectionManager{
		config: cfg,
	}
}

// GetClient returns the WebSocket client, connecting if needed.
func (m *ConnectionManager) GetClient(ctx context.Context) (*Client, error) {
	m.mu.RLock()
	if m.client != nil {
		select {
		case <-m.client.done:
			// Client is closed, need to reconnect
		default:
			if m.client.IsHealthy() {
				m.mu.RUnlock()
				return m.client, nil
			}
			debug.Log("connection unhealthy, reconnecting")
		}
	}
	m.mu.RUnlock()

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.client != nil {
		select {
		case <-m.client.done:
		default:
			if m.client.IsHealthy() {
				return m.client, nil
			}
			m.client.Close()
		}
	}

	debug.Log("establishing persistent WebSocket connection")

	opts := []ClientOption{
		WithReconnect(DefaultMaxReconnects),
		WithOnReconnect(func() {
			debug.Log("WebSocket reconnected")
		}),
	}
	if m.config.BearerTokenSource != nil {
		opts = append(opts, WithBearerTokenSource(m.config.BearerTokenSource))
	} else if m.config.BearerToken != "" {
		opts = append(opts, WithBearerAuth(m.config.BearerToken))
	} else if m.config.APIKey != "" && m.config.APISecret != "" {
		opts = append(opts, WithAuth(m.config.APIKey, m.config.APISecret))
	}

	client, err := Connect(
		ctx,
		m.config.URL,
		opts...,
	)
	if err != nil {
		return nil, fmt.Errorf("connect to WebSocket: %w", err)
	}

	m.client = client
	return client, nil
}

// Close closes the connection manager and underlying client.
func (m *ConnectionManager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.client != nil {
		err := m.client.Close()
		m.client = nil
		return err
	}
	return nil
}

func (m *ConnectionManager) checkCircuit() error {
	m.circuitMu.RLock()
	state := m.circuitState
	lastFailure := m.lastFailureTime
	m.circuitMu.RUnlock()

	switch state {
	case circuitOpen:
		if time.Since(lastFailure) > circuitBreakerCooldown {
			m.circuitMu.Lock()
			m.circuitState = circuitHalfOpen
			m.circuitMu.Unlock()
			debug.Log("circuit breaker half-open, allowing test request")
			return nil
		}
		return ErrCircuitOpen
	case circuitHalfOpen, circuitClosed:
		return nil
	}
	return nil
}

func (m *ConnectionManager) recordSuccess() {
	m.circuitMu.Lock()
	defer m.circuitMu.Unlock()

	m.consecutiveFailures = 0
	if m.circuitState == circuitHalfOpen {
		debug.Log("circuit breaker closed after successful request")
		m.circuitState = circuitClosed
	}
}

func (m *ConnectionManager) recordFailure(err error) {
	if !isRetryableError(err) {
		return
	}

	m.circuitMu.Lock()
	defer m.circuitMu.Unlock()

	m.consecutiveFailures++
	m.lastFailureTime = time.Now()

	if m.circuitState == circuitHalfOpen {
		debug.Log("circuit breaker reopened after failed test request")
		m.circuitState = circuitOpen
		return
	}

	if m.consecutiveFailures >= circuitBreakerThreshold {
		debug.Log("circuit breaker opened after %d consecutive failures", m.consecutiveFailures)
		m.circuitState = circuitOpen
	}
}

func isRetryableError(err error) bool {
	if err == nil {
		return false
	}

	var wsErr *Error
	if errors.As(err, &wsErr) {
		switch wsErr.Code {
		case 401, 403:
			return false
		case 400:
			return false
		}
	}

	if errors.Is(err, context.DeadlineExceeded) ||
		errors.Is(err, context.Canceled) {
		return true
	}

	return true
}

func shouldFallback(err error) bool {
	if err == nil {
		return false
	}

	if errors.Is(err, ErrCircuitOpen) {
		return true
	}

	var wsErr *Error
	if errors.As(err, &wsErr) {
		switch wsErr.Code {
		case 401, 403:
			return false
		case 400:
			return false
		}
	}

	return true
}

// PlaceOrder places an order via WebSocket.
func (m *ConnectionManager) PlaceOrder(ctx context.Context, params *OrderParams) (*OrderResult, error) {
	if err := m.checkCircuit(); err != nil {
		return nil, err
	}

	client, err := m.GetClient(ctx)
	if err != nil {
		m.recordFailure(err)
		return nil, err
	}

	result, err := client.PlaceOrder(ctx, params)
	if err != nil {
		m.recordFailure(err)
		return nil, err
	}

	m.recordSuccess()
	return result, nil
}

// CancelOrder cancels an order via WebSocket.
func (m *ConnectionManager) CancelOrder(ctx context.Context, params CancelParams) (*OrderResult, error) {
	if err := m.checkCircuit(); err != nil {
		return nil, err
	}

	client, err := m.GetClient(ctx)
	if err != nil {
		m.recordFailure(err)
		return nil, err
	}

	result, err := client.CancelOrder(ctx, params)
	if err != nil {
		m.recordFailure(err)
		return nil, err
	}

	m.recordSuccess()
	return result, nil
}

// CancelAllOrders cancels all orders via WebSocket.
func (m *ConnectionManager) CancelAllOrders(ctx context.Context, params *CancelAllParams) (*CancelAllResult, error) {
	if err := m.checkCircuit(); err != nil {
		return nil, err
	}

	client, err := m.GetClient(ctx)
	if err != nil {
		m.recordFailure(err)
		return nil, err
	}

	result, err := client.CancelAllOrders(ctx, params)
	if err != nil {
		m.recordFailure(err)
		return nil, err
	}

	m.recordSuccess()
	return result, nil
}

// PlaceOrderWithFallback places an order with REST API fallback.
func (m *ConnectionManager) PlaceOrderWithFallback(ctx context.Context, params *OrderParams, restFallback func() (*OrderResult, error)) (*OrderResult, error) {
	wsCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	result, err := m.PlaceOrder(wsCtx, params)
	if err != nil {
		if shouldFallback(err) {
			debug.Log("WebSocket order failed, falling back to REST: %v", err)
			return restFallback()
		}
		return nil, err
	}
	return result, nil
}

// CancelOrderWithFallback cancels an order with REST API fallback.
func (m *ConnectionManager) CancelOrderWithFallback(ctx context.Context, params CancelParams, restFallback func() (*OrderResult, error)) (*OrderResult, error) {
	wsCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	result, err := m.CancelOrder(wsCtx, params)
	if err != nil {
		if shouldFallback(err) {
			debug.Log("WebSocket cancel failed, falling back to REST: %v", err)
			return restFallback()
		}
		return nil, err
	}
	return result, nil
}

// CancelAllOrdersWithFallback cancels all orders with REST API fallback.
func (m *ConnectionManager) CancelAllOrdersWithFallback(ctx context.Context, params *CancelAllParams, restFallback func() (*CancelAllResult, error)) (*CancelAllResult, error) {
	wsCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	result, err := m.CancelAllOrders(wsCtx, params)
	if err != nil {
		if shouldFallback(err) {
			debug.Log("WebSocket cancel all failed, falling back to REST: %v", err)
			return restFallback()
		}
		return nil, err
	}
	return result, nil
}
