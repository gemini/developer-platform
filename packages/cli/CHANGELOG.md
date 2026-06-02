# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.4] - 2026-05-27

### Added
- `stream positions` — authenticated WebSocket stream for real-time position deltas (`positions@account`)
- `stream contract-status` — public WebSocket stream for contract lifecycle events and strike-price availability (`contractStatus`), with optional `--symbol` filter
- Comprehensive test suite (API client, config, WebSocket)
- ARCHITECTURE.md documenting design decisions

### Changed
- Improved test coverage: API client 12% → 39%, config 7.8% → 24.3%

## [0.1.0] - 2026-02-26

### Added

#### Core Functionality
- REST API client for prediction markets and spot trading
- WebSocket client with auto-reconnection and subscription restoration
- WebSocket-first architecture with REST fallback
- Circuit breaker pattern for rate limit protection
- Exponential backoff with jitter for retries

#### Trading Features
- Spot trading: place, cancel, list orders
- Prediction markets: place, cancel, list orders
- Position tracking (open and settled)
- Spot fee tier info
- Order book depth
- OHLCV candle data
- Account balance queries

#### Agent Integration
- JSON output by default (agent-first design)
- Machine-readable CLI spec (`gemini-markets spec`)
- Structured error handling with retry hints
- Idempotent operations via `--client-order-id`
- Quiet mode (`-q`) for clean JSON piping

#### Output Formats
- JSON (pretty-printed by default)
- JSON compact (`--raw`)
- Table output (`-o table`)
- CSV output (`-o csv`)

#### Security
- OS keychain integration (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- TLS 1.2+ enforcement
- HMAC-SHA512 request signing
- Secure credential storage with file fallback

#### Developer Experience
- Interactive setup wizard (`gemini-markets config init`)
- Shell completions (bash, zsh, fish, powershell)
- Global flags: `--timeout`, `--debug`, `--sandbox`
- Self-update mechanism with SHA256 verification

#### Infrastructure
- Cross-platform builds (darwin, linux, windows × amd64, arm64)
- GitHub Actions CI/CD
- Multi-OS testing (Ubuntu, macOS, Windows)
- Security scanning (gosec, govulncheck)
- Linting (golangci-lint with 28 rules)

### Security
- Constant-time secret comparison
- Memory scrubbing for sensitive data
- Crypto-grade random number generation for nonces
