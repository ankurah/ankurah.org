# Tree Management

`ankurah_core::sync::TreeManager` connects core's entities and Selections to
the generic digest-tree crate. It can open trees, retain recent ones, route
explicitly supplied entity changes to live trees, and rebuild a tree.

**Node does not own or invoke TreeManager yet.** The intended integration is
one manager per Node. The behavior below is implemented and exercised by
callers in tests; automatic Node maintenance comes later.

## One Selection, one lookup

`open(selection)` looks up the exact resolved Selection. Display-only property
labels are canonicalized, while predicate structure, property IDs, ordering
and `LIMIT` remain part of its identity. If the tree is still alive, opening
reuses it. Otherwise the manager rebuilds its full predicate membership from
canonical entity state before returning it.

A stable backing tree ID lets a rebuild reuse the existing storage namespace.
Persisted data surviving a restart is not evidence that it includes every
entity change made since the tree was last maintained.

`view(selection)` follows the same opening path and returns the digest crate's
existing `DigestTreeView`. There is no separate core view wrapper.

Selections with different limits currently get separate lookups, even though
both trees contain full membership and a caller applies the read limit.
Compatible Selection sharing is an optimization for later; reversing an
ordering, for example, must preserve missing-value placement and ID ties.

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

## Maintenance needs a caller

`TreeManager::apply` accepts stable before/after entity versions and the
caller's storage transaction. It evaluates each live tree's predicate against
both versions, then inserts, updates or removes the member as appropriate.
The member's payload is its head `Clock`; its key comes from the properties
specified by the tree's `KeySpec`.

Maintenance is version-checked: after A→B lands, replaying A→B names an old
version and can be refused. The caller must supply the versions that the
actual entity transition replaces.

The caller must coordinate entity writers with the publication lock supplied
to the manager. The required sequence covers maintenance, storage commit,
reporting tree writes landed, and publication of entity state. Opening holds
the same gate across its scan and registration, preventing a cooperating
writer from slipping a change between them. The caller must not call `open`
while holding that gate.

This is an integration obligation, not a background worker hidden inside the
manager. A process-local gate also cannot coordinate independent Nodes sharing
PostgreSQL; the future continuation design must account for those writers.

## Recovery is explicit

`refresh(selection)` rebuilds even when a tree is still live. It provides a
recovery primitive for a committed maintenance refusal or a storage reset.
`open` can reuse a live handle without detecting that it requires recovery.

A rebuild within the same incarnation preserves existing handle ownership.
After a reset or drop, a new incarnation replaces the old one, whose handles
remain retired. A failed rebuild does not replace the manager's registration.
Corrupt records or incompatible key specifications can still make rebuilding
fail; refresh is not an unconditional repair of arbitrary damage.

## What comes next

Node integration must supply the actual commit and publication wiring.
Maintenance continuation must cover missed changes across eviction, recall
and restart. Write-behind must distinguish the progress held in memory from
the progress durably persisted. Incremental recovery must also cover adopted
state snapshots, not only ordinary event arrivals.

The current rebuild path is the available fallback. No durable replay cursor,
automatic catch-up protocol, deferred tree flush, or comparison network
message is implied by the APIs described here.
