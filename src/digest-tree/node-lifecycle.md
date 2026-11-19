# Node Lifecycle

Ordinary fetch and live-query setup open Node-owned digest trees. Applications
continue to query through a Context; they do not construct a `TreeManager`
or maintain leaves alongside every transaction. This chapter follows the
[pinned, unreleased preview](index.md).

## Commit, maintain, persist

A canonical commit first makes entity state durable. Node invalidates its
maintained trees before polling that commit, then reconciles them from a
consistent canonical-state read. A completed, validated tree version becomes
visible to reads. Its persistence can follow later.

The default **write-behind** policy flushes at 1,024 changed entities or
250 ms after a maintained batch. `Node::set_tree_write_behind` changes the
policy; setting `max_changes` to zero flushes each maintained batch.
`Node::flush_trees().await` explicitly catches up and persists managed trees.
The delay concerns tree persistence, not a deadline for canonical commits
or query activation.

<iframe class="digest-figure" src="figures/node-lifecycle.html" title="Node digest-tree maintenance and recovery" loading="lazy" style="width:100%;height:850px;border:0"></iframe>

[Open the maintenance and recovery explainer](figures/node-lifecycle.html).

Try restarting before the flush. The latest canonical state survives, while
the durable tree and its cursor remain at their previous consistent boundary.
Opening reconciles from that cursor before serving the tree. Correctness does
not depend on an asynchronous destructor flush. The figure illustrates these
boundaries; it is not an execution trace or a timing measurement.

## Run the lifecycle through public APIs

The [complete example](https://github.com/ankurah/ankurah.org/blob/docs/0.10/example/digest-tree/examples/node_lifecycle.rs)
uses a temporary, file-backed SQLite database and a small `Record` model with
`title`, `year` and `available` fields. Run it from the website repository:

```sh
cargo run --locked --manifest-path example/digest-tree/Cargo.toml --example node_lifecycle
```

Create a durable Node and wait for its system to become ready. The explicit
policy below is also the default:

<pre><code class="language-rust" transclude="example/digest-tree/examples/node_lifecycle.rs#node-tree-setup">let storage = SqliteStorageEngine::open(&amp;database).await?;
let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
node.system.create().await?;
node.wait_ready().await?;
node.set_tree_write_behind(WriteBehind {
    max_changes: 1024,
    max_delay: Duration::from_millis(250),
});
let context = node.context(DEFAULT_CONTEXT)?;</code></pre>

The example seeds three available records: First (2008), Second (2013), and
Third (2016). Both the live query and fetch use the same limited Selection:

<pre><code class="language-rust" transclude="example/digest-tree/examples/node_lifecycle.rs#node-tree-query">let selection = &quot;available = true ORDER BY year ASC LIMIT 2&quot;;
let live: LiveQuery&lt;RecordView&gt; = context.query(selection)?;
live.wait_initialized().await?;
let first_page: Vec&lt;RecordView&gt; = context.fetch(selection).await?;
assert_eq!(titles(&amp;first_page)?, [&quot;First&quot;, &quot;Second&quot;]);</code></pre>

Marking First unavailable removes it from the result. Third refills its place
even though Third did not change. The maintained tree contains this limited
result; the storage engine supplies the refill through its normal query path.

<pre><code class="language-rust" transclude="example/digest-tree/examples/node_lifecycle.rs#node-tree-refill">let transaction = context.begin();
first_page[0].edit(&amp;transaction)?.available()?.set(&amp;false)?;
transaction.commit().await?;

// The engine query refills the limited selection with Third.
let refilled: Vec&lt;RecordView&gt; = context.fetch(selection).await?;
assert_eq!(titles(&amp;refilled)?, [&quot;Second&quot;, &quot;Third&quot;]);

// Canonical state is already committed; flush derived tree records too.
node.flush_trees().await?;
drop(live);</code></pre>

After dropping the original handles, reopen the same database and check the
result again:

<pre><code class="language-rust" transclude="example/digest-tree/examples/node_lifecycle.rs#node-tree-reopen">let storage = SqliteStorageEngine::open(&amp;database).await?;
let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
node.wait_ready().await?;
let context = node.context(DEFAULT_CONTEXT)?;
let reopened: Vec&lt;RecordView&gt; = context
    .fetch(&quot;available = true ORDER BY year ASC LIMIT 2&quot;)
    .await?;
assert_eq!(titles(&amp;reopened)?, [&quot;Second&quot;, &quot;Third&quot;]);</code></pre>

The example checks observable query results, explicit flush and reopen. It
does not inspect a private Node tree or simulate a process crash. The
[storage chapter](storage.md#canonical-state-is-the-recovery-source) explains
why unflushed tree records can recover, including adopted state snapshots
and PostgreSQL transactions that commit after a saved boundary.

## What requests advertise today

Fetch and subscription requests carry both the existing `known_matches`
inventory and a `KnownState` digest. They are prepared from one authorized
canonical version. Query scoping happens at its established boundary, and
current credentials separately gate every advertised member, including on
reconnect after credentials narrow.

Receivers still use only `known_matches` to decide transfers and completion.
The summary does not suppress state transfer, replace the inventory, or
establish that a query is complete. The inventory therefore still grows
with the number of known members. With narrowed credentials, disclosure
checks can conservatively advertise fewer members of an installed limited
Selection; they do not refill it under a newly resolved session Selection.

Network digest comparison and repair, replacing the legacy inventory,
cross-Selection tree reuse, a configured LIMIT cap, and Reactor optimization
remain outside this preview.
