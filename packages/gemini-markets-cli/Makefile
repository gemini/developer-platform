GO ?= go
BINARY ?= gemini-markets
BUILD_DIR ?= ./bin

.PHONY: all build check test race vet docs smoke fmt mod-verify

all: check

build:
	mkdir -p "$(BUILD_DIR)"
	$(GO) build -trimpath -o "$(BUILD_DIR)/$(BINARY)" ./cmd/gemini-markets

test:
	$(GO) test ./...

race:
	$(GO) test -race ./...

vet:
	$(GO) vet ./...

docs:
	$(GO) doc ./cmd/gemini-markets >/dev/null
	$(GO) doc ./internal/cli >/dev/null
	$(GO) doc ./internal/credentials >/dev/null
	$(GO) doc ./internal/output >/dev/null
	$(GO) doc ./internal/session >/dev/null

smoke:
	$(GO) run ./cmd/gemini-markets --help >/dev/null

fmt:
	@test -z "$$(gofmt -l .)" || (echo "gofmt required; run gofmt -w ." && exit 1)

mod-verify:
	$(GO) mod verify

check: fmt mod-verify test race vet build docs smoke
