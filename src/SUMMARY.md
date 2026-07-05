# Summary

[What is Ankurah?](what-is-ankurah.md)

# Get Started

- [Quick Start (Template)](getting-started/template.md)
- [Manual Setup](getting-started/manual.md)

# Build Your App

- [Defining Models](models.md)
- [Choosing a Merge Strategy (LWW vs Yrs)](models/merge-strategy.md)
- [Querying Data](queries/index.md)
- [Query Syntax (AnkQL)](queries/syntax.md)
- [Reactivity & Signals](reactivity/index.md)
- [React Bindings](reactivity/react.md)
- [Authentication & Policy](guides/auth.md)
- [Deployment & Operations](guides/deployment.md)

# How It Works

- [Overview](architecture.md)
- [Concurrency: The Mental Model](concurrency/index.md)
- [Conflict Resolution & Guarantees](concurrency/guarantees.md)
- [Glossary](glossary.md)
- [Design Goals](design-goals.md)

# Reference

- [API Reference (docs.rs)](reference/api.md)
- [Examples](examples.md)

# Internals (Contributors)

- [Anatomy of the Engine](concurrency/factorization.md)
- [Event DAG Subsystem](internals/event-dag.md)
- [Causal Comparison: Frontiers and Meets](concurrency/causal-comparison.md)
- [The Compare-Apply Cycle](internals/compare-apply-cycle.md)
- [Event Retrieval and Staging](internals/retrieval.md)
- [Storage Engine Layer](internals/storage-engines.md)
- [Entity Lifecycle](internals/entity-lifecycle.md)
- [Node Architecture and Replication](internals/node-architecture.md)
- [Property Backends](internals/property-backends.md)
- [LWW Merge Resolution](internals/lww-merge.md)
- [Testing Strategy](internals/testing.md)
