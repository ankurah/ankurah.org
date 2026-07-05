# Deployment & Operations

An Ankurah deployment is small: one durable server process holding the
system of record, any number of ephemeral clients (browsers, native apps)
connecting over WebSockets, and a storage engine under the server. This
page covers standing that up for real -- storage choices, the one-time
system bootstrap, ports and TLS, upgrades, and backups.

## The durable server

The minimal production shape, from the example server:

```rust,ignore
let storage_dir = dirs::home_dir().unwrap().join(".ankurah");
let storage = SledStorageEngine::with_path(storage_dir)?;
let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
node.system.create().await?;

let mut server = WebsocketServer::new(node);
server.run("0.0.0.0:9797").await?;
```

Three decisions are hiding in those lines:

**Durability.** `Node::new_durable` marks this node as a system of record:
it keeps full event history and answers other nodes' fetches. Clients use
`Node::new` (ephemeral) -- they hold a synchronized working set and lean on
durable peers for history.

**The system bootstrap.** `node.system.create()` initializes a brand-new
system and must run **exactly once, ever, per system** -- it errors if a
system root already exists. Every subsequent process (and every restart)
joins the existing system instead: clients call
`node.system.wait_system_ready().await` after connecting. A mismatched
system root between peers is treated as a different system, so do not
create fresh systems against stores you mean to keep.

**The policy agent.** `PermissiveAgent::new()` performs no authentication
and no authorization -- it is the development baseline. Before exposing a
server to anyone you do not fully trust, wire a real agent: see
[Authentication & Policy](auth.md).

## Choosing a storage engine

| Engine | Construction | Fits |
|--------|--------------|------|
| Sled | `SledStorageEngine::new()` (uses `~/.ankurah`) or `with_path(dir)` | Default: embedded, zero-dependency servers and development |
| SQLite | `SqliteStorageEngine::open(path).await` (or `open_in_memory()`) | Single-file deployments, mobile; requires SQLite 3.45+ for JSONB |
| Postgres | `Postgres::open("postgresql://user:pass@host/db").await` | Production SQL infrastructure, inspectable data, existing backup tooling |
| IndexedDB | automatic in the browser template | Browser clients (WASM); not a server engine |

All engines implement the same two traits and behave identically at the
API; the trade-offs are operational. Details:
[Storage Engine Layer](../internals/storage-engines.md).

For Postgres, the URI is standard `tokio-postgres` form. Tables are created
on demand -- one state table per collection (named for the collection) plus
`{collection}_event` -- and property columns are added as models introduce
them, so no schema migration step is needed for new fields.

## Ports, TLS, and the browser

`WebsocketServer::run("0.0.0.0:9797")` binds plain TCP. The example
server uses port 9797 and the React template defaults to 9898; pick your
own and keep client URLs in sync. For production:

- **Terminate TLS in front of the server** (reverse proxy or load
  balancer) and point clients at `wss://your-host`. Native clients can
  also bring their own TLS configuration on the connection builder.
- The WebSocket handshake itself is unauthenticated by design -- requests
  are authenticated individually inside the protocol (see
  [Authentication & Policy](auth.md)) -- so transport encryption is what
  `wss://` is buying you, not access control.
- Browser clients are WASM builds (`wasm-pack build --target web` in your
  bindings crate; the [template](../getting-started/template.md) wires
  this up with a `dev.sh` that watches and rebuilds).

A Rust process can also be a client -- useful for workers and services
that participate in sync rather than owning it:

```rust,ignore
let node = Node::new(Arc::new(storage), PermissiveAgent::new());
let _client = WebsocketClient::new(node.clone(), "ws://localhost:9797").await?;
node.system.wait_system_ready().await;
```

Hold on to the returned `WebsocketClient` handle for the life of the
connection, as the example does.

## Upgrades

- **0.8.x stores upgrade themselves.** 0.9 reads pre-0.9 LWW state
  buffers through a legacy fallback and rewrites each entity in the
  current format on its next save -- no migration step. Details in
  [Property Backends](../internals/property-backends.md).
- **Upgrade all nodes together.** There is no protocol version negotiation
  yet, and 0.8.x binaries cannot read 0.9 state buffers, so mixed-version
  fleets are not supported across the 0.8 -> 0.9 boundary.

## Backups

Back up the storage engine's data as a whole -- for Sled that is the
storage directory (`~/.ankurah` by default), for SQLite the database file,
for Postgres your normal database backup. Entity state and event history
live side by side in the same store, and both matter: state is the
materialized view, but events are the authoritative history that concurrent
merges depend on. Snapshot them together; a state-only backup would leave
future merges unable to walk history.

One operational note on crash behavior: events are committed before the
state that references them is persisted, so a crash can leave orphaned
events (harmless; integrated on next delivery) but never state pointing at
missing history. Engine-level recovery is inherited from the engine (sled
crash recovery, SQLite journaling, Postgres WAL).

## What to monitor

The observability story is young: there is no built-in metrics endpoint or
health check yet. Practical minimum today: process supervision on the
server, disk growth of the storage directory (event history is
append-only), and your reverse proxy's WebSocket connection counts. Log
output uses standard `tracing`, so a `tracing-subscriber` with an
env-filter gives you leveled logs.
