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

Current built-in projected types include:

- `String`
- `bool`
- Integers: `i16`, `i32`, `i64`
- Floating point: `f64`
- `Option<String>`, `Option<i32>`, `Option<i64>`, `Option<f64>`
- `Vec<u8>`, `Json`, `EntityId`, and typed `Ref<T>` references

Plain `String` fields infer the Yrs text backend. Other built-ins infer LWW;
use `#[active_type(LWW)]` when you explicitly want whole-value LWW semantics
for a `String`.

### CRDT Types

Use `#[active_type(...)]` to choose an active value backend explicitly. The shipped CRDT-backed type is `YrsString` for collaborative text:

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

## Updating Entities

Views remain read-only. To update an entity, edit the View inside a
transaction, call the active field type's mutation method, and commit:

<pre><code transclude="example/server/src/main.rs#model-update">let trx = ctx.begin();
let album = view.edit(&amp;trx)?;
album.name().replace(&quot;Parade - Music from the Motion Picture&quot;)?;
album.year().set(&amp;1987)?;
trx.commit().await?;</code></pre>

Here `name()` is a `YrsString`, so it offers text operations such as
`insert`, `delete`, `overwrite`, and `replace`. `year()` is an `LWW<i32>`,
so it uses `set`. Mutation handles stop accepting writes when their
transaction closes.

## Generated TypeScript

When you build your WASM bindings, TypeScript types are generated automatically:

Creation and mutation use the generated model and View APIs:

<pre><code transclude="example/react-app/src/App.tsx#react-create">export async function createAlbum(
  name: string,
  artist: string,
  year: number,
): Promise&lt;AlbumView&gt; {
  const transaction = ctx().begin();
  const album = await Album.create(transaction, { name, artist, year });
  await transaction.commit();
  return album;
}</code></pre>

<pre><code transclude="example/react-app/src/App.tsx#react-update">export async function renameAlbum(
  album: AlbumView,
  name: string,
): Promise&lt;void&gt; {
  const transaction = ctx().begin();
  album.edit(transaction).name.replace(name);
  await transaction.commit();
}</code></pre>

The generated surface includes the model's creation/query namespace
(`Album`), read-only `AlbumView`, transaction-bound `AlbumMut`, typed
`AlbumLiveQuery`, result/change-set wrappers, and typed reference wrappers.
View fields and live-query results are JavaScript getters (`album.name`,
`albums.items`); mutations go through the active field wrapper returned by
`album.edit(transaction)`.

## Next Steps

- [Querying Data](queries/index.md) - How to query and filter entities
- [Query Syntax](queries/syntax.md) - Full AnkQL syntax reference
