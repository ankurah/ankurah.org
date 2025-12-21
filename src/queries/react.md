# Queries in React

Ankurah provides TypeScript bindings that are automatically generated from your Rust model. These bindings include React-friendly APIs for live queries.

## Setup

The WASM bindings package exports everything you need:

```typescript
import {
  Album,           // Generated model class
  AlbumView,       // Read-only view type
  AlbumLiveQuery,  // LiveQuery type for this model
  ctx,             // Get the current context
  useObserve,      // React hook for signal observation
} from "your-wasm-bindings";
```

## Creating Queries

Use the static `.query()` method on any model class:

<pre><code transclude="example/react-app/src/App.tsx#react-livequery">const q: AlbumLiveQuery = Album.query(ctx(), &quot;year &gt; 1985&quot;);</code></pre>

The query returns immediately with a `LiveQuery` object. Results stream in as they become available.

## Signal Observation

Ankurah uses signals for reactivity. To make a React component reactive, wrap it with `signalObserver`:

<pre><code transclude="example/react-app/src/App.tsx#react-component">/* creates and Binds a ReactObserver to the component */
const AlbumList = signalObserver(({ albums }: Props) =&gt; {
  return (
    &lt;ul&gt;
      /* React Observer automatically tracks albums */
      {albums.items.map((album) =&gt; (
        &lt;li&gt;{album.name}&lt;/li&gt;
      ))}
    &lt;/ul&gt;
  );
});</code></pre>

The `signalObserver` wrapper:
1. Creates a reactive observer for the component render
2. Automatically tracks which signals are accessed during render
3. Re-renders the component when those signals change

### How It Works

When you access `albums.items` inside a component wrapped with `signalObserver`, the observer tracks this access. When the live query's results change—whether from local changes or remote sync—the component automatically re-renders.

## Creating Entities

Use a transaction to create new entities:

```typescript
const createRoom = async (name: string) => {
  const transaction = ctx().begin();
  const room = await Room.create(transaction, {
    name: name.trim(),
  });
  await transaction.commit();
  return room;
};
```

## Querying All Entities

Use an empty string to match all entities:

```typescript
// Query for all users
const users = useMemo(() => User.query(ctx(), ""), []);
```

## Memoization

Wrap your queries in `useMemo` to avoid recreating them on every render:

```typescript
const albums = useMemo(() => {
  return Album.query(ctx(), "year > 1985");
}, []); // Empty deps = create once
```

For dynamic queries, include the parameters in the dependency array:

```typescript
const albums = useMemo(() => {
  return Album.query(ctx(), `artist = '${artistName}'`);
}, [artistName]); // Recreate when artistName changes
```

## Reactive State with JsValueMut

For local reactive state that integrates with the signal system:

```typescript
import { JsValueMut, JsValueRead } from "your-wasm-bindings";

// Mutable signal - can be read and written
const selectedRoom = useMemo(() => new JsValueMut<RoomView | null>(null), []);

// Read the current value (tracked by observer)
const room = selectedRoom.get();

// Update the value (triggers re-render)
selectedRoom.set(newRoom);
```

## Complete Example

```typescript
import { useMemo, useEffect } from "react";
import { Room, RoomLiveQuery, ctx, JsValueMut } from "your-wasm-bindings";
import { signalObserver } from "./utils";

interface RoomListProps {
  selectedRoom: JsValueMut<RoomView | null>;
}

export const RoomList = signalObserver(({ selectedRoom }) => {
  // Create a live query for all rooms
  const rooms = useMemo(() => Room.query(ctx(), ""), []);
  
  // Access items - tracked by signalObserver
  const items = rooms.items;
  const currentRoom = selectedRoom.get();

  return (
    <div className="room-list">
      {items.map((room) => (
        <div
          key={room.id.to_base64()}
          className={currentRoom?.id.to_base64() === room.id.to_base64() ? 'selected' : ''}
          onClick={() => selectedRoom.set(room)}
        >
          {room.name}
        </div>
      ))}
    </div>
  );
});
```

## Next Steps

- [Querying Data](index.md) - Overview of fetch vs query
- [Query Syntax](syntax.md) - Full AnkQL syntax reference

