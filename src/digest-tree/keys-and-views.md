# Keys, Spans, and Views

A tree needs an unambiguous order before it can describe part of its contents.
The order also makes range reads useful: albums released in a particular
period occupy a contiguous part of a tree ordered by year.

## From a member to an address

A **key specification**, `KeySpec`, lists the properties to order by. Each
part specifies a value type, a direction and the placement of missing values.
Several parts give a compound order: year first, then title, for example.

The tree encodes a member's values into its **key**. Its **address** combines
that key with its ID using framing that preserves order and keeps their bytes
unambiguous. Addresses sort by key, then by the ID's bytes. The ID resolves
ties; two albums released in the same year remain distinct members.

Change the key order and select a year interval below. The two albums from
2013 make the tie rule visible. An unknown year has a defined place in the
tree, but it does not belong to a numeric year interval.

<iframe class="digest-figure" src="figures/keys.html" title="Explore key order, missing values, and a selected year interval" loading="lazy" style="width:100%;height:710px;border:0"></iframe>

[Open the key explorer](figures/keys.html).

Changing a key specification creates a different ordering; it is not a
request to read the same tree backward. Reversing a range scan reverses the
entire address order, including ID ties. A descending year key still breaks
equal-year ties by ascending ID bytes.

## A range describes values; a span describes addresses

A **key range**, such as `2010..=2016`, names bounds in the key's values. A
**span**, `Span`, names bounds in encoded addresses. `IntoSpan` lets reads
accept either form, with key values checked against the tree's key spec.

Bounds matter. An included upper year includes all IDs tied at that year;
an excluded upper year includes none of them. Prefix bounds on a compound
key can cover all the members with matching leading key parts.

Use key ranges when expressing an application range. Spans are the lower
level representation used to subdivide the tree during comparison.

## A view fixes its scope, not its contents

`DigestTreeView` is a read-only handle to a tree and a set of spans. Calling
`tree.view()` covers the whole tree. `tree.select(...)` restricts it. A view
does not copy the members or freeze their versions.

<pre><code class="language-rust" transclude="example/digest-tree/src/lib.rs#select-range">pub async fn read_range(tree: &amp;Tree) -&gt; anyhow::Result&lt;Vec&lt;Id&gt;&gt; {
    // Key values describe the view; they are not raw address bytes.
    let view = tree.select(2010..=2016)?;
    let members: Vec&lt;_&gt; = view.range(..)?.try_collect().await?;
    Ok(members.into_iter().map(|member| member.id).collect())
}</code></pre>

Each read sees one consistent committed state. A range stream reads a batch
at a time, with a separate read for each batch. Commits can occur between
batches; the stream does not hold a storage snapshot open while its caller
pauses. A long stream is therefore not a snapshot of the whole tree at one
instant.

Both a view and a range stream keep the underlying tree alive. That becomes
important when [TreeManager](management.md) evicts its own retained handle.

## A limited Selection has limited membership

The generic tree has no Selection or predicate evaluator. Its owner decides
what belongs. Core's manager maintains the exact resolved Selection's result,
including `LIMIT`. An initial build reads the engine's selected result.
Incremental maintenance uses the tree as the ordered selected prefix: it
checks changed IDs against the predicate at one canonical snapshot, applies
changes and trims excess members. If a gap remains, a query strictly after
the surviving boundary supplies the missing suffix from that same snapshot.
An unchanged album can therefore refill a vacated place without a full query
on every change or a second permanent sorted result.

For ordered or limited queries, the storage engines add ascending entity-ID order to
break ties unless an explicit ID order already supplies it. An explicit
`id DESC` remains descending.
This determines which tied members enter a limited result; the generic
address encoding described above still distinguishes every member.
The four storage engines and digest keys share canonical value ordering,
including JSON and entity references. Missing values sort last in ascending
order and first in descending order. This agreement is required for a strict
suffix query to continue the same order as the tree.

Different limits identify different trees. See
[Tree Management](management.md#one-selection-one-lookup) for exact lookup
and retention. A limit bounds the tree's membership, not necessarily the
query work or temporary memory an engine needs to find those members.
