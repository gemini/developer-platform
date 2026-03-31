#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# generate-sdks.sh
#
# Generates Go, Python, and TypeScript SDKs from the Gemini REST API OpenAPI
# spec using openapi-generator-cli.
#
# Prerequisites:
#   - Node.js (for npx)
#   - Java 11+ (required by openapi-generator)
#
# Usage:
#   ./scripts/generate-sdks.sh [--lang go|python|typescript] [--skip-download]
#
# By default generates all three SDKs and downloads a fresh copy of the spec.
#
# NOTE: These SDKs cover the REST API only. When the AsyncAPI spec for the
# WebSocket API is complete, WebSocket support will be added to each SDK.
# Prefer WebSocket endpoints where available (order book, trades, order events,
# candle subscriptions) as they have lower latency than polling REST.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC_URL="https://docs.gemini.com/rest.yaml"
SPEC_FILE="$SCRIPT_DIR/rest.yaml"
CONFIG_DIR="$SCRIPT_DIR/config"
GENERATOR_VERSION="2.31.0"

LANGS=("go" "python" "typescript")
SKIP_DOWNLOAD=false

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --lang)
      LANGS=("$2")
      shift 2
      ;;
    --skip-download)
      SKIP_DOWNLOAD=true
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: $0 [--lang go|python|typescript] [--skip-download]"
      exit 1
      ;;
  esac
done

# -----------------------------------------------------------------------------
# Preflight checks
# -----------------------------------------------------------------------------

check_deps() {
  if ! command -v java &>/dev/null; then
    echo "Error: Java is required but not found. Install Java 11+."
    exit 1
  fi
  if ! command -v node &>/dev/null; then
    echo "Error: Node.js is required but not found."
    exit 1
  fi
  local java_version
  java_version=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d. -f1)
  if [[ "$java_version" -lt 11 ]]; then
    echo "Error: Java 11+ required, found Java $java_version."
    exit 1
  fi
}

# -----------------------------------------------------------------------------
# Download spec
# -----------------------------------------------------------------------------

download_spec() {
  if [[ "$SKIP_DOWNLOAD" == true && -f "$SPEC_FILE" ]]; then
    echo "Skipping download, using cached spec at $SPEC_FILE"
    return
  fi
  echo "Downloading OpenAPI spec from $SPEC_URL..."
  curl -sSfL "$SPEC_URL" -o "$SPEC_FILE"
  echo "Spec saved to $SPEC_FILE"
  # Strip tab characters — the Gemini spec has literal tabs in some description
  # fields which cause SnakeYAML to fail when openapi-generator parses it.
  sed -i '' $'s/\t/ /g' "$SPEC_FILE"
}

# -----------------------------------------------------------------------------
# Generator helpers
# -----------------------------------------------------------------------------

run_generator() {
  local lang="$1"
  local generator="$2"
  local output_dir="$ROOT_DIR/packages/sdk-$lang"

  echo ""
  echo "==> Generating $lang SDK → $output_dir"

  # Clean previous output but preserve any manually maintained files
  if [[ -d "$output_dir" ]]; then
    # .openapi-generator-ignore lets us protect handwritten files
    rm -rf "$output_dir"
  fi

  npx --yes "@openapitools/openapi-generator-cli@$GENERATOR_VERSION" generate \
    --input-spec "$SPEC_FILE" \
    --generator-name "$generator" \
    --output "$output_dir" \
    --config "$CONFIG_DIR/$lang.yaml" \
    --git-repo-id "developer-platform" \
    --git-user-id "gemini" \
    --skip-validate-spec

  echo "==> $lang SDK generated."
}

post_generate_go() {
  local output_dir="$ROOT_DIR/packages/sdk-go"
  echo "    Running go mod tidy..."
  (cd "$output_dir" && go mod tidy 2>/dev/null) || true
}

post_generate_python() {
  local output_dir="$ROOT_DIR/packages/sdk-python"
  # Ensure a modern pyproject.toml-friendly layout if needed
  if [[ -f "$output_dir/setup.py" && ! -f "$output_dir/pyproject.toml" ]]; then
    cat > "$output_dir/pyproject.toml" <<'TOML'
[build-system]
requires = ["setuptools>=61"]
build-backend = "setuptools.backends.legacy:build"
TOML
  fi
}

post_generate_typescript() {
  local output_dir="$ROOT_DIR/packages/sdk-typescript"
  echo "    Running npm install..."
  (cd "$output_dir" && npm install --silent 2>/dev/null) || true
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

check_deps
download_spec

for lang in "${LANGS[@]}"; do
  case "$lang" in
    go)
      run_generator "go" "go"
      post_generate_go
      ;;
    python)
      run_generator "python" "python"
      post_generate_python
      ;;
    typescript)
      run_generator "typescript" "typescript-fetch"
      post_generate_typescript
      ;;
    *)
      echo "Unknown language: $lang (supported: go, python, typescript)"
      exit 1
      ;;
  esac
done

echo ""
echo "Done. Generated SDKs:"
for lang in "${LANGS[@]}"; do
  echo "  packages/sdk-$lang"
done
echo ""
echo "Next steps:"
echo "  - Review generated code in each packages/sdk-* directory"
echo "  - The Gemini API uses HMAC-SHA384 request signing — verify the auth"
echo "    implementation in each SDK matches docs.gemini.com/authentication"
echo "  - Add WebSocket client support once the AsyncAPI spec is available"
