package credentials

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// FileKeyring is a small persistence implementation for environments without
// an OS keychain. It writes a 0600 JSON file and uses an atomic rename. Users
// that need hardware-backed or desktop keychain protection can inject a
// Keyring implementation instead.
type FileKeyring struct {
	path string
	mu   sync.Mutex
}

// NewFileKeyring creates a file-backed keyring at path. It does not create or
// touch the path until Set is called.
func NewFileKeyring(path string) (*FileKeyring, error) {
	if path == "" {
		return nil, errors.New("keyring path is required")
	}
	return &FileKeyring{path: path}, nil
}

type fileData struct {
	Profiles map[string]Credentials `json:"profiles"`
}

func (k *FileKeyring) Get(ctx context.Context, profile string) (Credentials, error) {
	if err := contextErr(ctx); err != nil {
		return Credentials{}, err
	}
	profile = normalizeProfile(profile)
	k.mu.Lock()
	defer k.mu.Unlock()
	data, err := k.readLocked()
	if err != nil {
		return Credentials{}, err
	}
	value, ok := data.Profiles[profile]
	if !ok {
		return Credentials{}, ErrNotFound
	}
	return value.normalized(), nil
}

func (k *FileKeyring) Set(ctx context.Context, profile string, value Credentials) error {
	if err := contextErr(ctx); err != nil {
		return err
	}
	profile = normalizeProfile(profile)
	k.mu.Lock()
	defer k.mu.Unlock()
	data, err := k.readLocked()
	if err != nil && !errors.Is(err, ErrNotFound) {
		return err
	}
	if data.Profiles == nil {
		data.Profiles = make(map[string]Credentials)
	}
	data.Profiles[profile] = value.normalized()
	return k.writeLocked(data)
}

func (k *FileKeyring) Delete(ctx context.Context, profile string) error {
	if err := contextErr(ctx); err != nil {
		return err
	}
	profile = normalizeProfile(profile)
	k.mu.Lock()
	defer k.mu.Unlock()
	data, err := k.readLocked()
	if err != nil {
		return err
	}
	if _, ok := data.Profiles[profile]; !ok {
		return ErrNotFound
	}
	delete(data.Profiles, profile)
	return k.writeLocked(data)
}

func (k *FileKeyring) readLocked() (fileData, error) {
	contents, err := os.ReadFile(k.path)
	if errors.Is(err, os.ErrNotExist) {
		return fileData{}, ErrNotFound
	}
	if err != nil {
		return fileData{}, fmt.Errorf("read keyring: %w", err)
	}
	var data fileData
	if err := json.Unmarshal(contents, &data); err != nil {
		return fileData{}, fmt.Errorf("decode keyring: %w", err)
	}
	if data.Profiles == nil {
		data.Profiles = make(map[string]Credentials)
	}
	return data, nil
}

func (k *FileKeyring) writeLocked(data fileData) error {
	if err := os.MkdirAll(filepath.Dir(k.path), 0o700); err != nil {
		return fmt.Errorf("create keyring directory: %w", err)
	}
	contents, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("encode keyring: %w", err)
	}
	temporary, err := os.CreateTemp(filepath.Dir(k.path), ".gemini-keyring-*")
	if err != nil {
		return fmt.Errorf("create keyring temporary file: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("protect keyring temporary file: %w", err)
	}
	if _, err := temporary.Write(contents); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("write keyring: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close keyring temporary file: %w", err)
	}
	if err := os.Rename(temporaryPath, k.path); err != nil {
		return fmt.Errorf("replace keyring: %w", err)
	}
	return nil
}

func contextErr(ctx context.Context) error {
	if ctx == nil {
		return nil
	}
	return ctx.Err()
}

func normalizeProfile(profile string) string {
	if profile == "" {
		return "default"
	}
	return profile
}
