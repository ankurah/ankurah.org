# AnkQL Syntax

AnkQL is Ankurah's query language for filtering entities. It uses familiar SQL-like syntax that works consistently across all storage backends.

## Basic Comparisons

```
field = value       # Equality
field != value      # Not equal
field > value       # Greater than
field >= value      # Greater than or equal
field < value       # Less than
field <= value      # Less than or equal
```

### Examples

<pre><code transclude="example/server/src/main.rs#syntax-string-eq">let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;name = &#39;Dark Side of the Moon&#39;&quot;).await?;</code></pre>

<pre><code transclude="example/server/src/main.rs#syntax-numeric">let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;year &gt; 1985&quot;).await?;</code></pre>

<pre><code transclude="example/server/src/main.rs#syntax-not-eq">let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;artist != &#39;Unknown&#39;&quot;).await?;</code></pre>

## Logical Operators

Combine conditions with `AND` and `OR`:

```
condition1 AND condition2
condition1 OR condition2
```

Use parentheses for complex logic:

```
(condition1 OR condition2) AND condition3
```

### Examples

<pre><code transclude="example/server/src/main.rs#syntax-and">let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;year &gt; 1980 AND year &lt; 1990&quot;).await?;</code></pre>

<pre><code transclude="example/server/src/main.rs#syntax-or">let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;artist = &#39;Prince&#39; OR artist = &#39;Madonna&#39;&quot;).await?;</code></pre>

<pre><code transclude="example/server/src/main.rs#syntax-combined">let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;(artist = &#39;Prince&#39; OR artist = &#39;Madonna&#39;) AND year &gt; 1985&quot;).await?;</code></pre>

## The IN Operator

Check if a value is in a list:

```
field IN (value1, value2, value3)
```

### Example

<pre><code transclude="example/server/src/main.rs#syntax-in">let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;year IN (1984, 1985, 1986)&quot;).await?;</code></pre>

## Ordering Results

Use `ORDER BY` to sort results:

```
... ORDER BY field ASC
... ORDER BY field DESC
```

### Examples

<pre><code transclude="example/server/src/main.rs#syntax-order-desc">let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;year &gt; 1980 ORDER BY year DESC&quot;).await?;</code></pre>

<pre><code transclude="example/server/src/main.rs#syntax-order-asc">let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;true ORDER BY name ASC&quot;).await?;</code></pre>

## Selecting All Entities

Use `true` to match all entities:

<pre><code transclude="example/server/src/main.rs#syntax-all">let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;true ORDER BY name ASC&quot;).await?;</code></pre>

## String Values

String literals use single quotes:

<pre><code transclude="example/server/src/main.rs#syntax-string-literal">let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;name = &#39;Purple Rain&#39;&quot;).await?;</code></pre>

To include a single quote in a string, escape it with another single quote:

<pre><code transclude="example/server/src/main.rs#syntax-escape-quote">let albums: Vec&lt;AlbumView&gt; = ctx.fetch(&quot;name = &#39;Rock &#39;&#39;n&#39;&#39; Roll&#39;&quot;).await?;</code></pre>

## Variable Interpolation

Use the `fetch!` and `selection!` macros for dynamic queries. They support multiple syntaxes:

### Unquoted Form

The unquoted form is the most concise. Variables expand to equality by default:

```rust
let artist = "Prince";
fetch!(ctx, {artist}).await?;  // Equivalent to: artist = 'Prince'
```

Add comparison operators as prefixes:

<pre><code transclude="example/server/src/main.rs#syntax-interpolate-int">// Unquoted form: {&gt;year} expands to year &gt; {year}
let year = 1985;

let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, {&gt;year}).await?;</code></pre>

All comparison operators work: `{>var}`, `{<var}`, `{>=var}`, `{<=var}`, `{!=var}`:

<pre><code transclude="example/server/src/main.rs#fetch-unquoted-comparisons">// All comparison operators work: &gt;, &lt;, &gt;=, &lt;=, !=
let year = 1985;

let _newer: Vec&lt;AlbumView&gt; = fetch!(ctx, {&gt;year}).await?;
let _older: Vec&lt;AlbumView&gt; = fetch!(ctx, {&lt;year}).await?;
let _gte: Vec&lt;AlbumView&gt; = fetch!(ctx, {&gt;=year}).await?;
let _lte: Vec&lt;AlbumView&gt; = fetch!(ctx, {&lt;=year}).await?;
let _not_eq: Vec&lt;AlbumView&gt; = fetch!(ctx, {!=year}).await?;</code></pre>

Combine conditions with AND/OR:

<pre><code transclude="example/server/src/main.rs#fetch-unquoted-combined">// Combine multiple conditions with AND/OR
let artist = &quot;Prince&quot;;
let year = 1985;

let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, {artist} AND {&gt;year}).await?;</code></pre>

Mix unquoted variables with explicit comparisons:

<pre><code transclude="example/server/src/main.rs#fetch-unquoted-mixed">// Mix unquoted variables with explicit comparisons
let artist = &quot;Prince&quot;;
let year = 1985;

let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, {artist} AND year &gt; {year}).await?;</code></pre>

### Quoted Form

Use quoted form for string literals and positional arguments:

<pre><code transclude="example/server/src/main.rs#syntax-interpolate-str">// Quoted form with positional argument for string values
let artist = &quot;Prince&quot;;

let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, &quot;artist = &#39;{}&#39;&quot;, artist).await?;</code></pre>

Multiple variables:

<pre><code transclude="example/server/src/main.rs#syntax-interpolate-multi">// Multiple variables with quoted form
let min_year = 1980;
let max_year = 1990;

let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, &quot;year &gt;= {} AND year &lt;= {}&quot;, min_year, max_year).await?;</code></pre>

Pure string literals (no variables):

<pre><code transclude="example/server/src/main.rs#fetch-quoted-literal">// Quoted form for pure string literals
let albums: Vec&lt;AlbumView&gt; = fetch!(ctx, &quot;artist = &#39;Prince&#39; AND year &gt; 1985&quot;).await?;</code></pre>

## Common Patterns

### Check if entity exists

<pre><code transclude="example/server/src/main.rs#syntax-exists">// Check if any entities match the query
let album_name = &quot;Purple Rain&quot;;
let matching_albums: Vec&lt;AlbumView&gt; = fetch!(ctx, &quot;name = &#39;{}&#39;&quot;, album_name).await?;
let exists = matching_albums.len() &gt; 0;</code></pre>

### Get first match

<pre><code transclude="example/server/src/main.rs#syntax-first">let album = ctx.fetch::&lt;AlbumView&gt;(&quot;name = &#39;Purple Rain&#39;&quot;).await?.into_iter().next();</code></pre>

### Count matches

<pre><code transclude="example/server/src/main.rs#syntax-count">let count = ctx.fetch::&lt;AlbumView&gt;(&quot;year &gt; 1985&quot;).await?.len();</code></pre>

## Next Steps

- [Querying Data](index.md) - Overview of fetch vs query
- [React Usage](react.md) - Using queries in React components
