# Conflict Resolution & Guarantees

This page is the contract: what Ankurah promises your application when
nodes write concurrently, and -- just as important -- what it does not.
The [mental model](index.md) chapter explains the machinery narratively;
this one states the outcomes.

## What happens to an incoming change

Every change arriving at an entity is classified against that entity's
current head before it touches state:

| The incoming change is... | Ankurah does... |
|---------------------------|-----------------|
| Already integrated (or a re-delivery) | Nothing. Idempotency is structural, not a dedup table |
| Strictly newer than the head | Applies it directly and advances the head |
| Strictly older than the head | Nothing -- its effects are already reflected |
| Concurrent with the head (true divergence) | Merges: both branches are combined field by field |
| From an unrelated history (different genesis) | Rejects it |

Merging never blocks on coordination: there is no lock server and no
requirement that any peer is online. Divergent branches coexist in the
entity's head until a later write reunifies them, and every rule below is
deterministic so that reunification looks identical everywhere.

## The promises

1. **Convergence.** Nodes that receive the same set of events reach
   identical state, regardless of arrival order or timing. Resolution
   depends only on the event graph, never on wall clocks.

2. **Per-field merge, per your model.** Conflicts resolve at property
   granularity using the [merge strategy](../models/merge-strategy.md) each
   field declared. A concurrent write to `title` never clobbers an
   unrelated concurrent write to `artist` on the same entity.

3. **Deterministic winners.** For last-writer-wins fields, a causally newer
   write always beats the write it saw; truly concurrent writes resolve by
   comparing the events' content-hash ids -- an arbitrary but stable order
   every node computes independently. For collaborative-text (Yrs) fields,
   concurrent edits merge losslessly instead of picking a winner.

4. **No silent loss.** A write that reached the event graph is never
   dropped by an ordering accident. Receivers re-sort every incoming batch
   parents-first themselves; sender order is not trusted.

5. **No foreign history.** An update that smuggles in an unrelated lineage
   (a second genesis, or a graft joining one) is never adopted wholesale --
   it either merges through the normal machinery or is rejected.

6. **Durability ordering.** Events are committed to storage before any
   state referencing them is persisted, so a crash can leave harmless
   orphaned events but never state whose history is missing.

7. **Offline is not a special case.** A node that wrote while disconnected
   simply has a divergent branch. On reconnect, the branches compare and
   merge by exactly the rules above -- there is no separate reconciliation
   protocol to reason about.

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

## Where these promises come from

The convergence and determinism claims are pinned by tests that apply the
same events in opposite orders on independent nodes and assert identical
results, plus a randomized property test checking comparison verdicts
against a brute-force oracle. The mechanics live in the contributor
section: [Causal Comparison](causal-comparison.md) computes the
classification table above, [The Compare-Apply Cycle](../internals/compare-apply-cycle.md)
traces one merge end to end, and [LWW Merge Resolution](../internals/lww-merge.md)
derives the determinism argument formally.
