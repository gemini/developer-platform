#!/bin/sh
set -e

# Gemini Markets CLI Installer
# Usage: curl -sSL https://raw.githubusercontent.com/gemini/developer-platform/main/packages/cli/scripts/install.sh | sh
#
# Options (environment variables):
#   VERSION      - pin a specific version, e.g. VERSION=0.1.4
#   INSTALL_DIR  - install location, default /usr/local/bin

REPO="gemini/developer-platform"
BINARY="gemini-markets"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
    x86_64|amd64)  ARCH="amd64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *)
        echo "error: unsupported architecture: $ARCH" >&2
        exit 1
        ;;
esac

case "$OS" in
    darwin|linux) ;;
    mingw*|msys*|cygwin*) OS="windows" ;;
    *)
        echo "error: unsupported OS: $OS" >&2
        exit 1
        ;;
esac

# Resolve version — prefer explicit VERSION, fall back to GitHub API, then
# the releases page (handles API rate limiting).
if [ -n "$VERSION" ]; then
    RESOLVED_VERSION="$VERSION"
else
    RESOLVED_VERSION=$(curl -sSfL \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${REPO}/releases/latest" \
        2>/dev/null | grep '"tag_name"' | sed -E 's/.*"cli\/v?([^"]+)".*/\1/')

    if [ -z "$RESOLVED_VERSION" ]; then
        echo "error: could not determine latest version." >&2
        echo "       Set VERSION=<version> to install a specific release." >&2
        exit 1
    fi
fi

echo "Installing ${BINARY} v${RESOLVED_VERSION}..."

BASE_URL="https://github.com/${REPO}/releases/download/cli/v${RESOLVED_VERSION}"
FILENAME="${BINARY}_${RESOLVED_VERSION}_${OS}_${ARCH}"
if [ "$OS" = "windows" ]; then
    FILENAME="${FILENAME}.zip"
else
    FILENAME="${FILENAME}.tar.gz"
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Download archive and checksums file in parallel.
curl -sSfL "${BASE_URL}/${FILENAME}"       -o "${TMP_DIR}/${FILENAME}"
curl -sSfL "${BASE_URL}/checksums.txt"     -o "${TMP_DIR}/checksums.txt"

# Verify checksum before extracting.
cd "$TMP_DIR"
if command -v sha256sum >/dev/null 2>&1; then
    grep "${FILENAME}" checksums.txt | sha256sum -c --status
elif command -v shasum >/dev/null 2>&1; then
    grep "${FILENAME}" checksums.txt | shasum -a 256 -c --status
else
    echo "warning: sha256sum/shasum not found, skipping checksum verification" >&2
fi
echo "Checksum verified."

# Extract.
if [ "$OS" = "windows" ]; then
    unzip -q "$FILENAME"
else
    tar -xzf "$FILENAME"
fi

# Install.
if [ -w "$INSTALL_DIR" ]; then
    mv "$BINARY" "${INSTALL_DIR}/${BINARY}"
else
    echo "Installing to ${INSTALL_DIR} (requires sudo)..."
    sudo mv "$BINARY" "${INSTALL_DIR}/${BINARY}"
fi

chmod +x "${INSTALL_DIR}/${BINARY}"

# Ad-hoc codesign on macOS to avoid Gatekeeper prompts.
if [ "$OS" = "darwin" ] && command -v codesign >/dev/null 2>&1; then
    codesign -s - "${INSTALL_DIR}/${BINARY}" 2>/dev/null || true
fi

echo ""
echo "${BINARY} v${RESOLVED_VERSION} installed to ${INSTALL_DIR}/${BINARY}"
echo ""
echo "Get started:"
echo "  gemini-markets auth login      # browser-based OAuth login"
echo "  gemini-markets auth setup       # API key setup (alternative)"
echo "  gemini-markets --help"
