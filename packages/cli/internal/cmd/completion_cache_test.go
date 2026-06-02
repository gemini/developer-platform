package cmd

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/spf13/cobra"

	appmarkets "github.com/gemini/developer-platform/packages/cli/internal/app/markets"
)

func TestLoadCachedCompletionValuesUsesFreshCache(t *testing.T) {
	t.Setenv("GEMINI_COMPLETION_CACHE_DIR", t.TempDir())
	cmd := &cobra.Command{Use: "test"}
	cmd.SetOut(os.Stdout)

	err := writeCompletionCache("production", "predict-symbols", completionCache{
		UpdatedAt: time.Now(),
		Values:    []string{"BTCUSD"},
	})
	if err != nil {
		t.Fatalf("writeCompletionCache() error = %v", err)
	}

	called := 0
	got := loadCachedCompletionValues(cmd, "predict-symbols", func(context.Context, *appmarkets.Service) ([]string, error) {
		called++
		return []string{"ETHUSD"}, nil
	})

	if called != 0 {
		t.Fatalf("loader called %d times, want 0", called)
	}
	if len(got) != 1 || got[0] != "BTCUSD" {
		t.Fatalf("values = %#v, want [BTCUSD]", got)
	}
}

func TestLoadCachedCompletionValuesFallsBackToStaleCache(t *testing.T) {
	t.Setenv("GEMINI_COMPLETION_CACHE_DIR", t.TempDir())
	cmd := &cobra.Command{Use: "test"}

	err := writeCompletionCache("production", "predict-symbols", completionCache{
		UpdatedAt: time.Now().Add(-2 * predictionCompletionCacheTTL),
		Values:    []string{"BTCUSD"},
	})
	if err != nil {
		t.Fatalf("writeCompletionCache() error = %v", err)
	}

	called := 0
	got := loadCachedCompletionValues(cmd, "predict-symbols", func(context.Context, *appmarkets.Service) ([]string, error) {
		called++
		return nil, errors.New("network down")
	})

	if called != 1 {
		t.Fatalf("loader called %d times, want 1", called)
	}
	if len(got) != 1 || got[0] != "BTCUSD" {
		t.Fatalf("values = %#v, want [BTCUSD]", got)
	}
}

func TestLoadCachedCompletionValuesRefreshesStaleCache(t *testing.T) {
	t.Setenv("GEMINI_COMPLETION_CACHE_DIR", t.TempDir())
	cmd := &cobra.Command{Use: "test"}

	err := writeCompletionCache("production", "predict-symbols", completionCache{
		UpdatedAt: time.Now().Add(-2 * predictionCompletionCacheTTL),
		Values:    []string{"OLDUSD"},
	})
	if err != nil {
		t.Fatalf("writeCompletionCache() error = %v", err)
	}

	got := loadCachedCompletionValues(cmd, "predict-symbols", func(context.Context, *appmarkets.Service) ([]string, error) {
		return []string{"BTCUSD", "BTCUSD", "ETHUSD"}, nil
	})

	if len(got) != 2 || got[0] != "BTCUSD" || got[1] != "ETHUSD" {
		t.Fatalf("values = %#v, want [BTCUSD ETHUSD]", got)
	}

	cache, err := readCompletionCache("production", "predict-symbols")
	if err != nil {
		t.Fatalf("readCompletionCache() error = %v", err)
	}
	if len(cache.Values) != 2 || cache.Values[0] != "BTCUSD" || cache.Values[1] != "ETHUSD" {
		t.Fatalf("cache values = %#v, want [BTCUSD ETHUSD]", cache.Values)
	}
}

func TestCompletionCacheTTLByKey(t *testing.T) {
	if got := completionCacheTTL("spot-symbols"); got != spotCompletionCacheTTL {
		t.Fatalf("completionCacheTTL(spot-symbols) = %v, want %v", got, spotCompletionCacheTTL)
	}
	if got := completionCacheTTL("predict-symbols"); got != predictionCompletionCacheTTL {
		t.Fatalf("completionCacheTTL(predict-symbols) = %v, want %v", got, predictionCompletionCacheTTL)
	}
}
