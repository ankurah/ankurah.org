#!/bin/bash

# Build and test script for ankurah.org example
# This compiles the transclusion sources and executes their runtime checks.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building and testing ankurah.org example...${NC}\n"

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo -e "${RED}Error: wasm-pack is not installed${NC}"
    echo "Install it with: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"
    exit 1
fi

# Test Rust examples, including runtime query parsing and substitution semantics
echo -e "${BLUE}[1/4]${NC} Testing Rust workspace..."
if ! cargo test --workspace --locked; then
    echo -e "${RED}✗${NC} Rust tests failed\n"
    exit 1
fi
echo -e "${GREEN}✓${NC} Rust workspace tests passed\n"

# Build Rust workspace in release mode
echo -e "${BLUE}[2/4]${NC} Building Rust workspace..."
if ! cargo build --workspace --release --locked; then
    echo -e "${RED}✗${NC} Rust build failed\n"
    exit 1
fi
echo -e "${GREEN}✓${NC} Rust workspace built\n"

# Build WASM bindings
echo -e "${BLUE}[3/4]${NC} Building WASM bindings..."
cd wasm-bindings
if ! wasm-pack build --target web --release; then
    echo -e "${RED}✗${NC} WASM build failed\n"
    exit 1
fi
cd ..
echo -e "${GREEN}✓${NC} WASM bindings built\n"

# Build React app (type checking)
echo -e "${BLUE}[4/4]${NC} Type-checking React app..."
cd react-app
if ! command -v bun &> /dev/null; then
    echo -e "${YELLOW}⚠${NC}  Bun not installed, skipping React type check"
else
    if ! bun install --frozen-lockfile > /dev/null 2>&1; then
        echo -e "${RED}✗${NC} Failed to install React dependencies\n"
        exit 1
    fi
    if ! bun run build; then
        echo -e "${RED}✗${NC} React build failed\n"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} React app built\n"
fi
cd ..

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ All builds successful!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "\nAll transcluded code sources are compiled, and their runtime checks pass."
echo -e "Run ${BLUE}./dev.sh${NC} to start the development environment.\n"
