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
result. During incremental maintenance, the tree itself holds the ordered
selected prefix. Node evaluates changed IDs at one canonical snapshot, trims
any excess, and asks the engine only for a missing suffix when a gap remains.
It does not retain a second sorted result or rerun the full query on every change.

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

## From maintained trees to network queries

Fetch and subscription setup capture an authorized version of a maintained
tree, then advertise its key specification and digest. The digest replaces
the full `known_matches` inventory. Peers compare differing spans and send
needed state or events through their existing update channel.

A live query installs its standing Reactor subscription before capturing the
initial target. The comparison covers that target; Reactor continues to own
later changes. See [Query Synchronization](query-sync.md) for the protocol,
authorization boundary and executable reconnect example.

Cross-Selection tree reuse, a configured LIMIT cap, Reactor optimization,
and durable-to-durable replication remain outside this preview.
