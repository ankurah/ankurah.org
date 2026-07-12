# What is Ankurah?

Ankurah is a state-management framework for synchronizing data between
connected nodes with built-in observability.

It supports multiple storage engines and per-field merge backends so
applications can choose representations that fit their data.

> **Note:** This project is beta status. It works, but be careful with production use.

## Key Features

- **Schema-First Design**: Define data models using Rust structs with an ActiveRecord-style View/Mut interface
- **Content-filtered pub/sub**: Subscribe to changes on a collection using a SQL-like query
- **Real-Time Observability**: Signal-based pattern for tracking entity changes
- **Distributed Architecture**: Multi-node synchronization with event sourcing
- **Flexible Storage**: Implementations for Sled, SQLite, Postgres, and IndexedDB in the browser (with beta-level maturity)
- **Shared model code**: The same Rust models and query semantics compile for native servers and browser clients; React has maintained hooks and templates, while the Leptos bridge remains experimental

## Core Concepts

- **Model**: A struct describing fields and types for entities in a collection (data binding)
- **Collection**: A group of entities of the same type (similar to a database table, and backed by per-collection tables in the PostgreSQL and SQLite engines)
- **Entity**: A discrete identity in a collection - Dynamic schema (similar to a schema-less database row)
- **View**: A read-only representation of an entity - Typed by the model
- **Mut**: A transaction-bound mutable handle for an entity - Typed by the model
- **Event**: An immutable change in an entity's causal history, used for replay and synchronization

## Design Philosophy

Ankurah follows an event-sourced architecture where:

- Every change is an immutable **event** whose id hashes the entity id,
  operation set, and parent clock
- Events form a per-entity DAG (like a git history); an entity's current
  state points at the DAG's **head**
- Entity ids are ULIDs, generated on any node without coordination
- Merge is deterministic per field: LWW fields use causal dominance plus a
  stable tiebreak for concurrent writes, while Yrs text fields combine CRDT
  updates -- see
  [Conflict Resolution & Guarantees](concurrency/guarantees.md)

## Quick Example

Create a live query on an initialized node:

<pre><code transclude="example/server/src/main.rs#livequery-rust">// Using selection! macro with ctx.query()
let q: LiveQuery&lt;AlbumView&gt; = ctx.query(selection!(&quot;year &gt; 1985&quot;))?;</code></pre>

Then commit a model inside a transaction:

<pre><code transclude="example/server/src/main.rs#model-create">let trx = ctx.begin();

let album = trx.create(&amp;Album {
    name: &quot;Parade&quot;.into(),
    artist: &quot;Prince&quot;.into(),
    year: 1986,
}).await?;

let album_id = album.id();
trx.commit().await?;</code></pre>

The local reactor updates matching queries after the commit. Connected peers
receive matching changes through their subscriptions.

See [Querying Data](queries/index.md) for the full query API, including the
one-shot `fetch()` form and the `fetch!`/`selection!` macros.

## Community

Join the conversation and contribute:

- [GitHub Repository](https://github.com/ankurah/ankurah)
- [Discord Server](https://discord.gg/XMUUxsbT5S)

## License

Ankurah is dual-licensed under MIT or Apache-2.0.
