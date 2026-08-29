package services

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

// ErrInvalidServiceConfiguration indicates that a service was constructed
// without a usable transport client or base URL.
var ErrInvalidServiceConfiguration = errors.New("gemini services: invalid service configuration")

// baseService encapsulates the shared HTTP transport client and base URL for all domain services.
type baseService struct {
	client  *transport.Client
	baseURL string
}

func newBaseService(client *transport.Client, baseURL string) baseService {
	return baseService{
		client:  client,
		baseURL: baseURL,
	}
}

func (b *baseService) request(ctx context.Context, method, path string, payload any, target any) error {
	if b == nil || b.client == nil {
		return ErrInvalidServiceConfiguration
	}
	if strings.TrimSpace(b.baseURL) == "" {
		if err := b.client.ConfigurationError(); err != nil {
			return err
		}
		return ErrInvalidServiceConfiguration
	}
	baseURL := strings.TrimRight(b.baseURL, "/")
	requestPath := "/" + strings.TrimLeft(path, "/")
	return b.client.Request(ctx, method, baseURL+requestPath, payload, target)
}

func (b *baseService) post(ctx context.Context, path string, payload any, target any) error {
	return b.request(ctx, http.MethodPost, path, payload, target)
}

func (b *baseService) get(ctx context.Context, path string, target any) error {
	return b.request(ctx, http.MethodGet, path, nil, target)
}
