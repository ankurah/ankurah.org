#!/bin/bash

# Development script for ankurah.org
# Watches for changes and rebuilds the landing page assets

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting ankurah.org development environment...${NC}\n"

# Store PIDs for cleanup
PIDS=()

# Function to cleanup background processes on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    
    # Kill all background jobs
    jobs -p | xargs -r kill 2>/dev/null || true
    
    # Kill process tree for each stored PID
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            pkill -P "$pid" 2>/dev/null || true
            kill "$pid" 2>/dev/null || true
        fi
    done
    
    # Give processes a moment to terminate gracefully
    sleep 1
    
    # Force kill any stragglers
    for pid in "${PIDS[@]}"; do
        kill -9 "$pid" 2>/dev/null || true
    done
    
    # Kill any remaining processes from this session
    pkill -f "bun.*serve" 2>/dev/null || true
    pkill -f "browser-sync" 2>/dev/null || true
    pkill -f "fswatch" 2>/dev/null || true
    pkill -f "inotifywait" 2>/dev/null || true
    
    echo -e "${GREEN}✓ All services stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo -e "${RED}Error: bun is not installed${NC}"
    echo "Install it with: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Check if liaison is installed
if ! command -v liaison &> /dev/null; then
    echo -e "${RED}Error: liaison is not installed${NC}"
    echo "Install it with: cd ../liaison && cargo install --path ."
    exit 1
fi

# Check if browser-sync is available (install if not)
if ! command -v browser-sync &> /dev/null; then
    echo -e "${YELLOW}Installing browser-sync for hot-reload...${NC}"
    if ! bun add -g browser-sync > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠ Could not install browser-sync. Falling back to static server (no hot-reload)${NC}"
        USE_BROWSER_SYNC=false
    else
        USE_BROWSER_SYNC=true
    fi
else
    USE_BROWSER_SYNC=true
fi

echo -e "${BLUE}[1/3]${NC} Running liaison to transclude code examples..."
if ! liaison index.html 2>&1 | grep -E "(Updated|No changes)" > /dev/null; then
    echo -e "${RED}✗${NC} liaison failed"
    liaison index.html  # Show the actual error
    exit 1
fi
echo -e "${GREEN}✓${NC} Code examples transcluded"

echo -e "${BLUE}[2/3]${NC} Building initial site..."
if ! mdbook build > /dev/null 2>&1; then
    echo -e "${RED}✗${NC} Initial build failed\n"
    exit 1
fi
echo -e "${GREEN}✓${NC} mdBook build complete"

# Always copy landing page files on startup
echo -e "${BLUE}      ${NC} Copying landing page assets..."
cp index.html book/ 2>/dev/null || true
cp styles.css book/ 2>/dev/null || true
cp -r images book/ 2>/dev/null || true
echo -e "${GREEN}✓${NC} Landing page assets copied\n"

echo -e "${BLUE}[3/3]${NC} Starting watchers and server...\n"

# Start server with or without hot-reload
if [ "$USE_BROWSER_SYNC" = true ]; then
    echo -e "${YELLOW}Starting browser-sync with hot-reload on port 3000...${NC}"
    (cd book && browser-sync start --server --port 3000 --no-open --no-ui --files "**/*" 2>&1 | sed 's/^/[SERVER] /') &
    SERVER_PID=$!
    PIDS+=($SERVER_PID)
else
    echo -e "${YELLOW}Starting static file server on port 3000 (no hot-reload)...${NC}"
    (cd book && bun --bun x serve -l 3000 2>&1 | sed 's/^/[SERVER] /') &
    SERVER_PID=$!
    PIDS+=($SERVER_PID)
fi

# Give server a moment to start
sleep 2

# Watch for markdown file changes and rebuild
echo -e "${YELLOW}Starting mdBook watcher...${NC}"
if command -v fswatch &> /dev/null; then
    # Use fswatch
    fswatch -o src/ 2>/dev/null | while read; do
        echo -e "${BLUE}[WATCHER]${NC} Markdown files changed, rebuilding mdBook..."
        mdbook build > /dev/null 2>&1
        cp index.html book/ 2>/dev/null || true
        cp styles.css book/ 2>/dev/null || true
        cp -r images book/ 2>/dev/null || true
        echo -e "${GREEN}[WATCHER]${NC} Site rebuilt"
    done &
    MD_WATCHER_PID=$!
    PIDS+=($MD_WATCHER_PID)
elif command -v inotifywait &> /dev/null; then
    # Use inotifywait on Linux
    while inotifywait -q -r -e modify,create,delete src/ 2>/dev/null; do
        echo -e "${BLUE}[WATCHER]${NC} Markdown files changed, rebuilding mdBook..."
        mdbook build > /dev/null 2>&1
        cp index.html book/ 2>/dev/null || true
        cp styles.css book/ 2>/dev/null || true
        cp -r images book/ 2>/dev/null || true
        echo -e "${GREEN}[WATCHER]${NC} Site rebuilt"
    done &
    MD_WATCHER_PID=$!
    PIDS+=($MD_WATCHER_PID)
else
    echo -e "${YELLOW}⚠ File watcher not available (install fswatch for auto-rebuild)${NC}"
    echo -e "${YELLOW}  Markdown changes require manual rebuild: mdbook build && cp index.html styles.css book/ && cp -r images book/${NC}"
fi

# Watch landing page files (index.html, styles.css, images/)
echo -e "${YELLOW}Starting landing page watcher...${NC}"
if command -v fswatch &> /dev/null; then
    # Use fswatch
    fswatch -o index.html styles.css images/ 2>/dev/null | while read; do
        echo -e "${BLUE}[WATCHER]${NC} Landing page files changed, copying..."
        cp index.html book/ 2>/dev/null || true
        cp styles.css book/ 2>/dev/null || true
        cp -r images book/ 2>/dev/null || true
        echo -e "${GREEN}[WATCHER]${NC} Landing page updated"
    done &
    WATCHER_PID=$!
    PIDS+=($WATCHER_PID)
elif command -v inotifywait &> /dev/null; then
    # Use inotifywait on Linux
    while inotifywait -q -r -e modify,create,delete index.html styles.css images/ 2>/dev/null; do
        echo -e "${BLUE}[WATCHER]${NC} Landing page files changed, copying..."
        cp index.html book/ 2>/dev/null || true
        cp styles.css book/ 2>/dev/null || true
        cp -r images book/ 2>/dev/null || true
        echo -e "${GREEN}[WATCHER]${NC} Landing page updated"
    done &
    WATCHER_PID=$!
    PIDS+=($WATCHER_PID)
else
    echo -e "${YELLOW}⚠ File watcher not available (install fswatch for auto-rebuild)${NC}"
    echo -e "${YELLOW}  Landing page changes require manual: cp index.html styles.css book/ && cp -r images book/${NC}"
fi

# Watch example files and run liaison when they change
echo -e "${YELLOW}Starting example code watcher...${NC}"
if command -v fswatch &> /dev/null; then
    # Use fswatch
    fswatch -o example/ 2>/dev/null | while read; do
        echo -e "${BLUE}[WATCHER]${NC} Example code changed, running liaison..."
        if liaison index.html 2>&1 | grep -q "Updated"; then
            cp index.html book/ 2>/dev/null || true
            echo -e "${GREEN}[WATCHER]${NC} Code examples transcluded and copied"
        else
            echo -e "${YELLOW}[WATCHER]${NC} No changes needed"
        fi
    done &
    EXAMPLE_WATCHER_PID=$!
    PIDS+=($EXAMPLE_WATCHER_PID)
elif command -v inotifywait &> /dev/null; then
    # Use inotifywait on Linux
    while inotifywait -q -r -e modify,create,delete example/ 2>/dev/null; do
        echo -e "${BLUE}[WATCHER]${NC} Example code changed, running liaison..."
        if liaison index.html 2>&1 | grep -q "Updated"; then
            cp index.html book/ 2>/dev/null || true
            echo -e "${GREEN}[WATCHER]${NC} Code examples transcluded and copied"
        else
            echo -e "${YELLOW}[WATCHER]${NC} No changes needed"
        fi
    done &
    EXAMPLE_WATCHER_PID=$!
    PIDS+=($EXAMPLE_WATCHER_PID)
else
    echo -e "${YELLOW}⚠ File watcher not available (install fswatch for auto-rebuild)${NC}"
    echo -e "${YELLOW}  Example code changes require manual: liaison index.html && cp index.html book/${NC}"
fi

echo -e "\n${GREEN}✓ All services started!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Website:${NC}     http://localhost:3000"
echo -e "${GREEN}Landing:${NC}     http://localhost:3000/index.html"
echo -e "${GREEN}Docs:${NC}        http://localhost:3000/what-is-ankurah.html"
if [ "$USE_BROWSER_SYNC" = true ]; then
    echo -e "${GREEN}Hot-reload:${NC}  ✓ Enabled (browser will auto-refresh on changes)"
else
    echo -e "${YELLOW}Hot-reload:${NC}  ✗ Disabled (install browser-sync for auto-refresh)"
fi
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo -e "${YELLOW}Watching:${NC}"
echo -e "  - ${BLUE}src/*.md${NC} (mdBook auto-rebuild)"
echo -e "  - ${BLUE}index.html, styles.css, images/${NC} (landing page auto-copy)"
echo -e "  - ${BLUE}example/...${NC} (liaison transclude + copy)"
echo ""

# Wait for all background processes
wait

