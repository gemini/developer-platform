package transport

import (
	"net/http"
	"testing"
	"time"
)

func TestParseRetryAfter(t *testing.T) {
	tests := []struct {
		name    string
		header  string
		want    time.Duration
		wantMax bool
	}{
		{name: "empty", header: ""},
		{name: "delta seconds", header: "3", want: 3 * time.Second},
		{name: "trimmed delta", header: " 2 ", want: 2 * time.Second},
		{name: "negative delta", header: "-1"},
		{name: "invalid value", header: "later"},
		{name: "past date", header: time.Now().Add(-time.Minute).UTC().Format(http.TimeFormat)},
		{name: "overflow clamp", header: "9223372037", wantMax: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseRetryAfter(tt.header)
			if tt.wantMax {
				maxDuration := time.Duration(1<<63 - 1)
				if got != maxDuration {
					t.Fatalf("parseRetryAfter(%q) = %s, want max duration", tt.header, got)
				}
				return
			}
			if tt.want != 0 && got != tt.want {
				t.Fatalf("parseRetryAfter(%q) = %s, want %s", tt.header, got, tt.want)
			}
			if tt.want == 0 && got != 0 {
				t.Fatalf("parseRetryAfter(%q) = %s, want zero", tt.header, got)
			}
		})
	}

	future := time.Now().Add(2 * time.Second).UTC().Format(http.TimeFormat)
	if got := parseRetryAfter(future); got <= 0 || got > 2*time.Second {
		t.Fatalf("parseRetryAfter(future date) = %s, want a positive delay no greater than two seconds", got)
	}
}

func TestRetryPolicyCalculateBackoffEdges(t *testing.T) {
	policy := RetryPolicy{
		BaseDelay:  10 * time.Millisecond,
		MaxDelay:   50 * time.Millisecond,
		Multiplier: 2,
		Jitter:     false,
	}

	tests := []struct {
		name       string
		policy     RetryPolicy
		attempt    int
		retryAfter string
		want       time.Duration
	}{
		{name: "first attempt", attempt: 0, want: 10 * time.Millisecond},
		{name: "exponential attempt", attempt: 2, want: 40 * time.Millisecond},
		{name: "max delay clamp", attempt: 10, want: 50 * time.Millisecond},
		{name: "zero retry after uses base", retryAfter: "0", want: 10 * time.Millisecond},
		{name: "retry after max clamp", retryAfter: "60", want: 50 * time.Millisecond},
		{name: "invalid multiplier uses default", policy: RetryPolicy{BaseDelay: time.Millisecond, MaxDelay: 100 * time.Millisecond, Multiplier: 0, Jitter: false}, attempt: 1, want: 2 * time.Millisecond},
		{name: "invalid max follows base", policy: RetryPolicy{BaseDelay: 20 * time.Millisecond, MaxDelay: time.Millisecond, Multiplier: 2, Jitter: false}, attempt: 2, want: 20 * time.Millisecond},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := policy
			if tt.policy.BaseDelay != 0 || tt.policy.MaxDelay != 0 || tt.policy.Multiplier != 0 || tt.policy.Jitter {
				p = tt.policy
			}
			if got := p.CalculateBackoff(tt.attempt, tt.retryAfter); got != tt.want {
				t.Fatalf("CalculateBackoff() = %s, want %s", got, tt.want)
			}
		})
	}

	serverDelayPolicy := policy
	serverDelayPolicy.MaxDelay = 2 * time.Second
	if got := serverDelayPolicy.CalculateBackoff(0, "1"); got != time.Second {
		t.Fatalf("CalculateBackoff(server retry-after) = %s, want one second", got)
	}
}
