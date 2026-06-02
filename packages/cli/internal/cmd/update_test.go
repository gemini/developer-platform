package cmd

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	appupdate "github.com/gemini/developer-platform/packages/cli/internal/app/update"
)

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		{"1.0.0", "1.0.0", 0},
		{"1.0.1", "1.0.0", 1},
		{"1.0.0", "1.0.1", -1},
		{"2.0.0", "1.9.9", 1},
		{"1.9.9", "2.0.0", -1},
		{"1.10.0", "1.9.0", 1},
		{"0.0.1", "0.0.0", 1},
		{"10.0.0", "9.0.0", 1},
		{"1.0.0-beta", "1.0.0", 0}, // prerelease stripped
	}

	for _, tt := range tests {
		t.Run(tt.a+"_vs_"+tt.b, func(t *testing.T) {
			got := compareVersions(tt.a, tt.b)
			if got != tt.want {
				t.Errorf("compareVersions(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestParseVersion(t *testing.T) {
	tests := []struct {
		input string
		want  [3]int
	}{
		{"1.2.3", [3]int{1, 2, 3}},
		{"v1.2.3", [3]int{1, 2, 3}},
		{"0.0.1", [3]int{0, 0, 1}},
		{"10.20.30", [3]int{10, 20, 30}},
		{"1.0.0-beta.1", [3]int{1, 0, 0}},
		{"", [3]int{0, 0, 0}},
		{"invalid", [3]int{0, 0, 0}},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := parseVersion(tt.input)
			if got != tt.want {
				t.Errorf("parseVersion(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestNormalizeVersion(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"1.0.0", "1.0.0"},
		{"v1.0.0", "1.0.0"},
		{"", "0.0.0"},
		{"dev", "0.0.0"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := normalizeVersion(tt.input)
			if got != tt.want {
				t.Errorf("normalizeVersion(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestGetAssetName(t *testing.T) {
	name := getAssetName()
	if name == "" {
		t.Error("getAssetName() returned empty string")
	}
	// Should contain platform info
	if len(name) < 10 {
		t.Errorf("getAssetName() = %q, expected longer name", name)
	}
}

func TestVerifyChecksum(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "testfile")
	content := []byte("test content for checksum")

	if err := os.WriteFile(testFile, content, 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	h := sha256.New()
	h.Write(content)
	correctChecksum := hex.EncodeToString(h.Sum(nil))

	t.Run("correct checksum", func(t *testing.T) {
		err := appupdate.VerifyChecksum(testFile, correctChecksum)
		if err != nil {
			t.Errorf("verifyChecksum() with correct checksum failed: %v", err)
		}
	})

	t.Run("incorrect checksum", func(t *testing.T) {
		err := appupdate.VerifyChecksum(testFile, "0000000000000000000000000000000000000000000000000000000000000000")
		if err == nil {
			t.Error("verifyChecksum() with incorrect checksum should fail")
		}
	})

	t.Run("missing file", func(t *testing.T) {
		err := appupdate.VerifyChecksum("/nonexistent/file", correctChecksum)
		if err == nil {
			t.Error("verifyChecksum() with missing file should fail")
		}
	})
}

func setTempConfigDir(t *testing.T) {
	t.Helper()
	tmpDir := t.TempDir()
	t.Setenv("HOME", tmpDir)
	t.Setenv("USERPROFILE", tmpDir)
	t.Setenv("APPDATA", filepath.Join(tmpDir, "AppData", "Roaming"))
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(tmpDir, ".config"))
}

func TestUpdateCache(t *testing.T) {
	setTempConfigDir(t)

	// Test that loading non-existent cache returns error
	_, err := loadUpdateCache()
	if err == nil {
		t.Error("loadUpdateCache() should fail when cache doesn't exist")
	}
}

func TestPendingUpdate(t *testing.T) {
	setTempConfigDir(t)

	// Test that loading non-existent pending update returns error
	_, err := appupdate.LoadPendingUpdate()
	if err == nil {
		t.Error("loadPendingUpdate() should fail when file doesn't exist")
	}

	// Test save and load
	pending := &appupdate.PendingUpdate{
		Version:      "1.2.3",
		BinaryPath:   "/path/to/binary",
		Checksum:     "abc123",
		DownloadedAt: "2024-01-01T00:00:00Z",
	}

	if err := appupdate.SavePendingUpdate(pending); err != nil {
		t.Fatalf("savePendingUpdate() failed: %v", err)
	}

	loaded, err := appupdate.LoadPendingUpdate()
	if err != nil {
		t.Fatalf("loadPendingUpdate() failed: %v", err)
	}

	if loaded.Version != pending.Version {
		t.Errorf("Version = %q, want %q", loaded.Version, pending.Version)
	}
	if loaded.BinaryPath != pending.BinaryPath {
		t.Errorf("BinaryPath = %q, want %q", loaded.BinaryPath, pending.BinaryPath)
	}
	if loaded.Checksum != pending.Checksum {
		t.Errorf("Checksum = %q, want %q", loaded.Checksum, pending.Checksum)
	}

	// Test clear
	appupdate.ClearPendingUpdate()
	_, err = appupdate.LoadPendingUpdate()
	if err == nil {
		t.Error("loadPendingUpdate() should fail after clearPendingUpdate()")
	}
}
