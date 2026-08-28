package services

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gemini/gemini-go/generated/account"
	"github.com/gemini/gemini-go/transport"
)

// HeartbeatService manages Gemini session heartbeats (dead-man's switch).
type HeartbeatService struct {
	baseService
}

// NewHeartbeatService creates a new HeartbeatService.
func NewHeartbeatService(client *transport.Client, baseURL string) *HeartbeatService {
	return &HeartbeatService{
		baseService: newBaseService(client, baseURL),
	}
}

// Send submits a single heartbeat pulse to prevent order cancellation.
func (s *HeartbeatService) Send(ctx context.Context) error {
	var res struct {
		Result string `json:"result,omitempty"`
	}
	return s.post(ctx, "/v1/heartbeat", &account.Heartbeat{}, &res)
}

// HeartbeatSession coordinates background heartbeat intervals and error broadcasting.
type HeartbeatSession struct {
	service  *HeartbeatService
	interval time.Duration
	cancel   context.CancelFunc
	errChan  chan error
	lastBeat atomic.Int64 // Unix milli
	alive    atomic.Bool
	stopOnce sync.Once
}

// Start launches an autonomous background heartbeat loop sending pulses every interval.
func (s *HeartbeatService) Start(parentCtx context.Context, interval time.Duration) *HeartbeatSession {
	if parentCtx == nil {
		parentCtx = context.Background()
	}
	if interval <= 0 {
		interval = 5 * time.Second
	}

	ctx, cancel := context.WithCancel(parentCtx)
	session := &HeartbeatSession{
		service:  s,
		interval: interval,
		cancel:   cancel,
		errChan:  make(chan error, 16),
	}
	session.alive.Store(true)

	go session.run(ctx)
	return session
}

func (s *HeartbeatSession) run(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	defer s.alive.Store(false)
	defer close(s.errChan)

	// Send initial beat immediately
	if err := s.service.Send(ctx); err != nil {
		s.notifyErr(err)
	} else {
		s.lastBeat.Store(time.Now().UnixMilli())
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.service.Send(ctx); err != nil {
				s.notifyErr(err)
			} else {
				s.lastBeat.Store(time.Now().UnixMilli())
			}
		}
	}
}

func (s *HeartbeatSession) notifyErr(err error) {
	select {
	case s.errChan <- err:
	default:
		// Do not block if error channel is full
	}
}

// Stop gracefully shuts down the background heartbeat session.
func (s *HeartbeatSession) Stop() {
	s.stopOnce.Do(func() {
		s.cancel()
		s.alive.Store(false)
	})
}

// IsAlive returns true if the heartbeat session is actively ticking.
func (s *HeartbeatSession) IsAlive() bool {
	return s.alive.Load()
}

// LastBeat returns the time of the latest successful heartbeat.
func (s *HeartbeatSession) LastBeat() time.Time {
	milli := s.lastBeat.Load()
	if milli == 0 {
		return time.Time{}
	}
	return time.UnixMilli(milli)
}

// Errors returns a channel notifying callers of any heartbeat transmission failures.
func (s *HeartbeatSession) Errors() <-chan error {
	return s.errChan
}
