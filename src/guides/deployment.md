# Deployment & Operations

A basic Ankurah deployment is small: one durable server process holding the
system of record, any number of ephemeral clients (browsers, native apps)
connecting over WebSockets, and a storage engine under the server. This
page covers storage choices, Node startup, ports and TLS, upgrades, and backups.

## The durable server

The startup code below follows the [0.10 preview](node-lifecycle.md) and is
compiled in the [startup example](https://github.com/ankurah/ankurah.org/tree/docs/0.10/example/startup):

<pre><code class="language-rust" transclude="example/startup/src/lib.rs#server-startup">let storage = SledStorageEngine::with_path(storage_dir)?;
let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
node.wait_ready().await?;

let mut server = WebsocketServer::new(node);
server.run(&quot;127.0.0.1:9797&quot;).await?;</code></pre>

Three decisions are hiding in those lines:

**Durability.** `Node::new_durable` marks this node as a system of record:
it keeps full event history and answers other nodes' fetches. Clients use
`Node::new` (ephemeral) -- they hold a synchronized working set and lean on
durable peers for history.

**Readiness and identity.** `wait_ready()` waits for the keypair, catalog and
policy to initialize. Fresh storage needs no System bootstrap. Reopening
loads the same keypair, preserving the NodeId. There is no runtime System-root
membership gate; authorization remains a policy decision. See
[Node Identity and Reset](node-lifecycle.md) before clearing storage or
constructing a successor after reset.

**The policy agent.** `PermissiveAgent::new()` performs no application authentication
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

All engines expose the same `StorageEngine` contract and
aim for equivalent query semantics. Their planning, platform constraints,
feature maturity, and operational trade-offs differ. Details:
[Storage Engine Layer](../internals/storage-engines.md).

For Postgres, the URI is standard `tokio-postgres` form. The storage engine
owns the physical tables and ordered maps. Keep entity state, event history,
Node keys and derived-tree metadata together when backing it up.

## Ports, TLS, and the browser

`WebsocketServer::run("0.0.0.0:9797")` binds plain TCP. The example
server uses port 9797 and the React template defaults to 9898; pick your
own and keep client URLs in sync. Before an internet-facing deployment:

- **Terminate TLS in front of the server** (reverse proxy or load
  balancer) and point clients at `wss://your-host`. Native clients can
  also bring their own TLS configuration on the connection builder.
- Ankurah connection setup proves possession of the Node's private key.
  Application requests still pass through the policy agent (see
  [Authentication & Policy](auth.md)). Use `wss://` for transport
  confidentiality, integrity and certificate-based server identity;
  possession of a Node key does not itself grant application access.
- Browser clients are WASM builds. React uses a `wasm-pack --target web`
  bindings crate; Leptos compiles the Rust application directly through
  Trunk. The [templates](../getting-started/template.md) wire each path into
  their development runners.

A Rust process can also be a client -- useful for workers and services
that participate in sync rather than owning it:

<pre><code class="language-rust" transclude="example/startup/src/lib.rs#native-client-startup">let storage = SledStorageEngine::with_path(storage_dir)?;
let node = Node::new(Arc::new(storage), PermissiveAgent::new());
let client = WebsocketClient::new(node.clone(), server_url).await?;
node.wait_ready().await?;
let context = node.context(DEFAULT_CONTEXT)?;</code></pre>

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

In 0.10, canonical entity changes and their supporting events commit in one
storage transaction. Derived digest trees can persist later and recover from
canonical state. A durable Node requires supporting history when accepting
remote updates; ephemeral Nodes can accept authorized state snapshots without
retaining full history. See [Storage and Transactions](../digest-tree/storage.md)
and [Durable Replication](../digest-tree/durable-replication.md) for these
boundaries. Power-loss durability follows the selected engine's configuration.

## What to monitor

The observability story is young: there is no built-in metrics endpoint or
health check yet. Practical minimum today: process supervision on the
server, disk growth of the storage directory (event history is
append-only), and your reverse proxy's WebSocket connection counts. Log
output uses standard `tracing`, so a `tracing-subscriber` with an
env-filter gives you leveled logs.
