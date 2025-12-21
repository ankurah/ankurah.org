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

```rust
// String equality
ctx.fetch::<AlbumView>("name = 'Dark Side of the Moon'").await?

// Numeric comparison
ctx.fetch::<AlbumView>("year > 1985").await?

// Not equal
ctx.fetch::<AlbumView>("artist != 'Unknown'").await?
```

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

```rust
// AND - both conditions must match
ctx.fetch::<AlbumView>("year > 1980 AND year < 1990").await?

// OR - either condition matches
ctx.fetch::<AlbumView>("artist = 'Prince' OR artist = 'Madonna'").await?

// Combined
ctx.fetch::<AlbumView>("(artist = 'Prince' OR artist = 'Madonna') AND year > 1985").await?
```

## The IN Operator

Check if a value is in a list:

```
field IN (value1, value2, value3)
```

### Examples

```rust
// Literal list
ctx.fetch::<AlbumView>("year IN (1984, 1985, 1986)").await?

// With the fetch! macro and a Vec
let years = vec![1984, 1985, 1986];
let albums: Vec<AlbumView> = fetch!(ctx, year IN {years}).await?;
```

## Ordering Results

Use `ORDER BY` to sort results:

```
... ORDER BY field ASC
... ORDER BY field DESC
```

### Examples

```rust
// Sort by year, newest first
ctx.fetch::<AlbumView>("year > 1980 ORDER BY year DESC").await?

// Sort alphabetically by name
ctx.fetch::<AlbumView>("true ORDER BY name ASC").await?
```

## Selecting All Entities

Use `true` to match all entities:

```rust
// Get all albums, sorted by name
ctx.fetch::<AlbumView>("true ORDER BY name ASC").await?
```

## String Values

String literals use single quotes:

```rust
ctx.fetch::<AlbumView>("name = 'Purple Rain'").await?
```

To include a single quote in a string, escape it with another single quote:

```rust
ctx.fetch::<AlbumView>("name = 'Rock ''n'' Roll'").await?
```

## Nested Property Access

For structured data (like JSON fields), use dot notation:

```rust
// Query nested JSON properties
ctx.fetch::<EntityView>("data.category = 'music'").await?
ctx.fetch::<EntityView>("metadata.author.name = 'Alice'").await?
```

## Variable Interpolation

Use Rust's `format!` macro for dynamic queries:

```rust
// Variable interpolation
let year = 1985;
let query = format!("year > {year}");
ctx.fetch::<AlbumView>(query.as_str()).await?

// String values need quotes
let artist = "Prince";
let query = format!("artist = '{artist}'");
ctx.fetch::<AlbumView>(query.as_str()).await?

// Multiple variables
let min_year = 1980;
let max_year = 1990;
let query = format!("year >= {min_year} AND year <= {max_year}");
ctx.fetch::<AlbumView>(query.as_str()).await?
```

## Common Patterns

### Check if entity exists

```rust
let exists = !ctx.fetch::<AlbumView>("name = 'Purple Rain'").await?.is_empty();
```

### Get first match

```rust
let album = ctx.fetch::<AlbumView>("name = 'Purple Rain'").await?.into_iter().next();
```

### Count matches

```rust
let count = ctx.fetch::<AlbumView>("year > 1985").await?.len();
```

## Next Steps

- [Querying Data](index.md) - Overview of fetch vs query
- [React Usage](react.md) - Using queries in React components

