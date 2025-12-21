# Defining Models

Models define the structure of your entities. Define them once in Rust, and they work everywhere—native servers, browser clients, and mobile apps.

## Basic Model Definition

Use the `#[derive(Model)]` macro to define a model:

<pre><code transclude="example/model/src/lib.rs#model">#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Album {
    #[active_type(YrsString)]
    pub name: String,
    pub artist: String,
    pub year: i32,
}</code></pre>

This single definition generates:

| Generated Type | Purpose |
|----------------|---------|
| `Album` | The model struct for creating new entities |
| `AlbumView` | Read-only view of an entity's current state |
| `AlbumMutable` | Mutable handle for updating entities in a transaction |

## Field Types

### Basic Types

```rust
#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Task {
    pub title: String,
    pub completed: bool,
    pub priority: i32,
}
```

Supported types include:
- `String`
- `bool`
- Integers: `i8`, `i16`, `i32`, `i64`, `u8`, `u16`, `u32`, `u64`
- `f32`, `f64`
- `Vec<T>` for arrays

### Collaborative Text

For real-time collaborative text editing, use `YrsString`:

```rust
#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Document {
    #[active_type(YrsString)]
    pub content: String,  // Collaborative text field
    
    pub title: String,    // Regular string field
}
```

`YrsString` fields use Yjs-backed CRDTs for:
- Real-time collaboration without conflicts
- Automatic merge of concurrent edits
- Offline support with sync

## Creating Entities

Use a transaction to create new entities:

```rust
let ctx = node.context(DEFAULT_CONTEXT)?;
let trx = ctx.begin();

let album = trx.create(&Album {
    name: "Parade".into(),
    artist: "Prince".into(),
    year: 1986,
}).await?;

trx.commit().await?;
```

## Reading Entities

Access data through the `View` type:

```rust
let album: AlbumView = entity.view()?;
println!("Album: {} by {} ({})", album.name, album.artist, album.year);
```

## Updating Entities

Use a transaction with a mutable handle:

```rust
let trx = ctx.begin();
let mut mutable: AlbumMutable = entity.mutable(&trx)?;

mutable.name.set("New Name".to_string());
mutable.year.set(2024);

trx.commit().await?;
```

## Transactions

All writes happen within a transaction:

```rust
let trx = ctx.begin();

// Create multiple entities
let album1 = trx.create(&Album { ... }).await?;
let album2 = trx.create(&Album { ... }).await?;

// Update existing entities
let mut mutable = album1.mutable(&trx)?;
mutable.name.set("Updated".into());

// Commit all changes atomically
trx.commit().await?;
```

Transactions are automatically rolled back if not committed.

## Generated TypeScript

When you build your WASM bindings, TypeScript types are generated automatically:

```typescript
// Generated from your Rust model
interface AlbumView {
  id: EntityId;
  name: string;
  artist: string;
  year: number;
}

// Static methods on the model class
class Album {
  static query(ctx: Context, query: string): AlbumLiveQuery;
  static create(trx: Transaction, data: AlbumData): Promise<AlbumView>;
}
```

## Next Steps

- [Querying Data](queries/index.md) - How to query and filter entities
- [Query Syntax](queries/syntax.md) - Full AnkQL syntax reference

