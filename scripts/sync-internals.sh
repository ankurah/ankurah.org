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

# Stamp every vendored chapter so nobody edits the copy by mistake.
# Consolidation plan (single doc home + liaison): ankurah/ankurah#283
BANNER='<!-- GENERATED FILE - do not edit here.
     Source of truth: ankurah repo docs/internals/ (run scripts/sync-internals.sh to refresh).
     Consolidation plan: https://github.com/ankurah/ankurah/issues/283
     Accuracy corrections: https://github.com/ankurah/ankurah/issues/348 -->'
for f in "$DST"/*.md; do
    printf '%s\n\n' "$BANNER" | cat - "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done

echo "Synced from $SRC (banners stamped). Review: git diff src/internals/"
