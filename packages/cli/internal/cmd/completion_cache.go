package cmd

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	appmarkets "github.com/gemini/developer-platform/packages/cli/internal/app/markets"
	"github.com/gemini/developer-platform/packages/cli/internal/config"
)

const (
	predictionCompletionCacheTTL = 6 * time.Hour
	spotCompletionCacheTTL       = 7 * 24 * time.Hour
)

type completionCache struct {
	UpdatedAt time.Time `json:"updatedAt"`
	Values    []string  `json:"values"`
}

func completionConfig(cmd *cobra.Command) *config.Config {
	environment := "production"
	if os.Getenv("GEMINI_ENVIRONMENT") != "" {
		environment = os.Getenv("GEMINI_ENVIRONMENT")
	}
	if cmd != nil {
		if flag := cmd.Root().PersistentFlags().Lookup("sandbox"); flag != nil && flag.Value.String() == "true" {
			environment = "sandbox"
		}
	}
	return &config.Config{Environment: environment}
}

func completionCacheDir() string {
	if dir := os.Getenv("GEMINI_COMPLETION_CACHE_DIR"); dir != "" {
		return dir
	}

	baseDir, err := os.UserCacheDir()
	if err != nil {
		baseDir = os.TempDir()
	}
	return filepath.Join(baseDir, "gemini-markets-cli", "completion")
}

func completionCachePath(environment, cacheKey string) string {
	filename := environment + "-" + cacheKey + ".json"
	return filepath.Join(completionCacheDir(), filename)
}

func readCompletionCache(environment, cacheKey string) (*completionCache, error) {
	data, err := os.ReadFile(completionCachePath(environment, cacheKey))
	if err != nil {
		return nil, err
	}

	var cache completionCache
	if err := json.Unmarshal(data, &cache); err != nil {
		return nil, err
	}
	cache.Values = uniqueCompletionValues(cache.Values)
	return &cache, nil
}

func writeCompletionCache(environment, cacheKey string, cache completionCache) error {
	path := completionCachePath(environment, cacheKey)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	cache.Values = uniqueCompletionValues(cache.Values)
	data, err := json.Marshal(cache)
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0o600)
}

func loadCachedCompletionValues(
	cmd *cobra.Command,
	cacheKey string,
	load func(context.Context, *appmarkets.Service) ([]string, error),
) []string {
	cfg := completionConfig(cmd)
	cache, _ := readCompletionCache(cfg.Environment, cacheKey)
	ttl := completionCacheTTL(cacheKey)
	if cache != nil && time.Since(cache.UpdatedAt) < ttl {
		return cache.Values
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	svc := appmarkets.NewService(api.NewClient(cfg))
	values, err := load(ctx, svc)
	if err == nil {
		values = uniqueCompletionValues(values)
		_ = writeCompletionCache(cfg.Environment, cacheKey, completionCache{
			UpdatedAt: time.Now(),
			Values:    values,
		})
		return values
	}

	if cache != nil {
		return cache.Values
	}
	return nil
}

func completionCacheTTL(cacheKey string) time.Duration {
	switch cacheKey {
	case "spot-symbols":
		return spotCompletionCacheTTL
	default:
		return predictionCompletionCacheTTL
	}
}
