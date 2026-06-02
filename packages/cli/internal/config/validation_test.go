package config

import (
	"testing"
)

func TestValidateConfig(t *testing.T) {
	tests := []struct {
		name    string
		config  *Config
		wantErr bool
	}{
		{
			name: "valid config",
			config: &Config{
				APIKey:      "account-abc123456789",
				APISecret:   "secret123456789",
				Environment: "production",
			},
			wantErr: false,
		},
		{
			name: "missing api key",
			config: &Config{
				APISecret:   "secret123456789",
				Environment: "production",
			},
			wantErr: true,
		},
		{
			name: "missing api secret",
			config: &Config{
				APIKey:      "account-abc123456789",
				Environment: "production",
			},
			wantErr: true,
		},
		{
			name: "api key too short",
			config: &Config{
				APIKey:    "abc",
				APISecret: "secret123456789",
			},
			wantErr: true,
		},
		{
			name: "api secret too short",
			config: &Config{
				APIKey:    "account-abc123456789",
				APISecret: "short",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateConfig(tt.config)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateConfig() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestIsAuthenticated(t *testing.T) {
	tests := []struct {
		name   string
		config *Config
		want   bool
	}{
		{
			name: "authenticated",
			config: &Config{
				APIKey:    "test-key",
				APISecret: "test-secret",
			},
			want: true,
		},
		{
			name: "missing key",
			config: &Config{
				APISecret: "test-secret",
			},
			want: false,
		},
		{
			name: "missing secret",
			config: &Config{
				APIKey: "test-key",
			},
			want: false,
		},
		{
			name:   "empty config",
			config: &Config{},
			want:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.config.IsAuthenticated(); got != tt.want {
				t.Errorf("IsAuthenticated() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGetCredentialSource(t *testing.T) {
	// Just verify it returns a string without panicking
	source := GetCredentialSource()
	if source == "" {
		t.Error("GetCredentialSource() returned empty string")
	}
}

func TestValidateCredentials(t *testing.T) {
	tests := []struct {
		name    string
		config  *Config
		wantErr bool
	}{
		{
			name: "valid credentials",
			config: &Config{
				APIKey:    "account-abc123",
				APISecret: "secret12345",
			},
			wantErr: false,
		},
		{
			name: "api key too short",
			config: &Config{
				APIKey:    "short",
				APISecret: "secret12345",
			},
			wantErr: true,
		},
		{
			name: "api secret too short",
			config: &Config{
				APIKey:    "account-abc123",
				APISecret: "short",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateCredentials(tt.config)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateCredentials() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
