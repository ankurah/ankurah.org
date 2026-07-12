// liaison id=react-hooks-imports
import { useEffect, useMemo, useState } from "react";
// liaison end
import {
  initialize_client,
  useObserve,
} from "ankurah-org-example-wasm-bindings";
// liaison id=react-model-imports
import {
  Album,
  ctx,
  AlbumLiveQuery,
  AlbumView,
} from "ankurah-org-example-wasm-bindings";
// liaison end
import "./App.css";

// liaison id=react-signal-observer
export function signalObserver<T>(fc: React.FC<T>): React.FC<T> {
  return (props: T) => {
    const observer = useObserve();
    try {
      return fc(props);
    } finally {
      observer.finish();
    }
  };
}
// liaison end

// liaison id=react-initialize
let clientInitialization: Promise<void> | undefined;

function initializeClientOnce(): Promise<void> {
  clientInitialization ??= initialize_client("ws://localhost:9797");
  return clientInitialization;
}

function useClientReady() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    initializeClientOnce()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, error };
}
// liaison end

// React Component example from the landing page

// liaison id=react-component
interface Props {
  albums: AlbumLiveQuery;
}
/* Bind a React observer to the component. */
const AlbumList = signalObserver(({ albums }: Props) => {
  return (
    <ul>
      {/* Reading items registers this render as a live-query observer. */}
      {albums.items.map((album) => (
        <li key={album.id.to_base64()}>{album.name}</li>
      ))}
    </ul>
  );
});
// liaison end

// liaison id=react-livequery
let albumsQuery: AlbumLiveQuery | undefined;

function queryAlbums(): AlbumLiveQuery {
  albumsQuery ??= Album.query(ctx(), "year > 1985");
  return albumsQuery;
}
// liaison end

// liaison id=react-ready-component
const ReadyAlbums = signalObserver(() => {
  const albums = useMemo(queryAlbums, []);

  return (
    <div>
      <h2>{"Albums (year > 1985)"}</h2>
      <AlbumList albums={albums} />
    </div>
  );
});
// liaison end

// liaison id=react-dynamic-query
export function useAlbumsByArtist(artist: string): AlbumLiveQuery | null {
  const [albums, setAlbums] = useState<AlbumLiveQuery | null>(null);

  useEffect(() => {
    const query = Album.query(ctx(), "artist = ?", artist);
    setAlbums(query);
    return () => query.free();
  }, [artist]);

  return albums;
}
// liaison end

// liaison id=react-create
export async function createAlbum(
  name: string,
  artist: string,
  year: number,
): Promise<AlbumView> {
  const transaction = ctx().begin();
  const album = await Album.create(transaction, { name, artist, year });
  await transaction.commit();
  return album;
}
// liaison end

// liaison id=react-update
export async function renameAlbum(
  album: AlbumView,
  name: string,
): Promise<void> {
  const transaction = ctx().begin();
  album.edit(transaction).name.replace(name);
  await transaction.commit();
}
// liaison end

function App() {
  const { ready, error } = useClientReady();

  // liaison id=react-ready-gate
  const content = ready ? (
    <ReadyAlbums />
  ) : (
    <div className="status">
      Connecting to server at ws://localhost:9797...
    </div>
  );
  // liaison end

  return (
    <div className="app">
      <h1>Ankurah.org Example</h1>
      <p>This example validates the code snippets from the landing page.</p>

      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {content}
    </div>
  );
}

export default App;
