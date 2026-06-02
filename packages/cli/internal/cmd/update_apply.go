package cmd

import (
	"context"
	"os"
	"strings"

	appupdate "github.com/gemini/developer-platform/packages/cli/internal/app/update"
	"github.com/gemini/developer-platform/packages/cli/internal/debug"
)

func stageUpdateInBackground(ctx context.Context, release *githubRelease, version string) {
	assetName := appupdate.GetAssetNameForVersion(version)
	var assetURL, checksumURL string

	for _, asset := range release.Assets {
		if asset.Name == assetName {
			assetURL = asset.BrowserDownloadURL
		}
		if asset.Name == "checksums.txt" {
			checksumURL = asset.BrowserDownloadURL
		}
	}

	if assetURL == "" || checksumURL == "" {
		debug.Log("no suitable release asset found for staging")
		return
	}

	checksums, err := fetchChecksums(ctx, checksumURL)
	if err != nil {
		debug.Log("failed to fetch checksums for staging: %v", err)
		return
	}

	expectedChecksum, ok := checksums[assetName]
	if !ok {
		debug.Log("no checksum found for %s", assetName)
		return
	}

	debug.Log("downloading update v%s in background", version)

	tmpFile, err := downloadAsset(ctx, assetURL)
	if err != nil {
		debug.Log("background download failed: %v", err)
		return
	}
	defer func() { _ = os.Remove(tmpFile) }()

	if err := appupdate.VerifyChecksum(tmpFile, expectedChecksum); err != nil {
		debug.Log("background download checksum mismatch: %v", err)
		return
	}

	var binaryData []byte
	if strings.HasSuffix(assetName, ".zip") {
		binaryData, err = appupdate.ExtractFromZip(tmpFile, "gemini-markets.exe")
	} else {
		binaryData, err = appupdate.ExtractFromTarGz(tmpFile, "gemini-markets")
	}
	if err != nil {
		debug.Log("failed to extract binary: %v", err)
		return
	}

	if err := appupdate.StageBinary(binaryData, version); err != nil {
		debug.Log("failed to stage binary: %v", err)
		return
	}

	debug.Log("update v%s staged for next run", version)
}
