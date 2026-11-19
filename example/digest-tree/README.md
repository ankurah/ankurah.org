# Digest-tree documentation examples

This independent crate pins `6fe7640d1192bcf636fe27e9a26b57f72920644b` on
`feat/durable-selection-replication`. This is an implemented but unmerged and unreleased
0.10 preview, not the API currently available on `main` or crates.io.
`src/lib.rs` contains the generic examples transcluded into the book with Liaison.
The `test-support` feature provides the reference MemoryStore; it is used
here to teach the generic API, not to recommend a production storage engine.

`examples/node_lifecycle.rs` uses public Node APIs and a temporary file-backed
SQLite database. It checks query activation, a limited result's refill after
a canonical change, explicit tree flushing and reopening. It does not expose
the Node's private trees or simulate a crash. Its snippets also use Liaison.

`examples/query_sync.rs` connects an ephemeral client to a durable server
using the local-process connector and separate temporary SQLite databases.
It checks repeated fetch, a predicate exit with LIMIT refill, a live query
reconnecting after an offline edit, and a later standing update. Its snippets
are transcluded into Query Synchronization. The checks verify observable
results, not message counts or latency.

`examples/durable_replication.rs` uses independently stored durable SQLite
Nodes. It checks asymmetric interests, complete event ancestry, an offline
Selection exit, retained history and recreation of an interest after reopening.
Its controlled setup copies only the existing System root and catalog before
Node construction; application records arrive through replication.

Run from the website repository root:

```sh
cargo test --locked --manifest-path example/digest-tree/Cargo.toml
cargo run --locked --manifest-path example/digest-tree/Cargo.toml --example node_lifecycle
cargo run --locked --manifest-path example/digest-tree/Cargo.toml --example query_sync
cargo run --locked --manifest-path example/digest-tree/Cargo.toml --example durable_replication
cargo run --locked --quiet --manifest-path example/digest-tree/Cargo.toml --example trace > /tmp/digest-tree-trace.json
```

After the generator succeeds, replace
`src/digest-tree/figures/trace.json` with its output. It records real
`PageGetter` calls against four pairs of trees. Its embedded source revision
identifies the implementation used. The browser replays these observations;
it does not reimplement digest cryptography or invent network traffic.
The Node lifecycle, query synchronization and durable replication figures are separately labeled
conceptual sequences. They explain maintenance/recovery and
equal-digest/comparison/repair/coverage paths; they are not recorded traffic
or timing measurements.

Check the presentation logic and transclude the code and shared controls:

```sh
node --test src/digest-tree/figures/model.test.mjs
liaison src/digest-tree/*.md src/digest-tree/figures/*.html
liaison --check src/digest-tree/*.md src/digest-tree/figures/*.html
mdbook build
python3 scripts/check-links.py
```

Open the book through `mdbook serve --hostname 127.0.0.1`. Figures also have
standalone links. Check the controls with keyboard input, narrow and wide
viewports, the book's light and dark themes, and reduced motion enabled.
Playback starts only when requested, can be stepped or scrubbed, and stops
when the page becomes hidden. Prose and text descriptions retain the
explanation without relying on animation or color.

When updating the dependency revision, rerun the tests, regenerate the
trace, and review both the prose and recorded results. The Node preview
uses digest-based comparison for Fetch and live-query initialization/reconnect.
Reactor still owns standing live updates. Durable replication uses explicit
directional interests and bounded event histories; it does not promise
arbitrarily large atomic repairs or automatic interest persistence.
