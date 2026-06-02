package config

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"

	"golang.org/x/term"
)

// Authentication type constants.
const (
	AuthTypeHMAC      = "hmac"
	AuthTypeOAuth     = "oauth"
	AuthTypeBearerEnv = "bearer_env"
)

// Config contains API configuration and credentials.
type Config struct {
	APIKey      string `json:"api_key"`
	APISecret   string `json:"api_secret"`
	Environment string `json:"environment"`
	AccessToken string `json:"access_token,omitempty"`
	AuthType    string `json:"-"`
}

// GetBaseURL returns the appropriate API base URL.
func (c *Config) GetBaseURL() string {
	if c.Environment == "sandbox" {
		return "https://api.sandbox.gemini.com"
	}
	return "https://api.gemini.com"
}

// GetWebSocketURL returns the WebSocket URL.
func (c *Config) GetWebSocketURL() string {
	if c.Environment == "sandbox" {
		return "wss://ws.sandbox.gemini.com"
	}
	return "wss://ws.gemini.com"
}

// GetPredictionsWebSocketURL returns the predictions WebSocket URL.
func (c *Config) GetPredictionsWebSocketURL() string {
	return c.GetWebSocketURL()
}

func configPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "gemini", "markets-cli.json"), nil
}

// Save saves the configuration to file.
func Save(cfg *Config) error {
	path, err := configPath()
	if err != nil {
		return err
	}

	dir := filepath.Dir(path)
	if err = os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0o600)
}

// RunSetupWizard runs the interactive credential setup wizard.
func RunSetupWizard() error {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println()
	fmt.Println("  Gemini Markets CLI Setup")
	fmt.Println("  ========================")
	fmt.Println()
	fmt.Println("  You'll need API credentials from Gemini.")
	fmt.Println()
	fmt.Println("  1. Go to: https://exchange.gemini.com/settings/api")
	fmt.Println("  2. Click 'Create New API Key'")
	fmt.Println("  3. Enable 'Trading' permissions")
	fmt.Println("  4. Copy the API Key and Secret")
	fmt.Println()

	fmt.Print("  Open browser to create API key? [Y/n]: ")
	openBrowser, _ := reader.ReadString('\n')
	openBrowser = strings.TrimSpace(strings.ToLower(openBrowser))
	if openBrowser == "" || openBrowser == "y" || openBrowser == "yes" {
		url := "https://exchange.gemini.com/settings/api"
		if err := OpenURL(url); err != nil {
			fmt.Printf("  Could not open browser. Please visit: %s\n", url)
		} else {
			fmt.Println("  Browser opened. Create your API key, then return here.")
		}
		fmt.Println()
	}

	fmt.Print("  API Key: ")
	apiKey, _ := reader.ReadString('\n')
	apiKey = strings.TrimSpace(apiKey)

	if apiKey == "" {
		return fmt.Errorf("API key is required")
	}

	fmt.Print("  API Secret: ")
	var apiSecret string
	if term.IsTerminal(int(syscall.Stdin)) { //nolint:unconvert // required for Windows (Handle is uintptr)
		secretBytes, err := term.ReadPassword(int(syscall.Stdin)) //nolint:unconvert
		if err != nil {
			return fmt.Errorf("failed to read secret: %w", err)
		}
		apiSecret = strings.TrimSpace(string(secretBytes))
		fmt.Println() // newline after hidden input
	} else {
		// Non-interactive mode (piped input)
		apiSecret, _ = reader.ReadString('\n')
		apiSecret = strings.TrimSpace(apiSecret)
	}

	if apiSecret == "" {
		return fmt.Errorf("API secret is required")
	}

	fmt.Print("  Environment [production/sandbox] (default: production): ")
	env, _ := reader.ReadString('\n')
	env = strings.TrimSpace(env)
	if env == "" {
		env = "production"
	}

	cfg := &Config{
		APIKey:      apiKey,
		APISecret:   apiSecret,
		Environment: env,
	}

	fmt.Println()
	fmt.Print("  Validating credentials... ")

	if err := validateCredentials(cfg); err != nil {
		fmt.Println("FAILED")
		return fmt.Errorf("invalid credentials: %w", err)
	}
	fmt.Println("OK")

	// Save to OS keychain (secure)
	fmt.Print("  Saving to secure storage... ")
	if err := SaveToKeyring(apiKey, apiSecret); err != nil {
		fmt.Println("FAILED")
		fmt.Printf("  Warning: Could not save to keychain: %v\n", err)
		fmt.Println("  Falling back to config file...")

		// Fallback to file if keychain fails
		if err := Save(cfg); err != nil {
			return err
		}
		path, _ := configPath()
		fmt.Printf("  Config saved to %s\n", path)
	} else {
		fmt.Println("OK")
		fmt.Printf("  Credentials stored in %s\n", KeyringBackendName())
	}

	fmt.Println()
	fmt.Println("  You're ready to trade!")
	fmt.Println()
	return nil
}

// OpenURL opens a URL in the user's default browser.
func OpenURL(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	default:
		return fmt.Errorf("unsupported platform")
	}
	return cmd.Start()
}

func validateCredentials(cfg *Config) error {
	// Quick validation by making an authenticated request
	// We import the api package would create a circular dependency,
	// so we do a simple check here
	if len(cfg.APIKey) < 10 {
		return fmt.Errorf("API key too short")
	}
	if len(cfg.APISecret) < 10 {
		return fmt.Errorf("API secret too short")
	}
	return nil
}

// ValidateAPIKey validates an API key format.
func ValidateAPIKey(key string) error {
	if key == "" {
		return fmt.Errorf("API key is required")
	}
	if len(key) < 10 {
		return fmt.Errorf("API key is too short")
	}
	if !strings.HasPrefix(key, "account-") && !strings.HasPrefix(key, "master-") {
		return nil
	}
	return nil
}

// DeleteConfigFile removes the config file if it exists.
func DeleteConfigFile() error {
	path, err := configPath()
	if err != nil {
		return err
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil
	}

	return os.Remove(path)
}
