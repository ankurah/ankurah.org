use ankurah::{policy::DEFAULT_CONTEXT, LiveQuery, Node, PermissiveAgent};
use ankurah_org_example_model::Album;
use ankurah_storage_sled::SledStorageEngine;
use ankurah_websocket_client::WebsocketClient;
use ankurah_websocket_server::WebsocketServer;
use anyhow::Result;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<()> {
    let storage_dir = dirs::home_dir().unwrap().join(".ankurah");
    // liaison id=server-example
    let storage = SledStorageEngine::with_path(storage_dir)?;
    let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
    node.system.create().await?;

    let mut server = WebsocketServer::new(node);
    println!("Running server...");
    server.run("0.0.0.0:9797").await?;
    // liaison end

    Ok(())
}

// Storage backend examples
#[allow(dead_code)]
async fn sled_storage_example() -> anyhow::Result<()> {
    // liaison id=storage-sled
    let storage = SledStorageEngine::new()?;
    // liaison end
    let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());

    let _ = node;
    Ok(())
}

// Alternate storage backend example
#[allow(dead_code)]
async fn postgres_example() -> anyhow::Result<()> {
    use ankurah_storage_postgres::Postgres;

    let uri = "postgresql://localhost/mydb";
    // liaison id=storage-postgres
    let storage = Postgres::open(uri).await?;
    // liaison end
    let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());

    let _ = node;
    Ok(())
}

// Rust client example
#[allow(dead_code)]
#[rustfmt::skip]
async fn rust_client_example() -> anyhow::Result<()> {
    // liaison id=rust-client-example
    let storage = SledStorageEngine::new_test()?;
    let node = Node::new(Arc::new(storage), PermissiveAgent::new());
    let _client = WebsocketClient::new(node.clone(), "ws://localhost:9797").await?;
    node.system.wait_system_ready().await;

    // Create album
    let ctx = node.context(ankurah::policy::DEFAULT_CONTEXT)?;
    let trx = ctx.begin();
    trx.create(&Album { name: "Parade".into(), artist: "Prince".into(), year: 1986 }).await?;
    trx.commit().await?;
    // liaison end

    Ok(())
}

// Example showing reactive query pattern
#[allow(dead_code)]
#[rustfmt::skip]
async fn query_example(node: &Node<SledStorageEngine, PermissiveAgent>) -> anyhow::Result<()> {
    use ankurah_org_example_model::AlbumView;

    let ctx = node.context(DEFAULT_CONTEXT)?;

    #[allow(unused_variables)]
    // liaison id=livequery-rust
    let q: LiveQuery<AlbumView> = ctx.query("year > 1985")?;
    // liaison end
    
    // liaison id=signals-rust
    use ankurah::signals::Get;
    q.get(); // tracked by observer
             // liaison end

    Ok(())
}

// Query examples for documentation
#[allow(dead_code)]
#[rustfmt::skip]
async fn fetch_examples(node: &Node<SledStorageEngine, PermissiveAgent>) -> anyhow::Result<()> {
    use ankurah_org_example_model::AlbumView;

    let ctx = node.context(DEFAULT_CONTEXT)?;

    // liaison id=fetch-string
    // Fetch with a string query - one-time snapshot
    let albums: Vec<AlbumView> = ctx.fetch("year > 1985").await?;
    // liaison end

    // liaison id=fetch-format
    // Using format! for variable interpolation
    let year = 1985;
    let query = format!("year > {year}");

    let albums: Vec<AlbumView> = ctx.fetch(query.as_str()).await?;
    // liaison end

    // liaison id=fetch-complex
    // Multiple conditions with format!
    let min_year = 1980;
    let max_year = 1990;
    let query = format!("year >= {min_year} AND year <= {max_year}");

    let albums: Vec<AlbumView> = ctx.fetch(query.as_str()).await?;
    // liaison end

    let _ = albums;
    Ok(())
}

#[allow(dead_code)]
#[rustfmt::skip]
fn query_string_examples(node: &Node<SledStorageEngine, PermissiveAgent>) -> anyhow::Result<()> {
    use ankurah_org_example_model::AlbumView;

    let ctx = node.context(DEFAULT_CONTEXT)?;

    // liaison id=query-string
    // query() returns a LiveQuery with reactive updates
    let live: LiveQuery<AlbumView> = ctx.query("year > 1985")?;
    // liaison end

    // liaison id=query-format
    // Using format! for variable interpolation  
    let year = 1985;
    let query = format!("year > {year}");

    let live: LiveQuery<AlbumView> = ctx.query(query.as_str())?;
    // liaison end

    let _ = live;
    Ok(())
}

// Syntax examples for documentation
#[allow(dead_code)]
#[rustfmt::skip]
async fn syntax_examples(node: &Node<SledStorageEngine, PermissiveAgent>) -> anyhow::Result<()> {
    use ankurah_org_example_model::AlbumView;

    let ctx = node.context(DEFAULT_CONTEXT)?;

    // liaison id=syntax-string-eq
    let albums: Vec<AlbumView> = ctx.fetch("name = 'Dark Side of the Moon'").await?;
    // liaison end

    // liaison id=syntax-numeric
    let albums: Vec<AlbumView> = ctx.fetch("year > 1985").await?;
    // liaison end

    // liaison id=syntax-not-eq
    let albums: Vec<AlbumView> = ctx.fetch("artist != 'Unknown'").await?;
    // liaison end

    // liaison id=syntax-and
    let albums: Vec<AlbumView> = ctx.fetch("year > 1980 AND year < 1990").await?;
    // liaison end

    // liaison id=syntax-or
    let albums: Vec<AlbumView> = ctx.fetch("artist = 'Prince' OR artist = 'Madonna'").await?;
    // liaison end

    // liaison id=syntax-combined
    let albums: Vec<AlbumView> = ctx.fetch("(artist = 'Prince' OR artist = 'Madonna') AND year > 1985").await?;
    // liaison end

    // liaison id=syntax-in
    let albums: Vec<AlbumView> = ctx.fetch("year IN (1984, 1985, 1986)").await?;
    // liaison end

    // liaison id=syntax-order-desc
    let albums: Vec<AlbumView> = ctx.fetch("year > 1980 ORDER BY year DESC").await?;
    // liaison end

    // liaison id=syntax-order-asc
    let albums: Vec<AlbumView> = ctx.fetch("true ORDER BY name ASC").await?;
    // liaison end

    // liaison id=syntax-all
    let albums: Vec<AlbumView> = ctx.fetch("true ORDER BY name ASC").await?;
    // liaison end

    // liaison id=syntax-string-literal
    let albums: Vec<AlbumView> = ctx.fetch("name = 'Purple Rain'").await?;
    // liaison end

    // liaison id=syntax-escape-quote
    let albums: Vec<AlbumView> = ctx.fetch("name = 'Rock ''n'' Roll'").await?;
    // liaison end

    // liaison id=syntax-interpolate-int
    let year = 1985;
    let query = format!("year > {year}");

    let albums: Vec<AlbumView> = ctx.fetch(query.as_str()).await?;
    // liaison end

    // liaison id=syntax-interpolate-str
    let artist = "Prince";
    let query = format!("artist = '{artist}'");

    let albums: Vec<AlbumView> = ctx.fetch(query.as_str()).await?;
    // liaison end

    // liaison id=syntax-interpolate-multi
    let min_year = 1980;
    let max_year = 1990;
    let query = format!("year >= {min_year} AND year <= {max_year}");

    let albums: Vec<AlbumView> = ctx.fetch(query.as_str()).await?;
    // liaison end

    // liaison id=syntax-exists
    let exists = !ctx.fetch::<AlbumView>("name = 'Purple Rain'").await?.is_empty();
    // liaison end

    // liaison id=syntax-first
    let album = ctx.fetch::<AlbumView>("name = 'Purple Rain'").await?.into_iter().next();
    // liaison end

    // liaison id=syntax-count
    let count = ctx.fetch::<AlbumView>("year > 1985").await?.len();
    // liaison end

    let _ = (albums, exists, album, count);
    Ok(())
}

// Model usage examples
#[allow(dead_code)]
#[rustfmt::skip]
async fn model_examples(node: &Node<SledStorageEngine, PermissiveAgent>) -> anyhow::Result<()> {
    use ankurah::Mutable;
    use ankurah_org_example_model::{Album, AlbumView};

    let ctx = node.context(DEFAULT_CONTEXT)?;

    // liaison id=model-create
    let trx = ctx.begin();

    let album = trx.create(&Album {
        name: "Parade".into(),
        artist: "Prince".into(),
        year: 1986,
    }).await?;

    let album_id = album.id();
    trx.commit().await?;
    // liaison end

    // liaison id=model-read
    let view: AlbumView = ctx.get(album_id).await?;
    println!("Album: {} by {} ({})", view.name()?, view.artist()?, view.year()?);
    // liaison end

    Ok(())
}

// Ref examples
#[allow(dead_code)]
#[rustfmt::skip]
async fn ref_examples(node: &Node<SledStorageEngine, PermissiveAgent>) -> anyhow::Result<()> {
    use ankurah::property::Ref;
    use ankurah_org_example_model::{Artist, Song, SongView, ArtistView};

    let ctx = node.context(DEFAULT_CONTEXT)?;

    // liaison id=ref-create
    // Create an artist
    let trx = ctx.begin();
    let artist = trx.create(&Artist { name: "Radiohead".into() }).await?;
    let artist_id = artist.id();
    trx.commit().await?;

    // Create a song that references the artist
    let trx = ctx.begin();
    trx.create(&Song {
        title: "Paranoid Android".into(),
        artist: Ref::new(artist_id),
    }).await?;
    trx.commit().await?;
    // liaison end

    // liaison id=ref-traverse
    // Fetch the song and traverse to get the artist
    let songs: Vec<SongView> = ctx.fetch("title = 'Paranoid Android'").await?;
    let song = songs.first().unwrap();

    // Get the referenced artist entity
    let artist: ArtistView = song.artist()?.get(&ctx).await?;
    println!("Artist: {}", artist.name()?);
    // liaison end

    Ok(())
}

// Json query examples
#[allow(dead_code)]
#[rustfmt::skip]
async fn json_examples(node: &Node<SledStorageEngine, PermissiveAgent>) -> anyhow::Result<()> {
    use ankurah::property::Json;
    use ankurah_org_example_model::{Track, TrackView};

    let ctx = node.context(DEFAULT_CONTEXT)?;

    // liaison id=json-create
    let trx = ctx.begin();

    trx.create(&Track {
        name: "Test Track".into(),
        metadata: Json::new(serde_json::json!({
            "genre": "rock",
            "bpm": 120,
            "tags": ["guitar", "drums"]
        })),
    }).await?;

    trx.commit().await?;
    // liaison end

    // liaison id=json-query
    // Query by nested JSON path
    let tracks: Vec<TrackView> = ctx.fetch("metadata.genre = 'rock'").await?;
    // liaison end

    // liaison id=json-query-numeric
    // Numeric comparison on JSON field
    let fast_tracks: Vec<TrackView> = ctx.fetch("metadata.bpm > 100").await?;
    // liaison end

    let _ = (tracks, fast_tracks);
    Ok(())
}
