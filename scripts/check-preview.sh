#!/usr/bin/env bash
set -euo pipefail

docs_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$docs_root"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$docs_root/example/target/preview}"

cargo check --locked --manifest-path example/startup/Cargo.toml
cargo check --locked --manifest-path example/startup/Cargo.toml --target wasm32-unknown-unknown
cargo test --locked --manifest-path example/digest-tree/Cargo.toml
for preview_example in node_identity node_lifecycle query_sync durable_replication; do
    cargo run --locked --manifest-path example/digest-tree/Cargo.toml --example "$preview_example"
done

node --test src/digest-tree/figures/model.test.mjs

trace_file=$(mktemp "${TMPDIR:-/tmp}/ankurah-docs-trace.XXXXXX")
trap 'rm -f "$trace_file"' EXIT
cargo run --locked --quiet --manifest-path example/digest-tree/Cargo.toml --example trace > "$trace_file"
if ! diff -u src/digest-tree/figures/trace.json "$trace_file"; then
    printf '\nComparison trace is stale. Regenerate and review it using example/digest-tree/README.md.\n' >&2
    exit 1
fi

printf '\nPreview compile checks, executable examples, figure tests and recorded trace passed.\n'
