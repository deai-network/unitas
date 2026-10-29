import { screen } from '@testing-library/react';
import { useEffect, useState } from 'react';

/**
 * Probes for a tree widget's `renderLabel`: what `renderLabel` gives is a stateful component, as
 * Praeceptor's ChangingText is. It keeps the label it first showed in its state (`data-first`)
 * and counts its mounts and renders, by its node's value; its text is the label with a mark after
 * it (`"Kör ✱"`), so it is never the label alone. `renderLabel` is one function throughout, as a
 * caller keeps it; `clear()` the counts before each test.
 */
export function labelProbes() {
  const seen = new Map<string, { mounts: number; renders: number }>();
  /** A node's probe's mounts and renders so far. */
  const counts = (value: string) => {
    if (!seen.has(value)) seen.set(value, { mounts: 0, renders: 0 });
    return seen.get(value)!;
  };
  function Probe({ value, label }: { value: string; label: string }) {
    const [first] = useState(label);
    counts(value).renders += 1;
    useEffect(() => { counts(value).mounts += 1; }, [value]);
    return <mark data-testid={`probe-${value}`} data-first={first}>{label} ✱</mark>;
  }
  return {
    renderLabel: (node: { value: string; label: string }) => <Probe value={node.value} label={node.label} />,
    counts,
    /** A node's probe, as drawn. */
    probeOf: (value: string) => screen.getByTestId(`probe-${value}`),
    clear: () => seen.clear(),
  };
}
