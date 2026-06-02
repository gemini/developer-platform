package oauth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/url"
	"strings"
)

// PKCEParams holds PKCE challenge parameters.
type PKCEParams struct {
	CodeVerifier  string
	CodeChallenge string
	Method        string
}

// GeneratePKCE creates a PKCE code_verifier and S256 code_challenge.
func GeneratePKCE() (*PKCEParams, error) {
	verifierBytes := make([]byte, 32)
	if _, err := rand.Read(verifierBytes); err != nil {
		return nil, fmt.Errorf("generate PKCE verifier: %w", err)
	}
	verifier := base64.RawURLEncoding.EncodeToString(verifierBytes)

	hash := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(hash[:])

	return &PKCEParams{
		CodeVerifier:  verifier,
		CodeChallenge: challenge,
		Method:        "S256",
	}, nil
}

// GenerateState creates a random state parameter for CSRF protection.
func GenerateState() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate state: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// BuildAuthorizationURL constructs the OAuth authorization URL.
func BuildAuthorizationURL(endpoints Endpoints, clientID string, pkce *PKCEParams, state string, port int) string {
	redirectURI := fmt.Sprintf("http://localhost:%d%s", port, CallbackPath)

	params := url.Values{
		"response_type":         {"code"},
		"client_id":             {clientID},
		"redirect_uri":          {redirectURI},
		"scope":                 {strings.Join(Scopes, ",")},
		"state":                 {state},
		"code_challenge":        {pkce.CodeChallenge},
		"code_challenge_method": {pkce.Method},
	}

	return endpoints.AuthorizationURL + "?" + params.Encode()
}
