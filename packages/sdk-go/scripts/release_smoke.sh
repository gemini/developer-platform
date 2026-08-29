#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sdk_root="$(cd "$script_dir/.." && pwd)"
staging_root="$(mktemp -d)"
trap 'rm -rf "$staging_root"' EXIT

staged_sdk="$staging_root/packages/sdk-go"
consumer="$staging_root/consumer"
mkdir -p "$(dirname "$staged_sdk")"
cp -R "$sdk_root" "$staged_sdk"

go test -C "$staged_sdk" ./...
go test -C "$staged_sdk/websocket/gorilla" ./...
go test -C "$staged_sdk/scripts" ./...
go test -C "$staged_sdk/cmd/demo" ./...
go vet -C "$staged_sdk/cmd/demo" ./...

mkdir -p "$consumer"
cat >"$consumer/go.mod" <<EOF
module release-smoke-consumer

go 1.23

require (
	github.com/gemini/developer-platform/packages/sdk-go v0.0.0
	github.com/gemini/developer-platform/packages/sdk-go/websocket/gorilla v0.0.0
	github.com/gorilla/websocket v1.5.3
)

replace github.com/gemini/developer-platform/packages/sdk-go => $staged_sdk
replace github.com/gemini/developer-platform/packages/sdk-go/websocket/gorilla => $staged_sdk/websocket/gorilla
EOF
cp "$staged_sdk/websocket/gorilla/go.sum" "$consumer/go.sum"

cat >"$consumer/import_test.go" <<'EOF'
package consumer

import (
	"testing"

	gemini "github.com/gemini/developer-platform/packages/sdk-go"
	"github.com/gemini/developer-platform/packages/sdk-go/types"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/account"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/trading"
	"github.com/gemini/developer-platform/packages/sdk-go/services"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket/gorilla"
)

func TestPublishedModuleImports(t *testing.T) {
	if gemini.NewClient() == nil {
		t.Fatal("NewClient returned nil")
	}
	if types.MustParseDecimal("1.25").String() != "1.25" {
		t.Fatal("decimal import is not usable")
	}
	if websocket.OpOrderNew == "" {
		t.Fatal("websocket import is not usable")
	}
	if gorilla.NewDialer() == nil {
		t.Fatal("gorilla import is not usable")
	}
	if _, err := gemini.NewClientWithError(gemini.WithEnvironment(gemini.Sandbox)); err != nil {
		t.Fatalf("constructor import is not usable: %v", err)
	}
	var _ account.Balance
	var _ trading.NewOrderRequest
	var _ services.OrderOption
}
EOF

go test -C "$consumer" -mod=mod ./...

echo "release smoke passed: standalone modules, demo, generated packages, services, and Gorilla imports are usable"
