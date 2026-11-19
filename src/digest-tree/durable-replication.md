# Durable Replication

A durable replica accepts the events behind an entity, not just its current
state. It can recover that state and serve its history later. Digest comparison
finds missing work; the normal event application path validates and persists it.

This chapter describes the [unreleased preview](index.md). Applications choose
which durable Node supplies which Selection to another durable Node. A durable
commit completes locally; background replication does not make its caller wait
for a disconnected or slow peer.

## Each direction is independent

**Left → Right** means Right maintains a Selection from Left. Right owns the
replication handle. A reverse interest is a separate choice: it may use the
same Selection, a different Selection, or be absent. Several interests can
share one connection.

For example, Left might supply published albums to Right, while Right supplies
its favorites to Left. Neither direction makes unpublished drafts part of the
other's Selection. Policy still determines which entities and events each
participant may read and accept.

<iframe class="digest-figure" src="figures/durable-replication.html" title="Explore independent replication directions and retained history" loading="lazy" style="width:100%;height:850px;border:0"></iframe>

[Open the durable replication explainer](figures/durable-replication.html).

## Keep the handle for the interest

`replicate_from(peer, selection, sessions)` runs on the receiver. It takes a
resolved Selection, so property and model names have already been bound to
their IDs. The example's `selection` helper resolves a predicate for `Record`
and includes its model membership.

<pre><code class="language-rust" transclude="example/digest-tree/examples/durable_replication.rs#durable-directions">let published = selection(&amp;right, &quot;published = true&quot;).await?;
let left_to_right = right.replicate_from(left.id, published.clone(), DEFAULT_CONTEXT)?;
let captured = left_to_right.wait_caught_up().await?;
assert_eq!(captured.digest.count(), 1);

// The reverse direction is optional and can select different entities.
let favorites = selection(&amp;left, &quot;favorite = true&quot;).await?;
let right_to_left = left.replicate_from(right.id, favorites, DEFAULT_CONTEXT)?;
right_to_left.wait_caught_up().await?;</code></pre>

Cloning a `Replication` handle shares its interest. Dropping the last clone
cancels the current transfer and stops future sweeps; accepted states and
events remain in storage. Unlimited interests retain a digest tree rather
than a permanent result set of entities. Limited interests use the same
[ordered membership and gap refill](keys-and-views.md#a-limited-selection-has-limited-membership)
as other maintained trees.

## Caught up to which version?

`wait_caught_up()` returns the digest of a completed source capture. Every
required head in that capture has been covered by locally persisted history.
A local descendant already covers its ancestor; concurrent versions need
their missing events reconciled.

The source may have changed after capturing that target. The receiver can
also retain extra entities or newer local edits. **Caught up describes the
completed capture, not permanent equality between the Nodes.**

The handle's `state()` signal exposes:

| State | Meaning |
|---|---|
| `Connecting` | Waiting for the configured source, or retrying a transient interruption |
| `Comparing` | Comparing a source capture and applying missing history |
| `CaughtUp(KnownState)` | The last completed source capture is covered |
| `Failed(error)` | A refusal needs attention, changed credentials or limits, or an explicit retry |

An existing `CaughtUp` value can satisfy `wait_caught_up()` immediately. Call
`retry()` first when you explicitly need a new sweep. It cancels an active
sweep and starts again from current credentials and retained local progress.
This preview normally starts its next sweep one second after the preceding
one finishes. That polling interval is not a one-second delivery guarantee:
comparison, transfer and storage work also take time.

## Leaving a Selection retains history

When an album changes from published to unpublished, the receiver needs the exit
event to stop including it in the published Selection. Leaving the set is not
a deletion of its already accepted history. If it reenters later, connecting
events recover changes made while it was outside the Selection.

<pre><code class="language-rust" transclude="example/digest-tree/examples/durable_replication.rs#durable-exit">drop(connection);
let context = left.context_async(DEFAULT_CONTEXT).await?;
let transaction = context.begin();
transaction
    .get::&lt;Record&gt;(&amp;published_id)
    .await?
    .published()?
    .set(&amp;false)?;
transaction.commit().await?; // Durable locally while the receiver is offline.
drop(context);

let connection = LocalProcessConnection::new(&amp;left, &amp;right).await?;
left_to_right.retry(); // Ask for a new capture, rather than the last completed one.
let captured = left_to_right.wait_caught_up().await?;
assert_eq!(captured.digest.count(), 0);
assert!(right.storage.fetch_states(&amp;published).await?.is_empty());
assert_history(&amp;right, published_id, 2).await?; // Creation and the exit event remain.</code></pre>

The identity read needed to learn an exit remains subject to authorization.
Absence from another tree never grants permission to erase a local entity.
History reclamation and guarantees about how many other replicas retain an
entity are separate concerns.

## Restart with current credentials

Tree records and continuation cursors recover through the
[ordinary maintenance path](node-lifecycle.md). Accepted entity histories
survive alongside them. Replication handles and session secrets are not
persisted: the application reconnects and recreates its interests with current
credentials after constructing the new Node.

<pre><code class="language-rust" transclude="example/digest-tree/examples/durable_replication.rs#durable-restart">let reopened = Node::new_durable(
    Arc::new(SqliteStorageEngine::open(&amp;right_path).await?),
    PermissiveAgent::new(),
);
reopened.wait_ready().await?;
let _connection = LocalProcessConnection::new(&amp;left, &amp;reopened).await?;
let resumed = reopened.replicate_from(left.id, published, DEFAULT_CONTEXT)?;
resumed.wait_caught_up().await?;</code></pre>

The new handle proves a fresh source capture. A saved application status or
an old digest is not a substitute for that proof.

## Bounded, atomic repairs

New entities require complete supporting history. Known frontiers can receive
a connecting event bridge. A durable receiver refuses bare snapshot adoption;
one entity's update either applies with its supporting events or leaves no
partial accepted prefix. Independent entities in a batch retain their own
application outcomes.

This rule applies to new admissions. Opening an existing store does not audit
or migrate states previously accepted without complete supporting history.

`PolicyAgent::comparison_limits` bounds work and lifetime, page/repair bytes,
members, event inspection and retained captures. The defaults include 256
members per repair, 4 MiB per answer or delivery, 65,536 work units and a
60-second comparison lifetime. These limits interact; the 100,000-event
inspection ceiling does not promise that the smaller work budget will permit
that many events.

This preview transfers a bounded atomic history for each entity. It does not
stream arbitrarily large histories in resumable fragments. `LimitExceeded`
reports exceeded limits; `MemberUnavailable` reports a required captured member
whose authorized history cannot be supplied. Neither becomes a successful
`CaughtUp` result. Such refusals stop automatic sweeps until the application
retries or supplies changed session credentials. Transient connection or
capture failures retry without discarding already accepted entities.
An existing handle cannot restart a dropped or halted Node; construct the new
Node and recreate its interests instead.

## Run the example

```sh
cargo run --locked --manifest-path example/digest-tree/Cargo.toml --example durable_replication
```

The [complete example](https://github.com/ankurah/ankurah.org/blob/docs/0.10/example/digest-tree/examples/durable_replication.rs)
uses separate temporary SQLite files. It checks asymmetric interests,
complete event ancestry, an offline Selection exit, retained history and
reopening the receiver. The snippets above are transcluded with Liaison.

The current preview still requires peers to share the existing System root.
The example provisions only that root and catalog definitions, with their
events, before constructing the receiver. Application data is created later
and arrives exclusively through replication. This is controlled example
setup, not a joining API. Narrow interests need their required catalog
definitions provisioned or included in additional replication interests;
a full authorized `TRUE` Selection includes catalog data as well.
