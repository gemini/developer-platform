#!/bin/bash
set -e

# Gemini Markets CLI Installer
# Usage: curl -sSL https://raw.githubusercontent.com/gemini/gemini-markets-cli/main/install.sh | bash

REPO="gemini/gemini-markets-cli"
BINARY="gemini-markets"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
    x86_64|amd64)
        ARCH="amd64"
        ;;
    arm64|aarch64)
        ARCH="arm64"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

case "$OS" in
    darwin|linux)
        ;;
    mingw*|msys*|cygwin*)
        OS="windows"
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

# Get latest version
echo "Fetching latest version..."
VERSION=$(curl -sS "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$VERSION" ]; then
    echo "Failed to fetch latest version"
    exit 1
fi

echo "Installing $BINARY $VERSION for ${OS}/${ARCH}..."

# Download URL (version without 'v' prefix for filename)
VERSION_NUM="${VERSION#v}"
FILENAME="${BINARY}_${VERSION_NUM}_${OS}_${ARCH}"
if [ "$OS" = "windows" ]; then
    FILENAME="${FILENAME}.zip"
else
    FILENAME="${FILENAME}.tar.gz"
fi

URL="https://github.com/$REPO/releases/download/$VERSION/$FILENAME"

# Create temp directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# Download and extract
echo "Downloading from $URL..."
curl -sSL "$URL" -o "$TMP_DIR/$FILENAME"

cd "$TMP_DIR"
if [ "$OS" = "windows" ]; then
    unzip -q "$FILENAME"
else
    tar -xzf "$FILENAME"
fi

# Install
echo "Installing to $INSTALL_DIR..."
if [ -w "$INSTALL_DIR" ]; then
    mv "$BINARY" "$INSTALL_DIR/"
else
    sudo mv "$BINARY" "$INSTALL_DIR/"
fi

chmod +x "$INSTALL_DIR/$BINARY"

# Sign binary on macOS (enables Keychain access without prompts)
if [ "$OS" = "darwin" ] && command -v codesign &> /dev/null; then
    echo "Signing binary for macOS Keychain access..."
    codesign -s - "$INSTALL_DIR/$BINARY" 2>/dev/null || true
fi

echo ""
echo "Successfully installed $BINARY $VERSION"
echo ""
echo "Run 'gemini-markets --help' to get started"
echo "Run 'gemini-markets auth setup' to set up API credentials"
