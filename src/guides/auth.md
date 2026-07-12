# Authentication & Policy

Every Ankurah node runs a **policy agent**: the component that identifies
request contexts and supplies access-control hooks for local operations and
peer requests. Each context carries the agent's notion of an identity.

The examples elsewhere in this book use `PermissiveAgent::new()` -- the
development baseline that performs **no authentication and no
authorization**: every gate is a no-op allow. Ship something real and you
will want the JWT extension below, or your own `PolicyAgent`
implementation.

## What a policy agent decides

The `PolicyAgent` trait gates, in user terms:

| Decision | Hook | Fires when |
|----------|------|------------|
| Prove who I am to a peer | `sign_request` | This node sends a request |
| Decide who a peer is | `check_request` | This node receives a request |
| Coarse collection access | `can_access_collection` | Fetch/query against a collection |
| Which rows a query may see | `filter_predicate` | Every fetch/query/subscription |
| Point reads of an entity | `check_read` | Direct gets, delivered entities |
| Writes | `check_write` / `check_event` | Transaction commit, with before *and* after state |

Local denials surface as errors on the failing call (`create`, `commit`,
`fetch`, `get`). Remote write and coarse request denials return request errors,
not dropped connections. Remote row-level read denials are intentionally
filtered out of `get`, `fetch`, and initial-subscription results, so an entity
can look absent instead of returning `ByPolicy`.

## The JWT extension

`ankurah-jwt-auth` provides `JwtAgent`: RS256-signed JWTs plus a JSON
policy of roles, collection privileges, and row-level scope rules.

Enable the `watcher` feature in the durable server. Without it,
`new_durable` reads the policy into memory but does not publish or refresh the
replicated `JwtPolicy` entity used by ephemeral clients:

```toml
ankurah-jwt-auth = { version = "0.9", features = ["watcher"] }
```

**Server** -- a durable node with signing keys and a policy file:

```rust,ignore
let keys = SigningKeys::from_pem(include_str!("path/to/private_key.pem"))?;
let agent = JwtAgent::new_durable(keys.clone(), "policy.json")?;

let node = Node::new_durable(Arc::new(storage), agent);
node.system.wait_loaded().await;
if node.system.root().is_none() {
    node.system.create().await?;
}
```

**Authenticated context** -- verify the token before turning its claims into
the context every operation runs under. `JwtContext::from_claims` is only a
constructor; it does not verify the token itself:

```rust,ignore
let claims = keys.verify(&token)?;
let ctx = JwtContext::from_claims(claims, token);
let context = node.context(ctx)?;

let trx = context.begin();
trx.create(&Post { title: "Hello World".into(), body: "First post!".into() }).await?;
trx.commit().await?;
```

**Browser-shaped clients** start with no key material and never hold the
private signing key or policy file. Construct the agent with
`JwtAgent::new_ephemeral()`: with the durable `watcher` enabled, it syncs the
policy config and server's *public* key over the normal replication channel
(they live in a `JwtPolicy` entity that only the server's root context can
write). Local application code must still verify a token before constructing a
trusted `JwtContext`; `from_claims` does not do that automatically. Outgoing
requests carry the raw JWT, and the receiving server independently verifies it
in `check_request`.

## The policy file

Two maps: roles grant named privileges, and collections require them.

```json
{
  "roles": {
    "Admin":  ["*"],
    "Editor": ["view_posts", "write_posts", "manage_posts"],
    "Author": ["view_posts", "write_posts"]
  },
  "collections": {
    "post": {
      "read":  "view_posts",
      "write": "write_posts",
      "scope": [
        { "filter": "author = $jwt.sub", "unless_privilege": "manage_posts" }
      ]
    }
  }
}
```

- `read` / `write` name the intended operation privileges; `"*"` on a role is
  a full-access wildcard. The current coarse query-access caveat is called out
  under limitations below.
- `scope` rules add **row-level** restriction: the filter is an AnkQL
  predicate that is AND-ed onto every query the user runs. Here, Authors
  may read and write only their own posts (`author = $jwt.sub`). Editors
  also hold `manage_posts`, so they bypass the rule via
  `unless_privilege` while still satisfying the shared `write_posts`
  collection gate.

Scope details that matter in practice:

- **Claims become literals, safely.** `$jwt.sub`, `$jwt.email`,
  `$jwt.name`, and `$jwt.custom.<field>` substitute as *values* into the
  parsed predicate -- claim content can never alter the filter's
  structure, and a missing claim fails closed.
- **Rules compose with AND**, fail-closed: multiple rules all apply.
- **`applies_to`** scopes a rule to `"read"`, `"write"`, or both
  (default). A write-only rule gates mutations without hiding rows.
- **Scope checks also cover point reads and transaction writes.** Point reads re-evaluate
  scope against the entity's actual state, and writes are checked against
  both the before and after state -- so an update cannot move a row into
  or out of your scope to dodge the rule.

## Current limitations (read before shipping)

Honest edges of the extension as it stands today:

- **Policy enforcement is still being hardened.** Ankurah is beta software,
  and the open soundness audit covers check/apply races, remote-commit
  atomicity, and passive replication paths. Treat the current JWT agent as a
  reference implementation rather than an audited security boundary; follow
  [ankurah/ankurah#336](https://github.com/ankurah/ankurah/issues/336).

- **The coarse collection read gate currently accepts a write privilege.**
  `can_access_collection` returns true when a role has either the configured
  `read` or `write` privilege, and fetch/query use that gate. Row scopes still
  apply, but do not treat a nominally write-only role as a confidentiality
  boundary. This belongs to the hardening work in
  [#336](https://github.com/ankurah/ankurah/issues/336).

- **Token expiry has a built-in grace.** Verification uses the JWT
  library's default 15-minute clock-skew tolerance and does not tighten
  it: a token expired less than 15 minutes ago still verifies. Budget
  your token TTLs with that in mind.
- **`iss` and `aud` are not validated.** Signature and (grace-adjusted)
  expiry are checked; issuer and audience claims are ignored. Do not rely
  on audience separation between services sharing a key.
- **RS256 only, PEM only.** No JWKS endpoint support, no `kid`-based key
  selection; rotation means replacing the single active key (clients
  auto-adopt the new public key through the synced `JwtPolicy` entity).
- **Transport handshake is unauthenticated.** The WebSocket connection
  itself carries no credential; the token rides on each request inside
  the protocol, and that is where enforcement happens. Use `wss://` for
  transport privacy.
- **Scope filters use string claims.** Non-string custom claims are
  rejected (fail-closed); there is no array/`in`-style claim matching yet.
- **Token issuance is out of scope.** The extension verifies tokens; your
  login flow (an IdP, or your own endpoint calling `SigningKeys::sign`)
  is up to you.

## Failure modes at a glance

| You did | You get |
|---------|---------|
| Presented a token signed with the wrong key | `ValidationFailed("JWT verification failed: ...")` |
| Queried a scoped collection unauthenticated | `ByPolicy("No authenticated context for row filtering")` |
| Wrote without the collection's write privilege | `CollectionDenied` |
| Wrote a row outside your scope (before or after state) | `ByPolicy("Write outside permitted scope")` |
| Directly fetched an out-of-scope entity through a local/durable context | `ByPolicy("Read outside permitted scope")`; a remote read may instead omit it |
| Tried to write the `jwtpolicy` collection as a non-root user | `ByPolicy("Only privileged contexts may write to jwtpolicy")` |

## Writing your own agent

`PolicyAgent` is a normal trait: implement the hooks above over your own
`ContextData` type if JWTs are not your model. `PermissiveAgent` (allow
everything) and `JwtAgent` (claims-driven RBAC plus row scopes) are the
two shipped reference points, and the
[API reference](../reference/api.md) links to the full trait docs.
