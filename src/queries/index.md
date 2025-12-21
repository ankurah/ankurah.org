# Querying Data

Ankurah provides a SQL-like query language called **AnkQL** for filtering and retrieving entities. Queries work consistently across all storage backends—whether you're querying Postgres on your server or IndexedDB in a browser.

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

<pre><code transclude="example/server/src/main.rs#livequery-rust">let q: LiveQuery&lt;AlbumView&gt; = ctx.query(&quot;year &gt; 1985&quot;)?;</code></pre>

A `LiveQuery` is reactive—when entities matching your query are created, updated, or deleted (anywhere in the system), the query's results update automatically.

## Query Methods

### String Queries

The simplest way to query is with a string:

```rust
// fetch with string - one-time snapshot
let albums: Vec<AlbumView> = ctx.fetch("year > 1985").await?;

// query with string - live subscription
let live: LiveQuery<AlbumView> = ctx.query("year > 1985")?;
```

### Variable Interpolation with format!

Use Rust's `format!` macro for dynamic queries:

<pre><code transclude="example/server/src/main.rs#fetch-format">// Using format! for variable interpolation
let year = 1985;
let query = format!(&quot;year &gt; {year}&quot;);

let albums: Vec&lt;AlbumView&gt; = ctx.fetch(query.as_str()).await?;</code></pre>

Combine multiple conditions:

<pre><code transclude="example/server/src/main.rs#fetch-complex">// Multiple conditions with format!
let min_year = 1980;
let max_year = 1990;
let query = format!(&quot;year &gt;= {min_year} AND year &lt;= {max_year}&quot;);

let albums: Vec&lt;AlbumView&gt; = ctx.fetch(query.as_str()).await?;</code></pre>

The same pattern works with `query()`:

<pre><code transclude="example/server/src/main.rs#query-format">// Using format! for variable interpolation  
let year = 1985;
let query = format!(&quot;year &gt; {year}&quot;);

let live: LiveQuery&lt;AlbumView&gt; = ctx.query(query.as_str())?;</code></pre>

## Next Steps

- [Query Syntax](syntax.md) - Learn the full AnkQL query language
- [React Usage](react.md) - Using queries in React components

