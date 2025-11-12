# Design Goals

Ankurah is designed with specific goals in mind to create a powerful, flexible, and developer-friendly state management framework.

## Schema / UX

### Model-Based Schema Definition

- Define schema using "Model" structs, which define the data types for a collection of entities
- An ActiveRecord style interface with type-specific methods for each value
- TypeScript/JavaScript bindings allow these Model definitions to be used client or serverside
- Macros to create and query entities in the collection

**Example:**

```rust
#[derive(Model)]
struct Album {
    name: String,
    year: String,
    artist: String,
}

// Use it
let album = context.create(&Album {
    name: "Origin of Symmetry".into(),
    year: "2001".into(),
    artist: "Muse".into(),
}).await?;
```

## Observability

### Signal-Style Reactive Pattern

- Utilize a "signal" style pattern to allow for observability of changes to entities, collections, and values
- Derivative signals can be created which filter, combine, and transform those changes
- React bindings are a key consideration
- Leptos and other Rust web frameworks should also work, but are lower priority initially

**Benefits:**

- Automatic UI updates when data changes
- Declarative data dependencies
- Efficient change propagation

## Storage and State Management

### Multiple Backing Stores

Support for various storage backends:

- **Sled KV Store** (initial implementation)
- **Postgres** (production-ready relational database)
- **TiKV** (planned - distributed transactional KV)
- **IndexedDB** (browser/WASM support)
- Others as needed

### Event Sourcing / Operation-Based

All changes are tracked as immutable operations:

- **Audit Trail**: All operations have a unique ID and a list of precursor operations
- **Immutable History**: Operations are immutable (with considerations for CRDT compaction and GDPR)
- **Current State**: The "present" state of an entity is maintained per node, including the "head" of the operation tree
- **Version Tracking**: Nodes can determine if they have the latest version of an entity

### Operation IDs

- Use **ULID** (Universally Unique Lexicographically Sortable Identifiers) for distributed ID generation
- Enables lexicographical ordering without coordination
- Entity IDs are derived from the initial operation that created them (genesis operation)

**Future Considerations:**

- How can this be modified to provide non-adversarial cryptographic collision resistance?
- How can we add adversarial attack resistance?

## Development Milestones

### Major Milestone 1 - Getting the foot in the door

Core functionality for early adopters:

- ✅ Production-usable event-sourced ORM with off-the-shelf database storage
- ✅ Rust structs for data modeling
- ✅ Signals pattern for notifications
- ✅ WASM Bindings for client-side use
- ✅ WebSocket server and client
- ✅ React Bindings
- ✅ Basic included data-types: CRDT text (yrs crate) and primitive types
- ✅ Embedded KV backing store (Sled DB)
- ✅ Basic, single field queries (auto-indexed)
- ✅ Postgres backend
- ✅ Multi-field queries
- ✅ Robust recursive query AST for declarative queries

### Major Milestone 2 - Stuff we need, but can live without for a bit

Enhanced functionality:

- TiKV Backend
- Graph Functionality
- User-definable data types
- Advanced indexing strategies
- Query optimization
- Performance profiling tools

### Major Milestone 3 - Maybe someday...

Future aspirations:

- **P2P functionality**: Direct peer-to-peer connections without central servers
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
