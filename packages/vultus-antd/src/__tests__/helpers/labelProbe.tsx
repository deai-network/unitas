import { screen } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';

/**
 * Probes for a tree widget's `renderLabel`: what `renderLabel` gives is a stateful component, as
 * Praeceptor's ChangingText is. It keeps the label it first showed in its state (`data-first`)
 * and counts its mounts and renders, by its node's value; its text is the label with a mark after
 * it (`"Kör ✱"`), so it is never the label alone. `renderLabel` is one function throughout, as a
 * caller keeps it; `clear()` the counts before each test.
 *
 * A mount is a probe instance (its own ref object) whose mount effect ran: StrictMode's second
 * run of that effect, on the same instance, is not a second mount, while a remount is a new
 * instance. Renders are counted as they come (StrictMode renders twice), for comparing before and
 * after.
 */
export function labelProbes() {
  const seen = new Map<string, { instances: Set<object>; renders: number }>();
  const entry = (value: string) => {
    if (!seen.has(value)) seen.set(value, { instances: new Set(), renders: 0 });
    return seen.get(value)!;
  };
  /** A node's probe's mounts and renders so far. */
  const counts = (value: string) => ({ mounts: entry(value).instances.size, renders: entry(value).renders });
  function Probe({ value, label }: { value: string; label: string }) {
    const [first] = useState(label);
    const self = useRef<object>({});
    entry(value).renders += 1;
    useEffect(() => { entry(value).instances.add(self.current); }, [value]);
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
