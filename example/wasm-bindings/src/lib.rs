use ankurah::{policy::DEFAULT_CONTEXT, Context, Node, PermissiveAgent};
use ankurah_storage_indexeddb_wasm::IndexedDBStorageEngine;
use ankurah_websocket_client_wasm::WebsocketClient;
use std::sync::{Arc, Mutex};
use wasm_bindgen::prelude::*;

static CONTEXT: Mutex<Option<Context>> = Mutex::new(None);

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub async fn initialize_client(server_url: &str) -> Result<(), JsValue> {
    // liaison id=client-example
    let storage = IndexedDBStorageEngine::open("myapp")
        .await
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let node = Node::new(Arc::new(storage), PermissiveAgent::new());
    let _client = WebsocketClient::new(node.clone(), server_url)
        .map_err(|e| JsValue::from_str(&format!("{:?}", e)))?;

    let context = node
        .context(DEFAULT_CONTEXT)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let _albums = context
        .query::<ankurah_org_example_model::AlbumView>("year > 1985")
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    // liaison end

    *CONTEXT.lock().unwrap() = Some(context);
    Ok(())
}

#[wasm_bindgen]
pub fn ctx() -> Result<Context, JsValue> {
    CONTEXT
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| JsValue::from_str("Context not initialized"))
}

// Re-export the generated TypeScript bindings
pub use ankurah_org_example_model::*;
