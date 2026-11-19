# Pages and Comparison

A digest tells a reader whether a span appears to agree. A **page** gives
the reader the next useful detail within that span: either summaries of
smaller spans or the members themselves.

## Ask, compare, narrow

`DigestTreeView::differences` performs the comparison. A `PageGetter` supplies
the other tree's answers. A getter can read another view in the same process,
as this example does. Node supplies a network getter for
[query synchronization](query-sync.md), including authorization and resource
limits. The crate owns the descent; it does not implement the transport.

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

## Consume differences in bounded batches

`differences` collects the complete result and pairs moved members by ID.
`compare` instead returns a cursor: `next_batch` yields at most the chosen
number of differences, and the caller can repair them before reading more.
Node uses this incremental form. Even an empty remote span containing many
local members is enumerated in bounded batches.

<pre><code class="language-rust" transclude="example/digest-tree/src/lib.rs#compare-batches">pub async fn find_changes_in_batches() -&gt; anyhow::Result&lt;()&gt; {
    let ours = albums_tree(Vec::new()).await?;
    let theirs = albums_tree(
        (1..=300)
            .map(|id| album(id, 1800 + id as i32, &quot;Album&quot;))
            .collect(),
    )
    .await?;
    let mut comparison = ours
        .view()
        .compare(theirs.view(), NonZeroUsize::new(32).unwrap());
    let mut found = 0;
    while let Some(batch) = comparison.next_batch().await? {
        assert!(batch.len() &lt;= 32);
        // A caller can process this batch before asking for the next one.
        found += batch.len();
    }
    assert_eq!(found, 300);
    Ok(())
}</code></pre>

A batch pairs leaves at the same address. A moved member can appear in two
different batches; the cursor does not keep a global member-ID map to pair
those observations. Consult canonical state before applying a difference.
Use the collecting API when its global pairing is needed and its memory use
is acceptable. The getter still controls how large an accepted page can be.

## The structure behind an answer

The tree is a path-compressed binary trie over address bits. Branches divide
the address space. A terminal tree node is a **bucket**, holding at most 64
members in this implementation. Each tree node records the digest beneath it.

Digests are sums, so the same set of leaves has the same digest regardless of
insertion order or grouping. Two trees can compare the same spans even when
their internal branching differs. The comparison follows the subdivisions
returned by the other tree and computes its own digests over those bounds.

## What a difference means

The collecting `differences` result pairs observed versions by member ID in
`Difference { ours, theirs }`. Either side may be absent. A changed key can
move a member to another address; the collecting comparison pairs both
versions when it encounters them.

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
the observations. Node uses [captured versions](storage.md#captured-versions-survive-short-reads)
so one network comparison does not mix tree generations. The generic
comparison neither applies changes nor establishes that both participants
will remain equal afterward.

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

The [digest module documentation](https://github.com/ankurah/ankurah/blob/6fe7640d1192bcf636fe27e9a26b57f72920644b/digest-tree/src/digest/mod.rs)
states the construction and its assumptions. The
[LtHash16 documentation](https://github.com/ankurah/ankurah/blob/6fe7640d1192bcf636fe27e9a26b57f72920644b/digest-tree/src/digest/lthash16.rs)
explains the limitations of that alternative.
