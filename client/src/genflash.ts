/**
 * Generators that finished since the last call, for the whole map to see and
 * hear. known holds each generator's last progress; one seen for the first
 * time, or reset to nothing by a rematch, flashes nothing.
 */
export function newlyDone(known: number[], gens: number[], ticks: number): number[] {
  const done: number[] = [];
  gens.forEach((g, i) => {
    const was = known[i];
    if (was !== undefined && was < ticks && g >= ticks) done.push(i);
    known[i] = g;
  });
  return done;
}
