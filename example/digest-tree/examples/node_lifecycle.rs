//! Run Node-owned tree maintenance through the ordinary query API.

use std::{sync::Arc, time::Duration};

use ankurah::{
    core::sync::WriteBehind, policy::DEFAULT_CONTEXT, LiveQuery, Model, Node, PermissiveAgent,
};
use ankurah_storage_sqlite::SqliteStorageEngine;
use serde::{Deserialize, Serialize};

// liaison id=node-tree-model
#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Record {
    title: String,
    year: i32,
    available: bool,
}
// liaison end

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    let directory = tempfile::tempdir()?;
    let database = directory.path().join("albums.sqlite");

    {
        // liaison id=node-tree-setup
        let storage = SqliteStorageEngine::open(&database).await?;
        let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
        node.system.create().await?;
        node.wait_ready().await?;
        node.set_tree_write_behind(WriteBehind {
            max_changes: 1024,
            max_delay: Duration::from_millis(250),
        });
        let context = node.context(DEFAULT_CONTEXT)?;
        // liaison end

        let transaction = context.begin();
        for (title, year) in [("First", 2008), ("Second", 2013), ("Third", 2016)] {
            transaction
                .create(&Record {
                    title: title.into(),
                    year,
                    available: true,
                })
                .await?;
        }
        transaction.commit().await?;

        // liaison id=node-tree-query
        let selection = "available = true ORDER BY year ASC LIMIT 2";
        let live: LiveQuery<RecordView> = context.query(selection)?;
        live.wait_initialized().await?;
        let first_page: Vec<RecordView> = context.fetch(selection).await?;
        assert_eq!(titles(&first_page)?, ["First", "Second"]);
        // liaison end

        // liaison id=node-tree-refill
        let transaction = context.begin();
        first_page[0].edit(&transaction)?.available()?.set(&false)?;
        transaction.commit().await?;

        // The engine query refills the limited selection with Third.
        let refilled: Vec<RecordView> = context.fetch(selection).await?;
        assert_eq!(titles(&refilled)?, ["Second", "Third"]);

        // Canonical state is already committed; flush derived tree records too.
        node.flush_trees().await?;
        drop(live);
        // liaison end
    }

    // liaison id=node-tree-reopen
    let storage = SqliteStorageEngine::open(&database).await?;
    let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
    node.wait_ready().await?;
    let context = node.context(DEFAULT_CONTEXT)?;
    let reopened: Vec<RecordView> = context
        .fetch("available = true ORDER BY year ASC LIMIT 2")
        .await?;
    assert_eq!(titles(&reopened)?, ["Second", "Third"]);
    // liaison end

    println!("Initial: First, Second; after refill and reopen: Second, Third");
    Ok(())
}

fn titles(records: &[RecordView]) -> anyhow::Result<Vec<String>> {
    records
        .iter()
        .map(|record| record.title().map_err(Into::into))
        .collect()
}
