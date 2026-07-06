# Manual Setup

Most projects should start from the [template](template.md). Use this path
if you cannot, or if you want to see every moving part: it runs the example
apps from the [ankurah repository](https://github.com/ankurah/ankurah)
directly.

### Prerequisites

- **Install Rust:**

  - [rustup.rs](https://rustup.rs/)

- **Install Cargo Watch** (useful for development workflow):

  ```bash
  cargo install cargo-watch
  ```

- **Install wasm-pack:**

  - [wasm-pack installer](https://rustwasm.github.io/wasm-pack/installer/)

- **Install Bun** (npm/node might work, but Bun is faster):
  - [Bun installation guide](https://bun.sh/docs/installation)

### Server Setup

Start the example server (keep this running):

```bash
cargo run -p ankurah-example-server
```

Or in development mode with auto-reload:

```bash
cargo watch -x 'run -p ankurah-example-server'
```

### React Example App

1. **Compile the Wasm Bindings** (keep this running):

   Navigate to the `wasm-bindings` example directory:

   ```bash
   cd examples/wasm-bindings
   wasm-pack build --target web --debug
   ```

   Or in development mode with auto-rebuild:

   ```bash
   cargo watch -s 'wasm-pack build --target web --debug'
   ```

2. **Run the React Example App** (keep this running):

   ```bash
   cd examples/react-app
   bun install
   bun dev
   ```

3. **Test the app:**

   Load `http://localhost:5173/` in one regular browser tab, and one incognito browser tab to see real-time synchronization in action!

   > **Note:** You can also use two regular browser tabs, but they share one IndexedDB local storage backend, so incognito mode provides a better test of multi-node synchronization.

### Leptos Example App

The Leptos example is maintained as a standalone template repository rather than
in the ankurah repo. Clone
[ankurah/leptos-template](https://github.com/ankurah/leptos-template)
and follow its README to run it. It uses [Trunk](https://trunkrs.dev/) to build
and serve, and does not require building the Wasm bindings crate separately.

## How It Works

In the example setup:

- The **"server"** process is a native Rust process whose node is flagged as **"durable"**, meaning that it attests it will not lose data.
- The **"client"** process is a WASM process that is also durable in some sense, but not to be relied upon to have all data.
- The demo server currently uses the **Sled** backend; **Postgres**, **SQLite**, and (in the browser) **IndexedDB** are also supported.
- WebSocket connections enable real-time bi-directional communication between nodes.

## Next Steps

- Check out the [Examples](../examples.md) page for more code samples
- Learn [how Ankurah works](../architecture.md) under the hood
- Read the [Glossary](../glossary.md) to understand key terminology
- Join the [Discord](https://discord.gg/XMUUxsbT5S) to ask questions and share your projects!
