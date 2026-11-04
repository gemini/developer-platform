# Security policy

## Reporting a vulnerability

Do not open a public issue for a security vulnerability. Report it through
Gemini's internal security-reporting process or the repository's private
security advisory flow. Include the affected package version, runtime, a
minimal reproduction, and the potential impact. Do not include production
credentials or customer data.

## SDK credential handling

- Use the least-privileged Gemini API key that supports the required operation.
- Keep API secrets, confidential OAuth client secrets, access tokens, and refresh
  tokens in server-side secret storage.
- Use the sandbox environment for development and explicitly select the
  production environment only in controlled deployments.
- Browser applications must use public OAuth PKCE clients and secure,
  application-controlled token storage. Do not put refresh tokens in
  `localStorage`.
- Treat withdrawal, order, transfer, and account-management methods as
  privileged operations and protect them with application-level authorization.

## Supported versions

Security fixes are applied to the latest published SDK release. Upgrade to the
latest release before reporting an issue against an older version.
