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
- `AlbumMutable` (for updates)

See [Defining Models](models.md) for full documentation.

## Server Setup

<pre><code transclude="example/server/src/main.rs#server-example">let storage = SledStorageEngine::with_path(storage_dir)?;
let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
node.system.create().await?;

let mut server = WebsocketServer::new(node);
println!(&quot;Running server...&quot;);
server.run(&quot;0.0.0.0:9797&quot;).await?;</code></pre>

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

<pre><code transclude="example/react-app/src/App.tsx#react-component">/* creates and Binds a ReactObserver to the component */
const AlbumList = signalObserver(({ albums }: Props) =&gt; {
  return (
    &lt;ul&gt;
      /* React Observer automatically tracks albums */
      {albums.items.map((album) =&gt; (
        &lt;li&gt;{album.name}&lt;/li&gt;
      ))}
    &lt;/ul&gt;
  );
});</code></pre>

See [React Usage](queries/react.md) for full documentation.

## Live Query

<pre><code transclude="example/server/src/main.rs#livequery-rust">let q: LiveQuery&lt;AlbumView&gt; = ctx.query(&quot;year &gt; 1985&quot;)?;</code></pre>

See [Querying Data](queries/index.md) for full documentation.

## Storage Backends

### Sled (Embedded)

<pre><code transclude="example/server/src/main.rs#storage-sled">let storage = SledStorageEngine::new()?;</code></pre>

### Postgres

<pre><code transclude="example/server/src/main.rs#storage-postgres">let storage = Postgres::open(uri).await?;</code></pre>

### IndexedDB (WASM)

```rust
let storage = IndexedDBStorageEngine::new("my-app").await?;
```

## Next Steps

- Check out the [Getting Started](getting-started.md) guide for step-by-step setup
- Review the [Glossary](glossary.md) to understand key terms
- Study the [Architecture](architecture.md) to see how it all fits together
- Join the [Discord](https://discord.gg/XMUUxsbT5S) to discuss your use case!
