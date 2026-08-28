package gemini

// Environment represents a Gemini deployment target.
type Environment string

const (
	Production Environment = "production"
	Sandbox    Environment = "sandbox"
)

// EnvironmentEndpoints holds the URLs for REST, WebSocket, and OAuth endpoints.
type EnvironmentEndpoints struct {
	REST               string
	WebSocket          string
	OAuthAuthorization string
	OAuthToken         string
}

var endpoints = map[Environment]EnvironmentEndpoints{
	Production: {
		REST:               "https://api.gemini.com",
		WebSocket:          "wss://ws.gemini.com",
		OAuthAuthorization: "https://exchange.gemini.com/auth",
		OAuthToken:         "https://exchange.gemini.com/auth/token",
	},
	Sandbox: {
		REST:               "https://api.sandbox.gemini.com",
		WebSocket:          "wss://ws.sandbox.gemini.com",
		OAuthAuthorization: "https://exchange.sandbox.gemini.com/auth",
		OAuthToken:         "https://exchange.sandbox.gemini.com/auth/token",
	},
}

// EndpointsFor returns the verified endpoints for an environment.
func EndpointsFor(env Environment) (EnvironmentEndpoints, bool) {
	endpoints, ok := endpoints[env]
	return endpoints, ok
}
