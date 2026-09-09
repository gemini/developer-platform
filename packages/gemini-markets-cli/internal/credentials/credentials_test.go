package credentials

import (
	"context"
	"errors"
	"testing"
)

type mapEnv map[string]string

func (e mapEnv) LookupEnv(key string) (string, bool) {
	value, ok := e[key]
	return value, ok
}

type testKeyring struct {
	value Credentials
	err   error
}

func (k testKeyring) Get(context.Context, string) (Credentials, error) { return k.value, k.err }
func (testKeyring) Set(context.Context, string, Credentials) error     { return nil }
func (testKeyring) Delete(context.Context, string) error               { return nil }

func TestLoadPrecedence(t *testing.T) {
	got, err := Load(context.Background(), LoadOptions{
		Profile: "work",
		Keyring: testKeyring{value: Credentials{
			APIKey: "keyring-key", APISecret: "keyring-secret", AccessToken: "keyring-token",
		}},
		Env: mapEnv{
			"GEMINI_API_KEY":      " env-key ",
			"GEMINI_ACCESS_TOKEN": "env-token",
		},
		Explicit: Credentials{APISecret: "explicit-secret"},
	})
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	want := Credentials{AccessToken: "env-token"}
	if got != want {
		t.Fatalf("Load() = %#v, want %#v", got, want)
	}
}

func TestLoadWithOriginReportsSelectedCredentialSource(t *testing.T) {
	value, origin, err := LoadWithOrigin(context.Background(), LoadOptions{
		Env:     mapEnv{"GEMINI_ACCESS_TOKEN": "env-token"},
		Keyring: testKeyring{value: Credentials{APIKey: "stored-key", APISecret: "stored-secret"}},
	})
	if err != nil {
		t.Fatalf("LoadWithOrigin() error = %v", err)
	}
	if origin != OriginEnvironment || value.AccessToken != "env-token" {
		t.Fatalf("LoadWithOrigin() = %#v, %q; want environment token", value, origin)
	}

	value, origin, err = LoadWithOrigin(context.Background(), LoadOptions{
		Env:     mapEnv{},
		Keyring: testKeyring{value: Credentials{APIKey: "stored-key", APISecret: "stored-secret"}},
	})
	if err != nil {
		t.Fatalf("LoadWithOrigin() keyring error = %v", err)
	}
	if origin != OriginKeyring || value.APIKey != "stored-key" {
		t.Fatalf("LoadWithOrigin() = %#v, %q; want keyring credentials", value, origin)
	}
}

func TestLoadTreatsNewDefaultKeyringAsOptional(t *testing.T) {
	value, origin, err := LoadWithOrigin(context.Background(), LoadOptions{
		Env:     mapEnv{},
		Keyring: &lazyOSKeyring{err: ErrUnavailable},
	})
	if err != nil || !value.Empty() || origin != OriginNone {
		t.Fatalf("LoadWithOrigin() = %#v, %q, %v; want empty optional keyring result", value, origin, err)
	}
}

func TestLoadSelectsCompleteFamilyWithoutMergingSources(t *testing.T) {
	tests := []struct {
		name     string
		explicit Credentials
		env      mapEnv
		keyring  Credentials
		want     Credentials
	}{
		{
			name:     "explicit HMAC wins over lower OAuth",
			explicit: Credentials{APIKey: "explicit-key", APISecret: "explicit-secret"},
			env:      mapEnv{"GEMINI_ACCESS_TOKEN": "env-token", "GEMINI_REFRESH_TOKEN": "env-refresh", "GEMINI_OAUTH_CLIENT_ID": "env-client"},
			keyring:  Credentials{APIKey: "stored-key", APISecret: "stored-secret"},
			want:     Credentials{APIKey: "explicit-key", APISecret: "explicit-secret"},
		},
		{
			name:     "incomplete explicit HMAC does not borrow secret",
			explicit: Credentials{APIKey: "explicit-key"},
			env:      mapEnv{"GEMINI_API_KEY": "env-key", "GEMINI_API_SECRET": "env-secret"},
			want:     Credentials{APIKey: "env-key", APISecret: "env-secret"},
		},
		{
			name:    "environment OAuth keeps same-source metadata",
			env:     mapEnv{"GEMINI_ACCESS_TOKEN": "env-token", "GEMINI_REFRESH_TOKEN": "env-refresh", "GEMINI_OAUTH_CLIENT_ID": "env-client", "GEMINI_OAUTH_CLIENT_SECRET": "env-secret"},
			keyring: Credentials{OAuthClientID: "stored-client", OAuthClientSecret: "stored-secret"},
			want:    Credentials{AccessToken: "env-token", RefreshToken: "env-refresh", OAuthClientID: "env-client", OAuthClientSecret: "env-secret"},
		},
		{
			name:     "higher OAuth source does not borrow lower refresh metadata",
			explicit: Credentials{AccessToken: "explicit-token"},
			env:      mapEnv{"GEMINI_REFRESH_TOKEN": "env-refresh", "GEMINI_OAUTH_CLIENT_ID": "env-client"},
			want:     Credentials{AccessToken: "explicit-token"},
		},
		{
			name:    "keyring fallback",
			keyring: Credentials{APIKey: "stored-key", APISecret: "stored-secret"},
			want:    Credentials{APIKey: "stored-key", APISecret: "stored-secret"},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := Load(context.Background(), LoadOptions{
				Explicit: test.explicit,
				Env:      test.env,
				Keyring:  testKeyring{value: test.keyring},
			})
			if err != nil {
				t.Fatalf("Load() error = %v", err)
			}
			if got != test.want {
				t.Fatalf("Load() = %#v, want %#v", got, test.want)
			}
		})
	}
}

func TestLoadMissingKeyringIsAllowed(t *testing.T) {
	got, err := Load(context.Background(), LoadOptions{
		Keyring: testKeyring{err: ErrNotFound},
		Env:     mapEnv{},
	})
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !got.Empty() {
		t.Fatalf("Load() = %#v, want empty credentials", got)
	}
}

func TestLoadKeyringErrorsAreReturned(t *testing.T) {
	keyringErr := errors.New("keychain unavailable")
	_, err := Load(context.Background(), LoadOptions{Keyring: testKeyring{err: keyringErr}, Env: mapEnv{}})
	if !errors.Is(err, keyringErr) {
		t.Fatalf("Load() error = %v, want %v", err, keyringErr)
	}
}

func TestLoadExplicitUnavailableKeyringErrorIsReturned(t *testing.T) {
	_, err := Load(context.Background(), LoadOptions{
		Keyring: testKeyring{err: ErrUnavailable},
		Env:     mapEnv{},
	})
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("Load() error = %v, want ErrUnavailable", err)
	}
}

func TestFileKeyringRoundTrip(t *testing.T) {
	path := t.TempDir() + "/credentials.json"
	keyring, err := NewFileKeyring(path)
	if err != nil {
		t.Fatalf("NewFileKeyring() error = %v", err)
	}
	value := Credentials{APIKey: "key", APISecret: "secret", RefreshToken: "refresh"}
	if err := keyring.Set(context.Background(), "", value); err != nil {
		t.Fatalf("Set() error = %v", err)
	}
	got, err := keyring.Get(context.Background(), "default")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if got != value {
		t.Fatalf("Get() = %#v, want %#v", got, value)
	}
	if err := keyring.Delete(context.Background(), "default"); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if _, err := keyring.Get(context.Background(), "default"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Get() after Delete() error = %v, want ErrNotFound", err)
	}
}
