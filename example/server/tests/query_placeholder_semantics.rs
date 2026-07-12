use ankurah::{fetch, policy::DEFAULT_CONTEXT, Node, PermissiveAgent};
use ankurah_org_example_model::{Album, AlbumView};
use ankurah_storage_sled::SledStorageEngine;
use std::sync::Arc;

fn names(albums: &[AlbumView]) -> anyhow::Result<Vec<String>> {
    let mut names = albums
        .iter()
        .map(AlbumView::name)
        .collect::<Result<Vec<_>, _>>()?;
    names.sort();
    Ok(names)
}

#[tokio::test]
async fn positional_placeholders_bind_typed_string_and_numeric_values() -> anyhow::Result<()> {
    let storage = SledStorageEngine::new_test()?;
    let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
    node.system.create().await?;
    let ctx = node.context(DEFAULT_CONTEXT)?;

    let trx = ctx.begin();
    for album in [
        Album {
            name: "Parade".into(),
            artist: "Prince".into(),
            year: 1986,
        },
        Album {
            name: "Purple Rain".into(),
            artist: "Prince".into(),
            year: 1984,
        },
        Album {
            name: "Like a Prayer".into(),
            artist: "Madonna".into(),
            year: 1989,
        },
        // These sentinel values make the formerly quoted placeholders fail loudly:
        // `artist = '{}'` and `name = '{}'` used to compile as literal `?` queries.
        Album {
            name: "?".into(),
            artist: "?".into(),
            year: 2100,
        },
    ] {
        trx.create(&album).await?;
    }
    trx.commit().await?;

    let artist = "Prince";
    let year = 1985;
    let albums: Vec<AlbumView> = fetch!(ctx, "artist = {} AND year > {}", artist, year).await?;
    assert_eq!(names(&albums)?, ["Parade"]);

    let artist = "Prince";
    let albums: Vec<AlbumView> = fetch!(ctx, "artist = {}", artist).await?;
    assert_eq!(names(&albums)?, ["Parade", "Purple Rain"]);

    let album_name = "Purple Rain";
    let matching_albums: Vec<AlbumView> = fetch!(ctx, "name = {}", album_name).await?;
    assert_eq!(names(&matching_albums)?, ["Purple Rain"]);

    Ok(())
}
