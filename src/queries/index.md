# Querying Data

Ankurah provides a SQL-like query language called **AnkQL** for filtering and
retrieving entities. The same public query API targets Postgres, SQLite, Sled,
and browser IndexedDB, although execution strategy and backend maturity differ.

## Two Ways to Query

There are two fundamental patterns for getting data:

| Method | Returns | Use When |
|--------|---------|----------|
| `fetch()` | One-time snapshot | You need data once (e.g., checking if something exists) |
| `query()` | Live subscription | You want automatic updates when data changes |

### fetch() - One-Time Snapshot

Use `fetch()` when you need data once and don't need ongoing updates:

<pre><code transclude="example/server/src/main.rs#fetch-string">// Fetch with a string query - one-time snapshot
let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;year &gt; 1985&quot;).await?;</code></pre>

The results are a `Vec<AlbumView>` containing all matching entities at that moment. If the data changes later, you won't be notified.

### query() - Live Subscription

Use `query()` when your UI should update automatically as data changes:

<pre><code transclude="example/server/src/main.rs#livequery-rust">// Using selection! macro with ctx.query()
let q: LiveQuery&lt;AlbumView&gt; = ctx.query(selection!(&quot;year &gt; 1985&quot;))?;</code></pre>

A `LiveQuery` is reactive: local commits and remote changes delivered to the
node can add an entity to the result set, update one already in it, or make one
leave the predicate. The query updates automatically as those changes apply.

## Query Methods

### Using Macros (Recommended)

The recommended way to query is using the `fetch!` and `selection!` macros, which provide compile-time safety and variable interpolation:

### Variable Interpolation with Macros

Use the `fetch!` and `selection!` macros for dynamic queries. They support multiple syntaxes:

#### Unquoted Form (Terse)

The unquoted form is the most concise. Variables expand to equality comparisons by default:

<pre><code transclude="example/server/src/main.rs#fetch-unquoted-eq">// Unquoted form: {variable} expands to variable = {variable}
let artist = &quot;Prince&quot;;

let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, {artist}).await?;</code></pre>

Add comparison operators as prefixes: `{>year}`, `{<year}`, `{>=year}`, `{<=year}`, `{!=year}`:

<pre><code transclude="example/server/src/main.rs#fetch-unquoted-gt">// Unquoted form with comparison operator: {&gt;year} expands to year &gt; {year}
let year = 1985;

let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, {&gt;year}).await?;</code></pre>

Combine multiple conditions with AND/OR:

<pre><code transclude="example/server/src/main.rs#fetch-unquoted-combined">// Combine multiple conditions with AND/OR
let artist = &quot;Prince&quot;;
let year = 1985;

let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, {artist} AND {&gt;year}).await?;</code></pre>

Mix unquoted variables with explicit comparisons:

<pre><code transclude="example/server/src/main.rs#fetch-unquoted-mixed">// Mix unquoted variables with explicit comparisons
let artist = &quot;Prince&quot;;
let year = 1985;

let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, {artist} AND year &gt; {year}).await?;</code></pre>

#### Quoted Form (Flexible)

Use quoted form for string literals and positional arguments:

<pre><code transclude="example/server/src/main.rs#fetch-quoted-literal">// Quoted form for pure string literals
let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, &quot;artist = &#39;Prince&#39; AND year &gt; 1985&quot;).await?;</code></pre>

Positional arguments with `{}`:

Placeholders are typed values. Do **not** wrap `{}` in AnkQL quotes, even
when the argument is a string; quotes are only for string literals written
directly in the query.

<pre><code transclude="example/server/src/main.rs#fetch-quoted-positional">// Quoted form with positional arguments
let min_year = 1980;
let max_year = 1990;

let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, &quot;year &gt;= {} AND year &lt;= {}&quot;, min_year, max_year).await?;</code></pre>

Multiple positional arguments:

<pre><code transclude="example/server/src/main.rs#fetch-quoted-mixed">// String and numeric positional arguments are typed; do not quote `{}` placeholders.
let artist = &quot;Prince&quot;;
let year = 1985;

let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, &quot;artist = {} AND year &gt; {}&quot;, artist, year).await?;</code></pre>

#### With query() and selection!

The same syntaxes work with `ctx.query(selection!(...))`:

<pre><code transclude="example/server/src/main.rs#query-unquoted-eq">// Unquoted form with selection! macro
let artist = &quot;Prince&quot;;

let live: LiveQuery&lt;AlbumView&gt; = ctx.query(selection!({artist}))?;</code></pre>

<pre><code transclude="example/server/src/main.rs#query-unquoted-gt">// Unquoted form with comparison operator
let year = 1985;

let live: LiveQuery&lt;AlbumView&gt; = ctx.query(selection!({&gt;year}))?;</code></pre>

<pre><code transclude="example/server/src/main.rs#query-unquoted-combined">// Combine conditions with AND/OR
let artist = &quot;Prince&quot;;
let year = 1985;

let live: LiveQuery&lt;AlbumView&gt; = ctx.query(selection!({artist} AND {&gt;year}))?;</code></pre>

<pre><code transclude="example/server/src/main.rs#query-quoted-literal">// Quoted form for string literals
let live: LiveQuery&lt;AlbumView&gt; = ctx.query(selection!(&quot;artist = &#39;Prince&#39; AND year &gt; 1985&quot;))?;</code></pre>

## Next Steps

- [Query Syntax](syntax.md) - Learn the full AnkQL query language
- [React Bindings](../reactivity/react.md) - Using queries in React components
