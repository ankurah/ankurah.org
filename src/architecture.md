# Architecture

Ankurah is built on a distributed, event-sourced architecture that enables real-time data synchronization across multiple nodes.

## High-Level Overview

The following interactive diagram shows the key components and data flow in an Ankurah system:

<div style="text-align: center; margin: 2rem 0;">
<iframe width="768" height="496" src="https://miro.com/app/live-embed/uXjVJszJ8-8=/?focusWidget=3458764647841903532&embedMode=view_only_without_ui&embedId=113557891403" frameborder="0" scrolling="no" allow="fullscreen; clipboard-read; clipboard-write" allowfullscreen></iframe>
</div>

## Key Architectural Components

### Node

A **Node** is the fundamental unit in Ankurah. Each node can:
- Store data using a pluggable storage backend
- Subscribe to changes from other nodes
- Publish changes to subscribed nodes
- Maintain its own view of entity state

### Storage Backends

Ankurah supports multiple storage backends:

- **Sled**: Embedded key-value store, great for development and embedded applications
- **Postgres**: Production-grade relational database backend
- **IndexedDB** (WASM): Browser-based storage for client applications
- **TiKV** (planned): Distributed transactional key-value database

### Event Sourcing

All changes in Ankurah are represented as immutable events:

- Each event has a unique ID (ULID) for distributed generation
- Events reference their precursor events, forming a directed acyclic graph (DAG)
- Entity state is derived from applying events in order
- The "present" state includes the "head" operations of the event tree

### Subscriptions

Nodes can subscribe to changes using SQL-like queries:

```rust
client.subscribe::<_,_,AlbumView>(
    "name LIKE 'Origin%' AND year > '2000'",
    |changes| {
        // Handle matching changes
    }
).await?;
```

The subscription system uses:
- **Content filtering**: Only matching entities trigger callbacks
- **Real-time updates**: Changes propagate immediately
- **Efficient indexing**: Queries are optimized using available indexes

### Reactive Runtime

Ankurah includes a reactive runtime (Reactor) that:
- Tracks dependencies between entities
- Propagates changes through the dependency graph
- Enables derived/computed values
- Powers the signal-based observability pattern

## Communication Patterns

### Client-Server

- WebSocket-based bidirectional communication
- Automatic reconnection and synchronization
- Delta-based updates for efficiency

### Peer-to-Peer (Planned)

Future versions will support:
- Direct peer-to-peer connections
- Mesh networking
- Cryptographic identities
- End-to-end encryption

## Data Flow

1. **Create/Update**: A node creates or updates an entity
2. **Event Generation**: An immutable event is generated and stored
3. **Local Application**: The event is applied to the local node's state
4. **Subscription Matching**: The reactor checks which subscriptions match
5. **Propagation**: Matching events are sent to subscribed nodes
6. **Remote Application**: Remote nodes receive and apply the event

## Consistency Model

Ankurah uses **eventual consistency** with strong guarantees:

- Operations are **causally consistent**: if event B depends on event A, all nodes see A before B
- Conflicts are resolved deterministically using operation IDs
- Nodes can operate while partitioned and sync when reconnected

## Learn More

- See the [Design Goals](design-goals.md) for the philosophy behind these choices
- Check out [Examples](examples.md) for practical code demonstrating these concepts
- Join the [Discord](https://discord.gg/XMUUxsbT5S) to discuss architecture and implementation details

