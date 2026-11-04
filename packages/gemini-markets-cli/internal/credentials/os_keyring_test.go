package credentials

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	keyring "github.com/99designs/keyring"
)

type memoryOSKeyring struct {
	items map[string]keyring.Item
}

func (k *memoryOSKeyring) Get(name string) (keyring.Item, error) {
	item, ok := k.items[name]
	if !ok {
		return keyring.Item{}, keyring.ErrKeyNotFound
	}
	return item, nil
}

func (k *memoryOSKeyring) GetMetadata(name string) (keyring.Metadata, error) {
	item, err := k.Get(name)
	if err != nil {
		return keyring.Metadata{}, err
	}
	item.Data = nil
	return keyring.Metadata{Item: &item}, nil
}

func (k *memoryOSKeyring) Set(item keyring.Item) error {
	if k.items == nil {
		k.items = make(map[string]keyring.Item)
	}
	k.items[item.Key] = item
	return nil
}

func (k *memoryOSKeyring) Remove(name string) error {
	if _, ok := k.items[name]; !ok {
		return keyring.ErrKeyNotFound
	}
	delete(k.items, name)
	return nil
}

func (k *memoryOSKeyring) Keys() ([]string, error) {
	keys := make([]string, 0, len(k.items))
	for key := range k.items {
		keys = append(keys, key)
	}
	return keys, nil
}

func TestOSKeyringRoundTrip(t *testing.T) {
	backend := &memoryOSKeyring{}
	keyring, err := newOSKeyringWithBackend(backend)
	if err != nil {
		t.Fatalf("newOSKeyringWithBackend() error = %v", err)
	}
	want := Credentials{
		APIKey: " api-key ", APISecret: "api-secret", AccessToken: "access-token",
		RefreshToken: "refresh-token", OAuthClientID: "client-id", OAuthClientSecret: "client-secret",
		ExpiresAt: time.Date(2026, time.August, 29, 12, 0, 0, 0, time.UTC),
	}
	if err := keyring.Set(context.Background(), "", want); err != nil {
		t.Fatalf("Set() error = %v", err)
	}
	got, err := keyring.Get(context.Background(), "default")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	want.APIKey = "api-key"
	if got != want {
		t.Fatalf("Get() = %#v, want %#v", got, want)
	}
	if string(backend.items["default"].Data) == "" {
		t.Fatal("Set() stored no data")
	}
	if err := keyring.Delete(context.Background(), "default"); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if _, err := keyring.Get(context.Background(), "default"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Get() after Delete() error = %v, want ErrNotFound", err)
	}
}

func TestOSKeyringDoesNotFallbackToFileBackend(t *testing.T) {
	for _, backend := range secureBackends {
		if backend == keyring.FileBackend || backend == keyring.PassBackend {
			t.Fatalf("secure backend list includes file-backed backend %q", backend)
		}
	}
}

func TestOSKeyringHonorsCanceledContext(t *testing.T) {
	keyring, err := newOSKeyringWithBackend(&memoryOSKeyring{})
	if err != nil {
		t.Fatalf("newOSKeyringWithBackend() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := keyring.Set(ctx, "default", Credentials{APIKey: "secret"}); !errors.Is(err, context.Canceled) {
		t.Fatalf("Set() error = %v, want context.Canceled", err)
	}
}

func TestOSKeyringSerializesConcurrentCredentialRotation(t *testing.T) {
	backend := &memoryOSKeyring{}
	keyring, err := newOSKeyringWithBackend(backend)
	if err != nil {
		t.Fatalf("newOSKeyringWithBackend() error = %v", err)
	}

	const writers = 32
	var wg sync.WaitGroup
	wg.Add(writers)
	for i := 0; i < writers; i++ {
		go func() {
			defer wg.Done()
			value := Credentials{AccessToken: "access", RefreshToken: "refresh", OAuthClientID: "client"}
			if err := keyring.Set(context.Background(), "default", value); err != nil {
				t.Errorf("Set() error = %v", err)
			}
		}()
	}
	wg.Wait()
	got, err := keyring.Get(context.Background(), "default")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if got.AccessToken != "access" || got.RefreshToken != "refresh" || got.OAuthClientID != "client" {
		t.Fatalf("concurrent rotation produced incomplete credentials: %#v", got)
	}
}
