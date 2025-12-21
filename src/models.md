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
| `AlbumMut` | Mutable handle for updating entities in a transaction |

## Field Types

### Basic Types

<pre><code transclude="example/model/src/lib.rs#model-task">#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Task {
    pub title: String,
    pub completed: bool,
    pub priority: i32,
}</code></pre>

Supported types include:
- `String`
- `bool`
- Integers: `i8`, `i16`, `i32`, `i64`, `u8`, `u16`, `u32`, `u64`
- `f32`, `f64`

### CRDT Types

Use `#[active_type(...)]` to specify a CRDT backend for a field. The first supported CRDT type is `YrsString` for collaborative text:

<pre><code transclude="example/model/src/lib.rs#model-document">#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Document {
    #[active_type(YrsString)]
    pub content: String,
    pub title: String,
}</code></pre>

### Entity References

Use `Ref<T>` to create typed references between entities:

<pre><code transclude="example/model/src/lib.rs#model-ref">#[derive(Model, Debug, Serialize, Deserialize, Clone)]
pub struct Artist {
    pub name: String,
}

#[derive(Model, Debug, Serialize, Deserialize, Clone)]
pub struct Song {
    pub title: String,
    pub artist: Ref&lt;Artist&gt;,
}</code></pre>

References enable graph-style navigation between related entities.

### JSON Fields

Use `Json` for schemaless, dynamic data:

<pre><code transclude="example/model/src/lib.rs#model-json">#[derive(Model, Debug, Serialize, Deserialize, Clone)]
pub struct Track {
    pub name: String,
    pub metadata: Json,
}</code></pre>

JSON fields support nested path queries like `metadata.genre = 'rock'`.

## Creating Entities

Use a transaction to create new entities:

<pre><code transclude="example/server/src/main.rs#model-create">let trx = ctx.begin();

let album = trx.create(&amp;Album {
    name: &quot;Parade&quot;.into(),
    artist: &quot;Prince&quot;.into(),
    year: 1986,
}).await?;

let album_id = album.id();
trx.commit().await?;</code></pre>

## Reading Entities

Access data through the `View` type:

<pre><code transclude="example/server/src/main.rs#model-read">let view: AlbumView = ctx.get(album_id).await?;
println!(&quot;Album: {} by {} ({})&quot;, view.name()?, view.artist()?, view.year()?);</code></pre>

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
