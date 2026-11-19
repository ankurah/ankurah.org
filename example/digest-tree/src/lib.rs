//! Executable examples used by the digest-tree chapters and comparison figure.

use std::{borrow::Cow, convert::Infallible, num::NonZeroUsize};

use ankurah_core_types::{
    key_spec::{IndexKeyPart, KeySpec},
    Value, ValueType,
};
use ankurah_digest_tree::{
    DigestTree, DigestTreeView, Member, MemberId, MemoryStore, Payload, Ristretto255, Row, RowKey,
};
use futures::TryStreamExt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Id(pub u64);

impl MemberId for Id {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(self.0.to_be_bytes().to_vec())
    }
    fn from_bytes(bytes: &[u8]) -> Option<Self> {
        Some(Self(u64::from_be_bytes(bytes.try_into().ok()?)))
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Title(pub String);

impl Payload for Title {
    fn digest_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Borrowed(self.0.as_bytes())
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Property {
    Year,
}

// liaison id=album-member
#[derive(Clone, Debug)]
pub struct Album {
    pub id: Id,
    pub year: Option<i32>,
    pub title: Title,
}

impl Member<Property> for Album {
    type Id = Id;
    type Payload = Title;
    type KeyError = Infallible;

    fn id(&self) -> Id {
        self.id
    }

    fn value(&self, part: &IndexKeyPart<Property>) -> Result<Option<Value>, Infallible> {
        match part.key {
            Property::Year => Ok(self.year.map(Value::I32)),
        }
    }

    fn payload(&self) -> Title {
        self.title.clone()
    }
}
// liaison end

pub type Tree = DigestTree<
    Property,
    Id,
    Title,
    Ristretto255,
    MemoryStore<RowKey, Row<Property, Title, Ristretto255>>,
>;
pub type View = DigestTreeView<
    Property,
    Id,
    Title,
    Ristretto255,
    MemoryStore<RowKey, Row<Property, Title, Ristretto255>>,
>;

pub fn album(id: u64, year: i32, title: &str) -> Album {
    Album {
        id: Id(id),
        year: Some(year),
        title: Title(title.into()),
    }
}

// liaison id=create-tree
pub async fn albums_tree(albums: Vec<Album>) -> anyhow::Result<Tree> {
    let key_spec = KeySpec::new(vec![IndexKeyPart::asc(Property::Year, ValueType::I32)]);
    Ok(DigestTree::create(MemoryStore::new(), key_spec, albums).await?)
}
// liaison end

// liaison id=compare-trees
pub async fn find_changes() -> anyhow::Result<()> {
    let first = album(1, 2008, "Walking on a Dream");
    let second = album(2, 2013, "Ice on the Dune");
    let ours = albums_tree(vec![first.clone()]).await?;
    let theirs = albums_tree(vec![first, second]).await?;

    // A view can serve as a PageGetter in the same process.
    let differences = ours.view().differences(theirs.view()).await?;
    assert_eq!(differences.len(), 1);
    assert!(differences[0].ours.is_none());
    assert_eq!(differences[0].theirs.as_ref().unwrap().id, Id(2));
    Ok(())
}
// liaison end

// liaison id=select-range
pub async fn read_range(tree: &Tree) -> anyhow::Result<Vec<Id>> {
    // Key values describe the view; they are not raw address bytes.
    let view = tree.select(2010..=2016)?;
    let members: Vec<_> = view.range(..)?.try_collect().await?;
    Ok(members.into_iter().map(|member| member.id).collect())
}
// liaison end

// liaison id=compare-batches
pub async fn find_changes_in_batches() -> anyhow::Result<()> {
    let ours = albums_tree(Vec::new()).await?;
    let theirs = albums_tree(
        (1..=300)
            .map(|id| album(id, 1800 + id as i32, "Album"))
            .collect(),
    )
    .await?;
    let mut comparison = ours
        .view()
        .compare(theirs.view(), NonZeroUsize::new(32).unwrap());
    let mut found = 0;
    while let Some(batch) = comparison.next_batch().await? {
        assert!(batch.len() <= 32);
        // A caller can process this batch before asking for the next one.
        found += batch.len();
    }
    assert_eq!(found, 300);
    Ok(())
}
// liaison end

// liaison id=change-member
pub async fn retitle(tree: &Tree, before: Album) -> anyhow::Result<()> {
    let after = Album {
        title: Title("Walking on a Dream (Live)".into()),
        ..before.clone()
    };
    let mut change = tree.transaction();
    change.update(before, after)?;
    change.commit().await?;
    Ok(())
}
// liaison end

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn comparison_finds_the_missing_member() {
        find_changes().await.unwrap();
    }

    #[tokio::test]
    async fn incremental_comparison_visits_every_missing_member() {
        find_changes_in_batches().await.unwrap();
    }

    #[tokio::test]
    async fn range_keeps_ties_and_includes_its_upper_bound() {
        let tree = albums_tree(vec![
            album(1, 2008, "A"),
            album(3, 2016, "C"),
            album(2, 2016, "B"),
            album(4, 2020, "D"),
        ])
        .await
        .unwrap();
        assert_eq!(read_range(&tree).await.unwrap(), vec![Id(2), Id(3)]);
    }

    #[tokio::test]
    async fn a_view_is_live_and_keeps_the_tree_alive() {
        let before = album(1, 2008, "Walking on a Dream");
        let tree = albums_tree(vec![before.clone()]).await.unwrap();
        let view = tree.view();
        let original = view.span_digest(..).await.unwrap();
        retitle(&tree, before).await.unwrap();
        assert_ne!(original, view.span_digest(..).await.unwrap());
        drop(tree);
        let members: Vec<_> = view.range(..).unwrap().try_collect().await.unwrap();
        assert_eq!(members[0].payload.0, "Walking on a Dream (Live)");
    }
}
