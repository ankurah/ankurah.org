# Causal Comparison: Frontiers and Meets

Conceptually, everything in the previous chapter reduces to one operation:

```text
compare(event_getter, subject, comparison, budget)
    -> Result<ComparisonResult<E>, RetrievalError>
```

`ComparisonResult` contains the causal relation plus the accumulated graph
needed by a later merge. Given two clocks, the operation answers: does
`subject` strictly descend `comparison`,
strictly precede it, equal it, diverge from it since some meet, or share
nothing with it at all? This chapter walks through how that answer is
computed, and why several of the details are load-bearing.

Throughout, the **cover** of a clock means the clock's events plus all of
their ancestors: everything that clock "knows about".

## Early exits

Two identical clocks are `Equal`. This includes two empty clocks: an entity
with no history compared against another empty history is the same
(non-)place. A one-sided empty clock shares nothing with a non-empty one and
reports `DivergedSince` with an empty meet.

## The quick check

Almost every comparison in a live system is a new event landing exactly one
step above the current head. For that shape a full graph walk is wasted work,
and on ephemeral nodes it can be worse than wasted: the head events themselves
may not exist in local storage, only the state that references them.

So `compare` first fetches just the subject's events and checks a shortcut:

> Every subject event has a nonempty parent set contained in the comparison
> clock, and every comparison head appears as some subject event's parent.

If that holds, the subject is the comparison advanced by one step:
`StrictDescends`, no traversal, and crucially no fetch of the comparison
events.

Both halves of the condition matter. Coverage alone (every comparison head is
somebody's parent) is not enough, because a subject event that contributes
nothing to the parent union gets silently vouched for by its siblings.
Consider `subject = [B, X]` versus `comparison = [A]`, where `B`'s parent is
`A` and `X` is an independent genesis root. The parent union is `{A}`, which
covers the comparison, yet `X` carries an entire foreign lineage. Adopting
`[B, X]` as a fast-forward would import unrelated history without a merge.
The per-event guard sends any such shape to the full traversal, which
classifies it correctly as diverged.

## The traversal: two frontiers walking backward

When the shortcut does not apply, the algorithm walks the DAG backward from
both clocks simultaneously. Each side owns a **frontier**: the set of event
ids it is about to process. Each step:

1. Fetch every event on either frontier.
2. For each event: remove it from the frontier(s) it sits on, record which
   side(s) have now seen it, and extend that side's frontier with the event's
   parents.
3. Check whether a verdict can be declared.

An event reached by **both** sides is a **common** node: shared history. The
first common nodes discovered are candidates for the meet.

### Visit each node once per side

A node reachable by two paths of different lengths will be re-added to a
frontier after it was already processed. Left unchecked, that causes three
distinct problems: bookkeeping that counts the same head twice (and can
declare a false verdict from it), traversal budget spent per *path* rather
than per *event* (a chain of diamonds has linearly many events but
exponentially many paths), and result chains polluted with duplicates.

The algorithm therefore keeps a per-side *processed* set. Expansion consults
it twice: a node is only expanded the first time each side processes it, and
parents already processed on a side are never re-added to that side's
frontier. Budget becomes proportional to events fetched, and every
bookkeeping structure can trust that it sees each (node, side) pair once.

### Declaring StrictDescends: coverage plus a clean boundary

The subject strictly descends the comparison when the subject's traversal has
seen every comparison head. That is *cover containment*: everything the
comparison knows is inside what the subject knows.

But `StrictDescends` drives adoption: the receiver fast-forwards its head to
the subject clock wholesale. Cover containment alone is not a safe basis for
that, because a subject can smuggle a foreign lineage in two ways. The
`[B, X]` clock above juxtaposes an extra head; a single **graft event** does
it more subtly, with one event whose parent clock joins a legitimate
ancestor line with an independent genesis root. Both shapes cover the
comparison via their honest component while importing unrelated history.

So the completion requires, additionally, that the subject's **exploration
boundary** lies entirely within the comparison's ancestry: every genesis
root the subject traversal has discovered, and every id still on its
frontier (the undiscovered remainder), must be part of the comparison's
lineage. A foreign root fails the first test the moment it is discovered; a
deep foreign line keeps failing the second until its root surfaces.

Honest shapes fire exactly when they used to. A deep linear extension
completes with its unexplored remainder sitting below the comparison
surface, which is inside the comparison's ancestry. And a subject head may
be a *sibling* of a comparison head rather than its descendant: if the local
head is `[J]` and an incoming state carries head `[F, J]`, where `F` and `J`
are concurrent children of the same creation event, `F`'s walk bottoms out
at their shared ancestor, inside the comparison's ancestry. That state
genuinely contains everything the local node has, and adopting it is
correct.

A subject with a dirty boundary never fast-forwards. The traversal simply
continues to exhaustion and reports the honest diverged verdict, which
routes the foreign line through the merge machinery instead of adopting it
blind.

`StrictAscends` (the mirror direction) deliberately stays cover-only: it
drives *skip this incoming event*, and for skipping, knowing that the local
head already covers the incoming clock is sufficient.

## Finding the meet

For diverged clocks, the verdict must name the meet: the most recent common
ancestors, which become the floor for the layer merge.

Every common node is a meet *candidate*. When a candidate's child is also
common, the candidate is an ancestor of shared history, not its edge; the
final meet is the set of common nodes with no common children. In other
words, the maximal antichain of the common region.

One more check guards the verdict's honesty. Each comparison head must be
*accounted for*: some common node must be reachable backward from it. This is
asked once, at exhaustion, by direct reachability over everything the
traversal recorded, which is complete for both walks by then. A head that
reaches no common node means part of the comparison clock shares nothing with
the subject, and the verdict degrades to a diverged result with an empty meet
rather than inventing a partial one. An earlier design propagated per-head
origin markers through the walk and retired heads incrementally; that scheme
is provably insufficient once re-expansion is deduplicated (a marker arriving
at an already-expanded node is never carried forward), which is why the
implementation asks the reachability question directly instead of maintaining
running state.

## Disjoint detection

If the frontiers exhaust with no common node at all, the traversal has seen
both histories down to their genesis events. Different genesis events prove
different lineages: `Disjoint`. This is the backstop for lineage integrity:
an independently generated `EntityId` has one accepted creation event anchoring
its history, and no amount of clock juggling can replace that genesis wholesale.

## Budget

The current budget is a **soft breadth-step guard**, not a hard cap on storage
fetches. A traversal step drains the entire current frontier before the next
budget check, so a wide frontier may process more entries than the nominal
remaining budget; the preliminary quick-check fetches are outside this budget
as well. `compare` retries internally once with four times the budget before
reporting `BudgetExceeded`. Only the **accumulator** (the recorded DAG structure
and an LRU cache of fetched events) survives the retry; traversal state restarts
from the original clocks. Re-walked entries can hit the cache but still count
toward the soft guard.

Visits are deduplicated per side, so charged traversal work remains linear in
the explored `(event, side)` region. Deep histories consume many sequential
steps; wide histories can overshoot within one step. Common verdicts usually
fire before full exhaustion.

## Unfetchable events

On an ephemeral node, old events may exist only on a durable peer. If an id
sits on **both** frontiers but cannot be fetched, it is provably a common
ancestor; the algorithm processes it with empty parents, cleanly terminating
both walks at that point. An unfetchable id on only one frontier is a real
error: the local graph is missing something it needs.

## The second frontier algorithm: layers

Comparison walks *backward* to classify. Merging then walks *forward* to
apply. From the meet, the layer iterator repeatedly emits the set of events
whose parents have all been emitted already: a generalized topological sort
where each emission is a **layer** of mutually concurrent events.

Each layer is split into `already_applied` (events the local head already
incorporates, provided as context) and `to_apply` (new work). Property
backends receive whole layers and resolve concurrency within them; the
[property backends chapter](../internals/property-backends.md) covers exactly how.

## The third: ordering event batches

When a peer needs to catch a node up across many events (an **EventBridge**),
the batch travels as a set. Discovery order on the sender interleaves uneven
branches, and receivers must not trust sender ordering anyway. The same rule
applies to every multi-event wire shape. Applying a child before its staged
parent would classify the child as a fast-forward
(its ancestry resolves through staging), jump the head past the parent, and
then discard the parent's operations as "already history" while the event
itself sits committed in storage: a silent, durable loss.

So both sides sort. The receiver runs Kahn's algorithm over the batch using
parent edges within it (parents outside the batch are the bridge floor,
already known), applying parents before children unconditionally. Content
addressing makes a cycle impossible in honest input, so cycle detection
simply rejects the batch as malformed.

## The specification, executable

The comparison semantics described here are pinned by a randomized property
test: hundreds of generated DAGs, random antichain clock pairs, and a
brute-force reachability oracle that recomputes every verdict from first
principles (cover containment, root/boundary containment for safe
adoption, and meet as the maximal common antichain). Divergence between the
state machine and the oracle fails the build. When you need the precise
semantics of an edge case,
the oracle in `core/src/event_dag/tests.rs` is the most honest place to read
them.
