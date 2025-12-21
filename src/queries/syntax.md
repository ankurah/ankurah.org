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

Use Rust's `format!` macro for dynamic queries:

<pre><code transclude="example/server/src/main.rs#syntax-interpolate-int">let year = 1985;
let query = format!(&quot;year &gt; {year}&quot;);

let albums: Vec&lt;AlbumView&gt; = ctx.fetch(query.as_str()).await?;</code></pre>

String values need quotes:

<pre><code transclude="example/server/src/main.rs#syntax-interpolate-str">let artist = &quot;Prince&quot;;
let query = format!(&quot;artist = &#39;{artist}&#39;&quot;);

let albums: Vec&lt;AlbumView&gt; = ctx.fetch(query.as_str()).await?;</code></pre>

Multiple variables:

<pre><code transclude="example/server/src/main.rs#syntax-interpolate-multi">let min_year = 1980;
let max_year = 1990;
let query = format!(&quot;year &gt;= {min_year} AND year &lt;= {max_year}&quot;);

let albums: Vec&lt;AlbumView&gt; = ctx.fetch(query.as_str()).await?;</code></pre>

## Common Patterns

### Check if entity exists

<pre><code transclude="example/server/src/main.rs#syntax-exists">let exists = !ctx.fetch::&lt;AlbumView&gt;(&quot;name = &#39;Purple Rain&#39;&quot;).await?.is_empty();</code></pre>

### Get first match

<pre><code transclude="example/server/src/main.rs#syntax-first">let album = ctx.fetch::&lt;AlbumView&gt;(&quot;name = &#39;Purple Rain&#39;&quot;).await?.into_iter().next();</code></pre>

### Count matches

<pre><code transclude="example/server/src/main.rs#syntax-count">let count = ctx.fetch::&lt;AlbumView&gt;(&quot;year &gt; 1985&quot;).await?.len();</code></pre>

## Next Steps

- [Querying Data](index.md) - Overview of fetch vs query
- [React Usage](react.md) - Using queries in React components
