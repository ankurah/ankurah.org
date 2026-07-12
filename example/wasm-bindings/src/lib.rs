use ankurah::{policy::DEFAULT_CONTEXT, Context, Node, PermissiveAgent};
use ankurah_storage_indexeddb_wasm::IndexedDBStorageEngine;
use ankurah_websocket_client_wasm::WebsocketClient;
use anyhow::Result;
use std::{cell::RefCell, sync::Arc};
use wasm_bindgen::prelude::*;

thread_local! {
    static CONTEXT: RefCell<Option<Context>> = const { RefCell::new(None) };
    static CLIENT: RefCell<Option<WebsocketClient>> = const { RefCell::new(None) };
}

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

async fn initialize_client_impl(server_url: &str) -> Result<()> {
    // liaison id=client-example
    let storage = IndexedDBStorageEngine::open("myapp").await?;
    let node = Node::new(Arc::new(storage), PermissiveAgent::new());
    let client = WebsocketClient::new(node.clone(), server_url)?;
    node.system.wait_system_ready().await;

    let context = node.context(DEFAULT_CONTEXT)?;

    CONTEXT.with(|slot| slot.replace(Some(context)));
    CLIENT.with(|slot| slot.replace(Some(client)));
    // liaison end

    Ok(())
}

#[wasm_bindgen]
pub async fn initialize_client(server_url: &str) -> Result<(), JsValue> {
    initialize_client_impl(server_url)
        .await
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

// Storage backend example for IndexedDB
#[allow(dead_code)]
async fn indexeddb_storage_example() -> Result<()> {
    // liaison id=storage-indexeddb
    let storage = IndexedDBStorageEngine::open("myapp").await?;
    // liaison end

    let node = Node::new(Arc::new(storage), PermissiveAgent::new());

    let _ = node;
    Ok(())
}

#[wasm_bindgen]
pub fn ctx() -> Result<Context, JsValue> {
    CONTEXT.with(|slot| {
        slot.borrow()
            .clone()
            .ok_or_else(|| JsValue::from_str("Context not initialized"))
    })
}

// Re-export the generated TypeScript bindings
pub use ankurah_org_example_model::*;
