# Pages and Comparison

A digest tells a reader whether a span appears to agree. A **page** gives
the reader the next useful detail within that span: either summaries of
smaller spans or the members themselves.

## Ask, compare, narrow

`DigestTreeView::differences` performs the comparison. A `PageGetter` supplies
the other tree's answers. A getter can read another view in the same process,
as this example does. The Node preview sends a summary in `KnownState`, but
receivers do not yet use digest comparison to choose network transfers.
The crate itself does not implement that transport.

<pre><code class="language-rust" transclude="example/digest-tree/src/lib.rs#compare-trees">pub async fn find_changes() -&gt; anyhow::Result&lt;()&gt; {
    let first = album(1, 2008, &quot;Walking on a Dream&quot;);
    let second = album(2, 2013, &quot;Ice on the Dune&quot;);
    let ours = albums_tree(vec![first.clone()]).await?;
    let theirs = albums_tree(vec![first, second]).await?;

    // A view can serve as a PageGetter in the same process.
    let differences = ours.view().differences(theirs.view()).await?;
    assert_eq!(differences.len(), 1);
    assert!(differences[0].ours.is_none());
    assert_eq!(differences[0].theirs.as_ref().unwrap().id, Id(2));
    Ok(())
}</code></pre>

For each round, the comparison asks for pages at the spans still in question.
The other side reads and answers; it does not run the comparison. There are
two kinds of answer:

| Page | Contents | What the comparison does |
|---|---|---|
| `Page::Digests` | Digests and bounds for a subdivision of the requested span | Compare the same spans locally; continue only where they differ |
| `Page::Members` | All members within the requested span | Pair the members and report differing or absent versions |

Requests for one level are batched in one `get_pages` call. A **page is an
answer built for a read**, not a persistent storage page or a cache entry.

<iframe class="digest-figure" src="figures/comparison.html?detail=1" title="Step through actual PageGetter requests and page responses" loading="lazy" style="width:100%;height:820px;border:0"></iframe>

[Open the detailed comparison](figures/comparison.html?detail=1).

This replay uses actual traces from the pinned Rust example. The number of
requests and members returned belongs to this data set; it is not a fixed
performance guarantee. Dense differences can require reading much of a tree.

## The structure behind an answer

The tree is a path-compressed binary trie over address bits. Branches divide
the address space. A terminal tree node is a **bucket**, holding at most 64
members in this implementation. Each tree node records the digest beneath it.

Digests are sums, so the same set of leaves has the same digest regardless of
insertion order or grouping. Two trees can compare the same spans even when
their internal branching differs. The comparison follows the subdivisions
returned by the other tree and computes its own digests over those bounds.

## What a difference means

`Difference { ours, theirs }` pairs the observed versions by member ID. Either
side may be absent. A changed key can move the member to another address;
the comparison can pair both versions when it encounters them.

The tree has no general index from member ID to every address. A member
reported only on the other side can still have a local version in a span the
comparison skipped. A caller applying a result must consult its canonical
records rather than blindly inserting it.

Pages must fit their requested spans: subdivisions make progress without
gaps or overlap, and returned members stay in bounds and order. Those checks
validate page structure, not another participant's truthfulness. Access
control, response budgets and timeouts belong to the getter or its caller.

Views are live. Concurrent changes can prevent a comparison from observing a
settled pair of sets; seeing one member at multiple addresses can return
`ComparisonError::Unsettled`. The caller decides how to retry and how to use
the observations. Comparison neither applies changes nor establishes that
both participants will remain equal afterward.

## Two digest groups

A leaf binds an encoded key, a member ID and the payload's `digest_bytes()`.
The selected group hashes that leaf into an element. An insertion adds the
element; a removal subtracts it; an update subtracts the old and adds the new.
The digest also tracks the member count.

| Group | Element encoding | Role in the crate |
|---|---:|---|
| `Ristretto255` | 32 bytes | Default; compact elements with the crate's set-collision resistance construction |
| `LtHash16` | 2,048 bytes | An alternative with fast lane arithmetic and weaker security guarantees; provided for comparison, not as a security recommendation |

These are element sizes, not complete page or span-digest sizes. Counts,
bounds and encoding metadata add to the representation. Persisted records
identify the group; an encoding from one group cannot be read as the other.

The [digest module documentation](https://github.com/ankurah/ankurah/blob/d635ea5358396a2812526175f30471266ab7d8bb/digest-tree/src/digest/mod.rs)
states the construction and its assumptions. The
[LtHash16 documentation](https://github.com/ankurah/ankurah/blob/d635ea5358396a2812526175f30471266ab7d8bb/digest-tree/src/digest/lthash16.rs)
explains the limitations of that alternative.
