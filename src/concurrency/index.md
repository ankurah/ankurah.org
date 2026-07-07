# How Ankurah Handles Concurrency

Ankurah lets many nodes write to the same entities at the same time, with no
central lock and no requirement that anyone is online. A phone can edit an
album while a server processes an import job touching the same record; both
edits survive, and every node ends up with the same state.

This chapter builds the mental model, and
[Conflict Resolution & Guarantees](guarantees.md) states the resulting
contract. What "merging" means for each field is a modeling choice you make
per field -- see [Choosing a Merge Strategy](../models/merge-strategy.md).
The machinery itself lives in the contributor Internals section: the
[comparison algorithm](causal-comparison.md) that classifies incoming
changes, the [anatomy of the engine](factorization.md), and the
engine-facing [property backends](../internals/property-backends.md).

## Events form a DAG

Every change in Ankurah is an immutable **event**. An event records:

- which entity it modifies,
- a set of **operations** per property backend (more on those later),
- a **parent clock**: the ids of the event(s) it was built on top of.

An event's id is a content hash of all of that. Ids are therefore
self-verifying and collision-free in practice. Together, the parent
references form a directed acyclic graph, much like a git commit graph.
History is usually a straight line:

```text
A <- B <- C          (C's parent is B, B's parent is A)
```

When two nodes write without seeing each other's work, the graph forks:

```text
      <- C           (C's parent is B)
A <- B
      <- D           (D's parent is also B)
```

C and D are **concurrent**: neither is an ancestor of the other. Nothing went
wrong here. Concurrency is a normal, expected state of the world, and the
system's job is to integrate both sides deterministically.

## The head: where an entity currently is

Each entity tracks a **head**: the set of tip events that represent its
current state. Usually the head is a single event, `[C]`. After the fork
above is merged locally, the head is `[C, D]`: two concurrent tips, both part
of the present. A later event `E` written with `parent = [C, D]` collapses
the head back to `[E]` and permanently records that someone observed both
branches.

A set of event ids used this way is called a **clock**. Clocks are kept
sorted and deduplicated internally, and no member of a well-formed head is an
ancestor of another member.

## Classifying an incoming change

When an event or a state snapshot arrives, the receiving node asks one
question: *how does this relate, causally, to what I already have?* The
comparison algorithm answers with one of six relations:

| Relation | Meaning | What the node does |
|----------|---------|--------------------|
| `Equal` | Same point in history | Nothing |
| `StrictDescends` | Incoming is strictly newer | Fast-forward: apply and advance the head; if committed-but-unincorporated events sit between, replay them first (layers from the current head) |
| `StrictAscends` | Incoming is strictly older | Nothing (already integrated) |
| `DivergedSince` | Concurrent branches since a common ancestor (the **meet**) | Merge, layer by layer, from the meet |
| `Disjoint` | No shared history at all (different genesis) | Reject: this is a different entity's lineage, or an attack |
| `BudgetExceeded` | History too deep to classify within budget | Error, after internal retry with a larger budget |

The overwhelmingly common case is `StrictDescends` with the incoming event
sitting exactly one step above the current head. That case is detected with
a cheap shortcut and never walks the graph at all.

## Merging diverged branches

For `DivergedSince`, the node computes the **meet** (the most recent common
ancestors) and then replays both branches forward from the meet in **layers**.
Each layer contains only events that are mutually concurrent with each other;
layers are ordered so that parents always come before children.

Each entity property belongs to a **property backend**, and each backend
decides what concurrency means for its data:

- The **LWW** backend picks a single winner per property, preferring causally
  newer writes and breaking true ties deterministically.
- The **Yrs** backend wraps a text CRDT, so concurrent edits interleave and
  all of them survive.

The point of the layer machinery is that backends never have to think about
graph shapes. They receive flat groups of concurrent events in a correct
order, and apply their own policy within each group.

## The promises

The concurrency system is built to keep a small set of promises:

1. **Convergence.** Nodes that receive the same events reach identical state,
   regardless of arrival order. Comparison verdicts and merge results depend
   only on the graph, never on timing. A randomized property test checks the
   comparison verdicts against a brute-force reachability oracle across
   hundreds of generated DAGs and many more clock comparisons.
2. **No silent loss.** A write that reached the graph is never dropped by
   ordering accidents. Batches of events are topologically sorted before
   application on the receiving side, so a child can never sneak in ahead of
   its parent and orphan the parent's operations.
3. **No foreign history.** A clock that smuggles in an unrelated lineage
   (a second genesis) is never adopted wholesale. It either merges through
   the layer machinery or is rejected as `Disjoint`.
4. **Durability ordering.** Events are committed to storage before any state
   that references them is persisted, so a crash can leave harmless orphaned
   events but never a state whose history is missing.

## Where to go next

- [Conflict Resolution & Guarantees](guarantees.md) states the contract all
  of this machinery upholds, and what is deliberately not promised.
- [Choosing a Merge Strategy](../models/merge-strategy.md) covers the
  per-field LWW-vs-Yrs decision from the modeling side.
- In the contributor Internals section,
  [Causal Comparison: Frontiers and Meets](causal-comparison.md) explains how
  the six relations are actually computed, and
  [Anatomy of the Engine](factorization.md) maps the code.
