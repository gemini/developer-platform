package security

import (
	"crypto/tls"
	"crypto/x509"
	"net"
	"net/http"
	"time"
)

// NewSecureClient creates an HTTP client with security hardening:
// - TLS 1.2 minimum
// - Secure cipher suites only
// - Certificate validation
// - Reasonable timeouts to prevent resource exhaustion.
func NewSecureClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
				CipherSuites: []uint16{
					tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
					tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
					tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
					tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
					tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305,
					tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305,
				},
				VerifyConnection: verifyConnection,
			},
			DialContext: (&net.Dialer{
				Timeout:   10 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			TLSHandshakeTimeout:   10 * time.Second,
			ResponseHeaderTimeout: 30 * time.Second,
			IdleConnTimeout:       90 * time.Second,
			MaxIdleConns:          10,
			MaxIdleConnsPerHost:   5,
			DisableCompression:    false,
			ForceAttemptHTTP2:     true,
		},
	}
}

func verifyConnection(cs tls.ConnectionState) error { //nolint:gocritic // signature required by tls.Config.VerifyConnection
	// Standard certificate chain validation is performed automatically
	// Additional pinning can be added here if needed:
	//
	// for _, cert := range cs.PeerCertificates {
	//     fingerprint := sha256.Sum256(cert.Raw)
	//     if geminiCertFingerprints[hex.EncodeToString(fingerprint[:])] {
	//         return nil
	//     }
	// }
	// return fmt.Errorf("certificate not pinned")

	return nil
}

// NewSecureClientWithCertPool creates an HTTP client with a custom CA pool.
// Useful for testing or environments with custom CAs.
func NewSecureClientWithCertPool(timeout time.Duration, certPool *x509.CertPool) *http.Client {
	client := NewSecureClient(timeout)
	transport := client.Transport.(*http.Transport)
	transport.TLSClientConfig.RootCAs = certPool
	return client
}
