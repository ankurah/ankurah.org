# Glossary

This glossary defines key terms and concepts used throughout Ankurah.

## Core Concepts

### Model

A struct that describes the fields and their types for an entity in a collection. Models define the data binding schema and generate View and Mutable types.

```rust
#[derive(Model)]
struct Album {
    name: String,
    year: String,
}
// Generates: AlbumView, AlbumMutable
```

### Collection

A collection of entities, with a name and a type that implements the Model trait. Similar to a table in a traditional database. In the Postgres backend, collections are backed by actual database tables.

### Entity

A discrete identity in a collection similar to a row in a database. Each entity has a dynamic schema and can have properties bound to it via Models. An entity's ID is derived from the operation that created it.

### View

A struct that represents the read-only view of an entity which is typed by the Model. Views provide type-safe access to entity properties without allowing mutations.

```rust
let album: AlbumView = entity.view()?;
println!("Album: {} ({})", album.name, album.year);
```

### Mutable

A struct that represents the mutable state of an entity which is typed by the Model. Mutables allow type-safe modifications to entity properties.

```rust
let mut album: AlbumMutable = entity.mutable()?;
album.name.set("New Album Name");
```

### Event

A single event that may or may not be applied to an entity. Events are immutable operations that form the basis of Ankurah's event sourcing. Each event has:

- A unique ID (ULID)
- References to precursor events
- A payload describing the change
- Metadata (timestamp, node ID, etc.)

## Infrastructure

### Node

A participant in the Ankurah network. Nodes can be servers, clients, or peers. Each node has:

- A storage backend
- A policy agent (for permissions)
- Connection handlers
- A reactor for subscriptions

### Storage Engine

A means of storing and retrieving data which is generally durable (but not necessarily). Available engines:

- **Sled**: Embedded KV store
- **Postgres**: Relational database
- **IndexedDB**: Browser storage (WASM)
- **TiKV** (planned): Distributed KV store

### Storage Collection

A collection of entities in a storage engine. The physical representation of a Collection in the storage layer.

## Operations

### Transaction

A unit of work that groups multiple operations. Transactions provide:

- Atomicity: All operations succeed or fail together
- Isolation: Operations are isolated from other transactions
- Consistency: Database constraints are maintained

```rust
let trx = node.begin();
let entity = trx.create(&Album { /* ... */ }).await?;
trx.commit().await?;
```

### Subscription

A live query that receives updates when matching entities change. Subscriptions use SQL-like predicates for filtering.

```rust
node.subscribe::<_,_,AlbumView>("year > '2000'", |changes| {
    // Handle changes
}).await?;
```

## Event Sourcing Terms

### ULID

Universally Unique Lexicographically Sortable Identifier. Used for operation IDs to enable:

- Distributed ID generation without coordination
- Temporal ordering via lexicographic sorting
- Compact representation (128-bit)

### DAG (Directed Acyclic Graph)

The structure formed by events and their precursor relationships. The DAG enables:

- Causal consistency
- Conflict detection
- Efficient synchronization

### Lineage

The chain of events that led to an entity's current state. Used for:

- Audit trails
- Conflict resolution
- Replication

### Head

The most recent operation(s) in an entity's event DAG. Nodes track heads to determine if they have the latest version.

## Reactivity

### Signal

An observable value that notifies subscribers when it changes. Ankurah's signal system is inspired by SolidJS and enables reactive UIs.

### Reactor

The runtime component that manages subscriptions, tracks dependencies, and propagates changes. The reactor ensures that all live queries and derived values stay up-to-date.

### Live Query

A query that automatically updates when the underlying data changes. Implemented using subscriptions and the reactor.

## Policy & Security

### Policy Agent

A component that controls access to operations. Agents decide:

- Can a node read an entity?
- Can a node modify an entity?
- Can a node subscribe to a collection?

### Context

A wrapper around a Node that includes user/session information (ContextData). Operations performed through a Context are subject to policy checks.

```rust
let context = node.context(user_data)?;
let album = context.create(&Album { /* ... */ }).await?;
```

## Additional Resources

- See [What is Ankurah?](what-is-ankurah.md) for a high-level overview
- Check [Architecture](architecture.md) for how these concepts fit together
- Visit [Examples](examples.md) for practical usage
