# Query Synchronization

An ephemeral client may already hold nearly everything a durable peer would
return for a query. Fetch and live-query initialization/reconnect compare
digest trees to discover the missing work. Applications still call `fetch`
and `query`; Node manages the comparison underneath them.

This chapter describes the [unreleased preview](index.md). It covers query
answers and standing live queries. [Durable replication](durable-replication.md)
uses the same comparison machinery with explicit directional interests and
event-backed admission.

## A target to cover

A **capture** is a fixed, authorized version of a query's tree. For example,
it can say that the two earliest available albums were Second at head B and
Third at head C when the durable peer prepared the answer. Maintenance may
continue to change the ordinary managed tree while that capture is read.

The **target** identifies this comparison, its key specification and its
captured digest. A **repair** supplies entity state or events needed to cover
one of those heads. **Coverage** means the requester has that captured head
or a causal descendant: it has already incorporated everything in that
version. A concurrent head is insufficient until the missing events have
been reconciled.

The goal is coverage of the captured answer. A client may also have newer
edits or additional entities; completing the comparison does not require
discarding them to make its entire local set identical to the peer's.

<iframe class="digest-figure" src="figures/query-sync.html" title="Follow query comparison from digest agreement to repair and coverage" loading="lazy" style="width:100%;height:840px;border:0"></iframe>

[Open the query synchronization explainer](figures/query-sync.html).

## From a summary to entity changes

| Step | What crosses the connection | What it establishes |
|---|---|---|
| Start | Selection, comparison identity, key specification and known digest | The result and ordering to compare, without a full known-head inventory |
| Target | The peer's captured digest, with an initial page if it differs | Equal digests finish comparison without repair; differing ones start descent |
| Compare | Bounded batches of span requests and pages | Matching spans need no further detail; differing spans eventually expose member IDs, keys and heads |
| Repair | Bounded requests naming members and their current known heads | The peer sends needed state or events through its existing update channel |
| Verify | Local canonical-head and causal checks | Every differing target head is covered before completion |

The digest-tree crate owns the [page descent](comparison.md); Node supplies
the authorized network getter. Repairs share the peer's ordinary update
channel and carry request attribution. The requester registers admission
before sending a repair request, so an update can arrive before its reply.
Receiving the reply alone is not proof that the state has been applied.

A local-only member also needs attention. Suppose First was available in the
client's old result but is no longer available on the server. An authorized
read by its known identity can return the changed state, allowing the local
query to remove First and refill the result. Absence from a comparison page
never authorizes deleting local entity history.

## Run fetch and reconnect

The [complete executable example](https://github.com/ankurah/ankurah.org/blob/docs/0.10/example/digest-tree/examples/query_sync.rs)
uses two temporary SQLite databases and the local-process connector. The
connector carries ordinary Node messages within one process; no network
server is needed.

```sh
cargo run --locked --manifest-path example/digest-tree/Cargo.toml --example query_sync
```

Create a durable server and an ephemeral client. The latter has a local
database, but does not promise durable service to other Nodes:

<pre><code class="language-rust" transclude="example/digest-tree/examples/query_sync.rs#query-sync-connect">let server = Node::new_durable(
    Arc::new(SqliteStorageEngine::open(directory.path().join(&quot;server.sqlite&quot;)).await?),
    PermissiveAgent::new(),
);
server.system.create().await?;
server.wait_ready().await?;
let client = Node::new(
    Arc::new(SqliteStorageEngine::open(directory.path().join(&quot;client.sqlite&quot;)).await?),
    PermissiveAgent::new(),
);
let connection = LocalProcessConnection::new(&amp;server, &amp;client).await?;
let source = server.context_async(DEFAULT_CONTEXT).await?;
let target = client.context_async(DEFAULT_CONTEXT).await?;</code></pre>

After seeding First (2008), Second (2013) and Third (2016), fetch the earliest
two. `nocache` requests a durable answer; it does not erase locally known
state. The repeated fetch can therefore take the equal-digest path. Marking
First unavailable exercises a predicate exit and limited-result refill:

<pre><code class="language-rust" transclude="example/digest-tree/examples/query_sync.rs#query-sync-fetch">let selection = &quot;available = true ORDER BY year ASC LIMIT 2&quot;;
let first: Vec&lt;RecordView&gt; = target.fetch(nocache(selection)?).await?;
assert_eq!(titles(&amp;first)?, [&quot;First&quot;, &quot;Second&quot;]);

// The second fetch still asks the durable peer; its captured digest agrees.
let repeated: Vec&lt;RecordView&gt; = target.fetch(nocache(selection)?).await?;
assert_eq!(titles(&amp;repeated)?, [&quot;First&quot;, &quot;Second&quot;]);

let transaction = source.begin();
transaction
    .get::&lt;Record&gt;(&amp;ids[0])
    .await?
    .available()?
    .set(&amp;false)?;
transaction.commit().await?;
let refilled: Vec&lt;RecordView&gt; = target.fetch(nocache(selection)?).await?;
assert_eq!(titles(&amp;refilled)?, [&quot;Second&quot;, &quot;Third&quot;]);</code></pre>

Keep a live query across a disconnect. The server changes Second's title
while the client is offline; reconnect comparison brings it up to date:

<pre><code class="language-rust" transclude="example/digest-tree/examples/query_sync.rs#query-sync-reconnect">let live: LiveQuery&lt;RecordView&gt; = target.query(nocache(selection)?)?;
live.wait_durable_answered().await?;
assert_eq!(titles(&amp;live.peek())?, [&quot;Second&quot;, &quot;Third&quot;]);

drop(connection);
let transaction = source.begin();
transaction
    .get::&lt;Record&gt;(&amp;ids[1])
    .await?
    .title()?
    .replace(&quot;Second (Live)&quot;)?;
transaction.commit().await?;
assert_eq!(titles(&amp;live.peek())?, [&quot;Second&quot;, &quot;Third&quot;]);

let _connection = LocalProcessConnection::new(&amp;server, &amp;client).await?;
wait_titles(&amp;live, &amp;[&quot;Second (Live)&quot;, &quot;Third&quot;]).await?;</code></pre>

`wait_titles` observes query changes until the expected titles appear. The
complete example has a deadline and also checks a later standing update.
Its assertions verify results; they do not measure message counts or timing.
All displayed snippets are transcluded from that executable with Liaison.

## Live changes continue during comparison

The responder installs a standing Reactor subscription before capturing the
initial target. Comparison establishes coverage of that captured version;
Reactor owns ongoing membership and live updates. Reconnect repeats the
comparison using locally retained state. It does not turn the generic tree
into a subscription engine.

`wait_durable_answered()` waits for the current Selection's durable answer
and local initialization. Ordinary cached live queries may initialize from
local storage earlier. Neither operation means future changes have stopped.

## Authorization and bounded lifetime

A comparison is bound to its peer connection, credentials and Selection.
Every follow-up request authenticates again, and current policy is checked
before disclosure. Denied members are removed from a private tree overlay,
including their branching structure; hiding payloads alone would still
expose their presence in page subdivisions. Filtering does not modify the
managed tree or refill a limited Selection under different credentials.

Before disclosing a retained capture, Node checks authorization at a fresh
canonical read boundary. For a predicate-based grant, it compares the
captured membership with a freshly maintained scoped tree; unchanged
subtrees need no individual state reads. If a captured member has left that
scope, comparison restarts. For ordinary entity queries, a proven
unrestricted grant needs no membership check.

For an arbitrary state-reading policy, Node reads member states within the
policy's limits, finishes the snapshot, then checks all permissions without
another await. Both paths recheck mutable policy before returning. A commit
after the read boundary can change membership, as with any snapshot read.
Digest equality reduces transfer; it does not promise constant storage work
for an arbitrary policy.

The policy bounds pages, repairs, bytes, work, retained captures and lifetime.
An expired or unavailable [captured version](storage.md#captured-versions-survive-short-reads)
requires a new comparison from current known state. Already-applied repairs
remain; retrying does not reset the requester's work allowance or deadline.
Cancellation, disconnect, replacement and completion release comparison
resources. Malformed pages and policy refusals are errors, not successful
partial answers.
