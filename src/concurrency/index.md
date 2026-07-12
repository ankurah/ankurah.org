# How Ankurah Handles Concurrency

Ankurah's event-DAG engine can merge changes that different nodes produce
without a central lock. Once both causally complete histories are delivered,
every node that successfully integrates them computes the same result. The
0.9 connectors do not yet provide an offline-write outbox or automatic replay
on reconnect, so delivery of changes committed while disconnected remains a
separate application or connector concern. Reliable replay is coming soon;
track [ankurah/ankurah#195](https://github.com/ankurah/ankurah/issues/195) and
the broader reconciliation design in
[ankurah/ankurah#115](https://github.com/ankurah/ankurah/issues/115).

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
| `StrictDescends` | Incoming is strictly newer | Fast-forward: apply and advance the head |
| `StrictAscends` | Incoming is strictly older | Nothing (already integrated) |
| `DivergedSince` | Concurrent branches since a common ancestor (the **meet**) | Merge, layer by layer, from the meet |
| `Disjoint` | No shared history at all (an unrelated genesis for this `EntityId`) | Reject wholesale adoption of that lineage |
| `BudgetExceeded` | Deep or wide history exceeded the traversal budget | Error, after internal retry with a larger budget |

An optimized common case is `StrictDescends` with the incoming event
sitting exactly one step above the current head. That case is detected with
a cheap shortcut and never walks the graph at all.

## Merging diverged branches

For `DivergedSince`, the node computes the **meet** (the most recent common
ancestors) and sweeps the accumulated graph forward in **layers**. Divergent
frontier events in a layer are concurrent, but a layer can also include inert
`already_applied` context from below the meet; layer membership alone therefore
does not prove concurrency. The sweep processes in-graph parents before their
children.

Each entity property belongs to a **property backend**, and each backend
decides what concurrency means for its data:

- The **LWW** backend picks a single winner per property, preferring causally
  newer writes and breaking true ties deterministically.
- The **Yrs** backend wraps a text CRDT, so concurrent updates apply
  deterministically; concurrent inserts survive, although their visible
  interleaving may not match either author's intent.

The layer machinery keeps graph retrieval and traversal out of property
backends. They receive topological generations and query the accumulated graph
through `layer.compare` and `layer.dag_contains` when their policy needs causal
facts.

## The promises

The concurrency system is built to keep a small set of promises:

1. **Convergence.** Nodes that successfully integrate the same causally
   complete event set reach identical state across permitted delivery
   schedules. Comparison verdicts and merge results depend only on the graph,
   never on wall-clock timing. A randomized property test checks the
   comparison verdicts against a brute-force reachability oracle across
   hundreds of generated DAGs and many more clock comparisons.
2. **Parents first within a delivered batch.** Receivers topologically sort
   each event-bearing batch instead of trusting sender order. This protects a
   batch from child-before-parent delivery, but it does not fill ancestry the
   payload omitted; automatic gap replay is planned in
   [#268](https://github.com/ankurah/ankurah/issues/268).
3. **No foreign history.** A clock that smuggles in an unrelated lineage
   (a second genesis) is never adopted wholesale. It either merges through
   the layer machinery or is rejected as `Disjoint`.
4. **Event-bearing durability ordering.** Local commits and incoming paths
   that carry events store those events before persisting state that references
   them. Pure `StateSnapshot` payloads are an intentional exception for
   ephemeral working sets: their head events may remain available only from a
   durable peer.

## Where to go next

- [Conflict Resolution & Guarantees](guarantees.md) states the contract all
  of this machinery upholds, and what is deliberately not promised.
- [Choosing a Merge Strategy](../models/merge-strategy.md) covers the
  per-field LWW-vs-Yrs decision from the modeling side.
- In the contributor Internals section,
  [Causal Comparison: Frontiers and Meets](causal-comparison.md) explains how
  the six relations are actually computed, and
  [Anatomy of the Engine](factorization.md) maps the code.
