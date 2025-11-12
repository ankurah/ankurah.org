# Getting Started

There are two ways to get started with Ankurah: using a template or setting up manually.

## Starting from a Template

The quickest way to get started is to use our React + Sled template with `cargo-generate`:

```bash
cargo generate https://github.com/ankurah/react-sled-template
```

This will create a new project with:

- A Rust server using the Sled storage backend
- A React frontend with TypeScript
- WASM bindings pre-configured
- WebSocket communication between client and server
- Example models and UI components

After generating your project:

```bash
cd your-project-name

# Start the server (in one terminal)
cargo run -p server

# In another terminal, build the WASM bindings
cd wasm-bindings
wasm-pack build --target web --debug

# In another terminal, run the React app
cd react-app
bun install
bun dev
```

Then open your browser to the URL shown (usually `http://localhost:5173`).

> **Tip**: More templates will be added soon for different use cases!

---

## Manual Setup

If you want to set up Ankurah from scratch, follow these steps:

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

1. **Install Trunk** (build tool used by Leptos):

   ```bash
   cargo install trunk
   ```

2. **Run the Leptos Example App** (keep this running):

   ```bash
   cd examples/leptos-app
   trunk serve --open
   ```

> **Note:** For the Leptos app, there is no need to build the Wasm bindings crate separately.

## How It Works

In the example setup:

- The **"server"** process is a native Rust process whose node is flagged as **"durable"**, meaning that it attests it will not lose data.
- The **"client"** process is a WASM process that is also durable in some sense, but not to be relied upon to have all data.
- The demo server currently uses the **Sled** backend, but **Postgres** is also supported, and **TiKV** support is planned.
- WebSocket connections enable real-time bi-directional communication between nodes.

## Next Steps

- Check out the [Examples](examples.md) page for more code samples
- Learn about the [Architecture](architecture.md) to understand how Ankurah works
- Read the [Glossary](glossary.md) to understand key terminology
- Join the [Discord](https://discord.gg/XMUUxsbT5S) to ask questions and share your projects!
