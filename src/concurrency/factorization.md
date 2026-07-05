# Anatomy of the Engine

This chapter maps the concurrency system onto the codebase: which layer owns
which decision, what each seam guarantees, and why the factorization looks
the way it does. Read it when you need to change the engine, review a change
to it, or figure out where a behavior actually lives.

## The layers

From the wire up:

```text
proto           wire-truth data types: EventId, Clock, Event, Attested, fragments
event_dag       pure graph logic: comparison, layers, ordering (no I/O policy)
retrieval       how events and state are found: traits + getter implementations
entity          one entity's state machine: apply_event / apply_state, TOCTOU
node_applier    wire payloads -> entity applications, batch semantics
node / context  peering, subscriptions, local commit, policy enforcement
```

Each layer only speaks to the one below through a deliberately narrow
interface. The rest of this chapter walks them bottom-up.

## proto: the data model is the contract

`ankurah-proto` defines what travels between nodes, and it enforces its own
invariants at construction time rather than trusting callers:

- **`EventId`** is a SHA-256 content hash of the event's entity, operations,
  and parent clock. Identity is therefore self-verifying, and parent cycles
  are structurally impossible, which downstream code (Kahn's sort, ancestry
  walks) leans on.
- **`Clock`** is a sorted, deduplicated vector of event ids. Membership tests
  binary-search, so sortedness is load-bearing; every construction path,
  including deserialization of peer-supplied clocks, normalizes rather than
  trusting input order. Nothing downstream ever needs to wonder whether a
  clock is well-formed.
- **`Attested<T>`** pairs a payload with attestations. Policy decides what
  attestations mean; proto only carries them.
- **Fragments** (`EventFragment`, `StateFragment`) are events and states with
  the entity id and collection factored out, for wire compactness.

## event_dag: pure logic, injected I/O

`core/src/event_dag/` contains the algorithms from the
[previous chapter](causal-comparison.md), factored so that none of them know
where events come from:

| Module | Responsibility |
|--------|----------------|
| `comparison.rs` | The backward BFS state machine and the quick check |
| `frontier.rs` | The frontier set abstraction |
| `accumulator.rs` | `EventAccumulator` (recorded DAG + LRU event cache), `ComparisonResult`, and the DAG-walk helpers |
| `layers.rs` | `EventLayers` (the forward layer iterator), `EventLayer`, and the per-layer causal relation used by backends |
| `ordering.rs` | Topological sorting of event batches (Kahn's) |
| `relation.rs` | The `AbstractCausalRelation` verdict type |

Two design decisions shape this module:

**The accumulator outlives the comparison.** While the BFS walks, the
accumulator records every parent edge it sees and caches fetched events.
The comparison verdict is returned *together with* the accumulator as a
`ComparisonResult`, and a diverged result converts into the layer iterator
via `into_layers()`. The merge therefore replays exactly the graph the
comparison saw, with no second discovery pass and no window for the two
phases to disagree about the DAG's shape. The accumulator is also what
survives the internal budget-escalation retry.

**Event access is a capability, not an ambient ability.** Everything here is
generic over a `GetEvents` implementation. The comparison can fetch and read;
it cannot stage, commit, or write. That is enforced by the next layer.

## retrieval: three traits instead of one

`core/src/retrieval.rs` splits event access into capabilities:

- **`GetEvents`**: read an event; ask whether it is durably stored
  (`event_stored`), and whether a negative answer is authoritative
  (`storage_is_definitive`). This is all the comparison ever gets.
- **`GetState`**: read entity state snapshots. Separate because state has
  different caching and is never needed mid-traversal.
- **`SuspenseEvents`**: extends `GetEvents` with `stage_event` and
  `commit_event`. Only the outermost applier holds this.

The split turns the staging discipline into a compile-time property: code
that merely *compares* provably cannot commit, and the one place that commits
is easy to audit.

Two getter implementations matter:

- **`LocalEventGetter`**: staging map, then local storage. Used for local
  commits on all node types.
- **`CachedEventGetter`**: staging, then local storage, then a remote peer
  fetch. Used when applying remote updates on ephemeral nodes, where history
  may live elsewhere.

The **staging map** is the mechanism behind a core invariant: an incoming
event is staged (discoverable by BFS, held in memory) before anyone compares
against it, and committed to durable storage only after it has been accepted
and applied. `get_event` sees staging plus storage; `event_stored` sees
storage only. That distinction is exactly what lets guards distinguish "I can
see this event" from "this event is part of durable history".

## entity: one entity's state machine

`core/src/entity.rs` owns the head and the backends for a single entity, and
exposes two application paths:

**`apply_event`** integrates one event. Guards first: creation events on
non-empty heads are re-deliveries or attacks (the `event_stored` fast path
plus `storage_is_definitive` decide which); non-creation events on empty
heads are rejected outright. Then the retry loop: compare the event's clock
against the head, act on the verdict (the table from the
[overview](index.md)), and if the head moved between comparison and mutation,
re-read and retry. That last part is the TOCTOU discipline: comparison is
async and lock-free, so the head is re-checked under the write lock and the
loop retries on interference, bounded at five attempts.

**`apply_state`** integrates a whole state snapshot, using the same
comparison but coarser actions: adopt (`StrictDescends`), skip (`Equal` /
older), or report that a proper merge needs events (diverged).

The entity layer also owns the **WeakEntitySet**: the registry of resident
entities. Application paths materialize entities speculatively when an update
references one that is not resident; if the update then fails its guards, the
speculative empty-head resident is evicted rather than left looking like a
real entity with no state.

## node_applier: wire payloads to entity applications

`core/src/node_applier.rs` translates each wire payload shape into the
correct application sequence, and owns batch semantics:

- **`EventOnly`**: stage all events, topologically sort the batch, then
  apply and commit parents-first.
- **`StateAndEvent`**: stage and sort the events, try `apply_state`, and
  fall back to parents-first event application if the state cannot be
  adopted (which handles both divergence and stale-state cases).
- **`StateSnapshot`**: state only, for fetch responses.
- **`EventBridge`**: stage everything, topologically sort, then apply
  parents-first. Wire order is untrusted by design; the sender also sorts,
  but the receiver's sort is the guarantee.

Batches are failure-contained: one bad item is recorded and reported (as an
aggregate error to the sender), the remaining items still apply, and the
reactor is notified for the subset that succeeded. A malformed or malicious
item cannot poison unrelated entities that happened to share a delivery.

## context: local commits

Local writes go through a transaction and commit in phases
(`core/src/context.rs`): generate events from changed entities, run **every**
policy check (staging each event and applying it to a fork so the checker
sees before and after states), and only then persist. A denial partway
through a multi-entity transaction leaves nothing durable. After persistence,
heads advance, required peers confirm, and state snapshots are written.

## The invariants at the seams

These hold everywhere, and code changes are reviewed against them:

1. **Stage before head.** An event must be BFS-discoverable before any head
   references it.
2. **Commit before state.** An event must be durable before any persisted
   state references it. A crash may orphan events (harmless, content
   addressed, idempotent) but never orphan state.
3. **`get_event` is staging plus storage; `event_stored` is storage only.**
4. **Comparison cannot write.** `GetEvents` in, verdict out.
5. **Budget handling is internal to `compare`.** Callers see one call and at
   most one final `BudgetExceeded`; only the accumulator survives the retry.
6. **A diverged verdict is required for layer iteration.** `into_layers` on
   anything else is a programming error and is not reachable through the
   public flow.
7. **Receivers sort batches.** No application path trusts sender ordering.

## Why chains are advisory

`StrictDescends` carries a `chain` of visited events. Its contents are
deduplicated, but its order is traversal order, not topological, so nothing
uses it as an application order today. Batch application derives ordering
from parent edges instead (Kahn's), which is self-verifying. Treat `chain` as
a hint for future optimizations, not a contract.
