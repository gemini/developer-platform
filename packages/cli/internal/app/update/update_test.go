package update

import (
	"os"
	"path/filepath"
	"testing"
)

func setTempConfigDir(t *testing.T) {
	t.Helper()
	tmpDir := t.TempDir()
	t.Setenv("HOME", tmpDir)
	t.Setenv("USERPROFILE", tmpDir)
	t.Setenv("APPDATA", filepath.Join(tmpDir, "AppData", "Roaming"))
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(tmpDir, ".config"))
}

func TestPendingUpdatePersistence(t *testing.T) {
	setTempConfigDir(t)

	_, err := LoadPendingUpdate()
	if err == nil {
		t.Fatal("LoadPendingUpdate() should fail when no pending update exists")
	}

	pending := &PendingUpdate{
		Version:      "1.2.3",
		BinaryPath:   "/tmp/gemini-markets",
		Checksum:     "abc123",
		DownloadedAt: "2024-01-01T00:00:00Z",
	}
	if err := SavePendingUpdate(pending); err != nil {
		t.Fatalf("SavePendingUpdate() error = %v", err)
	}

	got, err := LoadPendingUpdate()
	if err != nil {
		t.Fatalf("LoadPendingUpdate() error = %v", err)
	}
	if got.Version != pending.Version || got.BinaryPath != pending.BinaryPath || got.Checksum != pending.Checksum {
		t.Fatalf("LoadPendingUpdate() = %#v, want %#v", got, pending)
	}

	ClearPendingUpdate()
	if _, err := LoadPendingUpdate(); err == nil {
		t.Fatal("LoadPendingUpdate() should fail after ClearPendingUpdate()")
	}
}

func TestStageBinaryCreatesPendingUpdate(t *testing.T) {
	setTempConfigDir(t)

	if err := StageBinary([]byte("binary"), "9.9.9"); err != nil {
		t.Fatalf("StageBinary() error = %v", err)
	}

	pending, err := LoadPendingUpdate()
	if err != nil {
		t.Fatalf("LoadPendingUpdate() error = %v", err)
	}
	if pending.Version != "9.9.9" {
		t.Fatalf("Version = %s, want 9.9.9", pending.Version)
	}
	if _, err := os.Stat(pending.BinaryPath); err != nil {
		t.Fatalf("expected staged binary at %s: %v", pending.BinaryPath, err)
	}
}
