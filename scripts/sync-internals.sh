#!/usr/bin/env bash
# Sync the contributor Internals chapters from the ankurah repo, which is
# their source of truth (docs/internals/). Run after internals docs change
# there, review the diff, and update src/SUMMARY.md if chapters were
# added or removed.
set -euo pipefail
SRC="${1:-../ankurah/docs/internals}"
DST="$(cd "$(dirname "$0")/.." && pwd)/src/internals"
if [ ! -d "$SRC" ]; then
    echo "source not found: $SRC (pass the path to ankurah/docs/internals)" >&2
    exit 1
fi
mkdir -p "$DST"
rsync -a --delete --exclude SUMMARY.md "$SRC"/ "$DST"/
echo "Synced from $SRC. Review: git diff src/internals/"
