# API Reference (docs.rs)

The book explains concepts and tasks; the complete API surface lives on
docs.rs. Most applications depend on a single crate:

- **[`ankurah`](https://docs.rs/ankurah)** -- the main API crate. Re-exports
  the model derive, `Node`, contexts, transactions, queries, and the
  `fetch!`/`selection!` macros. Start here.

The workspace splits into focused crates underneath; you will mostly meet
them in error messages and Cargo trees rather than importing them directly:

| Crate | What it is |
|-------|------------|
| [`ankurah-core`](https://docs.rs/ankurah-core) | The engine: entities, transactions, the event DAG, policy, reactor |
| [`ankql`](https://docs.rs/ankql) | The query language: parser and AST for predicates, `ORDER BY`, `LIMIT` |
| [`ankurah-signals`](https://docs.rs/ankurah-signals) | The reactive signal primitives used for observability |
| [`ankurah-proto`](https://docs.rs/ankurah-proto) | Wire and storage data types: events, clocks, ids, attestations |
| [`ankurah-derive`](https://docs.rs/ankurah-derive) | The `#[derive(Model)]` macro |

Storage engines and connectors are separate crates so applications only
compile what they use:

| Crate | Role |
|-------|------|
| [`ankurah-storage-sled`](https://docs.rs/ankurah-storage-sled) | Embedded key-value storage (native; default for servers and development) |
| [`ankurah-storage-sqlite`](https://docs.rs/ankurah-storage-sqlite) | Single-file SQL storage (native, including mobile) |
| [`ankurah-storage-postgres`](https://docs.rs/ankurah-storage-postgres) | Production SQL server storage |
| [`ankurah-storage-indexeddb-wasm`](https://docs.rs/ankurah-storage-indexeddb-wasm) | Browser storage for WASM nodes |
| [`ankurah-websocket-server`](https://docs.rs/ankurah-websocket-server) | WebSocket server connector |
| [`ankurah-websocket-client`](https://docs.rs/ankurah-websocket-client) | WebSocket client connector (native) |
| [`ankurah-websocket-client-wasm`](https://docs.rs/ankurah-websocket-client-wasm) | WebSocket client connector (browser) |
| [`ankurah-jwt-auth`](https://docs.rs/ankurah-jwt-auth) | JWT-based policy agent extension |

For how these layers fit together, see the
[overview](../architecture.md); for the storage traits behind the engine
crates, see the [Storage Engine Layer](../internals/storage-engines.md)
chapter.
