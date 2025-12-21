use ankurah::{fetch, policy::DEFAULT_CONTEXT, selection, LiveQuery, Node, PermissiveAgent};
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
    // Using selection! macro with ctx.query()
    let q: LiveQuery<AlbumView> = ctx.query(selection!("year > 1985"))?;
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
    let _ = albums;

    // liaison id=fetch-unquoted-eq
    // Unquoted form: {variable} expands to variable = {variable}
    let artist = "Prince";

    let albums: Vec<AlbumView> = fetch!(ctx, {artist}).await?;
    // liaison end
    let _ = albums;

    // liaison id=fetch-unquoted-gt
    // Unquoted form with comparison operator: {>year} expands to year > {year}
    let year = 1985;

    let albums: Vec<AlbumView> = fetch!(ctx, {>year}).await?;
    // liaison end
    let _ = albums;

    // liaison id=fetch-unquoted-comparisons
    // All comparison operators work: >, <, >=, <=, !=
    let year = 1985;

    let _newer: Vec<AlbumView> = fetch!(ctx, {>year}).await?;
    let _older: Vec<AlbumView> = fetch!(ctx, {<year}).await?;
    let _gte: Vec<AlbumView> = fetch!(ctx, {>=year}).await?;
    let _lte: Vec<AlbumView> = fetch!(ctx, {<=year}).await?;
    let _not_eq: Vec<AlbumView> = fetch!(ctx, {!=year}).await?;
    // liaison end

    // liaison id=fetch-unquoted-combined
    // Combine multiple conditions with AND/OR
    let artist = "Prince";
    let year = 1985;

    let albums: Vec<AlbumView> = fetch!(ctx, {artist} AND {>year}).await?;
    // liaison end
    let _ = albums;

    // liaison id=fetch-unquoted-mixed
    // Mix unquoted variables with explicit comparisons
    let artist = "Prince";
    let year = 1985;

    let albums: Vec<AlbumView> = fetch!(ctx, {artist} AND year > {year}).await?;
    // liaison end
    let _ = albums;

    // liaison id=fetch-quoted-literal
    // Quoted form for pure string literals
    let albums: Vec<AlbumView> = fetch!(ctx, "artist = 'Prince' AND year > 1985").await?;
    // liaison end
    let _ = albums;

    // liaison id=fetch-quoted-positional
    // Quoted form with positional arguments
    let min_year = 1980;
    let max_year = 1990;

    let albums: Vec<AlbumView> = fetch!(ctx, "year >= {} AND year <= {}", min_year, max_year).await?;
    // liaison end
    let _ = albums;

    // liaison id=fetch-quoted-mixed
    // Quoted form with named variable interpolation
    let artist = "Prince";
    let year = 1985;

    let albums: Vec<AlbumView> = fetch!(ctx, "artist = '{}' AND year > {}", artist, year).await?;
    // liaison end
    let _ = (albums, artist, year);
    Ok(())
}

#[allow(dead_code)]
#[rustfmt::skip]
fn query_string_examples(node: &Node<SledStorageEngine, PermissiveAgent>) -> anyhow::Result<()> {
    use ankurah_org_example_model::AlbumView;

    let ctx = node.context(DEFAULT_CONTEXT)?;

    // liaison id=query-string
    // query() returns a LiveQuery with reactive updates
    let _live: LiveQuery<AlbumView> = ctx.query(selection!("year > 1985"))?;
    // liaison end

    // liaison id=query-unquoted-eq
    // Unquoted form with selection! macro
    let artist = "Prince";

    let live: LiveQuery<AlbumView> = ctx.query(selection!({artist}))?;
    // liaison end
    let _ = live;

    // liaison id=query-unquoted-gt
    // Unquoted form with comparison operator
    let year = 1985;

    let live: LiveQuery<AlbumView> = ctx.query(selection!({>year}))?;
    // liaison end
    let _ = live;

    // liaison id=query-unquoted-combined
    // Combine conditions with AND/OR
    let artist = "Prince";
    let year = 1985;

    let live: LiveQuery<AlbumView> = ctx.query(selection!({artist} AND {>year}))?;
    // liaison end
    let _ = live;

    // liaison id=query-quoted-literal
    // Quoted form for string literals
    let live: LiveQuery<AlbumView> = ctx.query(selection!("artist = 'Prince' AND year > 1985"))?;
    // liaison end
    let _ = live;

    // liaison id=query-quoted-positional
    // Quoted form with positional arguments
    let year = 1985;

    let live: LiveQuery<AlbumView> = ctx.query(selection!("year > {}", year))?;
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
    let _ = albums;

    // liaison id=syntax-numeric
    let albums: Vec<AlbumView> = ctx.fetch("year > 1985").await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-not-eq
    let albums: Vec<AlbumView> = ctx.fetch("artist != 'Unknown'").await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-and
    let albums: Vec<AlbumView> = ctx.fetch("year > 1980 AND year < 1990").await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-or
    let albums: Vec<AlbumView> = ctx.fetch("artist = 'Prince' OR artist = 'Madonna'").await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-combined
    let albums: Vec<AlbumView> = ctx.fetch("(artist = 'Prince' OR artist = 'Madonna') AND year > 1985").await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-in
    let albums: Vec<AlbumView> = ctx.fetch("year IN (1984, 1985, 1986)").await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-order-desc
    let albums: Vec<AlbumView> = ctx.fetch("year > 1980 ORDER BY year DESC").await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-order-asc
    let albums: Vec<AlbumView> = ctx.fetch("true ORDER BY name ASC").await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-all
    let albums: Vec<AlbumView> = ctx.fetch("true ORDER BY name ASC").await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-string-literal
    let albums: Vec<AlbumView> = ctx.fetch("name = 'Purple Rain'").await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-escape-quote
    let albums: Vec<AlbumView> = ctx.fetch("name = 'Rock ''n'' Roll'").await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-interpolate-int
    // Unquoted form: {>year} expands to year > {year}
    let year = 1985;

    let albums: Vec<AlbumView> = fetch!(ctx, {>year}).await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-interpolate-str
    // Quoted form with positional argument for string values
    let artist = "Prince";

    let albums: Vec<AlbumView> = fetch!(ctx, "artist = '{}'", artist).await?;
    // liaison end
    let _ = (albums, artist);

    // liaison id=syntax-interpolate-multi
    // Multiple variables with quoted form
    let min_year = 1980;
    let max_year = 1990;

    let albums: Vec<AlbumView> = fetch!(ctx, "year >= {} AND year <= {}", min_year, max_year).await?;
    // liaison end
    let _ = albums;

    // liaison id=syntax-exists
    // Check if any entities match the query
    let album_name = "Purple Rain";
    let matching_albums: Vec<AlbumView> = fetch!(ctx, "name = '{}'", album_name).await?;
    let exists = matching_albums.len() > 0;
    // liaison end
    let _ = (exists, album_name);

    // liaison id=syntax-first
    let album = ctx.fetch::<AlbumView>("name = 'Purple Rain'").await?.into_iter().next();
    // liaison end
    let _ = album;

    // liaison id=syntax-count
    let count = ctx.fetch::<AlbumView>("year > 1985").await?.len();
    // liaison end
    let _ = count;
    Ok(())
}

// Model usage examples
#[allow(dead_code)]
#[rustfmt::skip]
async fn model_examples(node: &Node<SledStorageEngine, PermissiveAgent>) -> anyhow::Result<()> {
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
