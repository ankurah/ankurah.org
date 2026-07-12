# Examples

This page contains practical code examples demonstrating key Ankurah features.

## Defining a Model

<pre><code transclude="example/model/src/lib.rs#model">#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Album {
    #[active_type(YrsString)]
    pub name: String,
    pub artist: String,
    pub year: i32,
}</code></pre>

This automatically generates:
- `AlbumView` (read-only)
- `AlbumMut` (transactional updates)

See [Defining Models](models.md) for full documentation.

## Server Setup

<pre><code transclude="example/server/src/main.rs#server-example">let storage = SledStorageEngine::with_path(storage_dir)?;
let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
node.system.wait_loaded().await;
if node.system.root().is_none() {
    node.system.create().await?;
}

let mut server = WebsocketServer::new(node);
println!(&quot;Running server...&quot;);
server.run(&quot;127.0.0.1:9797&quot;).await?;</code></pre>

## Rust Client

<pre><code transclude="example/server/src/main.rs#rust-client-example">let storage = SledStorageEngine::new_test()?;
let node = Node::new(Arc::new(storage), PermissiveAgent::new());
let _client = WebsocketClient::new(node.clone(), &quot;ws://localhost:9797&quot;).await?;
node.system.wait_system_ready().await;

// Create album
let ctx = node.context(ankurah::policy::DEFAULT_CONTEXT)?;
let trx = ctx.begin();
trx.create(&amp;Album { name: &quot;Parade&quot;.into(), artist: &quot;Prince&quot;.into(), year: 1986 }).await?;
trx.commit().await?;</code></pre>

## React Component

<pre><code transclude="example/react-app/src/App.tsx#react-component">interface Props {
  albums: AlbumLiveQuery;
}
/* Bind a React observer to the component. */
const AlbumList = signalObserver(({ albums }: Props) =&gt; {
  return (
    &lt;ul&gt;
      {/* Reading items registers this render as a live-query observer. */}
      {albums.items.map((album) =&gt; (
        &lt;li key={album.id.to_base64()}&gt;{album.name}&lt;/li&gt;
      ))}
    &lt;/ul&gt;
  );
});</code></pre>

See [React Bindings](reactivity/react.md) for full documentation.

## Live Query

<pre><code transclude="example/server/src/main.rs#livequery-rust">// Using selection! macro with ctx.query()
let q: LiveQuery&lt;AlbumView&gt; = ctx.query(selection!(&quot;year &gt; 1985&quot;))?;</code></pre>

See [Querying Data](queries/index.md) for full documentation.

## Entity References

Create relationships between entities with `Ref<T>`:

<pre><code transclude="example/server/src/main.rs#ref-create">// Create an artist
let trx = ctx.begin();
let artist = trx.create(&amp;Artist { name: &quot;Radiohead&quot;.into() }).await?;
let artist_id = artist.id();
trx.commit().await?;

// Create a song that references the artist
let trx = ctx.begin();
trx.create(&amp;Song {
    title: &quot;Paranoid Android&quot;.into(),
    artist: Ref::new(artist_id),
}).await?;
trx.commit().await?;</code></pre>

Traverse references to fetch related entities:

<pre><code transclude="example/server/src/main.rs#ref-traverse">// Fetch the song and traverse to get the artist
let songs: Vec&lt;SongView&gt; = ctx.fetch(&quot;title = &#39;Paranoid Android&#39;&quot;).await?;
let song = songs.first().unwrap();

// Get the referenced artist entity
let artist: ArtistView = song.artist()?.get(&amp;ctx).await?;
println!(&quot;Artist: {}&quot;, artist.name()?);</code></pre>

## JSON Queries

Create entities with dynamic JSON fields:

<pre><code transclude="example/server/src/main.rs#json-create">let trx = ctx.begin();

trx.create(&amp;Track {
    name: &quot;Test Track&quot;.into(),
    metadata: Json::new(serde_json::json!({
        &quot;genre&quot;: &quot;rock&quot;,
        &quot;bpm&quot;: 120,
        &quot;tags&quot;: [&quot;guitar&quot;, &quot;drums&quot;]
    })),
}).await?;

trx.commit().await?;</code></pre>

Query by nested JSON paths:

<pre><code transclude="example/server/src/main.rs#json-query">// Query by nested JSON path
let tracks: Vec&lt;TrackView&gt; = ctx.fetch(&quot;metadata.genre = &#39;rock&#39;&quot;).await?;</code></pre>

Numeric comparisons work too:

<pre><code transclude="example/server/src/main.rs#json-query-numeric">// Numeric comparison on JSON field
let fast_tracks: Vec&lt;TrackView&gt; = ctx.fetch(&quot;metadata.bpm &gt; 100&quot;).await?;</code></pre>

## Storage Backends

### Postgres

<pre><code transclude="example/server/src/main.rs#storage-postgres">let storage = Postgres::open(uri).await?;</code></pre>

### SQLite

<pre><code transclude="example/server/src/main.rs#storage-sqlite">let storage = SqliteStorageEngine::open(&quot;ankurah.sqlite&quot;).await?;</code></pre>

### Sled (Embedded)

<pre><code transclude="example/server/src/main.rs#storage-sled">let storage = SledStorageEngine::new()?;</code></pre>

### IndexedDB (WASM)

<pre><code transclude="example/wasm-bindings/src/lib.rs#storage-indexeddb">let storage = IndexedDBStorageEngine::open(&quot;myapp&quot;).await?;</code></pre>

## Next Steps

- Check out the [Quick Start](getting-started/template.md) guide for step-by-step setup
- Review the [Glossary](glossary.md) to understand key terms
- Study the [Architecture](architecture.md) to see how it all fits together
- Join the [Discord](https://discord.gg/XMUUxsbT5S) to discuss your use case!
