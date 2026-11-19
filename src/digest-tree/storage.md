# Storage and Transactions

A tree describes records owned by something else. Core's trees describe
entities. If an entity changed but its tree did not, the digest could report
agreement for data that no longer agrees. The tree's persistent records and
the entity records they describe must therefore commit together.

The machinery for doing this exists on all four storage engines. Node does
not yet call it as part of its commit path; this chapter explains the
available contract and how its caller must use it.

## Three layers, three jobs

| Layer | Responsibility |
|---|---|
| `ankurah-digest-tree` | Order members, maintain digests, read views and compare pages |
| `Store` implementation | Give one tree consistent reads and access to its owner's transaction |
| `StorageEngine` | Atomically persist the owner's entity records and ordered-map writes |

The digest-tree crate shares `KeySpec` and value types through
`ankurah-core-types` and does not depend on `ankurah_core`. `Store` is its
storage boundary. Core's `EngineAdapter` implements that boundary using an Ankurah
storage engine. It is scoped to one tree, so even an unbounded read cannot
cross into another tree's records.

## What is a tree record?

The crate calls a persistent item a `Row`. Here, **tree record** means one
key/value item in the tree's Store, not a relational row representing an
entity. There are three kinds:

| Record | Key | Contents |
|---|---|---|
| Metadata | `RowKey::Meta` | Key specification and digest group |
| Tree node | `RowKey::Node(prefix)` | Subtree digest and branching information |
| Member | `RowKey::Leaf(address)` | Payload and the member's digest element |

A changed member updates its record and the tree-node records along its path.
It does not require storing a complete new comparison page. Pages are assembled
from records when requested.

## Prepare, apply, commit, publish

The owner supplies the existing member version when updating or removing it.
The tree validates that version rather than silently replacing whatever it
finds. A generic in-memory example can use `Transaction::commit()`:

<pre><code class="language-rust" transclude="example/digest-tree/src/lib.rs#change-member">pub async fn retitle(tree: &amp;Tree, before: Album) -&gt; anyhow::Result&lt;()&gt; {
    let after = Album {
        title: Title(&quot;Walking on a Dream (Live)&quot;.into()),
        ..before.clone()
    };
    let mut change = tree.transaction();
    change.update(before, after)?;
    change.commit().await?;
    Ok(())
}</code></pre>

With core storage, the owner lends its `StorageTransaction` to the adapter.
Tree preparation and application write through that transaction. Only after
the storage commit succeeds does the owner report the write as `landed`,
which publishes eligible changes into the in-memory record cache.

Explore the boundary below. The diagram describes an explicit caller of the
storage/adapter APIs, not an already integrated Node commit path.

<iframe class="digest-figure" src="figures/transaction.html" title="Explore atomic entity and tree writes through commit or rollback" loading="lazy" style="width:100%;height:680px;border:0"></iframe>

[Open the transaction explainer](figures/transaction.html).

The storage commit is the atomic boundary. Cache publication follows a
successful commit and touches memory only. Calling `landed` before commit
would make the cache claim a state that storage might never accept.

Core can also commit an entity change together with a marker invalidating a
tree that refused maintenance. Reads of that tree then fail instead of
serving stale digests. Recovering it uses the manager's explicit
[`refresh`](management.md#recovery-is-explicit) operation; deciding when to
recover belongs to the caller.

## Ordered maps, named locks, snapshots

An **ordered map** maps byte keys to byte values under a `MapId`. Transactions
can read individual keys or ranges and apply batches of puts and deletes.
Map writes commit atomically with the transaction's entity records.

A **named lock** coordinates writers using a `LockName`. The transaction
owns its lifetime. Engines may make competing writers wait or reject a
conflicting commit. Names must be acquired in strictly ascending order.

A **map snapshot** gives a read a consistent committed state. A tree's
`Store::begin_read` obtains one for that operation; it does not turn every
live view into a long-lived snapshot.

| Engine | How the contract is supported |
|---|---|
| PostgreSQL | Native transactions, transaction-scoped advisory locks, and consistent read snapshots |
| SQLite | Native transactions and snapshots, with writes serialized by SQLite's writer coordination |
| Sled | Staged writes applied through its atomic transaction interface, with lock and read coordination |
| IndexedDB | Staged writes committed in a native transaction; cross-tab lock versions detect conflicting commits |

The contract is common; identical lock implementation or concurrency is not
promised. An IndexedDB named lock does not hold a mutex in another browser tab.

Some engines buffer map writes within a storage transaction. That staging
ends at commit. It is different from the future **write-behind** mechanism,
which will allow tree persistence to lag behind maintained in-memory state.

## Record caching belongs to the adapter

`StorageCache` caches tree records, not entity properties or a set of tree
handles. Several `EngineAdapter` instances can share its byte budget and
eviction policy. Their records remain scoped to distinct trees.

The adapter reconciles its cached generation with the persisted tree's
generation and change log. This catches up a cache with tree writes that
have already committed. It does **not** replay entity changes that happened
while a tree was not maintained. That continuation is separate future work.
