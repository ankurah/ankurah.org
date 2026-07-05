# Quick Start (Template)

Generate a new Ankurah app with
[`cargo-generate`](https://github.com/cargo-generate/cargo-generate) — pick your
frontend:

- **Leptos** — `cargo generate https://github.com/ankurah/leptos-template`
- **React** — `cargo generate https://github.com/ankurah/react-template`

Both scaffold the same Rust server and models with a live-syncing chat UI and
differ only in the frontend. The durable node uses the **Sled** storage engine
by default.

> A **Postgres** storage option — the durable node backed by a Postgres
> container — is on the way.

## Run it

```bash
cd your-project-name
./dev.sh
```

`dev.sh` builds the server and frontend and starts them on randomized local
ports — open the URL it prints. Stop with `./dev.sh --stop` (`--status`,
`--logs`, and `--restart` are also available).

To see real-time synchronization in action, open the app in one regular browser
tab and one incognito tab: the incognito tab gets its own IndexedDB store, so
the two tabs behave as two independent nodes syncing through your server.

> **Tip:** A React Native template also exists at
> [`ankurah/react-native-template`](https://github.com/ankurah/react-native-template).
>
> **Need help?** Join the [Ankurah Discord](https://discord.gg/XMUUxsbT5S)!

## Next Steps

- [Defining Models](../models.md) -- describe your data
- [Querying Data](../queries/index.md) -- fetch and live-query it
- [Manual Setup](manual.md) -- if you cannot use the template, or want to see
  every moving part
