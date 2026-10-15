import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useManyOfTreeField } from '../useManyOfTreeField.js';
import type { TreeNode } from '../tree.js';
import { FieldContextProvider } from '../FieldContext.js';

type Id = 'A' | 'A1' | 'A2' | 'A2a' | 'A2b' | 'B' | 'B1';

// A(A1, A2(A2a, A2b)), B(B1)
const NODES: TreeNode<Id>[] = [
  { value: 'A', children: [{ value: 'A1' }, { value: 'A2', children: [{ value: 'A2a' }, { value: 'A2b' }] }] },
  { value: 'B', children: [{ value: 'B1' }] },
];

function providing(value: object) {
  return ({ children }: { children?: ReactNode }) => <FieldContextProvider value={value}>{children}</FieldContextProvider>;
}

describe('useManyOfTreeField: value inside the field', () => {
  it('starts at [] with the topmost selection', () => {
    const { result } = renderHook(() => useManyOfTreeField({ id: 'topics', nodes: NODES }));
    expect(result.current.type).toBe('manyOfTree');
    expect(result.current.value).toEqual([]);
    expect(result.current.selection).toBe('topmost');
  });

  it('toggling a leaf of a checked node keeps its siblings', () => {
    const { result } = renderHook(() => useManyOfTreeField({ id: 'topics', nodes: NODES, initialValue: ['A'] }));
    act(() => result.current.toggle('A2b'));
    expect(result.current.value).toEqual(['A1', 'A2a']);
    act(() => result.current.toggle('A2b'));
    expect(result.current.value).toEqual(['A']);
  });

  it('setValue normalizes the requested list', () => {
    const { result } = renderHook(() => useManyOfTreeField({ id: 'topics', nodes: NODES }));
    act(() => result.current.setValue(['B1', 'A2b', 'A1', 'A2a']));
    expect(result.current.value).toEqual(['A', 'B']);
  });

  it('shows the initial value normalized', () => {
    const { result } = renderHook(() => useManyOfTreeField({ id: 'topics', nodes: NODES, initialValue: ['A1', 'A'] }));
    expect(result.current.value).toEqual(['A']);
  });

  it('keeps the same value object across renders while it is already normalized', () => {
    const { result, rerender } = renderHook(() => useManyOfTreeField({ id: 'topics', nodes: NODES, initialValue: ['A1'] }));
    const first = result.current.value;
    rerender();
    expect(result.current.value).toBe(first);
  });

  it('falls back to [] when a context-function initialValue resolves to undefined', () => {
    const { result } = renderHook(() => useManyOfTreeField({
      id: 'topics', nodes: NODES, initialValue: (ctx: { preset?: Id[] }) => ctx.preset as Id[],
    }), { wrapper: providing({ preset: undefined }) });
    expect(result.current.value).toEqual([]);
  });
});

describe('useManyOfTreeField: the other selections', () => {
  it('leaves: toggling a node whose leaves are all in the value clears them', () => {
    const { result } = renderHook(() => useManyOfTreeField({
      id: 'topics', nodes: NODES, selection: 'leaves', initialValue: ['A1', 'A2a', 'A2b'],
    }));
    expect(result.current.byValue.get('A')?.checked).toBe(true);
    act(() => result.current.toggle('A'));
    expect(result.current.value).toEqual([]);
    act(() => result.current.toggle('A2'));
    expect(result.current.value).toEqual(['A2a', 'A2b']);
  });

  it('all: toggling a node lists it with its descendants', () => {
    const { result } = renderHook(() => useManyOfTreeField({ id: 'topics', nodes: NODES, selection: 'all' }));
    act(() => result.current.toggle('B'));
    expect(result.current.value).toEqual(['B', 'B1']);
  });

  it('independent: toggling adds or removes just the node', () => {
    const { result } = renderHook(() => useManyOfTreeField({
      id: 'topics', nodes: NODES, selection: 'independent', initialValue: ['A'],
    }));
    act(() => result.current.toggle('A1'));
    expect(result.current.value).toEqual(['A', 'A1']);
    expect(result.current.byValue.get('A2')?.checked).toBe(false);
    act(() => result.current.toggle('A'));
    expect(result.current.value).toEqual(['A1']);
  });
});

describe('useManyOfTreeField: disabled and unknown nodes', () => {
  it('toggling a disabled node is ignored with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useManyOfTreeField({
      id: 'topics', initialValue: ['A'],
      nodes: [{ value: 'A', children: [{ value: 'A1', disabled: { verdict: true, reason: 'Locked' } }, { value: 'A2' }] }],
    }));
    act(() => result.current.toggle('A1'));
    expect(result.current.value).toEqual(['A']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Field 'topics': node 'A1' is disabled — Locked");
    warn.mockRestore();
  });

  it('a checked parent does not check its disabled child; checking its only enabled child checks the parent (as antd)', () => {
    const { result } = renderHook(() => useManyOfTreeField({
      id: 'topics',
      nodes: [{ value: 'geometria', children: [{ value: 'sikgeometria' }, { value: 'tergeometria', disabled: { verdict: true, reason: 'Later' } }] }],
    }));
    act(() => result.current.toggle('sikgeometria'));
    expect(result.current.value).toEqual(['geometria']);
    expect(result.current.byValue.get('geometria')?.checked).toBe(true);
    expect(result.current.byValue.get('sikgeometria')?.checked).toBe(true);
    expect(result.current.byValue.get('tergeometria')?.checked).toBe(false);
    act(() => result.current.toggle('geometria'));
    expect(result.current.value).toEqual([]);
  });

  it('setValue does not police disabled nodes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useManyOfTreeField({
      id: 'topics',
      nodes: [{ value: 'A', children: [{ value: 'A1', disabled: true }, { value: 'A2' }] }],
    }));
    act(() => result.current.setValue(['A1']));
    expect(result.current.value).toEqual(['A1']);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('toggling an unknown node is ignored with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useManyOfTreeField({ id: 'topics', nodes: NODES }));
    act(() => result.current.toggle('zz' as Id));
    expect(result.current.value).toEqual([]);
    expect(warn).toHaveBeenCalledWith("Field 'topics': 'zz' is not one of its nodes");
    warn.mockRestore();
  });

  it('a value the field holds that is no longer among the nodes is kept when toggling another', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useManyOfTreeField({
      id: 'topics', nodes: NODES, value: ['gone', 'A'] as Id[], onChange,
    }));
    expect(result.current.value).toEqual(['A', 'gone']);
    act(() => result.current.toggle('B1'));
    expect(onChange).toHaveBeenCalledWith(['A', 'B', 'gone']);
  });
});

describe('useManyOfTreeField: node controls', () => {
  it('the descendants of a value node are checked', () => {
    const { result } = renderHook(() => useManyOfTreeField({ id: 'topics', nodes: NODES, initialValue: ['A2'] }));
    const checked = (id: Id) => result.current.byValue.get(id)?.checked;
    expect(['A', 'A1', 'A2', 'A2a', 'A2b', 'B', 'B1'].map((id) => checked(id as Id)))
      .toEqual([false, false, true, true, true, false, false]);
    expect(result.current.nodes[0].children?.[1].children?.[0]).toBe(result.current.byValue.get('A2a'));
  });

  it('nodes carry their note and dimmed', () => {
    const { result } = renderHook(() => useManyOfTreeField({
      id: 'topics',
      nodes: [{ value: 'A', note: '12 · 8%', children: [{ value: 'A1', note: '0', dimmed: true }] }],
    }));
    const [a] = result.current.nodes;
    expect(a).toMatchObject({ value: 'A', label: 'A', note: '12 · 8%', dimmed: false, checked: false });
    expect(a.children?.[0]).toMatchObject({ value: 'A1', note: '0', dimmed: true, children: undefined });
  });

  it('nodes as a context function', () => {
    const { result } = renderHook(() => useManyOfTreeField({
      id: 'topics',
      nodes: (ctx: { roots: TreeNode<Id>[] }) => ctx.roots,
      initialValue: ['B1'],
    }), { wrapper: providing({ roots: NODES }) });
    expect(result.current.value).toEqual(['B']);
    expect(result.current.nodes.map((n) => n.value)).toEqual(['A', 'B']);
  });
});

describe('useManyOfTreeField: expandedKeys', () => {
  it('top (default): the roots with children', () => {
    const { result } = renderHook(() => useManyOfTreeField({
      id: 'topics', nodes: [...NODES, { value: 'C' as Id }],
    }));
    expect(result.current.expandedKeys).toEqual(['A', 'B']);
  });

  it('none: nothing', () => {
    const { result } = renderHook(() => useManyOfTreeField({ id: 'topics', nodes: NODES, expand: 'none' }));
    expect(result.current.expandedKeys).toEqual([]);
  });

  it("selected: the ancestors of the value's nodes", () => {
    const { result } = renderHook(() => useManyOfTreeField({
      id: 'topics', nodes: NODES, expand: 'selected', initialValue: ['A2a', 'B'],
    }));
    expect(result.current.expandedKeys).toEqual(['A', 'A2']);
  });

  it('all: every node with children', () => {
    const { result } = renderHook(() => useManyOfTreeField({ id: 'topics', nodes: NODES, expand: 'all' }));
    expect(result.current.expandedKeys).toEqual(['A', 'A2', 'B']);
  });
});
