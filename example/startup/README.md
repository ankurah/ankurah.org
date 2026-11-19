# 0.10 startup snippets

These native and browser functions supply the book's startup snippets through
Liaison. They pin the same unreleased source as `../digest-tree`. The server
function runs until stopped; clients require a reachable durable server and
return both the Context and connector handle for the application to retain.

`./scripts/check-preview.sh` runs these checks alongside the executable Node
examples and figure checks. CI runs the same script on the 0.10 branch.

```sh
cargo check --locked --manifest-path example/startup/Cargo.toml
cargo check --locked --manifest-path example/startup/Cargo.toml --target wasm32-unknown-unknown
liaison src/getting-started/first-app.md src/examples.md src/guides/deployment.md
liaison --check src/getting-started/first-app.md src/examples.md src/guides/deployment.md
```

These are compile checks, not browser or WebSocket end-to-end tests. Executable
Node startup, identity, reset and synchronization checks live in `../digest-tree`.
The older model, query and React examples in the parent workspace remain on 0.9;
they are independent of this startup sample and have not been repinned to 0.10.
