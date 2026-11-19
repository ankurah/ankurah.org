//! Persistent identity, a fresh local epoch on reopen, and terminal reset.

use std::{sync::Arc, time::Duration};

use ankurah::{
    error::{NodeHaltReason, NodeReadinessError, RetrievalError},
    policy::DEFAULT_CONTEXT,
    storage::StorageEngine,
    Model, Node, NodeState, PermissiveAgent,
};
use ankurah_storage_sqlite::SqliteStorageEngine;
use serde::{Deserialize, Serialize};

#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Note {
    text: String,
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    tokio::time::timeout(Duration::from_secs(20), run()).await?
}

async fn run() -> anyhow::Result<()> {
    let directory = tempfile::tempdir()?;
    let database = directory.path().join("notes.sqlite");

    // liaison id=node-identity-start
    let storage = Arc::new(SqliteStorageEngine::open(&database).await?);
    let node = Node::new_durable(storage.clone(), PermissiveAgent::new());
    let id = node.wait_id().await?; // The stored key has been loaded or created.
    node.wait_ready().await?; // Key, catalog and policy initialization are complete.
    let epoch = node.epoch();
    let context = node.context(DEFAULT_CONTEXT)?;
    // liaison end

    let transaction = context.begin();
    let note_id = transaction
        .create(&Note {
            text: "Keep me across a restart".into(),
        })
        .await?
        .id();
    transaction.commit().await?;
    drop(context);
    drop(node);
    while Arc::strong_count(&storage) != 1 {
        tokio::task::yield_now().await;
    }
    drop(storage);

    // liaison id=node-identity-reopen
    let storage = Arc::new(SqliteStorageEngine::open(&database).await?);
    let reopened = Node::new_durable(storage.clone(), PermissiveAgent::new());
    reopened.wait_ready().await?;
    assert_eq!(reopened.wait_id().await?, id); // Same persisted key.
    assert_ne!(reopened.epoch(), epoch); // A new local Node incarnation.
                                         // liaison end
    let context = reopened.context(DEFAULT_CONTEXT)?;
    let note: NoteView = context.get(note_id).await?;
    assert_eq!(note.text()?, "Keep me across a restart");

    // liaison id=node-identity-reset
    // This example owns all access to storage. Quiesce other owners first.
    reopened.reset().await?;
    assert_eq!(
        reopened.state().value(),
        NodeState::Halted(NodeHaltReason::Reset)
    );
    assert!(matches!(
        reopened.wait_ready().await,
        Err(NodeReadinessError::Halted(_))
    ));

    let successor = Node::new_durable(storage.clone(), PermissiveAgent::new());
    successor.wait_ready().await?;
    assert_ne!(successor.wait_id().await?, id); // Reset removed the stored key.
    assert_ne!(successor.epoch(), reopened.epoch());
    // liaison end

    assert!(matches!(
        context.get::<NoteView>(note_id).await,
        Err(RetrievalError::NodeHalted(_))
    ));
    assert!(matches!(
        successor.storage.get_state(note_id).await,
        Err(RetrievalError::EntityNotFound(_))
    ));
    println!("Reopen preserves identity and data; reset halts the old Node and clears both");
    Ok(())
}
