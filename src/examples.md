# Examples

This page contains practical code examples demonstrating key Ankurah features.

## Inter-Node Subscription

This example shows how to set up a server and client node, connect them, and subscribe to changes:

```rust
use ankurah::prelude::*;
use ankurah_storage_sled::SledStorageEngine;
use ankurah_connector_local_process::LocalProcessConnection;

// Create server node with durable storage
let server = Node::new_durable(
    Arc::new(SledStorageEngine::new_test()?),
    PermissiveAgent::new()
);

// Initialize a new "system" (only done once on first startup)
server.system.create()?;

// Create a context for the server
let server = server.context(context_data)?;

// Create client node
let client = Node::new(
    Arc::new(SledStorageEngine::new_test()?),
    PermissiveAgent::new()
);

// Connect nodes using local process connection
let _conn = LocalProcessConnection::new(&server, &client).await?;

// Wait for the client to join the server "system"
client.system.wait_system_ready().await;
let client = client.context(context_data)?;

// Subscribe to changes on the client
let subscription = client.subscribe::<_,_,AlbumView>(
    "name = 'Origin of Symmetry'",
    |changes| {
        println!("Received changes: {}", changes);
    }
).await?;

// Create a new album on the server
let trx = server.begin();
let album = trx.create(&Album {
    name: "Origin of Symmetry".into(),
    year: "2001".into(),
}).await?;
trx.commit().await?;

// The subscription callback will fire automatically!
```

## Defining a Model

Models define the schema for your entities:

```rust
use ankurah::prelude::*;

// Define your model
#[derive(Model, Clone, Debug)]
struct BlogPost {
    title: String,
    content: String,
    author: String,
    published: bool,
    tags: Vec<String>,
}

// This automatically generates:
// - BlogPostView (read-only)
// - BlogPostMutable (for updates)
```

## Creating Entities

```rust
// Start a transaction
let trx = context.begin();

// Create a new entity
let post = trx.create(&BlogPost {
    title: "Getting Started with Ankurah".into(),
    content: "Ankurah makes distributed state management easy...".into(),
    author: "Alice".into(),
    published: true,
    tags: vec!["tutorial".into(), "rust".into()],
}).await?;

// Commit the transaction
trx.commit().await?;

println!("Created post with ID: {}", post.id());
```

## Reading Entities

```rust
// Get a view of the entity (read-only)
let view: BlogPostView = post.view()?;

println!("Title: {}", view.title);
println!("Author: {}", view.author);
println!("Published: {}", view.published);
```

## Updating Entities

```rust
// Start a transaction
let trx = context.begin();

// Get a mutable handle
let mut mutable: BlogPostMutable = post.mutable(&trx)?;

// Update fields
mutable.title.set("Updated: Getting Started with Ankurah");
mutable.published.set(true);

// Commit changes
trx.commit().await?;
```

## Querying with Subscriptions

Subscriptions let you receive real-time updates for entities matching a query:

```rust
// Subscribe to all published posts
let sub = context.subscribe::<_,_,BlogPostView>(
    "published = true",
    |changes| {
        for change in changes.created {
            println!("New published post: {}", change.view.title);
        }
        for change in changes.updated {
            println!("Updated post: {}", change.view.title);
        }
    }
).await?;

// Subscribe with complex queries
let sub = context.subscribe::<_,_,BlogPostView>(
    "published = true AND author = 'Alice' AND tags CONTAINS 'rust'",
    |changes| {
        println!("Alice published a new Rust post!");
    }
).await?;
```

## Using Signals in React

Ankurah provides React hooks for reactive UI updates:

```typescript
import { useQuery, useEntity } from "ankurah-react";

function BlogPostList() {
  // Subscribe to all published posts
  const posts = useQuery<BlogPost>("BlogPost", "published = true");

  return (
    <div>
      {posts.map((post) => (
        <BlogPostCard key={post.id} postId={post.id} />
      ))}
    </div>
  );
}

function BlogPostCard({ postId }) {
  // Subscribe to a specific entity
  const post = useEntity<BlogPost>(postId);

  if (!post) return <div>Loading...</div>;

  return (
    <div>
      <h2>{post.title}</h2>
      <p>By {post.author}</p>
      <p>{post.content}</p>
    </div>
  );
}
```

## WebSocket Client Setup (WASM)

Connect a browser client to a server:

```rust
use ankurah_wasm::*;
use ankurah_connector_websocket_client_wasm::*;

// Create a client node with IndexedDB storage
let storage = IndexedDBStorageEngine::new("my-app").await?;
let client = Node::new(Arc::new(storage), PermissiveAgent::new());

// Connect to server via WebSocket
let ws = WebSocketClientWasm::connect(
    "ws://localhost:8080",
    &client
).await?;

// Wait for system to be ready
client.system.wait_system_ready().await;

// Now you can use the client normally
let context = client.context(user_data)?;
```

## Transaction Error Handling

```rust
use ankurah::error::Result;

async fn create_post_with_validation(
    context: &Context,
    title: &str,
    content: &str,
) -> Result<Entity> {
    // Validate input
    if title.is_empty() {
        return Err(AnkurahError::validation("Title cannot be empty"));
    }

    let trx = context.begin();

    // Create the post
    let post = trx.create(&BlogPost {
        title: title.into(),
        content: content.into(),
        author: "System".into(),
        published: false,
        tags: vec![],
    }).await?;

    // Commit (or automatically rollback on error)
    trx.commit().await?;

    Ok(post)
}
```

## Working with Collections

```rust
// Get a collection reference
let posts = context.collection::<BlogPost>("BlogPost");

// Count entities
let count = posts.count().await?;
println!("Total posts: {}", count);

// Iterate all entities (careful with large collections!)
let all_posts = posts.all().await?;
for post in all_posts {
    let view: BlogPostView = post.view()?;
    println!("- {}", view.title);
}
```

## Custom Storage Backend

```rust
use ankurah::storage::*;

// Create nodes with different backends

// Sled (embedded KV)
let node = Node::new(
    Arc::new(SledStorageEngine::new("./data")?),
    agent
);

// Postgres
let node = Node::new(
    Arc::new(PostgresStorageEngine::connect("postgresql://...").await?),
    agent
);

// IndexedDB (WASM only)
let node = Node::new(
    Arc::new(IndexedDBStorageEngine::new("my-app").await?),
    agent
);
```

## Next Steps

- Check out the [Getting Started](getting-started.md) guide for step-by-step setup
- Review the [Glossary](glossary.md) to understand key terms
- Study the [Architecture](architecture.md) to see how it all fits together
- Join the [Discord](https://discord.gg/XMUUxsbT5S) to discuss your use case!
