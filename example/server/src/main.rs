use ankurah::{policy::DEFAULT_CONTEXT, Node, PermissiveAgent};
use ankurah_org_example_model::Album;
use ankurah_storage_sled::SledStorageEngine;
use ankurah_websocket_server::WebsocketServer;
use anyhow::Result;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<()> {
    // liaison id=server-example
    let storage = SledStorageEngine::new()?;
    let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());

    let ctx = node.context(ankurah::policy::DEFAULT_CONTEXT)?;
    let trx = ctx.begin();
    trx.create(&Album {
        name: "Parade".into(),
        artist: "Prince".into(),
        year: 1986,
    })
    .await?;
    trx.commit().await?;
    // liaison end

    println!("✓ Created album: Parade (1986)");

    // Start WebSocket server
    let mut server = WebsocketServer::new(node);
    println!("✓ Server listening on ws://0.0.0.0:9797");

    server.run("0.0.0.0:9797").await?;

    Ok(())
}

// Example showing reactive query pattern
#[allow(dead_code)]
async fn query_example(node: &Node<SledStorageEngine, PermissiveAgent>) -> anyhow::Result<()> {
    use ankurah_org_example_model::AlbumView;

    let ctx = node.context(DEFAULT_CONTEXT)?;

    #[allow(unused_variables)]
    // liaison id=reactive-query-rust
    let live_query = ctx.query::<AlbumView>("year > 1985")?;
    use ankurah::signals::Get;
    live_query.get(); // tracked by observer
                      // liaison end

    Ok(())
}
