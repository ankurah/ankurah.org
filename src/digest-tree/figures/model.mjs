// Presentation state for the explainers. Comparison results come from Rust traces.
const rangeIds = (range) =>
  range.first === null
    ? []
    : Array.from(
        { length: range.last - range.first + 1 },
        (_, i) => range.first + i,
      );
export function comparisonState(trace, step) {
  const states = new Map();
  let received = 0;
  for (const round of trace.rounds.slice(0, step))
    for (const answer of round.answers) {
      if (answer.kind === "digests")
        for (const part of answer.parts)
          for (const id of rangeIds(part.range))
            states.set(id, part.equal ? "equal" : "pending");
      else {
        for (const id of rangeIds(answer.range)) states.set(id, "read");
        received += answer.members;
      }
    }
  const complete = step === trace.rounds.length;
  if (complete)
    for (const difference of trace.differences)
      states.set(difference.id, "found");
  return {
    states,
    received,
    complete,
    requests: step,
    differences: complete ? trace.differences : null,
  };
}

export const albums = [
  { id: 1, year: 2008, title: "Walking on a Dream" },
  { id: 2, year: 2013, title: "Ice on the Dune" },
  { id: 3, year: 2013, title: "A second album" },
  { id: 4, year: 2016, title: "Two Vines" },
  { id: 5, year: null, title: "An undated recording" },
  { id: 6, year: 2001, title: "An early record" },
  { id: 7, year: 2020, title: "A later release" },
  { id: 8, year: 2010, title: "The interval begins" },
];
export function orderAlbums(direction, nulls) {
  return [...albums].sort((a, b) => {
    if (a.year === null || b.year === null)
      return a.year === b.year
        ? a.id - b.id
        : (a.year === null ? -1 : 1) * (nulls === "first" ? 1 : -1);
    return (a.year - b.year) * (direction === "asc" ? 1 : -1) || a.id - b.id;
  });
}
export const includes = (album, from, to, inclusive, all) =>
  all ||
  (album.year !== null &&
    album.year >= from &&
    (inclusive ? album.year <= to : album.year < to));

export function transactionState(outcome, step) {
  const committed = outcome === "commit" && step >= 3;
  return {
    entity: committed ? "B" : "A",
    tree: committed ? "B" : "A",
    landed: committed && step === 4,
    pending: step === 2,
  };
}

export function liveTrees(state) {
  return {
    a: state.retained === "a" || state.view || state.stream,
    b: state.createdB && state.retained === "b",
  };
}
