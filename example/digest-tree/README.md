# Digest-tree documentation examples

This independent crate pins `d635ea5358396a2812526175f30471266ab7d8bb` on
`feat/node-digest-trees`. This is an implemented but unmerged and unreleased
0.10 preview, not the API currently available on `main` or crates.io.
`src/lib.rs` contains the generic examples transcluded into the book with Liaison.
The `test-support` feature provides the reference MemoryStore; it is used
here to teach the generic API, not to recommend a production storage engine.

`examples/node_lifecycle.rs` uses public Node APIs and a temporary file-backed
SQLite database. It checks query activation, a limited result's refill after
a canonical change, explicit tree flushing and reopening. It does not expose
the Node's private trees or simulate a crash. Its snippets also use Liaison.

Run from the website repository root:

```sh
cargo test --locked --manifest-path example/digest-tree/Cargo.toml
cargo run --locked --manifest-path example/digest-tree/Cargo.toml --example node_lifecycle
cargo run --locked --quiet --manifest-path example/digest-tree/Cargo.toml --example trace > /tmp/digest-tree-trace.json
```

After the generator succeeds, replace
`src/digest-tree/figures/trace.json` with its output. It records real
`PageGetter` calls against four pairs of trees. Its embedded source revision
identifies the implementation used. The browser replays these observations;
it does not reimplement digest cryptography or invent network traffic.
The Node lifecycle figure is a separately labeled conceptual sequence, with
flush and restart paths; it is not a recorded execution.

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
maintains trees and includes `KnownState` alongside `known_matches`; network
receivers still use only the latter for transfer decisions and completion.
