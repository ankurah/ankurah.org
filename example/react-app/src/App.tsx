import { useEffect, useMemo, useState } from 'react';
import { initialize_client, Album, useObserve, ctx } from 'ankurah-org-example-wasm-bindings';
import './App.css';

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

// React Component example from the landing page
// liaison id=react-component
export const AlbumList = signalObserver(() => {
    const albums = useMemo(() =>
        Album.query(ctx(), "year > 1985")
        , []);

    return (
        <ul>
            {albums.items.map(album => (
                <li>{album.name}
                    ({album.year})</li>
            ))}
        </ul>
    );
});
// liaison end

function App() {
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        initialize_client('ws://localhost:9797')
            .then(() => {
                console.log('✓ Client initialized');
                setReady(true);
            })
            .catch(err => {
                console.error('Failed to initialize client:', err);
                setError(String(err));
            });
    }, []);

    return (
        <div className="app">
            <h1>Ankurah.org Example</h1>
            <p>This example validates the code snippets from the landing page.</p>

            {error && (
                <div className="error">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {ready ? (
                <div>
                    <h2>Albums (year &gt; 1985)</h2>
                    <AlbumList />
                </div>
            ) : (
                <div className="status">
                    Connecting to server at ws://localhost:9797...
                </div>
            )}
        </div>
    );
}

export default App;

