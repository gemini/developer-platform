package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"syscall"

	"github.com/99designs/keyring"
	"golang.org/x/term"
)

const (
	serviceName         = "gemini-markets-cli"
	credentialKey       = "api-credentials"
	legacyOAuthTokenKey = "oauth-tokens" // #nosec G101 -- keyring item name, not a credential.
)

// keyringCache holds the opened keyring for the lifetime of the process so
// that file-backend users are only prompted for their password once per command.
var (
	keyringCache     keyring.Keyring
	keyringCacheErr  error
	keyringCacheOnce sync.Once
)

// StoredCredentials contains credentials stored in the OS keychain.
type StoredCredentials struct {
	APIKey    string `json:"api_key"`
	APISecret string `json:"api_secret"`
}

// getKeyring opens the appropriate keyring backend for the current OS.
// The result is cached for the process lifetime so the file backend only
// prompts for a password once per command invocation.
func getKeyring() (keyring.Keyring, error) {
	keyringCacheOnce.Do(func() {
		keyringCache, keyringCacheErr = openKeyring()
	})
	return keyringCache, keyringCacheErr
}

func openKeyring() (keyring.Keyring, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = filepath.Join(os.Getenv("HOME"), ".config")
	}

	// Try platform-specific backend first without file fallback.
	// This avoids password prompts when system keychain fails.
	ring, err := keyring.Open(keyring.Config{
		ServiceName: serviceName,

		// macOS Keychain
		KeychainName:             "login",
		KeychainTrustApplication: true,

		AllowedBackends: []keyring.BackendType{
			keyring.KeychainBackend,      // macOS
			keyring.WinCredBackend,       // Windows
			keyring.SecretServiceBackend, // Linux (GNOME Keyring, KWallet)
			keyring.PassBackend,          // Linux pass
		},
	})
	if err == nil {
		return ring, nil
	}

	// Fall back to encrypted file only if explicitly requested.
	if os.Getenv("GEMINI_USE_FILE_KEYRING") != "" {
		return keyring.Open(keyring.Config{
			ServiceName:      serviceName,
			FileDir:          filepath.Join(configDir, "gemini", "keyring"),
			FilePasswordFunc: filePasswordPrompt,
			AllowedBackends: []keyring.BackendType{
				keyring.FileBackend,
			},
		})
	}

	return nil, fmt.Errorf("no system keychain available (set GEMINI_USE_FILE_KEYRING=1 to use encrypted file)")
}

func filePasswordPrompt(prompt string) (string, error) {
	fmt.Fprint(os.Stderr, "Enter keyring password: ")

	// Use secure password input if terminal is available
	if term.IsTerminal(int(syscall.Stdin)) { //nolint:unconvert // required for Windows
		passwordBytes, err := term.ReadPassword(int(syscall.Stdin)) //nolint:unconvert
		fmt.Fprintln(os.Stderr)                                     // newline after hidden input
		if err != nil {
			return "", err
		}
		return string(passwordBytes), nil
	}

	// Fallback for non-interactive (piped input)
	var password string
	_, err := fmt.Scanln(&password)
	return password, err
}

// Generic keyring operations that both API key and OAuth token storage use.

func saveKeyringItem(key, label, description string, data []byte) error {
	ring, err := getKeyring()
	if err != nil {
		return fmt.Errorf("failed to open keyring: %w", err)
	}
	if err := ring.Set(keyring.Item{Key: key, Label: label, Description: description, Data: data}); err != nil {
		return fmt.Errorf("failed to save to keyring: %w", err)
	}
	return nil
}

func loadKeyringItem(key string) ([]byte, error) {
	ring, err := getKeyring()
	if err != nil {
		return nil, fmt.Errorf("failed to open keyring: %w", err)
	}
	item, err := ring.Get(key)
	if err != nil {
		if errors.Is(err, keyring.ErrKeyNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to read from keyring: %w", err)
	}
	return item.Data, nil
}

func deleteKeyringItem(key string) error {
	ring, err := getKeyring()
	if err != nil {
		return fmt.Errorf("failed to open keyring: %w", err)
	}
	err = ring.Remove(key)
	if err != nil && !errors.Is(err, keyring.ErrKeyNotFound) {
		return fmt.Errorf("failed to delete from keyring: %w", err)
	}
	return nil
}

// SaveToKeyring stores API credentials in the OS keychain.
func SaveToKeyring(apiKey, apiSecret string) error {
	creds := StoredCredentials{APIKey: apiKey, APISecret: apiSecret}
	data, err := json.Marshal(creds)
	if err != nil {
		return fmt.Errorf("failed to marshal credentials: %w", err)
	}
	return saveKeyringItem(credentialKey, "Gemini API Credentials", "API credentials for Gemini Markets CLI", data)
}

// LoadFromKeyring retrieves API credentials from the OS keychain.
func LoadFromKeyring() (*StoredCredentials, error) {
	data, err := loadKeyringItem(credentialKey)
	if err != nil || data == nil {
		return nil, err
	}
	var creds StoredCredentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return nil, fmt.Errorf("failed to parse credentials: %w", err)
	}
	return &creds, nil
}

// DeleteFromKeyring removes API credentials from the OS keychain.
func DeleteFromKeyring() error {
	return deleteKeyringItem(credentialKey)
}

func oauthTokenKey(env string) string {
	if env == "sandbox" {
		return "oauth-tokens-sandbox"
	}
	return "oauth-tokens-production"
}

// SaveOAuthTokens stores OAuth tokens in the OS keychain for a specific environment.
func SaveOAuthTokens(env string, data []byte) error {
	label := "Gemini OAuth Tokens (" + env + ")"
	description := "OAuth tokens for Gemini Markets CLI (" + env + ")"
	return saveKeyringItem(oauthTokenKey(env), label, description, data)
}

// LoadOAuthTokens retrieves OAuth tokens from the OS keychain for a specific environment.
// It falls back to the legacy shared key only when the stored token metadata matches the requested environment.
func LoadOAuthTokens(env string) ([]byte, error) {
	data, err := loadKeyringItem(oauthTokenKey(env))
	if err != nil || data != nil {
		return data, err
	}

	legacy, err := loadKeyringItem(legacyOAuthTokenKey)
	if err != nil || legacy == nil {
		return legacy, err
	}

	var meta struct {
		Environment string `json:"environment"`
	}
	if err := json.Unmarshal(legacy, &meta); err != nil {
		return nil, fmt.Errorf("failed to parse legacy OAuth token metadata: %w", err)
	}
	if meta.Environment != env {
		return nil, nil
	}

	return legacy, nil
}

// DeleteOAuthTokens removes OAuth tokens from the OS keychain for a specific environment.
func DeleteOAuthTokens(env string) error {
	return deleteKeyringItem(oauthTokenKey(env))
}

// KeyringBackendName returns a human-readable name for the active keyring backend.
func KeyringBackendName() string {
	ring, err := getKeyring()
	if err != nil {
		return "unknown"
	}

	// The keyring package doesn't expose backend name directly,
	// so we infer from the system
	switch {
	case fileExists("/usr/bin/security"): // macOS
		return "macOS Keychain"
	case os.Getenv("WSLENV") != "" || fileExists("C:\\Windows"):
		return "Windows Credential Manager"
	case os.Getenv("DBUS_SESSION_BUS_ADDRESS") != "":
		return "Secret Service (GNOME Keyring/KWallet)"
	default:
		_ = ring // silence unused warning
		return "encrypted file"
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
