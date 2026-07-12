# Design Goals

Ankurah is designed with specific goals in mind to create a powerful, flexible, and developer-friendly state management framework.

## Schema / UX

### Model-Based Schema Definition

- Define schema using "Model" structs, which define the data types for a collection of entities
- An ActiveRecord style interface with type-specific methods for each value
- The same Model definitions generate native Rust types and TypeScript classes for WASM browser clients
- Transaction, fetch/query, and selection helpers keep the typed API consistent across those targets

**Example:**

<pre><code transclude="example/model/src/lib.rs#model">#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Album {
    #[active_type(YrsString)]
    pub name: String,
    pub artist: String,
    pub year: i32,
}</code></pre>

Use it inside a transaction:

<pre><code transclude="example/server/src/main.rs#model-create">let trx = ctx.begin();

let album = trx.create(&amp;Album {
    name: &quot;Parade&quot;.into(),
    artist: &quot;Prince&quot;.into(),
    year: 1986,
}).await?;

let album_id = album.id();
trx.commit().await?;</code></pre>

## Observability

### Signal-Style Reactive Pattern

- Utilize a "signal" style pattern to allow for observability of changes to entities, collections, and values
- Derived signals can filter and transform those changes
- React is the primary, maintained frontend path through `@ankurah/react-hooks`
- A `reactive_graph` bridge and template exist for Leptos, but that integration is still young and experimental

**Benefits:**

- Automatic UI updates when data changes
- Declarative data dependencies
- Efficient change propagation

## Storage and State Management

### Multiple Backing Stores

The repository currently implements:

- **Sled** for embedded native key-value storage
- **SQLite** for embedded relational storage
- **Postgres** for client/server relational storage
- **IndexedDB** for browser/WASM storage

Ankurah is beta software. These are real implementations, not a promise that every backend has identical production maturity or feature coverage.

### Event Sourcing

Changes are committed as immutable events. An event carries per-backend operation diffs and a clock containing its parent event IDs:

- **Content identity**: An `EventId` is the SHA-256 hash of the entity ID, operation set, and parent clock
- **Immutable History**: Events are immutable (with future considerations for compaction and data-retention requirements)
- **Current State**: The present state of an entity is maintained per node, including the head of its event DAG
- **Version Tracking**: Nodes causally compare known entity versions and track
  the current local head

### Entity and Event IDs

- `EntityId` is an independently generated **ULID**, allowing any node to create an identity without coordination
- `EventId` is a 256-bit content hash, so it commits to the change and its causal parents
- Entity identity is therefore stable across later events and is not derived from a genesis event

**Future Considerations:**

- Compact long event histories while preserving convergence and retention guarantees
- Harden peer validation and resource limits for adversarial environments
- Define explicit audit/export and deletion semantics above the immutable event layer

## Development Milestones

### Major Milestone 1 - Current beta foundation

Core functionality for early adopters:

- ✅ Working event-sourced model and query layer with off-the-shelf storage engines
- ✅ Rust structs for data modeling
- ✅ Signals pattern for notifications
- ✅ WASM Bindings for client-side use
- ✅ WebSocket server and client
- ✅ Maintained React bindings and React/WASM template
- ✅ Basic included data-types: CRDT text (yrs crate) and primitive types
- ✅ Sled, SQLite, Postgres, and browser IndexedDB storage implementations
- ✅ Basic single-field queries
- ✅ Multi-field queries
- ✅ Robust recursive query AST for declarative queries

### Major Milestone 2 - Stuff we need, but can live without for a bit

Enhanced functionality and possible future work (not release commitments):

- Additional distributed storage engines
- Reliable replay of writes committed while disconnected (coming soon;
  [#195](https://github.com/ankurah/ankurah/issues/195))
- Broader stale-cache reconciliation research
  ([#115](https://github.com/ankurah/ankurah/issues/115))
- Unified ingest and missing-ancestor replay
  ([#268](https://github.com/ankurah/ankurah/issues/268))
- Validated multi-durable deployments (coming soon; schema-registration
  propagation blocker: [#309](https://github.com/ankurah/ankurah/issues/309))
- Iroh peer-to-peer connector (coming soon;
  [#341](https://github.com/ankurah/ankurah/pull/341))
- Graph Functionality
- User-definable data types
- Advanced indexing strategies
- Query optimization
- Performance profiling tools

### Major Milestone 3 - Maybe someday...

Future aspirations:

- **Portable cryptographic identities**: User identities that work across nodes
- **E2EE (End-to-End Encryption)**: Privacy-preserving data synchronization
- **Hypergraph functionality**: More complex relationship modeling
- **CRDT compaction**: Efficient storage of long operation histories
- **Byzantine fault tolerance**: Security against malicious nodes

## Design Philosophy

Ankurah prioritizes:

1. **Developer Experience**: Easy to learn, hard to misuse
2. **Type Safety**: Compile-time guarantees where possible
3. **Flexibility**: Support various storage backends and use cases
4. **Performance**: Efficient synchronization and querying
5. **Scalability**: From embedded devices to large distributed systems

## Inspirations

Ankurah draws inspiration from:

- **Event Sourcing**: CQRS, Event Store
- **Reactive Programming**: SolidJS signals, MobX
- **ActiveRecord**: Ruby on Rails, Ecto (Elixir)
- **Distributed Systems**: CRDTs, operational transformation
- **Modern Databases**: Postgres, TiKV, FaunaDB

## Contributing

We welcome contributions! Join the discussion:

- [GitHub Repository](https://github.com/ankurah/ankurah)
- [Discord Server](https://discord.gg/XMUUxsbT5S)

Help shape the future of Ankurah by:

- Reporting bugs and suggesting features
- Improving documentation
- Contributing code
- Building example applications
- Sharing your use cases
