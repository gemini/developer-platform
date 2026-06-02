package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"

	appupdate "github.com/gemini/developer-platform/packages/cli/internal/app/update"
	"github.com/gemini/developer-platform/packages/cli/internal/debug"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

const (
	repoOwner         = "gemini"
	repoName          = "developer-platform"
	updateCheckFile   = "last-update-check.json"
	pendingUpdateFile = "pending-update.json"
	checkInterval     = 24 * time.Hour
	githubAPI         = "https://api.github.com"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update to the latest version",
	Long: `Check for and install the latest version of the CLI.

Downloads the latest release from GitHub and replaces the current binary.
Validates SHA256 checksum before applying update.

Examples:
  gemini-markets update
  gemini-markets update --check`,
	RunE: runUpdate,
}

var checkOnly bool

func init() {
	updateCmd.Flags().BoolVar(&checkOnly, "check", false, "only check for updates, don't install")
	rootCmd.AddCommand(updateCmd)
}

type updateCache struct {
	LastCheck     time.Time `json:"lastCheck"`
	LatestVersion string    `json:"latestVersion"`
}

var (
	pendingUpdateNotice string
	updateNoticeMu      sync.Mutex
)

func getUpdateCachePath() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = filepath.Join(os.Getenv("HOME"), ".config")
	}
	return filepath.Join(configDir, "gemini", updateCheckFile)
}

func loadUpdateCache() (*updateCache, error) {
	data, err := os.ReadFile(getUpdateCachePath())
	if err != nil {
		return nil, err
	}
	var cache updateCache
	if err := json.Unmarshal(data, &cache); err != nil {
		return nil, err
	}
	return &cache, nil
}

func saveUpdateCache(cache *updateCache) error {
	path := getUpdateCachePath()
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(cache)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

// CheckForUpdateBackground checks for updates in the background.
func CheckForUpdateBackground() {
	go func() {
		pending, _ := appupdate.LoadPendingUpdate()
		if pending != nil {
			if compareVersions(pending.Version, normalizeVersion(Version)) > 0 {
				setUpdateNotice(pending.Version)
			}
			return
		}

		cache, err := loadUpdateCache()
		if err != nil {
			debug.Log("failed to load update cache: %v", err)
		}

		if cache != nil && time.Since(cache.LastCheck) < checkInterval {
			if cache.LatestVersion != "" && cache.LatestVersion != Version {
				if compareVersions(cache.LatestVersion, normalizeVersion(Version)) > 0 {
					setUpdateNotice(cache.LatestVersion)
				}
			}
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		release, err := fetchLatestRelease(ctx)
		if err != nil {
			debug.Log("update check failed: %v", err)
			return
		}

		latestVersion := strings.TrimPrefix(strings.TrimPrefix(release.TagName, "cli/"), "v")
		newCache := &updateCache{
			LastCheck:     time.Now(),
			LatestVersion: latestVersion,
		}
		if err := saveUpdateCache(newCache); err != nil {
			debug.Log("failed to save update cache: %v", err)
		}

		currentVersion := normalizeVersion(Version)
		if compareVersions(latestVersion, currentVersion) > 0 {
			setUpdateNotice(latestVersion)
			stageUpdateInBackground(ctx, release, latestVersion)
		}
	}()
}

func setUpdateNotice(newVersion string) {
	updateNoticeMu.Lock()
	defer updateNoticeMu.Unlock()
	pendingUpdateNotice = newVersion
}

// PrintPendingUpdateNotice prints a notice about pending updates.
func PrintPendingUpdateNotice() {
	if debug.IsQuiet() {
		return
	}

	updateNoticeMu.Lock()
	notice := pendingUpdateNotice
	pendingUpdateNotice = ""
	updateNoticeMu.Unlock()

	if notice == "" {
		return
	}

	pending, _ := appupdate.LoadPendingUpdate()
	if pending != nil && pending.Version == notice {
		fmt.Fprintf(os.Stderr, "\n  Update ready: v%s → v%s (will apply on next run)\n\n", Version, notice)
	} else {
		fmt.Fprintf(os.Stderr, "\n  Update available: v%s → v%s\n", Version, notice)
		fmt.Fprintf(os.Stderr, "  Run 'gemini-markets update' to install now\n\n")
	}
}

func runUpdate(cmd *cobra.Command, args []string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	release, err := fetchLatestRelease(ctx)
	if err != nil {
		return fmt.Errorf("failed to check for updates: %w", err)
	}

	latestVersion := strings.TrimPrefix(strings.TrimPrefix(release.TagName, "cli/"), "v")
	currentVersion := normalizeVersion(Version)

	if compareVersions(latestVersion, currentVersion) <= 0 {
		if IsTableOutput() {
			fmt.Printf("Already up to date (v%s)\n", currentVersion)
			return nil
		}
		return output.PrintJSON(map[string]any{
			"updateAvailable": false,
			"currentVersion":  currentVersion,
			"latestVersion":   latestVersion,
		})
	}

	if checkOnly {
		if IsTableOutput() {
			fmt.Printf("Update available: v%s → v%s\n", currentVersion, latestVersion)
			fmt.Println("Run 'gemini-markets update' to install.")
			return nil
		}
		return output.PrintJSON(map[string]any{
			"updateAvailable": true,
			"currentVersion":  currentVersion,
			"latestVersion":   latestVersion,
			"releaseNotes":    release.Body,
		})
	}

	if IsTableOutput() {
		fmt.Printf("Updating: v%s → v%s\n", currentVersion, latestVersion)
		fmt.Printf("Platform: %s/%s\n", runtime.GOOS, runtime.GOARCH)
	}

	assetName := appupdate.GetAssetNameForVersion(latestVersion)
	var assetURL string
	var checksumURL string

	for _, asset := range release.Assets {
		if asset.Name == assetName {
			assetURL = asset.BrowserDownloadURL
		}
		if asset.Name == "checksums.txt" {
			checksumURL = asset.BrowserDownloadURL
		}
	}

	if assetURL == "" {
		return fmt.Errorf("no release found for %s/%s", runtime.GOOS, runtime.GOARCH)
	}

	if checksumURL == "" {
		return fmt.Errorf("no checksums.txt found in release (required for security)")
	}

	checksums, err := fetchChecksums(ctx, checksumURL)
	if err != nil {
		return fmt.Errorf("failed to fetch checksums: %w", err)
	}

	expectedChecksum, ok := checksums[assetName]
	if !ok {
		return fmt.Errorf("no checksum found for %s", assetName)
	}

	if IsTableOutput() {
		fmt.Println("Downloading...")
	}

	tmpFile, err := downloadAsset(ctx, assetURL)
	if err != nil {
		return fmt.Errorf("failed to download: %w", err)
	}
	defer os.Remove(tmpFile)

	if IsTableOutput() {
		fmt.Println("Verifying checksum...")
	}

	if err := appupdate.VerifyChecksum(tmpFile, expectedChecksum); err != nil {
		return fmt.Errorf("checksum verification failed: %w", err)
	}

	if IsTableOutput() {
		fmt.Println("Installing...")
	}

	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return fmt.Errorf("failed to resolve executable path: %w", err)
	}

	if err := appupdate.InstallUpdate(tmpFile, exe, assetName); err != nil {
		return fmt.Errorf("failed to install update: %w", err)
	}

	if IsTableOutput() {
		fmt.Printf("Updated to v%s\n", latestVersion)
		return nil
	}
	return output.PrintJSON(map[string]any{
		"success":         true,
		"previousVersion": currentVersion,
		"newVersion":      latestVersion,
	})
}

func normalizeVersion(v string) string {
	if v == "" || v == "dev" {
		return "0.0.0"
	}
	return strings.TrimPrefix(v, "v")
}

func compareVersions(a, b string) int {
	aParts := parseVersion(a)
	bParts := parseVersion(b)

	for i := 0; i < 3; i++ {
		if aParts[i] > bParts[i] {
			return 1
		}
		if aParts[i] < bParts[i] {
			return -1
		}
	}
	return 0
}

func parseVersion(v string) [3]int {
	var parts [3]int
	v = strings.TrimPrefix(v, "v")
	v = strings.Split(v, "-")[0] // strip prerelease
	for i, p := range strings.SplitN(v, ".", 3) {
		_, _ = fmt.Sscanf(p, "%d", &parts[i])
	}
	return parts
}
