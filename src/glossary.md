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

## Digest Trees (0.10)

These terms describe the [digest-tree preview](digest-tree/index.md), including
Node-owned maintenance and query synchronization on the pinned, unmerged
implementation branch.

### Member

One item an owner includes in a digest tree. It supplies a member ID, values
for the tree's key specification, and a payload. The generic crate does not
decide membership or require members to be Ankurah entities.

### Key and Address

A member's key encodes its ordered property values under a `KeySpec`. Its
address combines the key and member ID with framing. Addresses sort by key,
then by ID bytes, so equal keys do not make two members indistinguishable.

### Digest

A count and a group sum derived from a set of members' keys, IDs and payload
digest bytes. Matching digests let comparison skip a span, subject to the
chosen group's collision-resistance assumptions.

### Span

A range of encoded member addresses. A key range names bounds in property
values and is lowered into a span using the tree's key specification.

### Digest Tree View

A read-only handle to a tree restricted to some spans. `DigestTreeView` is
live, with a consistent state per read or stream batch. It is distinct from
a model's generated entity View and does not freeze a whole query snapshot.

### Page

An answer to a digest-tree comparison read: either span digests one level
down or the members within the requested span. A page is built from tree
records when requested; it is not a persistent storage page.

### Tree Record

One key/value item kept by a digest tree's Store. The Rust type is `Row`:
metadata, a tree node's digest and branching information, or a member's
payload and digest element. It is not the canonical record of an entity.

### Tree Node

A branching point or terminal bucket in the digest tree's trie. It describes
members beneath it. An Ankurah Node, by contrast, is a network participant.

### Selection

A predicate together with optional ordering and limit. A resolved Selection
identifies properties by their resolved IDs. TreeManager currently looks up
exact Selections and maintains their result membership, including `LIMIT`.
A limited tree holds the selected prefix; incremental maintenance checks
changed IDs and queries a strict suffix only when it needs to refill a gap.

### TreeManager

The Node-owned component that opens and retains trees for exact Selections
and reconciles their membership with canonical entity state. Its bounded
strong LRU retains recent trees; its weak registry also finds trees kept
alive by callers, views or streams.

### State Cursor

An opaque, storage-local token describing a validated canonical-state read
boundary. A tree persists its cursor with its derived records so it can
recover changes after restart. It is not a causal clock or peer inventory,
and its bytes must not be compared as sequence numbers.

### Write-behind

Deferred persistence of maintained tree records. Canonical entity state is
already durable; the tree's records, member lookup, generation log and cursor
flush atomically later. The default is 1,024 changed entities or 250 ms after
a maintained batch. See [Node Lifecycle](digest-tree/node-lifecycle.md).

### KnownState

The digest of a requester's authorized, locally known query members. Fetch
and subscription requests send it with a key specification instead of a full
`known_matches` inventory. Matching target digests skip comparison and repair.

### Capture

A fixed, authorized tree version retained for one query comparison. Ordinary
managed trees remain live; a capture reads its older version through short
storage snapshots and retained before-images. It has a bounded lifetime and
can require a restart when its history is no longer available.

### Before-image

A tree record's value immediately before a write, including a marker for an
absent record. The adapter saves bounded before-images atomically with tree
generations so captures can reconstruct their durable base. These are derived
tree records, not copies of entity history.

### Comparison Target

The peer's captured query answer, identified by a comparison ID, key
specification and digest. It defines which entity heads the requester must
cover; the peer may have advanced since it captured this answer.

### Repair

State or causal events delivered to reconcile an entity discovered during
comparison. Node sends bounded repairs through the existing peer update
channel. A comparison page identifies work; it does not itself contain a
complete entity state.

### Coverage

Having a captured entity head, or a causal descendant of that head, in local
canonical state. A newer descendant already includes the captured changes;
a concurrent head needs event repair. Query comparison finishes when it
covers the target, without discarding extra local state. See
[Query Synchronization](digest-tree/query-sync.md).

### Directional Replication Interest

A receiver's instruction to maintain one Selection from a particular durable
source, under its current credentials. The reverse direction is configured
independently and may select different entities. A `Replication` handle keeps
the interest active; accepted history remains after the last handle is dropped.

### CaughtUp

The `ReplicationState` reporting that a completed source capture is covered
by durably stored event history. It permits extra local entities and newer
descendants, and does not cover later source changes. See
[Durable Replication](digest-tree/durable-replication.md#caught-up-to-which-version).

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
