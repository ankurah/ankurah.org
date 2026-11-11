# Querying Several Components

> **0.10 preview.** This page describes behavior on Ankurah's `main` branch.
> It is not in a published release yet.

An entity can have more than one [component](../glossary.md#component): the
same entity can be a task and also an assignment. Each component has its own
model struct and its own View. A query typed by one View can filter and sort
only by that component's properties, and returns only that View. To filter by
the properties of several components of one entity, and to get a View of each
back, type the query by a tuple of Views.

The examples on this page use two components:

```rust,ignore
#[derive(Model, Debug, Clone)]
pub struct Task {
    pub title: String,
    pub status: String,
}

#[derive(Model, Debug, Clone)]
pub struct Assignment {
    pub assignee: String,
}
```

## A Tuple of Views

```rust,ignore
let pairs = ctx.fetch::<(TaskView, AssignmentView)>("status = 'open' AND assignee = 'ada'").await?;
for (task, assignment) in &pairs {
    println!("{} is assigned to {}", task.title()?, assignment.assignee()?);
}
```

The query matches the entities that have **every** component in the tuple and
returns one View of each, all of the same entity. A task that has no
assignment is not in the result, and neither is an assignment that is not a
task.

`query()` takes the same types, and the live query follows changes to any of
the components:

```rust,ignore
let live = ctx.query::<(TaskView, AssignmentView)>("status = 'open' ORDER BY assignee")?;
```

A tuple has two to twelve members. A member may itself be a tuple, so
`((TaskView, AssignmentView), ClosureView)` is also a query type. Tuples are for
Rust callers: the JavaScript and UniFFI bindings query one View at a time.

## Naming Properties

A property name without a qualifier is looked up in the components of the
tuple. In the query above, `status` is Task's and `assignee` is Assignment's,
and neither needs a qualifier.

If two components of the tuple declare the same name as different properties,
the bare name is refused and the error says to qualify it. Write the component
before the property, joined by `::` with no spaces:

```text
Task::note = 'call back'
Assignment::note = 'call back'
```

The qualifier is the model struct's name (`Assignment`) or its label
(`assignment`). Two components that declare a name as one shared property, by
giving it the same explicit property id, do not collide: the bare name
resolves.

A qualifier can also name a component that is not in the tuple, by its label.
With a third component `Closure` that has a `closed_at` property:

```text
closure::closed_at IS NULL
```

A match may lack that component. Its properties then read as missing on that
entity: `IS NULL` is true and a comparison never matches. A qualifier says
which property is meant; it does not require the entity to have the component.
To require it, add its View to the tuple, or test membership with
`memberof('closure')`.

Three more rules:

- `id` is the entity's id under any qualifier.
- An `ORDER BY` key must belong to a component in the tuple.
- In a tuple query a dot only ever starts a path into a JSON property. A query
  typed by one View still accepts its own label before a dot (`album.name`).

A name the components do not declare, an ambiguous name, an unknown qualifier
and a sort key outside the tuple are each refused with a typed
`RetrievalError::ComponentScope` error. A live query refuses a name its
components do not declare as soon as it is created.

## Seeing an Entity Through Another Component

When you already hold a View, `cast` gives you the same entity through another
component's View:

```rust,ignore
let task: TaskView = ctx.get(task_id).await?;
let assignment: AssignmentView = task.cast()?;
```

`cast` fails if the entity does not have that component. It also fails if this
node has not yet used that component's model; a query on the View binds it.

## Current Limits

- No typed call gives an existing entity another component yet. That design is
  tracked in [issue 412](https://github.com/ankurah/ankurah/issues/412).
- Every member of a tuple is required. A member that may be absent is not
  supported yet.
