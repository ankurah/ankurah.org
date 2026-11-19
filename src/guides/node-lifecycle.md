# Node Identity and Reset

A Node has a **key** that identifies it to peers and an **epoch** that identifies
one local incarnation. Reopening the same storage preserves the key. Constructing
a new Node always creates a new epoch. Reset clears the stored key and data, then
leaves the old Node permanently halted.

This chapter describes the [unreleased 0.10 preview](../digest-tree/index.md).
It uses the default constructors, which keep the key in the Node's storage.

## Start once, wait for what you need

`Node::new` and `Node::new_durable` return synchronously. In the background,
the Node loads its persisted keypair or creates one, loads its catalog of
model and property declarations, and initializes its policy agent.

<pre><code class="language-rust" transclude="example/digest-tree/examples/node_identity.rs#node-identity-start">let storage = Arc::new(SqliteStorageEngine::open(&amp;database).await?);
let node = Node::new_durable(storage.clone(), PermissiveAgent::new());
let id = node.wait_id().await?; // The stored key has been loaded or created.
node.wait_ready().await?; // Key, catalog and policy initialization are complete.
let epoch = node.epoch();
let context = node.context(DEFAULT_CONTEXT)?;</code></pre>

`wait_id()` waits only for the keypair. It returns a `NodeId`, the public part
of an Ed25519 keypair. `id()` reads it without waiting and returns `None` while
the Node is still unkeyed. `wait_ready()` waits for the keypair, catalog and
policy together; `check_ready()` checks immediately. Each wait returns an
error if the Node halts.

The `state()` signal moves from `Startup` to `Running`, or to terminal
`Halted(reason)`. Connectivity is independent: a running durable Node can
work offline. An ephemeral Node can connect before full readiness so it can
obtain the catalog from a durable peer. Connect it before waiting for readiness;
waiting alone cannot supply missing catalog data.

There is no System root to create, adopt or match during startup. Independently
created Nodes can connect. Sharing data still requires compatible catalog
declarations: two models independently named `Album` do not acquire the same
identity merely because their labels match.

## Identity persists; the epoch does not

| Value | Identifies | Across reopening the same storage |
|---|---|---|
| `NodeId` | The key presented to peers | Preserved while the stored key remains |
| `NodeEpoch` | This local Node's entities and catalog bindings | New for every constructed Node |
| `ConnectionId` | One local connection to a peer | New for each connection |

The key persists for both durable and ephemeral Nodes when their storage
persists. “Ephemeral” describes the Node's role and history obligations; it
does not mean that its identity must change on every browser reload.

<iframe class="digest-figure" src="../digest-tree/figures/node-identity.html" title="Compare reopening a Node with resetting it" loading="lazy" style="width:100%;height:750px;border:0"></iframe>

[Open the identity and reset explainer](../digest-tree/figures/node-identity.html).

Choose reopen or reset, then step through the transition. K₁ and K₂ label
different keys; E₁ and E₂ label different local epochs. These are explanatory
labels, not counter values exposed by the API.

<pre><code class="language-rust" transclude="example/digest-tree/examples/node_identity.rs#node-identity-reopen">let storage = Arc::new(SqliteStorageEngine::open(&amp;database).await?);
let reopened = Node::new_durable(storage.clone(), PermissiveAgent::new());
reopened.wait_ready().await?;
assert_eq!(reopened.wait_id().await?, id); // Same persisted key.
assert_ne!(reopened.epoch(), epoch); // A new local Node incarnation.</code></pre>

An epoch prevents a View or resolved model binding from one Node incarnation
being used as if it belonged to a successor. It is process-local: it is neither
a peer identity nor a storage continuation cursor. Recreate Contexts, queries
and [replication interests](../digest-tree/durable-replication.md#restart-with-current-credentials)
for the new Node.

For applications that manage keys themselves, `new_with_key` and
`new_durable_with_key` take a `NodeKey`. These Nodes are keyed immediately and
do not read the storage engine's key. The application owns key retention;
reusing that key preserves the NodeId even after resetting the storage.

## Possession is not permission

During connection setup, peers prove possession of their private key by
signing a challenge bound to their side of the exchange. This authenticates
the NodeId. It does not authorize a user, a Selection, an event or a write:
the [policy agent](auth.md) still makes those decisions.

Several physical Nodes can use the same key. A `ConnectionId` distinguishes
their live connections locally, so closing one connection does not release
another connection's work. A NodeId therefore does not imply a unique process,
storage instance, or connection.

## Reset is terminal

`Node::reset().await` stops this Node and empties its storage, including entity
state, event history, the persisted key and digest-tree records. The application
chooses when to invoke it. A disconnect or an unfamiliar peer does not reset a Node.

Reset closes admission to new work, stops services and connections, drains
admitted work and publication, closes the Reactor, then invokes the engine's
native wipe. Work from the old Node cannot repopulate storage after a successful
reset. Reset does not flush pending derived trees before deleting them.

**First quiesce any other owners of the same storage.** Reset coordinates work
owned by this Node. It cannot stop a second Node, another process, or code using
the storage engine directly.

<pre><code class="language-rust" transclude="example/digest-tree/examples/node_identity.rs#node-identity-reset">// This example owns all access to storage. Quiesce other owners first.
reopened.reset().await?;
assert_eq!(
    reopened.state().value(),
    NodeState::Halted(NodeHaltReason::Reset)
);
assert!(matches!(
    reopened.wait_ready().await,
    Err(NodeReadinessError::Halted(_))
));

let successor = Node::new_durable(storage.clone(), PermissiveAgent::new());
successor.wait_ready().await?;
assert_ne!(successor.wait_id().await?, id); // Reset removed the stored key.
assert_ne!(successor.epoch(), reopened.epoch());</code></pre>

The old Node never becomes running again. Its Contexts reject work; its queries
and replication handles cannot be resumed on the successor. Previously returned
Views can still hold values in memory, but they do not grant access to the new
Node's data or transactions.

Concurrent reset callers share one attempt. Once started, dropping a waiting
caller does not cancel the wipe. Success is idempotent. A storage failure is
returned to the callers and leaves the Node halted; calling reset again can
retry the wipe. Construct the successor only after reset succeeds.

## Run the example

```sh
cargo run --locked --manifest-path example/digest-tree/Cargo.toml --example node_identity
```

The [complete example](https://github.com/ankurah/ankurah.org/blob/docs/0.10/example/digest-tree/examples/node_identity.rs)
uses temporary SQLite storage. It writes a note, reopens with the same identity
and a new epoch, resets, then checks that the successor has a new identity and
the note is gone. It also checks that the old Context rejects reads. The code
above is transcluded from that executable with Liaison.

## Reading older stored data

Removing the runtime System root does not rewrite historical events. Legacy
System enum slots remain decodable, and the optional `system` field in a
Genesis event keeps its existing format. New Genesis events leave it empty;
older events retain their bytes and content-derived IDs. This storage
compatibility is not a promise of mixed-version protocol compatibility.
