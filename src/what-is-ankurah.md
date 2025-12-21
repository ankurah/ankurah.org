# What is Ankurah?

Ankurah is a state-management framework that enables real-time data synchronization across multiple nodes with built-in observability.

It supports multiple storage and data type backends to enable no-compromise representation of your data.

> **Note:** This project is beta status. It works, but be careful with production use.

## Key Features

- **Schema-First Design**: Define data models using Rust structs with an ActiveRecord-style interface - View/Mutable
- **Content-filtered pub/sub**: Subscribe to changes on a collection using a SQL-like query
- **Real-Time Observability**: Signal-based pattern for tracking entity changes
- **Distributed Architecture**: Multi-node synchronization with event sourcing
- **Flexible Storage**: Support for multiple storage backends (Sled, Postgres, TiKV)
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

- All operations have unique IDs and precursor operations
- Entity state is maintained per node with operation tree tracking
- Operations use ULID for distributed ID generation
- Entity IDs are derived from their creation operation

## Quick Example

```rust
// Subscribe to changes on the client
let subscription = client.subscribe::<_,_,AlbumView>(
    "name = 'Origin of Symmetry'",
    |changes| {
        println!("Received changes: {}", changes);
    }
).await?;

// Create a new album on the server
let trx = server.begin();
let album = trx.create(&Album {
    name: "Origin of Symmetry".into(),
    year: "2001".into(),
}).await?;
trx.commit().await?;
```

## Community

Join the conversation and contribute:

- [GitHub Repository](https://github.com/ankurah/ankurah)
- [Discord Server](https://discord.gg/XMUUxsbT5S)

## License

Ankurah is dual-licensed under MIT or Apache-2.0.
