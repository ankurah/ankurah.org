# Digest Trees

<div class="digest-lead">
<p class="eyebrow">Ankurah 0.10 · How the foundation works</p>
<p class="lead">Find the difference without sending everything.</p>
<p>Two participants can hold almost the same data. A digest tree lets them compare small summaries, skip the parts that agree, and look closely at the parts that do not.</p>
</div>

<div class="digest-status">
<strong>The foundation is implemented. Node integration is next.</strong>
The crate, storage adapters and <code>TreeManager</code> are available.
Nodes do not yet maintain these trees or compare them over the network.
These examples exercise the foundation directly.
</div>

## A small difference in a large set

Imagine two participants keeping the same catalog of albums. One has acquired
an album the other lacks, or holds a different title for an existing album.
Sending the entire catalog would work, but most of that transfer would repeat
what both already know.

A **member** is one item included in a tree. It has an identity, values used to
order it, and a payload to keep with it. In this example, an album's ID is its
identity, its release year orders it, and its title is the payload.

A **span** is a contiguous range of that ordered collection. A **digest**
summarizes its members: a count and a sum derived from each album's ID, year
and title. Matching digests let comparison skip that span; differing digests
tell it where to ask for more detail. The [comparison chapter](comparison.md#two-digest-groups)
explains the collision-resistance assumptions behind that shortcut.

Try a missing album, a changed title, or both. Each step below is a request
actually made by the crate's comparison algorithm against another tree in
the same process.

<iframe class="digest-figure" src="figures/comparison.html" title="Explore how digest comparison finds changed albums" loading="lazy" style="width:100%;height:760px;border:0"></iframe>

[Open the comparison explainer](figures/comparison.html).

The result identifies differences. It does not decide which version is
authoritative, authorize access, transfer entity state, or merge changes.
Those decisions belong to the caller. In particular, absence from another
participant's set is not, by itself, permission to delete an entity.

## What the tree knows

The crate keeps the members its owner supplies. It does not evaluate a query
predicate or know what an Ankurah entity is.

| Concept | In the album example | In core's integration |
|---|---|---|
| Member ID | Album ID | Entity ID, through `EntityMemberId` |
| Key values | Release year | Values of properties named by `KeySpec` |
| Payload | Album title | The entity's head `Clock`, through `EntityHead` |
| Membership | Albums the example inserts | Entities matching a resolved Selection |

Core uses the head to describe an entity's version; the tree does not hold a
second copy of every entity property. The example uses a title so the reader
can see exactly which bytes change the digest.

There are two meanings of *node* to keep apart: an **Ankurah Node** is a
participant in the distributed system; a **tree node** is a branching point
or bucket within one digest tree. A tree node is not a network participant.

## Start with a real tree

The examples use `MemoryStore`, a reference implementation enabled by the
crate's `test-support` feature. It lets the example own and commit its storage
transactions directly. Production integration uses the storage engine's
transaction, described in [Storage and Transactions](storage.md).

<pre><code class="language-rust" transclude="example/digest-tree/src/lib.rs#create-tree">pub async fn albums_tree(albums: Vec&lt;Album&gt;) -&gt; anyhow::Result&lt;Tree&gt; {
    let key_spec = KeySpec::new(vec![IndexKeyPart::asc(Property::Year, ValueType::I32)]);
    Ok(DigestTree::create(MemoryStore::new(), key_spec, albums).await?)
}</code></pre>

`Album` implements `Member<Property>`. The tree asks it for a value for each
key part and for the payload. `Id` converts to and from bytes; `Title` supplies
the bytes covered by the digest.

<details>
<summary>See the member implementation</summary>

<pre><code class="language-rust" transclude="example/digest-tree/src/lib.rs#album-member">#[derive(Clone, Debug)]
pub struct Album {
    pub id: Id,
    pub year: Option&lt;i32&gt;,
    pub title: Title,
}

impl Member&lt;Property&gt; for Album {
    type Id = Id;
    type Payload = Title;
    type KeyError = Infallible;

    fn id(&amp;self) -&gt; Id {
        self.id
    }

    fn value(&amp;self, part: &amp;IndexKeyPart&lt;Property&gt;) -&gt; Result&lt;Option&lt;Value&gt;, Infallible&gt; {
        match part.key {
            Property::Year =&gt; Ok(self.year.map(Value::I32)),
        }
    }

    fn payload(&amp;self) -&gt; Title {
        self.title.clone()
    }
}</code></pre>

</details>

These are maintained code examples, transcluded with Liaison from the
[executable example](https://github.com/ankurah/ankurah.org/tree/docs/0.10/example/digest-tree).
They use the merged implementation while 0.10 is being prepared for release.

## Follow the pieces

<div class="digest-reading-path">
<a href="keys-and-views.html"><span>01</span><strong>Keys, Spans, and Views</strong><small>Put members in order and select what to read.</small></a>
<a href="comparison.html"><span>02</span><strong>Pages and Comparison</strong><small>Follow a request down to the differences.</small></a>
<a href="storage.html"><span>03</span><strong>Storage and Transactions</strong><small>Keep a tree consistent with the records it describes.</small></a>
<a href="management.html"><span>04</span><strong>Tree Management</strong><small>Understand ownership, retention and maintenance.</small></a>
</div>

The crate's [module documentation](https://github.com/ankurah/ankurah/blob/ec7a15625900fcec0403176f03713acaef1280df/digest-tree/src/lib.rs)
and [introduction tests](https://github.com/ankurah/ankurah/blob/ec7a15625900fcec0403176f03713acaef1280df/digest-tree/tests/intro.rs)
provide the complete API context.
