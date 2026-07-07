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
ingest          planned application: staging area, planner, executor, outcomes
node_applier    wire payloads -> pipeline feeds, per-item batch semantics
node / context  peering, subscriptions, the commit lanes, policy enforcement
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

The **staging area** (`core/src/ingest/staging.rs`) is the mechanism behind
a core invariant: an incoming event is staged (discoverable by BFS, held in
memory) before anyone compares against it, and committed to durable storage
only after it has been accepted and applied. `get_event` sees staging plus
storage; `event_stored` sees storage only. That distinction is exactly what
lets guards distinguish "I can see this event" from "this event is part of
durable history".

Staging LIFETIME is the caller's choice, and the two choices are
deliberate. The remote-ingest lanes share one node-held area per collection,
so an event that cannot apply yet (missing parents, missing entity state)
survives across deliveries and integrates when the thing it was waiting for
arrives. The commit lanes construct a private area per call: a transaction
either commits whole or leaves nothing, buffered included. Retention in the
shared area follows one rule: only events still WAITING on something
(`NeedsState`/`NeedsEvents` outcomes) stay staged; everything else a plan
touches leaves the area when the plan completes, because rejection is not
buffering and the sender's retry re-delivers. The area is cap-bounded with
counted, logged, oldest-first eviction: an orphan flood degrades to
re-delivery, never to unbounded memory.

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

One verdict deserves detail. A `StrictDescends` apply whose chain contains
more than the incoming event means the comparison walked history the head
does not contain: events durably committed but never incorporated, which
the crash window between `commit_event` and the state write can leave
behind. Jumping the head there would orphan those events' operations under
a head that transitively claims them, undetectably. So the arm routes such
applies through the same layer machinery the diverged arm uses, of which
the linear gap is the degenerate case (meet = the current head, empty
divergent branch): the gap events and the incoming event apply atomically
under one lock, and chain entries the head already incorporates are
partitioned out as already applied. A clean child-of-head apply never pays
any of this; its chain is exactly the incoming event.

**`apply_state`** integrates a whole state snapshot, using the same
comparison but coarser actions: adopt (`StrictDescends`), skip (`Equal` /
older), or report that a proper merge needs events (diverged).

The entity layer also owns the **WeakEntitySet**: the registry of resident
entities. Application paths materialize entities speculatively when an update
references one that is not resident; if the update then fails its guards, the
speculative empty-head resident is evicted rather than left looking like a
real entity with no state.

## ingest: plan, then execute

`core/src/ingest/` is the one pipeline every event-application lane feeds.
It exists because seven lanes used to hand-roll variations of the same
sequence, and the variations were the bugs: a commit lane that was not
failure-atomic, a fetch path that bypassed entity mediation entirely, and
drop-on-the-floor handling for events that arrived before their parents.

- **`staging.rs`**: the staging area described above, plus a reverse index
  (parent id to staged children) that makes waiting orphans findable when
  their parent finally arrives.
- **`plan.rs`**: the planner. For one entity it decides WHICH staged events
  apply and in WHAT order, from cheap graph facts only: the delivered
  batch, the staged-but-unapplied ancestors reachable from it, and the
  descendant re-drive (buffered events whose parents just became
  satisfied, seeded from the scheduled set and the current head). Order
  comes from parent edges (Kahn's), never wire order. Classification is
  static: already-in-head means skip (idempotent redelivery), a
  non-creation event for an entity with no local existence means
  `NeedsState`, a provably absent parent on definitive storage means
  `NeedsEvents`. The planner is write-pure and deliberately does NOT
  precompute causal verdicts: those stay inside `apply_event`'s TOCTOU
  loop, where they cannot go stale.
- **`executor.rs`**: owns the canonical sequence. Per event: apply to the
  resident, then commit to the log, gated on the apply having advanced the
  entity. Per entity: persist the state buffer, uniformly on every arm.
  Failure containment: a hard failure stops the remaining schedule, but
  the applied prefix is real progress, persisted and reported. Phantom
  eviction is uniform here: a speculatively materialized empty-head
  resident never survives an item that failed to give it state. On
  completion the retention sweep enforces the staging rule.
- **`outcome.rs`**: per-event dispositions. `Applied`, `Skipped` (with
  reason), `NeedsState`, `NeedsEvents`. The last two are not errors: the
  event is buffered and integrates later; on the per-item lanes a missing
  parent is not even a failed item anymore, because failing it would only
  make the sender retry what is already safely buffered.
- **`state_apply.rs`**: the shared state-bearing feed (snapshots, fetch
  responses, the fast path of state-and-event updates): `with_state`
  mediation, events committed before the buffer persists, advance-only
  notification, and an empty-batch re-plan afterward so a state adoption
  drains any orphans that were waiting for exactly that history.

The reactor and peer communication stay OUTSIDE the pipeline: the executor
returns outcomes and changes; feeders decide notification and recovery.

## node_applier: wire payloads to pipeline feeds

`core/src/node_applier.rs` translates each wire payload shape into the
correct pipeline feed:

- **`EventOnly`**: validate, stage, plan, execute.
- **`StateAndEvent`**: try the shared state-apply fast path, and fall back
  to plan-and-execute over the staged events if the state cannot be
  adopted (which handles both divergence and stale-state cases).
- **`StateSnapshot`**: the shared state-apply, for fetch responses.
- **`EventBridge`**: validate, stage, plan, execute. Wire order is
  untrusted by design; the sender also sorts, but the receiver's planner
  is the guarantee.

Batches are failure-contained: one bad item is recorded and reported (as an
aggregate error to the sender), the remaining items still apply, and the
reactor is notified for the subset that succeeded. A malformed or malicious
item cannot poison unrelated entities that happened to share a delivery.

## node / context: the commit lanes

The two transaction lanes share one Atomic phase
(`Node::plan_and_check_entity_group`): stage the entity's events, plan
them, typed-fail anything the plan cannot resolve, and preview every
scheduled event on a fork of the resident so the policy judges a coherent
before-and-after pair, creations included. Any denial or unappliable event
fails the whole transaction with nothing durable.

The lanes differ in phase two, deliberately. The remote lane
(`commit_remote_transaction`) executes through the pipeline per entity:
post-policy failures are storage-class, the applied prefix persists and
notifies. The local lane (`core/src/context.rs`) commits every event, then
advances the transaction forks' heads, then waits for required peers to
confirm, and only then materializes onto the canonical residents and
persists state: an ephemeral node must not expose state its durable peer
has not accepted. Both lanes emit one change per entity per transaction.

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
6. **Layer iteration serves exactly two shapes.** A diverged merge (meet =
   the greatest common ancestor frontier) and the linear gap replay (meet =
   the current head, empty divergent branch). Both apply atomically under
   one lock; `into_layers` from any other verdict is a programming error.
7. **Receivers sort batches.** No application path trusts sender ordering.
8. **Only waiting events stay staged.** `NeedsState` and `NeedsEvents`
   retain; application promotes, rejection removes, and cap eviction is
   counted and logged, never silent.

## What chains are for

`StrictDescends` carries a `chain` of visited events. It is the gap
DETECTOR: a chain containing anything beyond the incoming event means the
head is missing incorporations, and the apply routes through layers. The
property oracle asserts chain COMPLETENESS for grounded verdicts (every
event strictly between the comparison cover and the subject is present);
the chain may still carry extras the head already incorporates, which the
layer partition neutralizes. Nothing uses the chain as an application
ORDER: ordering always derives from parent edges, which are self-verifying
(the layers walk them; batch planning uses Kahn's). Treat the chain as
membership evidence, never as sequence.
