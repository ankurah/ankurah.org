# Digest-tree documentation examples

This independent crate pins the implementation merged for the 0.10 preview.
`src/lib.rs` contains the examples transcluded into the book with Liaison.
The `test-support` feature provides the reference MemoryStore; it is used
here to teach the generic API, not to recommend a production storage engine.

Run from the website repository root:

```sh
cargo test --manifest-path example/digest-tree/Cargo.toml
cargo run --quiet --manifest-path example/digest-tree/Cargo.toml --example trace > /tmp/digest-tree-trace.json
```

After the generator succeeds, replace
`src/digest-tree/figures/trace.json` with its output. It records real
`PageGetter` calls against four pairs of trees. Its embedded source revision
identifies the implementation used. The browser replays these observations;
it does not reimplement digest cryptography or invent network traffic.

Check the presentation logic and transclude the code and shared controls:

```sh
node --test src/digest-tree/figures/model.test.mjs
liaison src/digest-tree/*.md src/digest-tree/figures/*.html
liaison --check src/digest-tree/*.md src/digest-tree/figures/*.html
mdbook build
```

Open the book through `mdbook serve --hostname 127.0.0.1`. Figures also have
standalone links. Check the controls with keyboard input, narrow and wide
viewports, the book's light and dark themes, and reduced motion enabled.
Playback starts only when requested, can be stepped or scrubbed, and stops
when the page becomes hidden. Prose and text descriptions retain the
explanation without relying on animation or color.

When updating the dependency revision, rerun the tests, regenerate the
trace, and review both the prose and recorded results. The preview should
not acquire Node or network claims merely because the generic API can
support them.
