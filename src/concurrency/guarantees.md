# Conflict Resolution & Guarantees

This page is the contract: what Ankurah promises your application when
nodes write concurrently, and -- just as important -- what it does not.
The [mental model](index.md) chapter explains the machinery narratively;
this one states the outcomes.

## What happens to an incoming change

Every non-creation event and state snapshot arriving at an entity is classified
against that entity's current head before it mutates state. Creation events use
dedicated genesis guards instead:

| The incoming change is... | Ankurah does... |
|---------------------------|-----------------|
| Already integrated (or a re-delivery) | Nothing. Idempotency is structural, not a dedup table |
| Strictly newer than the head | Applies it directly and advances the head |
| Strictly older than the head | Nothing -- its effects are already reflected |
| Concurrent with the head (true divergence) | Merges: both branches are combined field by field |
| From an unrelated history (different genesis) | Rejects it |

For a strictly newer state snapshot, adoption installs the cumulative state in
that snapshot. For an event-only update, the direct path applies the received
event's operations; it does not currently replay omitted ancestor operations.

Once the required histories are available locally, merging does not coordinate
with a lock server or another online peer. Divergent branches coexist in the
entity's head until a later write reunifies them, and every rule below is
deterministic so that reunification looks identical everywhere.

## The promises

1. **Convergence.** Nodes that successfully integrate the same causally
   complete event set reach identical state across permitted delivery
   schedules. Resolution depends only on the event graph, never on wall
   clocks. Missing ancestors or invalid creation order still produce errors.

2. **Per-field merge, per your model.** Conflicts resolve at property
   granularity using the [merge strategy](../models/merge-strategy.md) each
   field declared. A concurrent write to `title` never clobbers an
   unrelated concurrent write to `artist` on the same entity.

3. **Deterministic winners.** For last-writer-wins fields, a causally newer
   write always beats the write it saw; truly concurrent writes resolve by
   comparing the events' content-hash ids -- an arbitrary but stable order
   every node computes independently. For collaborative-text (Yrs) fields,
   concurrent CRDT updates apply deterministically instead of selecting one
   whole-field winner; the resulting interleaving is not a guarantee that
   either author's higher-level intent is preserved.

4. **Parents first within a delivered batch.** Receivers re-sort every
   incoming event-bearing batch parents-first; sender order is not trusted.
   This does not synthesize missing payload history.

5. **No wholesale adoption of foreign history.** An update that includes an
   unrelated lineage (a second genesis, or a graft joining one) is never
   fast-forwarded wholesale -- it either routes through merge machinery or is
   rejected.

6. **Event-bearing durability ordering.** Local commits and incoming paths
   that carry events store them before persisting state that references them.
   Pure `StateSnapshot` payloads intentionally allow an ephemeral node to
   persist state whose head events remain available only from a durable peer.

7. **Delivered offline branches use the same merge rules.** A change produced
   while disconnected forms a normal branch and merges normally once both
   histories are delivered. The 0.9 WebSocket connectors do not yet queue and
   replay disconnected writes automatically on reconnect. That work is coming
   soon; follow [#195](https://github.com/ankurah/ankurah/issues/195) and the
   broader anti-entropy design in
   [#115](https://github.com/ankurah/ankurah/issues/115).

## What is not promised

- **No global ordering of unrelated writes.** Two writes to different
  entities have no defined order across nodes; ordering guarantees are
  per-entity, through each entity's event DAG.
- **Last-writer-wins is causal, not chronological.** "Newer" means
  causally newer -- the writer had seen the other value. Between truly
  concurrent writes, the winner is the stable tiebreak, not whichever had
  the later wall-clock time. Do not encode business rules in "who wrote
  last."
- **Winning values are not approvals.** Resolution decides consistency,
  not intent. If a field needs human conflict handling, model it so both
  values survive (separate fields, a Yrs field, or an explicit review
  workflow).
- **No automatic offline synchronization yet.** Local writes can be created
  while disconnected, but applications cannot assume the 0.9 connectors will
  discover and upload them after reconnect without an explicit delivery path.
- **No automatic event-gap replay yet.** A strictly descending `EventOnly`
  update can advance the head after applying only that event's operations; it
  does not replay ancestor operations omitted from the payload. Deliver a
  causally complete event batch or cumulative state snapshot. A planned ingest
  pipeline with gap replay is tracked in
  [#268](https://github.com/ankurah/ankurah/issues/268).

## Where these promises come from

Current-main backend conformance tests compare independent backend instances
under alternate valid layer schedules, and a randomized property test checks
comparison verdicts against a brute-force reachability oracle. The suite does
not yet include an end-to-end test that replays opposite event orders through
two independent `Node` instances. The mechanics live in the contributor
section: [Causal Comparison](causal-comparison.md) computes the classification
table above, [The Compare-Apply Cycle](../internals/compare-apply-cycle.md)
traces one merge end to end, and [LWW Merge Resolution](../internals/lww-merge.md)
derives the determinism argument formally.
