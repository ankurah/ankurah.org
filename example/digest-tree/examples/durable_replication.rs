//! Independent directional selections with complete durable event histories.

use std::{collections::BTreeMap, sync::Arc, time::Duration};

use ankurah::{
    ankql::{
        self,
        ast::{Predicate, Resolved, Selection},
    },
    core::{error::RetrievalError, storage::StorageEngine},
    policy::DEFAULT_CONTEXT,
    proto::{EntityId, ModelId, SystemModel},
    Model, Node, PermissiveAgent,
};
use ankurah_connector_local_process::LocalProcessConnection;
use ankurah_storage_sqlite::SqliteStorageEngine;
use serde::{Deserialize, Serialize};

#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Record {
    title: String,
    published: bool,
    favorite: bool,
}

type Durable = Node<SqliteStorageEngine, PermissiveAgent>;

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    tokio::time::timeout(Duration::from_secs(30), run()).await?
}

async fn run() -> anyhow::Result<()> {
    let directory = tempfile::tempdir()?;
    let left = Node::new_durable(
        Arc::new(SqliteStorageEngine::open(directory.path().join("left.sqlite")).await?),
        PermissiveAgent::new(),
    );
    left.wait_ready().await?;
    left.context_async(DEFAULT_CONTEXT)
        .await?
        .resolve_model_id::<Record>()
        .await?;
    let right_path = directory.path().join("right.sqlite");
    let right = share_catalog(
        &left,
        Arc::new(SqliteStorageEngine::open(&right_path).await?),
    )
    .await?;

    // Application records arrive through replication, not catalog setup.
    let published_id = create(&left, "Published album", true, false).await?;
    let private_id = create(&left, "Private draft", false, false).await?;
    let favorite_id = create(&right, "Local favorite", false, true).await?;
    let connection = LocalProcessConnection::new(&left, &right).await?;

    // liaison id=durable-directions
    let published = selection(&right, "published = true").await?;
    let left_to_right =
        right.replicate_from(left.wait_id().await?, published.clone(), DEFAULT_CONTEXT)?;
    let captured = left_to_right.wait_caught_up().await?;
    assert_eq!(captured.digest.count(), 1);

    // The reverse direction is optional and can select different entities.
    let favorites = selection(&left, "favorite = true").await?;
    let right_to_left = left.replicate_from(right.wait_id().await?, favorites, DEFAULT_CONTEXT)?;
    right_to_left.wait_caught_up().await?;
    // liaison end

    assert!(
        matches!(right.storage.get_state(private_id).await, Err(RetrievalError::EntityNotFound(id)) if id == private_id)
    );
    assert_eq!(
        right.storage.get_state(published_id).await?.payload.state,
        left.storage.get_state(published_id).await?.payload.state
    );
    assert_eq!(
        left.storage.get_state(favorite_id).await?.payload.state,
        right.storage.get_state(favorite_id).await?.payload.state
    );
    assert_history(&right, published_id, 1).await?;
    assert_history(&left, favorite_id, 1).await?;

    // liaison id=durable-exit
    drop(connection);
    let context = left.context_async(DEFAULT_CONTEXT).await?;
    let transaction = context.begin();
    transaction
        .get::<Record>(&published_id)
        .await?
        .published()?
        .set(&false)?;
    transaction.commit().await?; // Durable locally while the receiver is offline.
    drop(context);

    let connection = LocalProcessConnection::new(&left, &right).await?;
    left_to_right.retry(); // Ask for a new capture, rather than the last completed one.
    let captured = left_to_right.wait_caught_up().await?;
    assert_eq!(captured.digest.count(), 0);
    assert!(right.storage.fetch_states(&published).await?.is_empty());
    assert_history(&right, published_id, 2).await?; // Creation and the exit event remain.
                                                    // liaison end

    let storage = right.storage.clone();
    drop(left_to_right);
    drop(right_to_left);
    drop(connection);
    drop(right);
    while Arc::strong_count(&storage) != 1 {
        tokio::task::yield_now().await;
    }
    drop(storage);
    let new_id = create(&left, "Published while offline", true, false).await?;

    // liaison id=durable-restart
    let reopened = Node::new_durable(
        Arc::new(SqliteStorageEngine::open(&right_path).await?),
        PermissiveAgent::new(),
    );
    reopened.wait_ready().await?;
    let _connection = LocalProcessConnection::new(&left, &reopened).await?;
    let resumed = reopened.replicate_from(left.wait_id().await?, published, DEFAULT_CONTEXT)?;
    resumed.wait_caught_up().await?;
    // liaison end
    assert_history(&reopened, published_id, 2).await?;
    assert_history(&reopened, new_id, 1).await?;
    println!("Independent directions, retained exit history, and restart recovery verified");
    Ok(())
}

async fn selection(node: &Durable, predicate: &str) -> anyhow::Result<Selection<Resolved>> {
    let model = node
        .context_async(DEFAULT_CONTEXT)
        .await?
        .resolve_model_id::<Record>()
        .await?;
    Ok(node
        .catalog
        .resolve_selection(&model, ankql::parser::parse_selection(predicate)?)?
        .and_member_of(model))
}

async fn create(
    node: &Durable,
    title: &str,
    published: bool,
    favorite: bool,
) -> anyhow::Result<EntityId> {
    let context = node.context_async(DEFAULT_CONTEXT).await?;
    let transaction = context.begin();
    let id = transaction
        .create(&Record {
            title: title.into(),
            published,
            favorite,
        })
        .await?
        .id();
    transaction.commit().await?;
    Ok(id)
}

/// Independently initialized nodes use the same catalog declarations.
/// Equal labels alone do not unify models created independently by two nodes.
async fn share_catalog(
    seed: &Durable,
    storage: Arc<SqliteStorageEngine>,
) -> anyhow::Result<Durable> {
    let node = Node::new_durable(storage, PermissiveAgent::new());
    node.wait_ready().await?;
    let mut states = BTreeMap::new();
    for model in [
        SystemModel::Model,
        SystemModel::Property,
        SystemModel::ModelProperty,
    ] {
        for state in seed
            .storage
            .fetch_states(&Predicate::MemberOf(ModelId::System(model)).into())
            .await?
        {
            states.insert(state.payload.entity_id, state);
        }
    }
    for state in states.values() {
        let mut events = seed
            .storage
            .dump_entity_events(state.payload.entity_id)
            .await?;
        assert!(!events.is_empty());
        events.sort_by_key(|event| event.payload.generation());
        node.import_events(&events).await?;
    }
    Ok(node)
}

async fn assert_history(node: &Durable, id: EntityId, count: usize) -> anyhow::Result<()> {
    let events = node.storage.dump_entity_events(id).await?;
    assert_eq!(events.len(), count);
    let generations: BTreeMap<_, _> = events
        .iter()
        .map(|event| (event.payload.id(), event.payload.generation()))
        .collect();
    for event in events {
        assert_eq!(event.payload.entity_id, id);
        for (generation, parent) in &event.payload.parent {
            assert_eq!(generations.get(parent), Some(generation));
        }
    }
    for (generation, head) in &node.storage.get_state(id).await?.payload.state.head {
        assert_eq!(generations.get(head), Some(generation));
    }
    Ok(())
}
