# Quick Start (Template)

## Prerequisites

Install a current stable Rust toolchain and `cargo-generate` before creating a
project:

```bash
cargo install cargo-generate --locked
```

The web development scripts also require frontend-specific tools:

- **React:** [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) and
  [Bun](https://bun.sh/)
- **Leptos:** [Trunk](https://trunkrs.dev/) plus the Rust WASM target:
  `rustup target add wasm32-unknown-unknown`
- **Postgres selection:** Docker, because the React and Leptos scripts run a
  local database container

The generated scripts check their primary executables and print a missing-tool
message. Install the Leptos WASM target explicitly; its script otherwise
reports only that the Trunk preflight build failed.

## Generate the project

Generate a new Ankurah app with
[`cargo-generate`](https://github.com/cargo-generate/cargo-generate), choosing
the frontend that matches your application:

- **Leptos** — `cargo generate https://github.com/ankurah/leptos-template`
- **React** — `cargo generate https://github.com/ankurah/react-template`
- **React Native** — currently blocked at generation; see the note below

The React and Leptos templates generate working chat applications with shared
Rust models, a durable server, a local client store, and live synchronization.
Their client bindings and development tools differ:

| Template | Client path | Current quick-start coverage |
|----------|-------------|------------------------------|
| React | TypeScript UI over Rust/WASM; IndexedDB locally | Browser development and Playwright multi-user tests |
| Leptos | Rust CSR app compiled to WASM; IndexedDB locally | Browser development through Trunk and end-to-end tests |
| React Native | React Native over UniFFI; Sled locally | Generation from `main` is currently blocked before the app can be built |

> **React Native template status:** as of July 2026, `cargo-generate` 0.23.12
> against template `main` (`f3c43b5`) tries to
> substitute template text inside the binary iOS `notification.caf` asset and
> `cargo generate https://github.com/ankurah/react-native-template` exits with
> an invalid-syntax error. The asset is missing from the binary
> exclusions in the template's
> [`cargo-generate.toml`](https://github.com/ankurah/react-native-template/blob/main/cargo-generate.toml).
> The iOS steps below describe the intended generated project, but are not a
> working from-scratch quick start until that upstream template bug is fixed;
> follow [react-native-template#10](https://github.com/ankurah/react-native-template/issues/10).

Choose the durable server's storage engine at generation time: **Sled**
(embedded, the default) or **Postgres**. Add `--define storage=postgres` to the
generation command. The React and Leptos development runners manage a local
Postgres container; a React Native server configured for Postgres reads
`DATABASE_URL` and expects you to provide the database.

## Run it

**Leptos / React (web):**

```bash
cd your-project-name
./dev.sh
```

`dev.sh` builds the server and frontend and starts them on randomized local
ports — open the URL it prints. Stop with `./dev.sh --stop` (`--status`,
`--logs`, and `--restart` are also available).

**React Native (iOS)** — the current script requires macOS, Xcode 16.1+, Node
20+, Ruby/Bundler with CocoaPods, the Rust iOS targets, and an installed
`iPhone 16` simulator. Install the generated app's dependencies first:

```bash
rustup target add aarch64-apple-ios-sim aarch64-apple-ios
cd react-app
npm install
bundle install
cd ios
bundle exec pod install
cd ../..
```

Then start the server and app in separate terminals:

```bash
cd your-project-name
cargo run -p your-project-name-server   # start the server (ws://localhost:9898)
./dev.sh                                # build the bindings + launch the iOS app
```

To see real-time synchronization in action, run the app as two independent
nodes. On the web, open one regular browser tab and one incognito tab — the
incognito tab gets its own IndexedDB store, so the two behave as separate nodes
syncing through your server. The React Native `dev.sh` currently launches one
fixed simulator target; a second client requires a separately configured
simulator or device rather than another invocation of the documented script.

> **Need help?** Join the [Ankurah Discord](https://discord.gg/XMUUxsbT5S)!

## Next Steps

- [A Synchronized Feature, End to End](first-app.md) -- follow one model from Rust
  definition through replication and a reactive UI
- [Defining Models](../models.md) -- describe your data
- [Querying Data](../queries/index.md) -- fetch and live-query it
- [Run the Repository Examples](manual.md) -- inspect the minimal examples in
  the Ankurah source tree
