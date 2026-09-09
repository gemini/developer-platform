package credentials

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	keyring "github.com/99designs/keyring"
)

const (
	// ServiceName is the service name used for all CLI credentials in the
	// operating system credential store.
	ServiceName = "gemini-markets"
)

// ErrUnavailable indicates that no supported operating-system credential
// store is available. Environment credentials remain usable in this case,
// but login cannot persist credentials until a keyring is available.
var ErrUnavailable = errors.New("operating-system keyring unavailable")

// secureBackends deliberately excludes keyring's file and pass backends. The
// CLI must never silently downgrade to a plaintext or file-backed credential
// store when an OS keychain is unavailable.
var secureBackends = []keyring.BackendType{
	keyring.WinCredBackend,
	keyring.KeychainBackend,
	keyring.SecretServiceBackend,
	keyring.KWalletBackend,
	keyring.KeyCtlBackend,
}

// OSKeyring stores credentials in a desktop or operating-system keyring.
// Values are encoded as JSON in one keyring item per profile. The backend is
// intentionally an internal seam so command tests can use an in-memory fake.
type OSKeyring struct {
	backend keyring.Keyring
	mu      sync.Mutex
}

// NewOSKeyring opens one of the supported operating-system credential stores.
// File and pass backends are not considered, so an unavailable OS keyring is
// returned as an error instead of causing a less secure fallback.
func NewOSKeyring() (*OSKeyring, error) {
	backend, err := keyring.Open(keyring.Config{
		ServiceName:     ServiceName,
		AllowedBackends: append([]keyring.BackendType(nil), secureBackends...),
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	return &OSKeyring{backend: backend}, nil
}

// newOSKeyringWithBackend wraps a keyring implementation. It is kept
// unexported because production callers should use NewOSKeyring; package
// tests use it to exercise serialization without touching a user's keychain.
func newOSKeyringWithBackend(backend keyring.Keyring) (*OSKeyring, error) {
	if backend == nil {
		return nil, errors.New("keyring backend is required")
	}
	return &OSKeyring{backend: backend}, nil
}

func (k *OSKeyring) Get(ctx context.Context, profile string) (Credentials, error) {
	if err := contextErr(ctx); err != nil {
		return Credentials{}, err
	}
	item, err := k.item(profile)
	if err != nil {
		return Credentials{}, err
	}
	k.mu.Lock()
	defer k.mu.Unlock()
	item, err = k.backend.Get(item.Key)
	if errors.Is(err, keyring.ErrKeyNotFound) {
		return Credentials{}, ErrNotFound
	}
	if err != nil {
		return Credentials{}, fmt.Errorf("read OS keyring: %w", err)
	}
	var value Credentials
	if err := json.Unmarshal(item.Data, &value); err != nil {
		return Credentials{}, fmt.Errorf("decode OS keyring credentials: %w", err)
	}
	return value.normalized(), nil
}

func (k *OSKeyring) Set(ctx context.Context, profile string, value Credentials) error {
	if err := contextErr(ctx); err != nil {
		return err
	}
	item, err := k.item(profile)
	if err != nil {
		return err
	}
	data, err := json.Marshal(value.normalized())
	if err != nil {
		return fmt.Errorf("encode OS keyring credentials: %w", err)
	}
	item.Data = data
	k.mu.Lock()
	defer k.mu.Unlock()
	if err := k.backend.Set(item); err != nil {
		return fmt.Errorf("write OS keyring: %w", err)
	}
	return nil
}

func (k *OSKeyring) Delete(ctx context.Context, profile string) error {
	if err := contextErr(ctx); err != nil {
		return err
	}
	item, err := k.item(profile)
	if err != nil {
		return err
	}
	k.mu.Lock()
	defer k.mu.Unlock()
	if err := k.backend.Remove(item.Key); err != nil {
		if errors.Is(err, keyring.ErrKeyNotFound) {
			return ErrNotFound
		}
		return fmt.Errorf("delete OS keyring credentials: %w", err)
	}
	return nil
}

func (k *OSKeyring) item(profile string) (keyring.Item, error) {
	if k == nil || k.backend == nil {
		return keyring.Item{}, ErrUnavailable
	}
	return keyring.Item{
		Key:         normalizeProfile(profile),
		Label:       "Gemini Markets CLI credentials",
		Description: "Gemini Markets CLI credentials for the selected profile",
	}, nil
}

// lazyOSKeyring lets commands that can operate with environment credentials
// retain that behavior on headless systems. It still makes the OS keyring the
// default persistence path and never falls back to FileKeyring.
type lazyOSKeyring struct {
	mu      sync.Mutex
	keyring *OSKeyring
	err     error
}

func (k *lazyOSKeyring) open() (*OSKeyring, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.keyring != nil || k.err != nil {
		return k.keyring, k.err
	}
	k.keyring, k.err = NewOSKeyring()
	return k.keyring, k.err
}

func (k *lazyOSKeyring) Get(ctx context.Context, profile string) (Credentials, error) {
	backend, err := k.open()
	if err != nil {
		return Credentials{}, err
	}
	return backend.Get(ctx, profile)
}

func (k *lazyOSKeyring) Set(ctx context.Context, profile string, value Credentials) error {
	backend, err := k.open()
	if err != nil {
		return err
	}
	return backend.Set(ctx, profile, value)
}

func (k *lazyOSKeyring) Delete(ctx context.Context, profile string) error {
	backend, err := k.open()
	if err != nil {
		return err
	}
	return backend.Delete(ctx, profile)
}

func defaultKeyring() Keyring { return &lazyOSKeyring{} }

var _ Keyring = (*OSKeyring)(nil)
var _ Keyring = (*lazyOSKeyring)(nil)
