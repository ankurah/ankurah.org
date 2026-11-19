//! Generate the comparison figure's data by running the real comparison API.

use ankurah_digest_tree::{leaf_address, Page, PageGetter, Ristretto255, Span};
use digest_tree_examples::{album, albums_tree, Album, Id, Title, View};
use futures::TryStreamExt;
use serde_json::{json, Value};

struct RecordedGetter {
    ours: View,
    theirs: View,
    addresses: Vec<(u64, Vec<u8>)>,
    rounds: Vec<Value>,
}

impl RecordedGetter {
    fn album_range(&self, span: &Span) -> Value {
        let ids: Vec<u64> = self
            .addresses
            .iter()
            .filter(|(_, address)| span.contains(address))
            .map(|(id, _)| *id)
            .collect();
        // This fixture orders consecutive IDs by consecutive years. Encode
        // their display range compactly; these are not the actual span bounds.
        assert!(ids.windows(2).all(|pair| pair[1] == pair[0] + 1));
        json!({"first": ids.first(), "last": ids.last()})
    }
}

impl PageGetter<Id, Title, Ristretto255> for RecordedGetter {
    type Error = ankurah_digest_tree::Error;

    async fn get_pages(
        &mut self,
        spans: Vec<Span>,
    ) -> Result<Vec<Page<Id, Title, Ristretto255>>, Self::Error> {
        let pages = self.theirs.get_pages(spans.clone()).await?;
        let mut answers = Vec::new();
        for (span, page) in spans.iter().zip(&pages) {
            let covered = self.album_range(span);
            match page {
                Page::Digests(parts) => {
                    let mut children = Vec::new();
                    for part in parts {
                        let local = self.ours.span_digest(part.bounds.clone()).await?;
                        children.push(json!({"range": self.album_range(&part.bounds), "count": part.digest.count(), "equal": local.digest == part.digest}));
                    }
                    answers.push(json!({"kind": "digests", "range": covered, "parts": children}));
                }
                Page::Members(members) => {
                    answers.push(
                        json!({"kind": "members", "range": covered, "members": members.len()}),
                    );
                }
            }
        }
        self.rounds
            .push(json!({"requests":spans.len(), "answers":answers}));
        Ok(pages)
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    let mut cases = Vec::new();
    for scenario in ["equal", "added", "changed", "both"] {
        let albums: Vec<Album> = (1..=256)
            .map(|id| album(id, 1800 + id as i32, &format!("Album {id}")))
            .collect();
        let ours = albums_tree(albums.clone()).await?;
        let theirs = albums_tree(albums).await?;
        let mut change = theirs.transaction();
        if matches!(scenario, "added" | "both") {
            change.insert(album(257, 2057, "Album 257"))?;
        }
        if matches!(scenario, "changed" | "both") {
            change.update(
                album(150, 1950, "Album 150"),
                album(150, 1950, "Album 150 (Live)"),
            )?;
        }
        change.commit().await?;
        let members: Vec<_> = theirs.view().range(..)?.try_collect().await?;
        let addresses = members
            .iter()
            .map(|m| (m.id.0, leaf_address(&m.key, &m.id)))
            .collect();
        let mut getter = RecordedGetter {
            ours: ours.view(),
            theirs: theirs.view(),
            addresses,
            rounds: Vec::new(),
        };
        let differences = ours.view().differences(&mut getter).await?;
        let expected = match scenario {
            "equal" => 0,
            "both" => 2,
            _ => 1,
        };
        assert_eq!(differences.len(), expected);
        cases.push(json!({
            "id": scenario, "ours": 256, "theirs": members.len(), "rounds":getter.rounds,
            "differences":differences.iter().map(|d| json!({"id":d.theirs.as_ref().or(d.ours.as_ref()).unwrap().id.0,"ours":d.ours.as_ref().map(|m| &m.payload.0),"theirs":d.theirs.as_ref().map(|m| &m.payload.0)})).collect::<Vec<_>>()
        }));
    }
    println!(
        "{}",
        serde_json::to_string_pretty(
            &json!({"source":"5d223bdf5f65542a2aa966e951dab47101a46521", "cases":cases})
        )?
    );
    Ok(())
}
