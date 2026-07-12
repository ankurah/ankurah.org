# A Synchronized Feature, End to End

This guided trace connects the pieces you receive from an Ankurah template:
a shared Rust model, a durable server node, an ephemeral client node, a live
query, and a reactive component. The snippets are transcluded from this site's
Ankurah 0.9 example workspace so the Rust, WASM, and React builds validate the
same code shown here.

This is an end-to-end tour of the site's `Album` validation workspace, not a
literal patch against the templates' `Message` model. For a runnable generated
application, complete [Quick Start](template.md) first; then use this tour to
see where the equivalent model, server, binding, query, and UI pieces fit.

If you have not generated a project yet, start with the
[Quick Start](template.md). The template uses a chat model; this page uses a
smaller `Album` model so the data flow is easy to see.

## 1. Define the shared model

Models live in the Rust model crate shared by the server and client bindings.

<pre><code transclude="example/model/src/lib.rs#model">#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Album {
    #[active_type(YrsString)]
    pub name: String,
    pub artist: String,
    pub year: i32,
}</code></pre>

Deriving `Model` implements the model contract for `Album` and generates the
read-only `AlbumView` plus the transaction-bound `AlbumMut` handle. The
user-defined `Album` struct is also the create input. See
[Defining Models](../models.md) for field types and
[Choosing a Merge Strategy](../models/merge-strategy.md) for how each field
resolves concurrent changes.

## 2. Start a durable node

The server owns a durable node and exposes it through the WebSocket connector:

<pre><code transclude="example/server/src/main.rs#server-example">let storage = SledStorageEngine::with_path(storage_dir)?;
let node = Node::new_durable(Arc::new(storage), PermissiveAgent::new());
node.system.wait_loaded().await;
if node.system.root().is_none() {
    node.system.create().await?;
}

let mut server = WebsocketServer::new(node);
println!(&quot;Running server...&quot;);
server.run(&quot;127.0.0.1:9797&quot;).await?;</code></pre>

`wait_loaded()` is the readiness barrier for checking the local system catalog
before the code reads its root. The root is created only when the store has none, so
restarting the process reopens the same system instead of trying to create a
second one. `PermissiveAgent` is appropriate for local development only; use
[Authentication & Policy](../guides/auth.md) before exposing a server to
untrusted clients. For the current readiness-wait edge case, see
[Deployment & Operations](../guides/deployment.md#the-durable-server).

## 3. Create data in a transaction

Application model writes are transactional. Create the model, retain its
generated id if you need it, and commit once:

<pre><code transclude="example/server/src/main.rs#model-create">let trx = ctx.begin();

let album = trx.create(&amp;Album {
    name: &quot;Parade&quot;.into(),
    artist: &quot;Prince&quot;.into(),
    year: 1986,
}).await?;

let album_id = album.id();
trx.commit().await?;</code></pre>

The commit creates an immutable event, updates the local materialized state,
and lets the node's reactor update matching live queries. Connected durable
peers receive the event; subscribed ephemeral peers receive matching changes
through their live-query subscriptions.

## 4. Read once or stay subscribed

Use `fetch()` for a one-time snapshot:

<pre><code transclude="example/server/src/main.rs#fetch-string">// Fetch with a string query - one-time snapshot
let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;year &gt; 1985&quot;).await?;</code></pre>

Use `query()` when the result set should continue updating:

<pre><code transclude="example/server/src/main.rs#livequery-rust">// Using selection! macro with ctx.query()
let q: LiveQuery&lt;AlbumView&gt; = ctx.query(selection!(&quot;year &gt; 1985&quot;))?;</code></pre>

An entity can enter, change within, or leave a live query's result set as
commits apply. [Querying Data](../queries/index.md) explains that lifecycle;
[AnkQL Syntax](../queries/syntax.md) covers predicates, ordering, limits, and
safe value substitution.

## 5. Connect a browser node

The browser uses IndexedDB for its local working set and connects to a durable
peer over WebSockets:

<pre><code transclude="example/wasm-bindings/src/lib.rs#client-example">let storage = IndexedDBStorageEngine::open(&quot;myapp&quot;).await?;
let node = Node::new(Arc::new(storage), PermissiveAgent::new());
let client = WebsocketClient::new(node.clone(), server_url)?;
node.system.wait_system_ready().await;

let context = node.context(DEFAULT_CONTEXT)?;

CONTEXT.with(|slot| slot.replace(Some(context)));
CLIENT.with(|slot| slot.replace(Some(client)));</code></pre>

`wait_system_ready()` is the corresponding client-side readiness barrier for
learning which system it joined.
Keep the returned connector handle alive for as long as the node should remain
connected.

Client initialization is asynchronous. Do not call `ctx()` or create queries
during the first React render; wait for `initialize_client()` to resolve, then
render the component that owns them. This hook makes that readiness state
explicit:

<pre><code transclude="example/react-app/src/App.tsx#react-initialize">let clientInitialization: Promise&lt;void&gt; | undefined;

function initializeClientOnce(): Promise&lt;void&gt; {
  clientInitialization ??= initialize_client(&quot;ws://localhost:9797&quot;);
  return clientInitialization;
}

function useClientReady() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState&lt;string | null&gt;(null);

  useEffect(() =&gt; {
    let cancelled = false;
    initializeClientOnce()
      .then(() =&gt; {
        if (!cancelled) setReady(true);
      })
      .catch((err) =&gt; {
        if (!cancelled) setError(String(err));
      });
    return () =&gt; {
      cancelled = true;
    };
  }, []);

  return { ready, error };
}</code></pre>

## 6. Observe the live query in React

The React templates create `signalObserver` with `@ankurah/react-hooks`; this
small example defines the same wrapper directly from the generated `useObserve`
binding. Create the live query only inside the subtree rendered after
initialization:

<pre><code transclude="example/react-app/src/App.tsx#react-signal-observer">export function signalObserver&lt;T&gt;(fc: React.FC&lt;T&gt;): React.FC&lt;T&gt; {
  return (props: T) =&gt; {
    const observer = useObserve();
    try {
      return fc(props);
    } finally {
      observer.finish();
    }
  };
}</code></pre>

<pre><code transclude="example/react-app/src/App.tsx#react-livequery">let albumsQuery: AlbumLiveQuery | undefined;

function queryAlbums(): AlbumLiveQuery {
  albumsQuery ??= Album.query(ctx(), &quot;year &gt; 1985&quot;);
  return albumsQuery;
}</code></pre>

The factory caches the query for this app's singleton client. That also makes
the example safe when React development `StrictMode` probes a component more
than once.

The ready-only component constructs that query once and passes it to the
observed list:

<pre><code transclude="example/react-app/src/App.tsx#react-ready-component">const ReadyAlbums = signalObserver(() =&gt; {
  const albums = useMemo(queryAlbums, []);

  return (
    &lt;div&gt;
      &lt;h2&gt;{&quot;Albums (year &gt; 1985)&quot;}&lt;/h2&gt;
      &lt;AlbumList albums={albums} /&gt;
    &lt;/div&gt;
  );
});</code></pre>

Gate that subtree on the readiness state returned above:

<pre><code transclude="example/react-app/src/App.tsx#react-ready-gate">const content = ready ? (
  &lt;ReadyAlbums /&gt;
) : (
  &lt;div className=&quot;status&quot;&gt;
    Connecting to server at ws://localhost:9797...
  &lt;/div&gt;
);</code></pre>

`ReadyAlbums` passes the query into an observed list component. Reading
`albums.items` registers that render as a dependent of the live query:

<pre><code transclude="example/react-app/src/App.tsx#react-component">interface Props {
  albums: AlbumLiveQuery;
}
/* Bind a React observer to the component. */
const AlbumList = signalObserver(({ albums }: Props) =&gt; {
  return (
    &lt;ul&gt;
      {/* Reading items registers this render as a live-query observer. */}
      {albums.items.map((album) =&gt; (
        &lt;li key={album.id.to_base64()}&gt;{album.name}&lt;/li&gt;
      ))}
    &lt;/ul&gt;
  );
});</code></pre>

The component rerenders when the query's result set changes; application code
does not need to maintain a second subscription or copy the rows into React
state. See [React Bindings](../reactivity/react.md) for initialization and hook
setup.

## 7. Write from React

The generated model namespace accepts the same transaction pattern from
TypeScript. Create a row, then commit:

<pre><code transclude="example/react-app/src/App.tsx#react-create">export async function createAlbum(
  name: string,
  artist: string,
  year: number,
): Promise&lt;AlbumView&gt; {
  const transaction = ctx().begin();
  const album = await Album.create(transaction, { name, artist, year });
  await transaction.commit();
  return album;
}</code></pre>

Views stay read-only. To update one, obtain its transaction-bound mutable
handle and use the field backend's mutation method before committing:

<pre><code transclude="example/react-app/src/App.tsx#react-update">export async function renameAlbum(
  album: AlbumView,
  name: string,
): Promise&lt;void&gt; {
  const transaction = ctx().begin();
  album.edit(transaction).name.replace(name);
  await transaction.commit();
}</code></pre>

`name` is Yrs-backed text, so its wrapper exposes `replace`. An LWW field such
as `year` exposes `set` instead.

## 8. Verify synchronization

The generated templates use `Message` rather than `Album`, but exercise the
same sequence: a shared model, `create`/`edit` inside a transaction, a live
query, and an observed component.

Run a generated React or Leptos project with `./dev.sh`, then open the printed
web URL in one regular browser window and one private/incognito window. The two
windows use independent IndexedDB stores, so they behave as separate client
nodes. Create or edit data in one and confirm that the other updates without a
refresh. For an existing React Native checkout or previously generated project,
start the Rust server as shown in the template and use a separately configured
second simulator or device for the second client; the current generation
blocker is noted in [Quick Start](template.md), and `dev.sh` launches one fixed
simulator target.

At that point you have exercised the complete path:

1. a model shared across server code and client code or generated bindings;
2. a transaction committed on one node;
3. replication through a connector;
4. storage on both durable and ephemeral nodes; and
5. a live query driving a reactive UI.

## Where to go next

- [Defining Models](../models.md) -- add fields, references, and updates.
- [Querying Data](../queries/index.md) -- choose between snapshots and live results.
- [Authentication & Policy](../guides/auth.md) -- replace the development policy agent.
- [Deployment & Operations](../guides/deployment.md) -- choose durable storage and prepare a server.
