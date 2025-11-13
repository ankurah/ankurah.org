# Ankurah.org Example

This example validates all the code snippets shown on the [ankurah.org](https://ankurah.org) landing page.

## Structure

- `model/` - Album data model (Schema-First Design example)
- `server/` - Rust server with Sled storage (Server example)
- `wasm-bindings/` - WASM bindings for browser (Client example)
- `react-app/` - React app with live queries (React Component example)

## Quick Start

```bash
# Build and test everything
./build-test.sh

# Run the development environment
./dev.sh
```

This will start:

- Server on `ws://localhost:9797`
- React app on `http://localhost:5173`

## Code Examples

All code on the landing page is implemented here:

1. **Schema-First Design** - `model/src/lib.rs`
2. **Reactive Queries** - `wasm-bindings/src/lib.rs` (Rust), `react-app/src/App.tsx` (TypeScript)
3. **Server Setup** - `server/src/main.rs`
4. **Client Setup** - `wasm-bindings/src/lib.rs`
5. **React Component** - `react-app/src/App.tsx`

## Dependencies

- Rust (with `cargo`)
- `wasm-pack` - Install: `curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh`
- `bun` - Install: `curl -fsSL https://bun.sh/install | bash`
- `cargo-watch` (optional, for dev.sh) - Install: `cargo install cargo-watch`




