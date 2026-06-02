package update

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/gemini/developer-platform/packages/cli/internal/debug"
)

const (
	pendingUpdateFile = "pending-update.json"
	updatesDirName    = "updates"
)

type PendingUpdate struct {
	Version      string `json:"version"`
	BinaryPath   string `json:"binaryPath"`
	Checksum     string `json:"checksum"`
	DownloadedAt string `json:"downloadedAt"`
}

func GetPendingUpdatePath() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = filepath.Join(os.Getenv("HOME"), ".config")
	}
	return filepath.Join(configDir, "gemini", pendingUpdateFile)
}

func GetStagedBinaryDir() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = filepath.Join(os.Getenv("HOME"), ".config")
	}
	return filepath.Join(configDir, "gemini", updatesDirName)
}

func LoadPendingUpdate() (*PendingUpdate, error) {
	data, err := os.ReadFile(GetPendingUpdatePath())
	if err != nil {
		return nil, err
	}
	var pending PendingUpdate
	if err := json.Unmarshal(data, &pending); err != nil {
		return nil, err
	}
	return &pending, nil
}

func SavePendingUpdate(pending *PendingUpdate) error {
	path := GetPendingUpdatePath()
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(pending)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func ClearPendingUpdate() {
	_ = os.Remove(GetPendingUpdatePath())
}

func ApplyPendingUpdate() bool {
	pending, err := LoadPendingUpdate()
	if err != nil {
		return false
	}

	if _, err := os.Stat(pending.BinaryPath); os.IsNotExist(err) {
		ClearPendingUpdate()
		return false
	}

	if err := VerifyChecksum(pending.BinaryPath, pending.Checksum); err != nil {
		debug.Log("staged update checksum mismatch, removing: %v", err)
		_ = os.Remove(pending.BinaryPath)
		ClearPendingUpdate()
		return false
	}

	exe, err := os.Executable()
	if err != nil {
		debug.Log("failed to get executable path: %v", err)
		return false
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		debug.Log("failed to resolve executable path: %v", err)
		return false
	}

	backupPath := exe + ".bak"
	_ = os.Remove(backupPath)

	if err := os.Rename(exe, backupPath); err != nil {
		debug.Log("failed to backup current binary: %v", err)
		return false
	}

	restoreBackup := func(reason string, cause error) bool {
		if renameErr := os.Rename(backupPath, exe); renameErr != nil {
			debug.Log("failed to restore backup after %s: %v", reason, renameErr)
		}
		debug.Log("failed during %s: %v", reason, cause)
		return false
	}

	stagedBinary, err := os.ReadFile(pending.BinaryPath)
	if err != nil {
		return restoreBackup("read staged binary", err)
	}

	if err := os.WriteFile(exe, stagedBinary, 0o600); err != nil {
		return restoreBackup("write new binary", err)
	}
	if err := os.Chmod(exe, 0o755); err != nil {
		return restoreBackup("set executable permissions", err)
	}

	_ = os.Remove(backupPath)
	_ = os.Remove(pending.BinaryPath)
	ClearPendingUpdate()

	if !debug.IsQuiet() {
		fmt.Fprintf(os.Stderr, "Updated to v%s\n", pending.Version)
	}

	return true
}

func ReExecAfterUpdate() {
	exe, err := os.Executable()
	if err != nil {
		return
	}

	if runtime.GOOS == "windows" {
		debug.Log("re-exec not supported on Windows, please re-run command")
		return
	}

	if !filepath.IsAbs(exe) {
		debug.Log("re-exec skipped: executable path is not absolute: %s", exe)
		return
	}
	// nosemgrep: go.lang.security.audit.dangerous-syscall-exec.dangerous-syscall-exec
	// exe is the current process binary from os.Executable(), not user input.
	if execErr := syscall.Exec(exe, os.Args, os.Environ()); execErr != nil {
		debug.Log("re-exec failed: %v", execErr)
	}
}

func StageBinary(binaryData []byte, version string) error {
	stageDir := GetStagedBinaryDir()
	if err := os.MkdirAll(stageDir, 0o700); err != nil {
		return err
	}

	binaryName := "gemini-markets"
	if runtime.GOOS == "windows" {
		binaryName = "gemini-markets.exe"
	}
	stagedPath := filepath.Join(stageDir, binaryName+"-"+version)

	if err := os.WriteFile(stagedPath, binaryData, 0o600); err != nil {
		return err
	}
	if err := os.Chmod(stagedPath, 0o755); err != nil {
		_ = os.Remove(stagedPath)
		return err
	}

	h := sha256.New()
	_, _ = h.Write(binaryData)
	binaryChecksum := hex.EncodeToString(h.Sum(nil))

	if err := SavePendingUpdate(&PendingUpdate{
		Version:      version,
		BinaryPath:   stagedPath,
		Checksum:     binaryChecksum,
		DownloadedAt: time.Now().Format(time.RFC3339),
	}); err != nil {
		_ = os.Remove(stagedPath)
		return err
	}

	return nil
}

func InstallUpdate(archivePath, targetPath, assetName string) error {
	var (
		binaryData []byte
		err        error
	)

	if strings.HasSuffix(assetName, ".zip") {
		binaryData, err = ExtractFromZip(archivePath, "gemini-markets.exe")
	} else {
		binaryData, err = ExtractFromTarGz(archivePath, "gemini-markets")
	}
	if err != nil {
		return err
	}

	tmpBinary, err := os.CreateTemp(filepath.Dir(targetPath), "gemini-markets-new-*")
	if err != nil {
		return err
	}
	tmpBinaryPath := tmpBinary.Name()

	if _, err := tmpBinary.Write(binaryData); err != nil {
		_ = tmpBinary.Close()
		_ = os.Remove(tmpBinaryPath)
		return err
	}
	_ = tmpBinary.Close()

	if err := os.Chmod(tmpBinaryPath, 0o755); err != nil {
		_ = os.Remove(tmpBinaryPath)
		return err
	}

	backupPath := targetPath + ".bak"
	_ = os.Remove(backupPath)

	if err := os.Rename(targetPath, backupPath); err != nil {
		_ = os.Remove(tmpBinaryPath)
		return fmt.Errorf("failed to backup current binary: %w", err)
	}

	if err := os.Rename(tmpBinaryPath, targetPath); err != nil {
		if renameErr := os.Rename(backupPath, targetPath); renameErr != nil {
			debug.Log("failed to restore backup after install error: %v", renameErr)
		}
		return fmt.Errorf("failed to install new binary: %w", err)
	}

	_ = os.Remove(backupPath)
	return nil
}

func VerifyChecksum(filePath, expectedChecksum string) error {
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}

	actualChecksum := hex.EncodeToString(h.Sum(nil))
	if actualChecksum != expectedChecksum {
		return fmt.Errorf("checksum mismatch: expected %s, got %s", expectedChecksum, actualChecksum)
	}

	return nil
}

func ExtractFromTarGz(archivePath, binaryName string) ([]byte, error) {
	f, err := os.Open(archivePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	gzr, err := gzip.NewReader(f)
	if err != nil {
		return nil, err
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}

		if header.Typeflag == tar.TypeReg && filepath.Base(header.Name) == binaryName {
			return io.ReadAll(tr)
		}
	}

	return nil, fmt.Errorf("binary %s not found in archive", binaryName)
}

func ExtractFromZip(archivePath, binaryName string) ([]byte, error) {
	r, err := zip.OpenReader(archivePath)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	for _, f := range r.File {
		if filepath.Base(f.Name) != binaryName {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		data, readErr := io.ReadAll(rc)
		_ = rc.Close()
		return data, readErr
	}

	return nil, fmt.Errorf("binary %s not found in archive", binaryName)
}

func GetAssetNameForVersion(version string) string {
	ext := "tar.gz"
	if runtime.GOOS == "windows" {
		ext = "zip"
	}
	return fmt.Sprintf("gemini-markets_%s_%s_%s.%s", version, runtime.GOOS, runtime.GOARCH, ext)
}
