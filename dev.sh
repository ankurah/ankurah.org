#!/bin/bash

# Development script for ankurah.org
#
# Builds the mdBook docs + static landing page and serves them with live
# rebuild-on-change. Made "sutra-compatible" per
# https://github.com/synestheticsystems/sutra/blob/main/docs/INTEGRATION.md
# so the running environment shows up in the sutra dashboard.
#
# What this does, in order:
#   1. liaison  — transclude code examples from example/ into index.html + src/
#   2. mdbook   — build the docs site into book/
#   3. copy     — overlay the landing page assets (index.html, styles.css,
#                 images/) into book/ so "/" serves the marketing page
#   4. serve    — browser-sync (hot reload) if installed, else `bun x serve`
#   5. watch    — three watcher groups: src/ (mdbook), landing assets (copy),
#                 example/ (liaison), degrading gracefully if no file watcher
#
# Port: honors an explicit PORT env var, otherwise picks a random free port
# (verified free by an actual bind test). The chosen port is printed below.

# `pipefail` matters for the sutra id: without it a missing shasum could
# silently produce an empty $REGISTRY_KEY and the cleanup globs would then
# match other projects' files in ~/.dev-runner/.
set -euo pipefail

# Ensure common tool paths are available (bun, liaison via cargo, mdbook)
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Resolve the project directory even when the script is piped in via stdin.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${GREEN}Starting ankurah.org development environment...${NC}\n"

# ============================================================================
# Sutra registry (~/.dev-runner) — situational-awareness dashboard
# See docs/INTEGRATION.md in the sutra repo for the file protocol.
# ============================================================================

REGISTRY_DIR="$HOME/.dev-runner"
mkdir -p "$REGISTRY_DIR"

# Portable SHA-256: macOS ships `shasum`, Linux ships `sha256sum`.
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi; }

# Stable per-project id derived from the absolute project path.
REGISTRY_KEY=$(printf %s "$SCRIPT_DIR" | sha256 | cut -c1-16)
# Length guard: an empty/short key would turn the cleanup globs below into
# "rm every other project's status files". Fail fast.
[ ${#REGISTRY_KEY} -ge 8 ] || { echo -e "${RED}fatal: empty/short registry key${NC}" >&2; exit 1; }
REGISTRY_FILE="$REGISTRY_DIR/$REGISTRY_KEY"

# Atomic status write (tmp + rename) so sutra's watcher never reads a
# half-written file. Convention: "<state>" or "<state>: <detail>".
update_status() {
    local name="$1" status="$2"
    local f="$REGISTRY_DIR/$REGISTRY_KEY.$name.status"
    printf '%s\n' "$status" > "$f.tmp" 2>/dev/null && mv -f "$f.tmp" "$f" 2>/dev/null || true
}

# Remove every status file for THIS project (guarded against empty key).
clear_all_status() {
    [ -n "${REGISTRY_KEY:-}" ] && [ ${#REGISTRY_KEY} -ge 8 ] || {
        echo -e "${RED}clear_all_status: refusing — REGISTRY_KEY missing or too short${NC}" >&2
        return 1
    }
    rm -f "$REGISTRY_DIR/$REGISTRY_KEY".*.status
}

register_instance() {
    cat > "$REGISTRY_FILE" << EOF
DIR=$SCRIPT_DIR
PID=$1
SITE_PORT=$PORT
STARTED=$(date +%s)
EOF
}

# PID currently recorded in the meta file (empty if none).
registered_pid() {
    [ -f "$REGISTRY_FILE" ] || return 0
    grep '^PID=' "$REGISTRY_FILE" 2>/dev/null | head -1 | cut -d= -f2
}

# Is another (still-alive) instance the registered owner? Because the
# registry key is derived from the project path, every invocation for this
# project shares one meta file. We must not let an exiting or failed run tear
# down the registration/status of a DIFFERENT instance that is still serving.
another_owner_alive() {
    local rp
    rp=$(registered_pid)
    [ -n "$rp" ] && [ "$rp" != "$$" ] && kill -0 "$rp" 2>/dev/null
}

unregister_instance() {
    # Only remove the shared registry if we own it (or it's ownerless/stale).
    if another_owner_alive; then
        return 0
    fi
    clear_all_status || true
    rm -f "$REGISTRY_FILE"
}

# Export so any subshell/watcher can publish status too.
export REGISTRY_DIR REGISTRY_KEY
export -f update_status

# Belt-and-suspenders: clear any stale status left by a PRIOR CRASHED run
# before we start writing fresh state — but only if no live instance owns the
# registry right now (don't stomp a concurrently-running one).
if ! another_owner_alive; then
    clear_all_status || true
fi

# ============================================================================
# Process management & cleanup
#
# We enable job control (`set -m`) so every backgrounded job (server,
# watchers, sidecar) becomes its own process-group leader — its PGID equals
# its own PID. That lets the cleanup trap reap each one as a GROUP
# (`kill -- -<pid>`), which takes down the whole subtree (e.g. the `sleep`
# inside a `fswatch | while ...; mdbook build` loop, or the `serve | sed`
# pipeline) in one shot — no orphaned grandchildren, and without the broad
# `pkill -f "bun.*serve" / fswatch / browser-sync` patterns the old script
# used, which could kill unrelated processes anywhere on the machine.
#
# Note: macOS ships bash 3.2 where $BASHPID is empty, so the sutra doc's
# single-`kill -- -$PGID`-on-a-self-backgrounded-supervisor trick does not
# apply here; per-child group kills are the portable equivalent.
# ============================================================================

set -m

# Track each backgrounded job's PID (== its PGID under `set -m`).
PIDS=()

cleanup() {
    # Disarm the trap so a signal mid-cleanup doesn't re-enter.
    trap - SIGINT SIGTERM SIGHUP EXIT
    echo -e "\n${YELLOW}Shutting down...${NC}"

    # Remove sutra registry entry + status files first so the dashboard
    # reflects shutdown even if a kill below hangs.
    unregister_instance

    # Kill each tracked job as a process group — reaps the job and all its
    # descendants. Never touches this script's own group (and thus never the
    # shell/harness that launched us).
    for pid in "${PIDS[@]:-}"; do
        [ -n "$pid" ] || continue
        kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
        pkill -P "$pid" 2>/dev/null || true
    done

    # Give things a beat, then SIGKILL any group stragglers.
    sleep 0.5
    for pid in "${PIDS[@]:-}"; do
        [ -n "$pid" ] || continue
        kill -9 -- -"$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    done

    echo -e "${GREEN}✓ All services stopped${NC}"
}

trap cleanup SIGINT SIGTERM SIGHUP EXIT

# ============================================================================
# Prerequisite checks
# ============================================================================

# bun — required (used for the fallback static server)
if ! command -v bun &> /dev/null; then
    echo -e "${RED}Error: bun is not installed${NC}"
    echo "Install it with: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# liaison — required (code transclusion)
if ! command -v liaison &> /dev/null; then
    echo -e "${RED}Error: liaison is not installed${NC}"
    echo "Install it with: cd ../liaison && cargo install --path ."
    exit 1
fi

# mdbook — required (docs build)
if ! command -v mdbook &> /dev/null; then
    echo -e "${RED}Error: mdbook is not installed${NC}"
    echo "Install it with: cargo install mdbook"
    exit 1
fi

# browser-sync — OPTIONAL. We do NOT auto-install it globally (that mutates
# the user's environment behind their back). If present we use it for hot
# reload; otherwise we fall back to a plain static server. This mirrors the
# sutra guidance of degrading gracefully rather than side-effecting.
if command -v browser-sync &> /dev/null; then
    USE_BROWSER_SYNC=true
else
    USE_BROWSER_SYNC=false
fi

# ============================================================================
# Port selection: explicit PORT env var > random free port
# ============================================================================

PORT_RANGE_MIN=10000
PORT_RANGE_MAX=59999
MAX_PORT_ATTEMPTS=50

# Is a TCP port free? Two-layer check:
#   1. lsof pre-filter — catches listeners of ANY address family (IPv4/IPv6),
#      which a 127.0.0.1-only bind test would miss.
#   2. actual bind on 0.0.0.0 via node — authoritative, and TOCTOU-safe at
#      the moment of binding. We bind the wildcard address (not 127.0.0.1) so
#      an IPv6-any or 0.0.0.0 listener on the same port is detected.
port_is_free() {
    local port=$1
    # Layer 1: anything already listening on this port?
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        return 1
    fi
    # Layer 2: can we actually bind it?
    if command -v node &> /dev/null; then
        node -e '
            const net = require("net");
            const s = net.createServer();
            s.once("error", () => process.exit(1));
            s.once("listening", () => s.close(() => process.exit(0)));
            s.listen(parseInt(process.argv[1], 10), "0.0.0.0");
        ' "$port" >/dev/null 2>&1
        return $?
    fi
    # No node: bash /dev/tcp connect test as a last resort (free == refused).
    if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
        exec 3>&- 2>/dev/null || true
        return 1
    fi
    return 0
}

random_port() {
    echo $(( PORT_RANGE_MIN + RANDOM % (PORT_RANGE_MAX - PORT_RANGE_MIN + 1) ))
}

select_port() {
    # 1) Explicit override (e.g. from the Claude Code preview harness).
    if [ -n "${PORT:-}" ]; then
        if port_is_free "$PORT"; then
            echo -e "${DIM}Using PORT from environment: $PORT${NC}" >&2
            return 0
        fi
        echo -e "${RED}Error: requested PORT=$PORT is already in use${NC}" >&2
        exit 1
    fi

    # 2) Randomized free port.
    local candidate
    for ((i=0; i<MAX_PORT_ATTEMPTS; i++)); do
        candidate=$(random_port)
        if port_is_free "$candidate"; then
            PORT=$candidate
            echo -e "${DIM}Selected random free port: $PORT${NC}" >&2
            return 0
        fi
    done

    echo -e "${RED}Error: could not find a free port after $MAX_PORT_ATTEMPTS attempts${NC}" >&2
    exit 1
}

select_port
export PORT

# ============================================================================
# Build pipeline
# ============================================================================

copy_landing_assets() {
    cp index.html book/ 2>/dev/null || true
    cp styles.css book/ 2>/dev/null || true
    cp -r images book/ 2>/dev/null || true
}

# Config for the `bun x serve` fallback. By default `serve` rewrites *.html
# URLs to extension-less "clean URLs" via 301 redirects (and /index.html ->
# /), which changes the contract: a plain request for /what-is-ankurah.html
# would 301 instead of 200. mdBook's own internal links all use .html, and
# the live-preview/review setup serves .html at 200 (python http.server), so
# we disable clean-URL rewriting to serve files literally, matching that
# behavior. Written into book/ (git-ignored build output), passed via -c.
SERVE_CONFIG="$SCRIPT_DIR/book/serve.json"
write_serve_config() {
    # - cleanUrls/trailingSlash off: serve *.html literally at 200 (no 301 to
    #   extension-less URLs), matching python http.server and mdBook's links.
    # - rewrite "/" -> "/index.html": without this, `serve` renders a directory
    #   listing for "/" instead of the landing page. Do NOT use
    #   "directoryListing": false to fix that — it 404s "/" entirely.
    cat > "$SERVE_CONFIG" 2>/dev/null << 'JSON' || true
{
  "cleanUrls": false,
  "trailingSlash": false,
  "rewrites": [
    { "source": "/", "destination": "/index.html" }
  ]
}
JSON
}

echo -e "${BLUE}[1/3]${NC} Running liaison to transclude code examples..."
update_status liaison "building: transcluding"
if ! liaison index.html 2>&1 | grep -E "(Updated|No changes)" > /dev/null; then
    echo -e "${RED}✗${NC} liaison failed"
    update_status liaison "failed: transclude error"
    liaison index.html  # Show the actual error
    exit 1
fi
update_status liaison "ready"
echo -e "${GREEN}✓${NC} Code examples transcluded"

echo -e "${BLUE}[2/3]${NC} Building initial site..."
update_status mdbook "building: mdbook"
if ! mdbook build > /dev/null 2>&1; then
    echo -e "${RED}✗${NC} Initial build failed\n"
    update_status mdbook "failed: build error"
    exit 1
fi
update_status mdbook "ready"
echo -e "${GREEN}✓${NC} mdBook build complete"

# Always copy landing page files on startup
echo -e "${BLUE}      ${NC} Copying landing page assets..."
copy_landing_assets
echo -e "${GREEN}✓${NC} Landing page assets copied\n"

# ============================================================================
# Server + watchers
# ============================================================================

echo -e "${BLUE}[3/3]${NC} Starting watchers and server...\n"

update_status site "starting"

if [ "$USE_BROWSER_SYNC" = true ]; then
    echo -e "${YELLOW}Starting browser-sync with hot-reload on port ${PORT}...${NC}"
    (cd book && browser-sync start --server --port "$PORT" --no-open --no-ui --files "**/*" 2>&1 | sed 's/^/[SERVER] /') &
    SERVER_PID=$!
    PIDS+=("$SERVER_PID")
else
    echo -e "${YELLOW}Starting static file server on port ${PORT} (no hot-reload)...${NC}"
    write_serve_config
    # --no-port-switching: bind exactly $PORT or fail (never silently switch);
    #   the harness relies on the announced port being the one in use.
    # -c serve.json: disable clean-URL redirects so *.html returns 200.
    (cd book && exec bun --bun x serve -l "$PORT" --no-port-switching --no-clipboard -c serve.json 2>&1 | sed 's/^/[SERVER] /') &
    SERVER_PID=$!
    PIDS+=("$SERVER_PID")
fi

# Readiness probe sidecar — flip the sutra "site" status to ready once the
# server actually answers, else mark it failed. Guarded so it can't outlive
# the parent (it's inside our process group and also self-limits to ~30s).
(
    ready=false
    for ((i=0; i<30; i++)); do
        if curl -sf "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
            update_status site "ready"
            ready=true
            break
        fi
        sleep 1
    done
    [ "$ready" = true ] || update_status site "failed: timeout"
) &
PIDS+=("$!")

# Give the server a moment to come up before printing URLs.
sleep 2

# --- Watcher: mdBook sources (src/) ---------------------------------------
echo -e "${YELLOW}Starting mdBook watcher...${NC}"
if command -v fswatch &> /dev/null; then
    fswatch -o src/ 2>/dev/null | while read -r _; do
        echo -e "${BLUE}[WATCHER]${NC} Markdown files changed, rebuilding mdBook..."
        update_status mdbook "building: mdbook"
        mdbook build > /dev/null 2>&1 && update_status mdbook "ready" || update_status mdbook "failed: build error"
        copy_landing_assets
        echo -e "${GREEN}[WATCHER]${NC} Site rebuilt"
    done &
    PIDS+=("$!")
elif command -v inotifywait &> /dev/null; then
    while inotifywait -q -r -e modify,create,delete src/ 2>/dev/null; do
        echo -e "${BLUE}[WATCHER]${NC} Markdown files changed, rebuilding mdBook..."
        update_status mdbook "building: mdbook"
        mdbook build > /dev/null 2>&1 && update_status mdbook "ready" || update_status mdbook "failed: build error"
        copy_landing_assets
        echo -e "${GREEN}[WATCHER]${NC} Site rebuilt"
    done &
    PIDS+=("$!")
else
    echo -e "${YELLOW}⚠ File watcher not available (install fswatch for auto-rebuild)${NC}"
    echo -e "${YELLOW}  Markdown changes require manual rebuild: mdbook build && cp index.html styles.css book/ && cp -r images book/${NC}"
fi

# --- Watcher: landing page assets (index.html, styles.css, images/) -------
echo -e "${YELLOW}Starting landing page watcher...${NC}"
if command -v fswatch &> /dev/null; then
    fswatch -o index.html styles.css images/ 2>/dev/null | while read -r _; do
        echo -e "${BLUE}[WATCHER]${NC} Landing page files changed, copying..."
        copy_landing_assets
        echo -e "${GREEN}[WATCHER]${NC} Landing page updated"
    done &
    PIDS+=("$!")
elif command -v inotifywait &> /dev/null; then
    while inotifywait -q -r -e modify,create,delete index.html styles.css images/ 2>/dev/null; do
        echo -e "${BLUE}[WATCHER]${NC} Landing page files changed, copying..."
        copy_landing_assets
        echo -e "${GREEN}[WATCHER]${NC} Landing page updated"
    done &
    PIDS+=("$!")
else
    echo -e "${YELLOW}⚠ File watcher not available (install fswatch for auto-rebuild)${NC}"
    echo -e "${YELLOW}  Landing page changes require manual: cp index.html styles.css book/ && cp -r images book/${NC}"
fi

# --- Watcher: example code (example/) -> re-run liaison -------------------
echo -e "${YELLOW}Starting example code watcher...${NC}"
if command -v fswatch &> /dev/null; then
    fswatch -o example/ 2>/dev/null | while read -r _; do
        echo -e "${BLUE}[WATCHER]${NC} Example code changed, running liaison..."
        update_status liaison "building: transcluding"
        if liaison index.html 2>&1 | grep -q "Updated"; then
            cp index.html book/ 2>/dev/null || true
            update_status liaison "ready"
            echo -e "${GREEN}[WATCHER]${NC} Code examples transcluded and copied"
        else
            update_status liaison "ready"
            echo -e "${YELLOW}[WATCHER]${NC} No changes needed"
        fi
    done &
    PIDS+=("$!")
elif command -v inotifywait &> /dev/null; then
    while inotifywait -q -r -e modify,create,delete example/ 2>/dev/null; do
        echo -e "${BLUE}[WATCHER]${NC} Example code changed, running liaison..."
        update_status liaison "building: transcluding"
        if liaison index.html 2>&1 | grep -q "Updated"; then
            cp index.html book/ 2>/dev/null || true
            update_status liaison "ready"
            echo -e "${GREEN}[WATCHER]${NC} Code examples transcluded and copied"
        else
            update_status liaison "ready"
            echo -e "${YELLOW}[WATCHER]${NC} No changes needed"
        fi
    done &
    PIDS+=("$!")
else
    echo -e "${YELLOW}⚠ File watcher not available (install fswatch for auto-rebuild)${NC}"
    echo -e "${YELLOW}  Example code changes require manual: liaison index.html && cp index.html book/${NC}"
fi

# Register with sutra now that the supervisor (this script) and its port are
# known. PID is $$ — this script IS the process-group leader.
register_instance "$$"

echo -e "\n${GREEN}✓ All services started!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Port:${NC}        ${CYAN}${PORT}${NC}"
echo -e "${GREEN}Website:${NC}     http://localhost:${PORT}"
echo -e "${GREEN}Landing:${NC}     http://localhost:${PORT}/index.html"
echo -e "${GREEN}Docs:${NC}        http://localhost:${PORT}/what-is-ankurah.html"
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

# Wait for all background processes (server + watchers). The cleanup trap
# fires on Ctrl+C / SIGTERM / normal exit.
wait
