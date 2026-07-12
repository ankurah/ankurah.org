# Deployment & Operations

A basic Ankurah deployment is small: one durable server process holding the
system of record, any number of ephemeral clients (browsers, native apps)
connecting over WebSockets, and a storage engine under the server. This
page covers standing that up for real -- storage choices, the one-time
system bootstrap, ports and TLS, upgrades, and backups.

## The durable server

The minimal durable-server shape, from the example workspace:

```rust,ignore
let storage_dir = dirs::home_dir().unwrap().join(".ankurah");
let storage = SledStorageEngine::with_path(storage_dir)?;
let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
node.system.wait_loaded().await;
if node.system.root().is_none() {
    node.system.create().await?;
}

let mut server = WebsocketServer::new(node);
server.run("0.0.0.0:9797").await?;
```

Three decisions are hiding in those lines:

**Durability.** `Node::new_durable` marks this node as a system of record:
it keeps full event history and answers other nodes' fetches. Clients use
`Node::new` (ephemeral) -- they hold a synchronized working set and lean on
durable peers for history.

**The system bootstrap.** `wait_loaded()` first lets the durable node inspect
its store. `node.system.create()` is called only when that store has no system
root; it initializes a brand-new system and errors if a root already exists.
Every restart reuses the stored root. Ephemeral clients call
`node.system.wait_system_ready().await` after connecting to wait until they have
joined the server's system; `SystemManager::create()` separately rejects
non-durable nodes. A mismatched root identifies a different system, so do not
replace or recreate it for stores you mean to keep.

Current 0.9 caveat: these readiness methods use a check followed by a
notification wait, which has a rare lost-wakeup window; a catalog-load error is
logged but does not release `wait_loaded()`. In a supervised deployment, put an
external bound on startup and treat an unresolved readiness wait as a failure
to investigate in the logs. The implementation fix is tracked in
[#347](https://github.com/ankurah/ankurah/issues/347).

**The policy agent.** `PermissiveAgent::new()` performs no authentication
and no authorization -- it is the development baseline. Before exposing a
server to anyone you do not fully trust, wire a real agent: see
[Authentication & Policy](auth.md).

## Choosing a storage engine

| Engine | Construction | Fits |
|--------|--------------|------|
| Sled | `SledStorageEngine::new()` (uses `~/.ankurah`) or `with_path(dir)` | Template default: embedded servers and development with no external database service |
| SQLite | `SqliteStorageEngine::open(path).await` (or `open_in_memory()`) | Single-file deployments and mobile; the crate bundles a JSONB-capable SQLite build |
| Postgres | `Postgres::open("postgresql://user:pass@host/db").await` | Server deployments using existing PostgreSQL infrastructure and backup tooling |
| IndexedDB | automatic in the browser template | Browser clients (WASM); not a server engine |

All engines expose the same `StorageEngine` and `StorageCollection` APIs and
aim for equivalent query semantics. Their planning, platform constraints,
feature maturity, and operational trade-offs differ. Details:
[Storage Engine Layer](../internals/storage-engines.md).

For Postgres, the URI is standard `tokio-postgres` form. Tables are created
on demand -- one state table per collection (named for the collection) plus
`{collection}_event` -- and property columns are added as models introduce
them, so no schema migration step is needed for new fields.

## Ports, TLS, and the browser

`WebsocketServer::run("0.0.0.0:9797")` binds plain TCP. The example
server uses port 9797 and the React template defaults to 9898; pick your
own and keep client URLs in sync. Before an internet-facing deployment:

- **Terminate TLS in front of the server** (reverse proxy or load
  balancer) and point clients at `wss://your-host`. Native clients can
  also bring their own TLS configuration on the connection builder.
- The WebSocket handshake itself is unauthenticated by design -- requests
  are authenticated individually inside the protocol (see
  [Authentication & Policy](auth.md)) -- so `wss://` provides transport
  confidentiality, integrity, and server identity, not application access
  control.
- Browser clients are WASM builds. React uses a `wasm-pack --target web`
  bindings crate; Leptos compiles the Rust application directly through
  Trunk. The [templates](../getting-started/template.md) wire each path into
  their development runners.

A Rust process can also be a client -- useful for workers and services
that participate in sync rather than owning it:

```rust,ignore
let node = Node::new(Arc::new(storage), PermissiveAgent::new());
let _client = WebsocketClient::new(node.clone(), "ws://localhost:9797").await?;
node.system.wait_system_ready().await;
```

Hold on to the returned `WebsocketClient` handle for the life of the
connection, as the example does.

## Upgrade note: 0.8 to 0.9

- **Pre-0.9 LWW buffers load lazily.** 0.9 reads pre-0.9 LWW state
  buffers through a legacy fallback and rewrites each entity in the
  current format on its next save -- no migration step. Details in
  [Property Backends](../internals/property-backends.md).
- **Upgrade all nodes together.** There is no protocol version negotiation
  yet, and 0.8.x binaries cannot read 0.9 state buffers, so mixed-version
  fleets are not supported across the 0.8 -> 0.9 boundary.

## Backups

Back up the storage engine's data as a consistent whole -- for Sled that is the
storage directory (`~/.ankurah` by default), for SQLite the database file,
for Postgres your normal database backup. Entity state and event history
live side by side in the same store, and both matter: state is the
materialized view, but events are the authoritative history that concurrent
merges depend on. Snapshot them together; a state-only backup would leave
future merges unable to walk history.

Use the storage engine's supported consistent-backup procedure rather than
copying files while writes are active. For an embedded store, the conservative
path is to stop the Ankurah process before copying it. For a database server,
use its transactional backup tooling. Test restoration into an isolated
environment before relying on the backup.

On local commits and other event-bearing application paths, events are stored
before the materialized state that references them. A crash can therefore
leave those paths with stored events and stale state. A pure `StateSnapshot`
payload is different: it may persist a snapshot without storing its head
events, which is intentional for ephemeral working sets. Recovery of a stale
event-backed state requires redelivery/reapplication of the unapplied event or
a response carrying the required history; an unrelated descendant alone is not a
documented recovery guarantee. Engine-level file or transaction recovery
remains the responsibility of the selected engine.

## What to monitor

The observability story is young: there is no built-in metrics endpoint or
health check yet. Practical minimum today: process supervision on the
server, disk growth of the storage directory (event history is
append-only), and your reverse proxy's WebSocket connection counts. Log
output uses standard `tracing`, so a `tracing-subscriber` with an
env-filter gives you leveled logs.
