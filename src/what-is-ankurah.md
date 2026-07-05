# What is Ankurah?

Ankurah is a state-management framework that enables real-time data synchronization across multiple nodes with built-in observability.

It supports multiple storage and data type backends to enable no-compromise representation of your data.

> **Note:** This project is beta status. It works, but be careful with production use.

## Key Features

- **Schema-First Design**: Define data models using Rust structs with an ActiveRecord-style interface - View/Mutable
- **Content-filtered pub/sub**: Subscribe to changes on a collection using a SQL-like query
- **Real-Time Observability**: Signal-based pattern for tracking entity changes
- **Distributed Architecture**: Multi-node synchronization with event sourcing
- **Flexible Storage**: Support for multiple storage backends (Sled, SQLite, Postgres, IndexedDB in the browser)
- **Isomorphic code**: Server applications and Web applications use the same code, including first-class support for React and Leptos out of the box

## Core Concepts

- **Model**: A struct describing fields and types for entities in a collection (data binding)
- **Collection**: A group of entities of the same type (similar to a database table, and backed by a table in the postgres backend)
- **Entity**: A discrete identity in a collection - Dynamic schema (similar to a schema-less database row)
- **View**: A read-only representation of an entity - Typed by the model
- **Mutable**: A mutable state representation of an entity - Typed by the model
- **Event**: An atomic change that can be applied to an entity - used for synchronization and audit trail

## Design Philosophy

Ankurah follows an event-sourced architecture where:

- Every change is an immutable **event** whose id is a content hash of the
  event and the parent events it was built on
- Events form a per-entity DAG (like a git history); an entity's current
  state points at the DAG's **head**
- Entity ids are ULIDs, generated on any node without coordination
- Concurrent changes merge deterministically: causally newer writes win, and
  truly concurrent writes resolve by a stable tiebreak every node computes
  identically -- see [Conflict Resolution & Guarantees](concurrency/guarantees.md)

## Quick Example

```rust,ignore
// A live query on one node: results update automatically as
// matching data changes anywhere in the system
let live: LiveQuery<AlbumView> = ctx.query(selection!("name = 'Origin of Symmetry'"))?;

// Create a matching album on another node -- connected peers converge in real time
let trx = ctx.begin();
trx.create(&Album {
    name: "Origin of Symmetry".into(),
    artist: "Muse".into(),
    year: 2001,
}).await?;
trx.commit().await?;
```

See [Querying Data](queries/index.md) for the full query API, including the
one-shot `fetch()` form and the `fetch!`/`selection!` macros.

## Community

Join the conversation and contribute:

- [GitHub Repository](https://github.com/ankurah/ankurah)
- [Discord Server](https://discord.gg/XMUUxsbT5S)

## License

Ankurah is dual-licensed under MIT or Apache-2.0.
