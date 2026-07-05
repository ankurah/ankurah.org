# Quick Start (Template)

The fastest way to a running Ankurah app is a template with
[`cargo-generate`](https://github.com/cargo-generate/cargo-generate). Two are
available today — pick your frontend:

## React

```bash
cargo generate https://github.com/ankurah/react-template
```

A Rust server (Sled storage) with a React + TypeScript frontend: WASM bindings,
WebSocket sync between client and server, and example models and UI components.

## Leptos

```bash
cargo generate https://github.com/ankurah/leptos-template
```

The same chat app in Leptos (Rust → WASM, trunk/CSR): reactive live queries
wired through `ankurah-signals`' reactive-graph integration, with
virtual-scrolled message lists.

Both templates share the same Rust model and server, so you can start from
whichever frontend you prefer.

## Run it

After generating your project:

```bash
cd your-project-name
./dev.sh
```

`dev.sh` builds the Rust server and the frontend and starts everything on
randomized local ports (to avoid collisions) — it prints the URL to open on
startup. Stop it with `./dev.sh --stop` (see `./dev.sh --help` for `--status`,
`--logs`, and `--restart`).

To see real-time synchronization in action, open the app in one regular browser
tab and one incognito tab: the incognito tab gets its own IndexedDB store, so
the two tabs behave as two independent nodes syncing through your server.

> **Tip:** A React Native template also exists at
> [`ankurah/react-native-template`](https://github.com/ankurah/react-native-template).
>
> **Need help?** Join the [Ankurah Discord](https://discord.gg/XMUUxsbT5S)!

## Next Steps

- [Defining Models](../models.md) -- describe your data
- [Querying Data](../queries/index.md) -- fetch and live-query it
- [Manual Setup](manual.md) -- if you cannot use the template, or want to see
  every moving part
