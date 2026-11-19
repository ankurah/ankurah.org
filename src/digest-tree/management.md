# Tree Management

`ankurah_core::sync::TreeManager` connects core's entities and Selections to
the generic digest-tree crate. Each Node owns one manager shared by fetch
and live-query setup. It opens trees, retains recent ones, and reconciles
their membership with canonical entity state.

This chapter describes the [pinned, unreleased Node preview](index.md).

## One Selection, one lookup

`open(selection)` looks up the exact resolved Selection. Display-only property
labels are canonicalized, while predicate structure, property IDs, ordering
and `LIMIT` remain part of its identity. If the tree is still alive, opening
reuses it and reconciles it before returning. Otherwise the manager opens
its backing tree and catches up from its durable cursor, or reconstructs
membership if no usable cursor remains.

A stable backing tree ID lets a rebuild reuse the existing storage namespace.
Persisted data surviving a restart is not evidence that it includes every
entity change made since the tree was last maintained; the cursor establishes
where reconciliation must resume.

`view(selection)` follows the same opening path and returns the digest crate's
existing `DigestTreeView`. There is no separate core view wrapper.

Selections with different limits get separate lookups and different
membership. A limited tree contains the engine's query result, including
refill candidates when previous members leave. An unlimited tree contains
all matches without requiring a separate permanent result set of those
entities. Sharing trees across compatible Selections remains future work.

## Two kinds of memory retention

Do not confuse the manager's retained trees with the adapter's cached records.

| Mechanism | Retains | Why |
|---|---|---|
| Manager's LRU | Strong handles to recently used trees | Reuse a tree when a request returns |
| Manager's weak registry | References that can find live trees without keeping them alive | Find trees still owned by a caller, view, stream or transaction |
| Adapter's `StorageCache` | Individual persisted tree records | Avoid repeated storage reads within a shared byte budget |

The weak registry uses the crate's `WeakDigestTree` handles.

The LRU's capacity bounds the manager's own retained handles. It does not
cap the number of trees that callers can keep alive. A zero capacity disables
that strong retention; it does not prevent callers from owning trees.

<iframe class="digest-figure" src="figures/lifetime.html" title="Explore how views and streams keep a tree managed after LRU eviction" loading="lazy" style="width:100%;height:730px;border:0"></iframe>

[Open the tree-lifetime explainer](figures/lifetime.html).

Eviction removes the LRU's strong reference. If a view, stream, transaction
or other handle still owns the tree, the weak registry can still find it for
maintenance. Only after the last strong owner disappears does that tree stop
being available through the registry. Eviction does not delete its backing
storage.

## Node maintains every live tree

Before polling a canonical commit, Node invalidates its maintained views
while holding the publication lock. Those views cannot present the old
tree as current. The background worker reconciles committed state even if
the initiating request is cancelled. Query opening also reconciles before
serving the tree.

Reconciliation reads canonical state at one engine boundary and builds a
private tree version. Only a successfully validated source read permits
publication. The member's payload is its head `Clock`; its key comes from
the properties in the tree's `KeySpec`. A persisted member lookup supplies
the former key and head when an entity moves or leaves the Selection.

One failing tree does not prevent maintenance of other trees. The worker
holds only a weak manager reference while waiting, and Node shutdown cancels
an active source read. It therefore does not keep a dropped Node alive.

The publication lock coordinates this Node's writers. Independent Nodes
sharing storage also need the [engine read boundary and conditional
flush](storage.md#canonical-state-is-the-recovery-source). A flush validates
the exact durable tree generation under its named lock; a conflict causes
refresh and reconciliation rather than overwriting another Node's progress.

## Recovery and reconstruction

Ordinary opening reconciles from the last valid cursor. An invalid cursor,
such as one from another storage incarnation, causes full reconstruction.
`refresh(selection)` explicitly rebuilds membership even when a tree is
still live; existing views share the adapter and observe the completed
replacement after publication.

Unlimited initial builds persist bounded pages with status `Building` and no recovery
cursor. They can resume through an idempotent full scan; ordinary opening
does not expose a partial build as ready. Only a completed, validated scan
establishes the cursor. Corrupt records or incompatible key specifications
can still make opening or refresh fail.

Large incremental catch-up and explicit refresh can still accumulate a large
transient overlay. The LRU bounds retained handles, not that work's temporary
memory. [Node Lifecycle](node-lifecycle.md) follows the separate maintenance
and persistence boundaries with an executable example.
