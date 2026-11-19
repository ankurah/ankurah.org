# Storage and Transactions

A tree describes records owned by something else. Core's trees describe
entities. If an entity changed but an old tree were still advertised as
current, its digest could report agreement for data that no longer agrees.
Node prevents that by invalidating maintained views before a canonical
commit, then publishing a reconciled tree only after validating its source.

Canonical entity writes and deferred tree writes have separate durable
boundaries. The tree's records and recovery cursor must persist together,
so a restart can recover any changes not yet flushed. The underlying adapter
also supports explicitly writing entities and tree records in one storage
transaction.

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

## The explicit transaction contract

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

Explore the boundary below. This is the lower-level adapter contract for an
explicit caller putting entity and tree writes in one transaction.
Node's automatic write-behind flow is shown in [Node Lifecycle](node-lifecycle.md).

<iframe class="digest-figure" src="figures/transaction.html" title="Explore atomic entity and tree writes through commit or rollback" loading="lazy" style="width:100%;height:680px;border:0"></iframe>

[Open the transaction explainer](figures/transaction.html).

The storage commit is the atomic boundary. Cache publication follows a
successful commit and touches memory only. Calling `landed` before commit
would make the cache claim a state that storage might never accept.

Node reconciliation instead prepares a private buffered version. Its flush
atomically persists tree records, the member-key lookup, the generation log
and the durable cursor. These records describe one completed canonical read
boundary, even while later entity changes are already durable.

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
ends at commit. **Write-behind** lets tree persistence lag behind maintained
in-memory state across transactions; it does not defer canonical durability.

## Canonical state is the recovery source

Every canonical entity state carries an engine-owned last-change marker
written in the same transaction as that state. Adopting a snapshot advances
the marker; merely caching events does not. Recovery therefore includes
snapshot adoption without needing every intervening event.

`StorageEngine::state_snapshot(StateScan)` establishes one read boundary:

| Scan | What its pages contain |
|---|---|
| `Changes(cursor)` | Latest visible states of identities changed since the cursor; no cursor means a full scan |
| `Selection(selection)` | The engine's complete limited-query result, including unchanged replacement members |

Point reads use that same boundary. `finish()` validates and closes the
snapshot and returns an opaque `StateCursor`. A failed or cancelled finish
establishes no coverage: the manager discards that attempt instead of
publishing a partially reconciled tree. Several changes to one entity can
be coalesced into its latest visible state.

The cursor belongs to one storage incarnation. It is neither an entity's
causal clock nor a peer's known state, and the manager must not interpret
its bytes as a maximum sequence number.

### PostgreSQL includes late commits

PostgreSQL transaction IDs are not commit-order numbers. Its cursor records
a native snapshot boundary and transactions still in progress there. For
example, writer 96 can still be running when writer 100 has committed. A
boundary at 101 remembers 96, so its later commit remains eligible for the
next scan. If 96 aborts there is no state to include; if it remains active,
the next cursor retains the exception. No fixed timeout is assumed.

Sled, SQLite and IndexedDB use transactional state counters and incarnation
checks. Engines either hold a native snapshot or reject a read whose
canonical boundary moves. A moved active read is retryable; a saved cursor
from another incarnation requires reconstruction.

## Record caching belongs to the adapter

`StorageCache` caches tree records, not entity properties or a set of tree
handles. Several `EngineAdapter` instances can share its byte budget and
eviction policy. Their records remain scoped to distinct trees.

The adapter reconciles its cached generation with the persisted tree's
generation and change log. This catches up a cache with tree writes that
have already committed. Canonical-state continuation is a separate job:
the manager uses the cursor to reconcile entity changes that the persisted
tree has not yet covered.
