# Event Generations

<style>
.gen-figure { margin: 1.6em auto; max-width: 440px; }
.gen-figure svg { display: block; width: 100%; height: auto; overflow: visible; }
.gen-figure figcaption { margin-top: 0.6em; font-size: 0.92em; line-height: 1.45; }
.gen-figure text { fill: currentColor; font-family: inherit; font-size: 13px; }
.gen-figure .gen-id { font-weight: 600; }
.gen-figure .gen-dim { font-family: var(--mono-font); font-size: 12px; fill-opacity: 0.7; }
.gen-figure .gen-mono { font-family: var(--mono-font); font-size: 12px; }
.gen-figure .gen-formula { font-family: var(--mono-font); font-size: 11px; }
.gen-figure .gen-muted { font-size: 11px; fill-opacity: 0.72; }
.gen-figure .gen-eyebrow { font-family: var(--mono-font); font-size: 10px; letter-spacing: 0.08em; fill-opacity: 0.8; }
.gen-figure .gen-small { font-size: 12px; }
.gen-figure .gen-lane { stroke: currentColor; stroke-opacity: 0.18; stroke-dasharray: 2 4; }
.gen-figure .gen-link { stroke: currentColor; stroke-width: 1.2; fill: none; }
.gen-figure .gen-node { fill: var(--bg); stroke: currentColor; stroke-width: 1.2; }
.gen-figure .gen-head { fill: var(--quote-bg); stroke: currentColor; stroke-width: 1.6; }
.gen-figure .gen-new { fill: var(--bg); stroke: var(--links); stroke-width: 2; stroke-dasharray: 5 3; }
.gen-figure .gen-panel { fill: none; stroke: currentColor; stroke-opacity: 0.45; stroke-width: 1; }
.gen-figure .gen-store { fill: none; stroke: currentColor; stroke-opacity: 0.45; stroke-width: 1; stroke-dasharray: 4 3; }
</style>

> This page describes the clock representation on Ankurah's `main` branch,
> which ships in 0.10. Released 0.9 clocks carry event ids alone. The
> serialized form of event parents and state heads changes with 0.10, so
> 0.9 stores and 0.9 peers do not interoperate with 0.10 nodes.

A **generation** is an event's depth in its entity's history: a genesis
event sits at generation 1, and every later event sits one step below its
deepest parent. Starting with 0.10, every clock entry pairs an event id with
the generation of that event, so a tip's depth travels wherever the tip
does. This page explains why that annotation exists, how a node computes
it, and what a node checks when a peer's clock arrives.

## Why generations exist

A clock names the tips of an entity's history. An event's parent clock
names what the event was built on; an entity's head names the tips that
make up its present; a peer's frontier names what it has seen. Each tip is
an event id, and an id is a content hash: it identifies the event exactly
and says nothing about where the event sits in the history. To learn how
deep a tip is, a node had to load the event and walk its parents, and on an
ephemeral node those events often live only on a durable peer.

Carrying the generation beside each id gives every clock a cheap, checkable
fact about each of its tips. Two uses follow directly:

- A node minting an update copies the entity's head into the new event's
  parent clock, and derives the update's own generation from those
  annotations without loading the head events.
- A node receiving an event or a snapshot checks its generation claims
  against the evidence available to that validation path, and rejects
  contradictions without fetching peer history solely for validation.

The generation supplements the causal links; it does not replace them.
Causal comparison still establishes how two clocks relate by following
parent pointers, exactly as
[Causal Comparison: Frontiers and Meets](causal-comparison.md) describes.

## How a generation is computed

A genesis event has no parents and sits at generation 1. An update's
generation is one more than the greatest generation among its parents:

```text
generation(genesis) = 1
generation(update)  = 1 + max(generation(parent) for each parent)
```

The addition saturates at `u32::MAX`;
see [the ceiling](#what-this-does-not-change-yet) below. The figure traces
the rule through a history whose two branches grew to different depths.

<figure class="gen-figure">
<svg viewBox="0 0 400 416" role="img" aria-labelledby="gen-fig1-title gen-fig1-desc">
<title id="gen-fig1-title">Generations in a branching history</title>
<desc id="gen-fig1-desc">Six events of one entity drawn in rows by generation: genesis G at generation 1, A at 2, concurrent B and D at 3, C at 4 below B, and a new event E at 5 whose parent clock names the two head tips C and D.</desc>
<defs>
<marker id="gen-fig1-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker>
</defs>
<line class="gen-lane" x1="64" y1="40" x2="392" y2="40"/>
<line class="gen-lane" x1="64" y1="112" x2="392" y2="112"/>
<line class="gen-lane" x1="64" y1="184" x2="392" y2="184"/>
<line class="gen-lane" x1="64" y1="256" x2="392" y2="256"/>
<line class="gen-lane" x1="64" y1="328" x2="392" y2="328"/>
<text class="gen-mono gen-muted" x="56" y="44" text-anchor="end">gen 1</text>
<text class="gen-mono gen-muted" x="56" y="116" text-anchor="end">gen 2</text>
<text class="gen-mono gen-muted" x="56" y="188" text-anchor="end">gen 3</text>
<text class="gen-mono gen-muted" x="56" y="260" text-anchor="end">gen 4</text>
<text class="gen-mono gen-muted" x="56" y="332" text-anchor="end">gen 5</text>
<line class="gen-link" x1="228" y1="98" x2="228" y2="54" marker-end="url(#gen-fig1-arrow)"/>
<line class="gen-link" x1="140" y1="170" x2="212" y2="126" marker-end="url(#gen-fig1-arrow)"/>
<line class="gen-link" x1="316" y1="170" x2="244" y2="126" marker-end="url(#gen-fig1-arrow)"/>
<line class="gen-link" x1="140" y1="242" x2="140" y2="198" marker-end="url(#gen-fig1-arrow)"/>
<line class="gen-link" x1="212" y1="314" x2="140" y2="270" marker-end="url(#gen-fig1-arrow)"/>
<line class="gen-link" x1="244" y1="314" x2="316" y2="198" marker-end="url(#gen-fig1-arrow)"/>
<rect class="gen-node" x="196" y="26" width="64" height="28" rx="6"/>
<text x="228" y="45" text-anchor="middle"><tspan class="gen-dim">1:</tspan><tspan class="gen-id">G</tspan></text>
<rect class="gen-node" x="196" y="98" width="64" height="28" rx="6"/>
<text x="228" y="117" text-anchor="middle"><tspan class="gen-dim">2:</tspan><tspan class="gen-id">A</tspan></text>
<rect class="gen-node" x="108" y="170" width="64" height="28" rx="6"/>
<text x="140" y="189" text-anchor="middle"><tspan class="gen-dim">3:</tspan><tspan class="gen-id">B</tspan></text>
<rect class="gen-node gen-head" x="284" y="170" width="64" height="28" rx="6"/>
<text x="316" y="189" text-anchor="middle"><tspan class="gen-dim">3:</tspan><tspan class="gen-id">D</tspan></text>
<rect class="gen-node gen-head" x="108" y="242" width="64" height="28" rx="6"/>
<text x="140" y="261" text-anchor="middle"><tspan class="gen-dim">4:</tspan><tspan class="gen-id">C</tspan></text>
<rect class="gen-node gen-new" x="196" y="314" width="64" height="28" rx="6"/>
<text x="228" y="333" text-anchor="middle"><tspan class="gen-dim">5:</tspan><tspan class="gen-id">E</tspan></text>
<text class="gen-mono" x="228" y="380" text-anchor="middle">parent(E) = head = [4:C, 3:D]</text>
<text class="gen-mono" x="228" y="404" text-anchor="middle">generation(E) = 1 + max(4, 3) = <tspan class="gen-id">5</tspan></text>
</svg>
<figcaption>Rows are generations, and every arrow points from an event to one of its parents. The tinted events C and D are the current head tips; the dashed event E is the update being minted from that head. E's parents sit at depths 4 and 3, so E lands at 5, one row below its deepest parent. D (generation 3) and C (generation 4) are concurrent even though their generations differ.</figcaption>
</figure>

Two branches grew from A at different speeds. B and C extend the left
branch to generation 4; D extends the right branch once, to generation 3.
A node that has integrated both branches holds a head with two tips.
Written the way Ankurah prints a clock, with each entry as `generation:id`
and the entries ordered by event id, that head is `[4:C, 3:D]`. (Real ids
are base64 hashes; single letters stand in for them throughout this page.)

A new event E minted against that head copies the head as its parent
clock. E's generation is one more than the greatest parent generation,
1 + max(4, 3) = 5. Once E applies, it supersedes both tips and the head
collapses to `[5:E]`.

The picture also shows two things that are easy to get wrong:

- **A lower generation does not mean an ancestor.** D (generation 3) and
  C (generation 4) are concurrent: neither is an ancestor of the other. An
  ancestor is always shallower than its descendant, so an event at
  generation 3 cannot be an ancestor of any event at generation 3 or below.
  The converse fails, so generation order is not a causal order, and
  comparison never treats it as one.
- **Every annotation counts, not only the deepest.** E's generation depends
  only on its deepest parent, but every parent annotation is part of E's
  identity, as [the identity section](#the-annotation-is-part-of-the-events-identity)
  explains.

## The clock carries the annotation

A `Clock` is a list of `(generation, event id)` entries kept in event-id
order. One type serves every place a frontier appears:

- an event's parent clock;
- an entity's head, in memory, in each storage engine's stored state, and
  in the state snapshots sent to peers;
- the frontiers that causal comparison takes as input, and the head a
  storage write expects to find before it replaces state.

Constructing or decoding a clock enforces two rules: no generation is 0,
and no id appears with two different generations. A peer-supplied clock
that breaks either rule fails to decode before any comparison sees it.
Clock equality includes the annotations, so `[4:C, 3:D]` and `[5:C, 3:D]`
are different clocks even though they name the same events.

## The annotation is part of the event's identity

An update's id is the SHA-256 hash of its entity id, author, nonce,
timestamp, operations, and its complete parent clock, annotations included.
There is no generation field in the event body; `Event::generation()`
derives the value from the parent clock on demand, and returns 1 for a
genesis. Two consequences follow:

1. Changing any parent annotation produces a different event, even when
   the change leaves the maximum, and therefore the update's own
   generation, untouched.
2. For an honest node, the generation it records for an event is a
   deterministic function of that event. That is what lets a node treat a
   peer's annotation as a *claim* and compare it against the generation it
   *knows*, as [What a node checks](#what-a-node-checks) describes.

## Deriving a generation from a snapshot

[Ephemeral nodes](../internals/node-architecture.md#durable-vs-ephemeral-nodes)
often hold an entity as a state snapshot from a durable peer: the current
property values plus the head, with none of the head events stored locally.
When an application edits that entity, the commit mints an update whose
parent clock is a copy of the head. Each copied tip carries its generation,
so the node derives the update's generation from the copy alone and fetches
nothing.

<figure class="gen-figure">
<svg viewBox="0 0 400 376" role="img" aria-labelledby="gen-fig2-title gen-fig2-desc">
<title id="gen-fig2-title">Minting an update from a snapshot alone</title>
<desc id="gen-fig2-desc">A durable node that stores every event sends an ephemeral node a state snapshot whose head is [4:C, 3:D]. The ephemeral node stores no event payloads, copies that head as the parent clock of a new event E, and derives generation 5 from the annotations without fetching anything.</desc>
<defs>
<marker id="gen-fig2-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker>
</defs>
<rect class="gen-panel" x="16" y="16" width="368" height="92" rx="6"/>
<text class="gen-eyebrow" x="28" y="36">DURABLE NODE</text>
<text class="gen-muted" x="372" y="36" text-anchor="end">stores every event</text>
<rect class="gen-node" x="46" y="64" width="52" height="24" rx="5"/>
<text class="gen-small" x="72" y="80" text-anchor="middle"><tspan class="gen-dim">1:</tspan><tspan class="gen-id">G</tspan></text>
<rect class="gen-node" x="110" y="64" width="52" height="24" rx="5"/>
<text class="gen-small" x="136" y="80" text-anchor="middle"><tspan class="gen-dim">2:</tspan><tspan class="gen-id">A</tspan></text>
<rect class="gen-node" x="174" y="64" width="52" height="24" rx="5"/>
<text class="gen-small" x="200" y="80" text-anchor="middle"><tspan class="gen-dim">3:</tspan><tspan class="gen-id">B</tspan></text>
<rect class="gen-node gen-head" x="238" y="64" width="52" height="24" rx="5"/>
<text class="gen-small" x="264" y="80" text-anchor="middle"><tspan class="gen-dim">4:</tspan><tspan class="gen-id">C</tspan></text>
<rect class="gen-node gen-head" x="302" y="64" width="52" height="24" rx="5"/>
<text class="gen-small" x="328" y="80" text-anchor="middle"><tspan class="gen-dim">3:</tspan><tspan class="gen-id">D</tspan></text>
<line class="gen-link" x1="200" y1="108" x2="200" y2="168" marker-end="url(#gen-fig2-arrow)"/>
<text class="gen-small" x="212" y="128">state snapshot</text>
<text class="gen-mono" x="212" y="144">head [4:C, 3:D]</text>
<text class="gen-muted" x="212" y="160">no event payloads</text>
<rect class="gen-panel" x="16" y="168" width="368" height="196" rx="6"/>
<text class="gen-eyebrow" x="28" y="188">EPHEMERAL NODE</text>
<text class="gen-muted" x="372" y="188" text-anchor="end">holds only the snapshot</text>
<rect class="gen-panel" x="24" y="204" width="160" height="64" rx="5"/>
<text class="gen-small" x="104" y="226" text-anchor="middle">entity state</text>
<rect class="gen-head" x="36" y="236" width="136" height="22" rx="4"/>
<text class="gen-mono" x="104" y="252" text-anchor="middle">head [4:C, 3:D]</text>
<rect class="gen-store" x="200" y="204" width="168" height="64" rx="5"/>
<text class="gen-small" x="284" y="226" text-anchor="middle">event store</text>
<text class="gen-muted" x="284" y="250" text-anchor="middle">C and D not local</text>
<line class="gen-link" x1="104" y1="258" x2="104" y2="300" marker-end="url(#gen-fig2-arrow)"/>
<text class="gen-muted" x="116" y="284">copied as parent(E)</text>
<rect class="gen-node gen-new" x="72" y="300" width="64" height="28" rx="6"/>
<text x="104" y="319" text-anchor="middle"><tspan class="gen-dim">5:</tspan><tspan class="gen-id">E</tspan></text>
<text class="gen-formula" x="152" y="310">parent(E) = [4:C, 3:D]</text>
<text class="gen-formula" x="152" y="328">generation(E) = 1 + max(4, 3) = 5</text>
<text class="gen-muted" x="152" y="350">nothing fetched from the durable node</text>
</svg>
<figcaption>The ephemeral node never stored C or D, yet it mints E with the right generation: the head annotations that arrived with the snapshot are the only input the formula needs. If depth lived only inside events, the node would have to fetch C and D from the durable peer before it could mint E.</figcaption>
</figure>

Applying E locally needs no fetch either. The comparison's
[quick check](causal-comparison.md#the-quick-check) sees that E's parents
are exactly the head and classifies E as a one-step extension without
reading C or D. The check described next then compares E's parent
annotations with the head annotations the node already holds.

## What a node checks

Annotations arrive from peers, so a node treats each one as a claim and
rejects contradictions with known generations. Comparison reuses the
history it already read; snapshot adoption can also read parents from
local storage. Neither path fetches missing peer history solely to check
generations, so claims without evidence remain unverified.

### During causal comparison

`compare` first determines the relation the way it always has: the quick
check, or the backward traversal over parent links. Then, for every
relation including `Equal` and `StrictAscends`, it checks two sets of
claims: the annotations on the subject clock's tips, and the annotations
inside every parent clock the traversal read. For each claimed
`generation:id` pair it looks for a known generation in this order:

1. The event itself, if the traversal read it. The traversal retains each
   event's parent clock even after the payload leaves its cache, and the
   event's generation follows from that clock.
2. Otherwise the local comparison head, if it names that id.
3. Otherwise nothing, and the claim stays unverified.

A known generation that differs from the claim rejects the input with a
`GenerationMismatch` structural error. Take the head `[4:C, 3:D]` from the
figures and an incoming event X whose parent clock reads `[9:C, 3:D]`:

| Claim | Known generation | Outcome |
|-------|------------------|---------|
| `9:C` | 4, from the local head | contradiction, X rejected |
| `3:D` | 3, from the local head | consistent |
| unknown parent | none | unverified |

The quick check accepts X's shape, because X names exactly the same parent
event ids as the head, and it never reads C. The check still catches the mismatch, because
the head annotation is evidence the node already holds. Because the check
runs for every relation, an input the node has already integrated is also
rejected if its claims contradict what the node now knows, rather than
being ignored as a re-delivery.

### Before adopting a snapshot

A snapshot can arrive together with the events that lead to its head.
Before the node persists any of it, it checks each carried event's parent
annotations against three sources: the entity's current head, if the entity
is already resident; the parent events carried in the same update; and
parent events already in local storage. Carried and stored parents supply
generations derived from the events themselves, and the resident head
supplies its annotations. A parent found in none of the three stays
unverified, and the node never fetches history from a peer for this check.
For an entity that is already resident, the snapshot's own head then goes
through the ordinary comparison against the local head, which checks its
tip annotations as described above. For an entity the node has never seen,
the node adopts the snapshot's head as the peer sent it.

## What this does not change (yet)

- **Traversal.** Comparison does not use generations to direct or prune
  its walk over parent links, so this page describes no change in
  comparison cost. Generation-directed traversal is separate, future work.
- **Merge ranking.** Last-writer-wins fields do not rank concurrent writes
  by generation. They resolve as
  [Conflict Resolution & Guarantees](guarantees.md#the-promises) states: a
  causally newer write wins, and truly concurrent writes resolve by event
  id. Ranking by generation first is separate, future work.
- **Ancestry.** A total order by generation is not an ancestry order.
  Generation can rule ancestry out, never prove it.
- **The ceiling.** Generations stop growing at `u32::MAX`. A child of a
  parent at the ceiling stays at the ceiling, so "strictly deeper than
  every parent" has that one exception.

## Where to go next

- [Concurrency: The Mental Model](index.md) introduces events, clocks, and
  heads.
- [Causal Comparison: Frontiers and Meets](causal-comparison.md) explains
  the traversal that establishes ancestry.
- [Event DAG Subsystem](../internals/event-dag.md) is the contributor
  reference for the comparison and layer machinery.
