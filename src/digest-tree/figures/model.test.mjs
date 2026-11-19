import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  comparisonState,
  orderAlbums,
  includes,
  transactionState,
  liveTrees,
} from "./model.mjs";

const traces = JSON.parse(
  await readFile(new URL("./trace.json", import.meta.url), "utf8"),
).cases;

test("the replay reports the actual Rust results only after comparison completes", () => {
  for (const [name, calls, payloads, differences] of [
    ["equal", 1, 0, 0],
    ["added", 2, 10, 1],
    ["changed", 4, 64, 1],
    ["both", 4, 74, 2],
  ]) {
    const trace = traces.find((t) => t.id === name);
    assert.equal(trace.rounds.length, calls);
    assert.equal(comparisonState(trace, 0).differences, null);
    const done = comparisonState(trace, calls);
    assert.equal(done.received, payloads);
    assert.equal(done.differences.length, differences);
    for (const difference of done.differences)
      assert.equal(done.states.get(difference.id), "found");
  }
});

test("descending year order preserves ascending ID ties and explicit null placement", () => {
  const ordered = orderAlbums("desc", "last");
  assert.deepEqual(
    ordered.filter((a) => a.year === 2013).map((a) => a.id),
    [2, 3],
  );
  assert.equal(ordered.at(-1).year, null);
  assert.equal(orderAlbums("asc", "first")[0].year, null);
});

test("range endpoints include all ties and a whole-tree view retains the missing value", () => {
  const ordered = orderAlbums("asc", "last");
  assert.deepEqual(
    ordered
      .filter((a) => includes(a, 2013, 2013, true, false))
      .map((a) => a.id),
    [2, 3],
  );
  assert.equal(
    ordered.filter((a) => includes(a, 2013, 2013, false, false)).length,
    0,
  );
  assert.equal(
    ordered.filter((a) => includes(a, 2010, 2016, true, false)).length,
    4,
  );
  assert.equal(
    ordered.filter((a) => includes(a, 2010, 2016, true, true)).length,
    8,
  );
});

test("the commit illustration never publishes half the transaction or cache changes before commit", () => {
  for (const outcome of ["commit", "rollback", "conflict"])
    for (let step = 0; step <= 4; step++) {
      const state = transactionState(outcome, step);
      assert.equal(state.entity, state.tree);
      if (step < 3 || outcome !== "commit") assert.equal(state.entity, "A");
      if (step < 4 || outcome !== "commit") assert.equal(state.landed, false);
    }
  assert.equal(transactionState("commit", 4).landed, true);
});

test("LRU eviction leaves a view or stream owning A; a weak reference alone does not", () => {
  const state = { retained: "b", createdB: true, view: true, stream: false };
  assert.deepEqual(liveTrees(state), { a: true, b: true });
  assert.deepEqual(liveTrees({ ...state, view: false, stream: true }), {
    a: true,
    b: true,
  });
  assert.deepEqual(liveTrees({ ...state, view: false }), { a: false, b: true });
});
