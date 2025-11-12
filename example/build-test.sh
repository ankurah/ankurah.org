#!/bin/bash

# Build and test script for ankurah.org example
# This validates that all code from the landing page actually compiles

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

# Build Rust workspace
echo -e "${BLUE}[1/3]${NC} Building Rust workspace..."
if ! cargo build --workspace --release; then
    echo -e "${RED}✗${NC} Rust build failed\n"
    exit 1
fi
echo -e "${GREEN}✓${NC} Rust workspace built\n"

# Build WASM bindings
echo -e "${BLUE}[2/3]${NC} Building WASM bindings..."
cd wasm-bindings
if ! wasm-pack build --target web --release; then
    echo -e "${RED}✗${NC} WASM build failed\n"
    exit 1
fi
cd ..
echo -e "${GREEN}✓${NC} WASM bindings built\n"

# Build React app (type checking)
echo -e "${BLUE}[3/3]${NC} Type-checking React app..."
cd react-app
if ! command -v bun &> /dev/null; then
    echo -e "${YELLOW}⚠${NC}  Bun not installed, skipping React type check"
else
    if ! bun install > /dev/null 2>&1; then
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
echo -e "\nAll code snippets from the landing page are validated."
echo -e "Run ${BLUE}./dev.sh${NC} to start the development environment.\n"

