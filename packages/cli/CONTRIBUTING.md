# Contributing to gemini-markets-cli

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Go version from `go.mod` or later
- Git

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/gemini-markets-cli.git
   cd gemini-markets-cli
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/gemini/gemini-markets-cli.git
   ```
4. Install dependencies:
   ```bash
   go mod download
   ```

### Building

```bash
go build -o gemini-markets ./cmd/gemini-markets
```

### Running Tests

```bash
go test ./...
```

If you change command help, examples, or command structure, regenerate manpages:

```bash
go run ./cmd/gen-docs
```

Optional sandbox smoke coverage for command wiring:

```bash
GEMINI_SANDBOX_SMOKE=1 go test -tags=integration ./internal/cmd -run TestSandboxSmokeSuite -count=1
```

With race detection:
```bash
go test -race ./...
```

### Linting

We use golangci-lint for linting. Install it:
```bash
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

Run the linter:
```bash
golangci-lint run
```

## Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/add-new-command`
- `fix/order-parsing-bug`
- `docs/update-readme`

### Commit Messages

Follow conventional commits:
- `feat: add new order type support`
- `fix: handle nil response in cancel`
- `docs: update installation instructions`
- `test: add coverage for websocket client`
- `refactor: simplify error handling`

### Code Style

- Run `gofmt` on all code
- Follow [Effective Go](https://go.dev/doc/effective_go) guidelines
- Keep functions focused and small
- Add tests for new functionality
- Update documentation for user-facing changes

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Run tests and linting locally
4. Push to your fork
5. Open a pull request against `main`
6. Fill out the PR template
7. Wait for CI to pass
8. Address review feedback

### PR Checklist

- [ ] Tests pass locally (`go test ./...`)
- [ ] Linting passes (`golangci-lint run`)
- [ ] Manpages regenerated if command/help output changed (`go run ./cmd/gen-docs`)
- [ ] New code has test coverage
- [ ] Documentation updated if needed
- [ ] Commit messages follow conventions

## Project Structure

```
gemini-markets-cli/
├── cmd/                    # Main entry point
├── internal/
│   ├── api/               # REST API client
│   ├── cmd/               # CLI commands (Cobra)
│   ├── config/            # Configuration handling
│   ├── output/            # Output formatting
│   └── ws/                # WebSocket client
├── .github/workflows/     # CI/CD workflows
└── .goreleaser.yml        # Release configuration
```

## Adding a New Command

1. Create a new file in `internal/cmd/` (e.g., `mycommand.go`)
2. Define the command using Cobra
3. Register it with the parent command in `init()`
4. Add tests
5. Update `spec.go` if it's a user-facing command

Example:
```go
var myCmd = &cobra.Command{
    Use:   "mycommand",
    Short: "Brief description",
    Long:  `Detailed description with examples.`,
    RunE: func(cmd *cobra.Command, args []string) error {
        // Implementation
        return nil
    },
}

func init() {
    rootCmd.AddCommand(myCmd)
}
```

## Reporting Issues

When reporting bugs, please include:
- Go version (`go version`)
- OS and architecture
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (with sensitive data redacted)

## Security

If you discover a security vulnerability, please do NOT open a public issue. Instead, email security@gemini.com with details.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
