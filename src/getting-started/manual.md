# Run the Repository Examples

Most projects should start from the [template](template.md), then follow
[A Synchronized Feature, End to End](first-app.md). This page is for contributors
and readers who want to run the smaller example applications maintained inside
the [Ankurah repository](https://github.com/ankurah/ankurah). It is not a
from-scratch project setup guide.

## Get the source

```bash
git clone https://github.com/ankurah/ankurah
cd ankurah
```

## Prerequisites

- **Install Rust:**

  - [rustup.rs](https://rustup.rs/)

- **Install Cargo Watch** (useful for development workflow):

  ```bash
  cargo install cargo-watch
  ```

- **Install wasm-pack:**

  - [wasm-pack installer](https://rustwasm.github.io/wasm-pack/installer/)

- **Install Bun** (used by the React example commands below):
  - [Bun installation guide](https://bun.sh/docs/installation)

## Server Setup

Start the example server (keep this running):

```bash
cargo run -p ankurah-example-server
```

Or in development mode with auto-reload:

```bash
cargo watch -x 'run -p ankurah-example-server'
```

## React Example App

1. **Compile the WASM bindings** in a second terminal:

   Navigate to the `wasm-bindings` example directory:

   ```bash
   cd examples/wasm-bindings
   wasm-pack build --target web --dev
   ```

   The one-off build exits when it finishes. For automatic rebuilds, keep this
   watcher running instead:

   ```bash
   cargo watch -s 'wasm-pack build --target web --dev'
   ```

2. **Run the React example app** in a third terminal, starting again from the
   repository root:

   ```bash
   cd examples/react-app
   bun install
   bun dev
   ```

3. **Test the app:**

   Load `http://localhost:5173/` in one regular browser tab, and one incognito browser tab to see real-time synchronization in action!

   > **Note:** You can also use two regular browser tabs, but they share one IndexedDB local storage backend, so incognito mode provides a better test of multi-node synchronization.

## Leptos Example App

The maintained Leptos example is the standalone template; the older in-tree
example is excluded from the Ankurah workspace. Clone
[ankurah/leptos-template](https://github.com/ankurah/leptos-template)
and follow its README to run it. It uses [Trunk](https://trunkrs.dev/) to build
and serve, and does not require building the Wasm bindings crate separately.

## How It Works

In the example setup:

- The **server** is a durable node: it retains complete event history for the
  data it stores and answers other nodes' retrieval requests.
- The browser is an ephemeral node. IndexedDB persists its synchronized working
  set across reloads, but the node is not expected to retain the system's full
  history.
- The demo server currently uses the **Sled** backend; **Postgres**, **SQLite**, and (in the browser) **IndexedDB** are also supported.
- The WebSocket connector carries subscriptions, state, and events between the
  browser and server.

## Next Steps

- Check out the [Examples](../examples.md) page for more code samples
- Learn [how Ankurah works](../architecture.md) under the hood
- Read the [Glossary](../glossary.md) to understand key terminology
- Join the [Discord](https://discord.gg/XMUUxsbT5S) to ask questions and share your projects!
