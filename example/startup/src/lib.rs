//! Startup snippets, checked on native and wasm32 targets for the 0.10 preview.

use ankurah::{policy::DEFAULT_CONTEXT, Context, Node, PermissiveAgent};
use std::sync::Arc;

#[cfg(not(target_arch = "wasm32"))]
pub async fn server(storage_dir: std::path::PathBuf) -> anyhow::Result<()> {
    use ankurah_storage_sled::SledStorageEngine;
    use ankurah_websocket_server::WebsocketServer;

    // liaison id=server-startup
    let storage = SledStorageEngine::with_path(storage_dir)?;
    let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
    node.wait_ready().await?;

    let mut server = WebsocketServer::new(node);
    server.run("127.0.0.1:9797").await?;
    // liaison end
    Ok(())
}

#[cfg(not(target_arch = "wasm32"))]
pub async fn client(
    storage_dir: std::path::PathBuf,
    server_url: &str,
) -> anyhow::Result<(
    Context,
    ankurah_websocket_client::WebsocketClient<
        ankurah_storage_sled::SledStorageEngine,
        PermissiveAgent,
    >,
)> {
    use ankurah_storage_sled::SledStorageEngine;
    use ankurah_websocket_client::WebsocketClient;

    // liaison id=native-client-startup
    let storage = SledStorageEngine::with_path(storage_dir)?;
    let node = Node::new(Arc::new(storage), PermissiveAgent::new());
    let client = WebsocketClient::new(node.clone(), server_url).await?;
    node.wait_ready().await?;
    let context = node.context(DEFAULT_CONTEXT)?;
    // liaison end
    Ok((context, client))
}

#[cfg(target_arch = "wasm32")]
pub async fn browser(
    server_url: &str,
) -> anyhow::Result<(Context, ankurah_websocket_client_wasm::WebsocketClient)> {
    use ankurah_storage_indexeddb_wasm::IndexedDBStorageEngine;
    use ankurah_websocket_client_wasm::WebsocketClient;

    // liaison id=browser-startup
    let storage = IndexedDBStorageEngine::open("myapp").await?;
    let node = Node::new(Arc::new(storage), PermissiveAgent::new());
    let client = WebsocketClient::new(node.clone(), server_url)?;
    node.wait_ready().await?;
    let context = node.context(DEFAULT_CONTEXT)?;
    // liaison end
    Ok((context, client))
}
