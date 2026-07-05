# Quick Start (Template)

The fastest way to a running Ankurah app is the React + Sled template with
`cargo-generate`:

```bash
cargo generate https://github.com/ankurah/react-sled-template
```

This creates a new project with:

- A Rust server using the Sled storage backend
- A React frontend with TypeScript
- WASM bindings pre-configured
- WebSocket communication between client and server
- Example models and UI components

After generating your project:

```bash
cd your-project-name
./dev.sh
```

This starts watchers for the Rust server, wasm-bindings, and React app. Open
your browser to `http://localhost:5173`. Press Ctrl+C to stop and all
watchers will exit cleanly.

To see real-time synchronization in action, open the app in one regular
browser tab and one incognito tab: the incognito tab gets its own IndexedDB
store, so the two tabs behave as two independent nodes syncing through your
server.

> **Tip**: More templates will be added soon for different use cases!
>
> **Need help?** Join the [Ankurah Discord](https://discord.gg/XMUUxsbT5S)!

## Next Steps

- [Defining Models](../models.md) -- describe your data
- [Querying Data](../queries/index.md) -- fetch and live-query it
- [Manual Setup](manual.md) -- if you cannot use the template, or want to see
  every moving part
