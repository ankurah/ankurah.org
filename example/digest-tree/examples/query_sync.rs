//! Fetch, initialize a live query, and reconnect through ordinary Node APIs.

use std::{sync::Arc, time::Duration};

use ankurah::{
    core::node::nocache,
    policy::DEFAULT_CONTEXT,
    signals::{Peek, Subscribe},
    LiveQuery, Model, Node, PermissiveAgent,
};
use ankurah_connector_local_process::LocalProcessConnection;
use ankurah_storage_sqlite::SqliteStorageEngine;
use serde::{Deserialize, Serialize};

#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Record {
    title: String,
    year: i32,
    available: bool,
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    // A deadline makes a failed example terminate instead of waiting forever.
    tokio::time::timeout(Duration::from_secs(20), run()).await?
}

async fn run() -> anyhow::Result<()> {
    let directory = tempfile::tempdir()?;

    // liaison id=query-sync-connect
    let server = Node::new_durable(
        Arc::new(SqliteStorageEngine::open(directory.path().join("server.sqlite")).await?),
        PermissiveAgent::new(),
    );
    server.wait_ready().await?;
    let client = Node::new(
        Arc::new(SqliteStorageEngine::open(directory.path().join("client.sqlite")).await?),
        PermissiveAgent::new(),
    );
    let connection = LocalProcessConnection::new(&server, &client).await?;
    let source = server.context_async(DEFAULT_CONTEXT).await?;
    let target = client.context_async(DEFAULT_CONTEXT).await?;
    // liaison end

    let transaction = source.begin();
    let mut ids = Vec::new();
    for (title, year) in [("First", 2008), ("Second", 2013), ("Third", 2016)] {
        ids.push(
            transaction
                .create(&Record {
                    title: title.into(),
                    year,
                    available: true,
                })
                .await?
                .id(),
        );
    }
    transaction.commit().await?;

    // liaison id=query-sync-fetch
    let selection = "available = true ORDER BY year ASC LIMIT 2";
    let first: Vec<RecordView> = target.fetch(nocache(selection)?).await?;
    assert_eq!(titles(&first)?, ["First", "Second"]);

    // The second fetch still asks the durable peer; its captured digest agrees.
    let repeated: Vec<RecordView> = target.fetch(nocache(selection)?).await?;
    assert_eq!(titles(&repeated)?, ["First", "Second"]);

    let transaction = source.begin();
    transaction
        .get::<Record>(&ids[0])
        .await?
        .available()?
        .set(&false)?;
    transaction.commit().await?;
    let refilled: Vec<RecordView> = target.fetch(nocache(selection)?).await?;
    assert_eq!(titles(&refilled)?, ["Second", "Third"]);
    // liaison end

    // liaison id=query-sync-reconnect
    let live: LiveQuery<RecordView> = target.query(nocache(selection)?)?;
    live.wait_durable_answered().await?;
    assert_eq!(titles(&live.peek())?, ["Second", "Third"]);

    drop(connection);
    let transaction = source.begin();
    transaction
        .get::<Record>(&ids[1])
        .await?
        .title()?
        .replace("Second (Live)")?;
    transaction.commit().await?;
    assert_eq!(titles(&live.peek())?, ["Second", "Third"]);

    let _connection = LocalProcessConnection::new(&server, &client).await?;
    wait_titles(&live, &["Second (Live)", "Third"]).await?;
    // liaison end

    // Check a subsequent standing update, after the reconnect has caught up.
    let transaction = source.begin();
    transaction
        .get::<Record>(&ids[2])
        .await?
        .title()?
        .replace("Third (Live)")?;
    transaction.commit().await?;
    wait_titles(&live, &["Second (Live)", "Third (Live)"]).await?;

    println!("Fetch: First, Second; refill: Second, Third; reconnect and live updates: both titles updated");
    Ok(())
}

fn titles(records: &[RecordView]) -> anyhow::Result<Vec<String>> {
    records
        .iter()
        .map(|record| record.title().map_err(Into::into))
        .collect()
}

async fn wait_titles(live: &LiveQuery<RecordView>, expected: &[&str]) -> anyhow::Result<()> {
    let changed = Arc::new(tokio::sync::Notify::new());
    let notify = changed.clone();
    let _guard = live.subscribe(move |_| notify.notify_one());
    loop {
        let notified = changed.notified();
        if titles(&live.peek())? == expected {
            return Ok(());
        }
        if let Some(error) = live.error().peek() {
            return Err(anyhow::anyhow!("{error}"));
        }
        notified.await;
    }
}
