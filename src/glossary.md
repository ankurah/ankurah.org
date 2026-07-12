# Glossary

This glossary defines key terms and concepts used throughout Ankurah.

## Core Concepts

### Model

A struct that describes the fields and projected Rust types for entities in a collection. Deriving `Model` generates a read-only View and a transaction-bound mutable handle.

<pre><code transclude="example/model/src/lib.rs#model">#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Album {
    #[active_type(YrsString)]
    pub name: String,
    pub artist: String,
    pub year: i32,
}</code></pre>

This generates `AlbumView` and `AlbumMut` alongside the user-defined `Album`
create input.

### Collection

A named group of entities described by the same Model. It is similar to a table in a traditional database, although its physical representation depends on the storage engine. PostgreSQL and SQLite use per-collection state and event tables.

### Entity

A discrete identity in a collection, similar to a row in a database. The entity stores dynamic property state; a Model provides a typed projection over that state. Its `EntityId` is an independently generated ULID, not a derivative of its creation event.

### View

A struct that represents the read-only view of an entity which is typed by the Model. Views provide type-safe access to entity properties without allowing mutations.

<pre><code transclude="example/server/src/main.rs#model-read">let view: AlbumView = ctx.get(album_id).await?;
println!(&quot;Album: {} by {} ({})&quot;, view.name()?, view.artist()?, view.year()?);</code></pre>

### Mutable

A generated handle such as `AlbumMut` that exposes an entity's active field types while a transaction is open. Obtain it by editing a View; mutations become durable only when the transaction commits.

<pre><code transclude="example/server/src/main.rs#model-update">let trx = ctx.begin();
let album = view.edit(&amp;trx)?;
album.name().replace(&quot;Parade - Music from the Motion Picture&quot;)?;
album.year().set(&amp;1987)?;
trx.commit().await?;</code></pre>

### Event

A committed, immutable change for one entity. Each event contains:

- The collection and `EntityId`
- Per-backend operation diffs
- A parent clock containing the immediate precursor event IDs

Its `EventId` is a SHA-256 content hash of the entity ID, operation set, and parent clock. Timestamps and node IDs are not implicit event metadata.

## Infrastructure

### Node

A participant in the Ankurah network. Nodes can be servers, clients, or peers. Each node has:

- A storage backend
- A policy agent (for permissions)
- Connection handlers
- A reactor for subscriptions

### Storage Engine

A means of storing and retrieving state and events. The current repository ships four implementations:

- **Sled**: Embedded native key-value storage
- **SQLite**: Embedded relational storage
- **Postgres**: Client/server relational storage
- **IndexedDB**: Browser storage for WASM clients

Ankurah is beta software, so do not assume identical feature maturity across all four engines without checking the backend-specific tests.

### Storage Collection

A collection of entities in a storage engine. The physical representation of a Collection in the storage layer.

## Operations

### Transaction

A local unit of work that groups creates and edits. An entity is snapshotted when it first enters the transaction; `commit()` validates the writes and generates an event for each changed entity. This API should not be read as a claim of globally serializable, cross-node ACID transactions.

<pre><code transclude="example/server/src/main.rs#model-create">let trx = ctx.begin();

let album = trx.create(&amp;Album {
    name: &quot;Parade&quot;.into(),
    artist: &quot;Prince&quot;.into(),
    year: 1986,
}).await?;

let album_id = album.id();
trx.commit().await?;</code></pre>

### Subscription

A live query that receives updates when matching entities change. Subscriptions use SQL-like predicates for filtering.

<pre><code transclude="example/server/src/main.rs#livequery-subscribe">use ankurah::signals::Subscribe;
let live: LiveQuery&lt;AlbumView&gt; = ctx.query(&quot;year &gt; 2000&quot;)?;
live.wait_initialized().await;
let _guard = live.subscribe(|changes| {
    println!(&quot;Received changes: {changes}&quot;);
});</code></pre>

## Event Sourcing Terms

### ULID

Universally Unique Lexicographically Sortable Identifier. Used for `EntityId` (and several internal request/query identifiers) to enable:

- Distributed ID generation without coordination
- Lexicographic ordering by the embedded creation timestamp (not causal order)
- Compact representation (128-bit)

`EventId` is different: it is a 256-bit content hash.

### DAG (Directed Acyclic Graph)

The structure formed by events and their precursor relationships. The DAG enables:

- Per-entity causal comparison and merge ordering
- Conflict detection
- Efficient synchronization

### Lineage

The causal event history that led to an entity's current state, including branches and merges. Used for:

- Audit trails
- Conflict resolution
- Replication

### Head

The most recent event or concurrent events in an entity's DAG. Nodes track the head as a set because concurrent branches may produce more than one tip.

## Reactivity

### Signal

An observable value that notifies subscribers when it changes. Ankurah's signal system is inspired by SolidJS and enables reactive UIs.

### Reactor

A per-node component that matches applied entity changes against registered query predicates and updates live-query result sets. The signal/observer layer, rather than the reactor itself, tracks component dependencies and derived values.

### Live Query

A query that automatically updates when the underlying data changes. Implemented using subscriptions and the reactor.

## Policy & Security

### Policy Agent

A component that authenticates peer requests and controls access to reads and writes. Agents decide:

- Can a node read an entity?
- Can a node modify an entity?
- Can a node subscribe to a collection?

### Context

A wrapper around a Node that includes user/session information (ContextData). Operations performed through a Context are subject to policy checks.

```rust,ignore
let context = node.context(user_data)?;
let trx = context.begin();
let album = trx.create(&Album { /* ... */ }).await?;
trx.commit().await?;
```

## Additional Resources

- See [What is Ankurah?](what-is-ankurah.md) for a high-level overview
- Check [Architecture](architecture.md) for how these concepts fit together
- Visit [Examples](examples.md) for practical usage
