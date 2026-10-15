import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOneOfTreeField } from '../useOneOfTreeField.js';
import type { TreeNode } from '../tree.js';

type GeoId = 'geo' | 'sik' | 'kor' | 'ter' | 'alg';

// Geometria (folder) > Síkgeometria > Kör, Térgeometria (disabled); Algebra. Same tree as
// tree.test.ts's 'choosable nodes' geo, with a description added on Kör for valueDescription.
const geo: TreeNode<GeoId>[] = [
  {
    value: 'geo', label: 'Geometria', choosable: false, children: [
      { value: 'sik', label: 'Síkgeometria', children: [{ value: 'kor', label: 'Kör', description: 'A closed curve' }] },
      { value: 'ter', label: 'Térgeometria', disabled: { verdict: true, reason: 'later' } },
    ],
  },
  { value: 'alg', label: 'Algebra' },
];

describe('useOneOfTreeField: initial value', () => {
  it("defaults to the first choosable node in pre-order ('any')", () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo }));
    expect(result.current.type).toBe('oneOfTree');
    expect(result.current.value).toBe('sik');
  });

  it("'leaves': the first leaf that can be chosen", () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, choose: 'leaves' }));
    expect(result.current.value).toBe('kor');
  });

  it('optional, with no initialValue: empty', () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, optional: true }));
    expect(result.current.value).toBe('');
  });

  it('initialValue wins over the implicit default', () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, initialValue: 'alg' }));
    expect(result.current.value).toBe('alg');
  });

  it('empty when no node can be chosen', () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: [{ value: 'x', choosable: false }] }));
    expect(result.current.value).toBe('');
  });
});

describe('useOneOfTreeField: setValue', () => {
  it('sets a node that can be chosen', () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo }));
    act(() => result.current.setValue('kor'));
    expect(result.current.value).toBe('kor');
  });

  it('refuses a folder (choosable: false), with a warning, leaving the value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo }));
    act(() => result.current.setValue('geo'));
    expect(result.current.value).toBe('sik');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Field 'category': node 'geo' cannot be chosen");
    warn.mockRestore();
  });

  it('refuses a disabled node, with a warning naming the reason', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo }));
    act(() => result.current.setValue('ter'));
    expect(result.current.value).toBe('sik');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Field 'category': node 'ter' is disabled — later");
    warn.mockRestore();
  });

  it('refuses a value naming no node, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo }));
    act(() => result.current.setValue('nope' as GeoId));
    expect(result.current.value).toBe('sik');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Field 'category': 'nope' is not one of its nodes");
    warn.mockRestore();
  });

  it("refuses '' when the field is not optional, with a warning", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo }));
    act(() => result.current.setValue(''));
    expect(result.current.value).toBe('sik');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Field 'category': '' is refused — the field is not optional");
    warn.mockRestore();
  });

  it("clear() sets '' when the field is optional", () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, optional: true, initialValue: 'kor' }));
    act(() => result.current.clear());
    expect(result.current.value).toBe('');
  });

  it("clear() is refused when the field is not optional", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, initialValue: 'kor' }));
    act(() => result.current.clear());
    expect(result.current.value).toBe('kor');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Field 'category': '' is refused — the field is not optional");
    warn.mockRestore();
  });

  it("a disabled node with no reason warns with '(no reason)'", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOneOfTreeField({
      id: 'category', initialValue: 'b', nodes: [{ value: 'a', disabled: true }, { value: 'b' }],
    }));
    act(() => result.current.setValue('a' as 'a' | 'b'));
    expect(result.current.value).toBe('b');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Field 'category': node 'a' is disabled — (no reason)");
    warn.mockRestore();
  });
});

describe('useOneOfTreeField: controls', () => {
  it('current, path, onPath, choosable, previous and next, at a nested value', () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, initialValue: 'kor' }));
    expect(result.current.current?.value).toBe('kor');
    expect(result.current.path.map((n) => n.value)).toEqual(['geo', 'sik', 'kor']);
    expect(result.current.byValue.get('geo')?.onPath).toBe(true);
    expect(result.current.byValue.get('sik')?.onPath).toBe(true);
    expect(result.current.byValue.get('kor')?.onPath).toBe(false);
    expect(result.current.byValue.get('kor')?.current).toBe(true);
    expect(result.current.byValue.get('geo')?.choosable).toBe(false);
    expect(result.current.previous?.value).toBe('sik');
    expect(result.current.next?.value).toBe('alg');
  });

  it('next is undefined at the last choosable node', () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, initialValue: 'alg' }));
    expect(result.current.next).toBeUndefined();
  });

  it('previous is undefined at the first choosable node', () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, initialValue: 'sik' }));
    expect(result.current.previous).toBeUndefined();
  });

  it('a value naming no node: current undefined, path empty, previous undefined, next the first', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, value: 'gone' as GeoId, onChange }));
    expect(result.current.current).toBeUndefined();
    expect(result.current.path).toEqual([]);
    expect(result.current.previous).toBeUndefined();
    expect(result.current.next?.value).toBe('sik');
  });

  it("an optional empty value: current undefined, next the first node", () => {
    const { result } = renderHook(() => useOneOfTreeField<GeoId>({ id: 'category', nodes: geo, optional: true, value: '', onChange: vi.fn() }));
    expect(result.current.current).toBeUndefined();
    expect(result.current.next?.value).toBe('sik');
  });

  it("a current that cannot itself be chosen (outside storage naming a disabled node) still gets its true neighbours", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, value: 'ter' as GeoId, onChange }));
    expect(result.current.current?.value).toBe('ter');
    expect(result.current.previous?.value).toBe('kor');
    expect(result.current.next?.value).toBe('alg');
  });
});

describe('useOneOfTreeField: valueDescription', () => {
  it("the current node's description, unless valueDescriptions words it differently", () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, initialValue: 'kor' }));
    expect(result.current.valueDescription).toBe('A closed curve');
  });

  it('valueDescriptions wins', () => {
    const { result } = renderHook(() => useOneOfTreeField({
      id: 'category', nodes: geo, initialValue: 'kor', valueDescriptions: { kor: 'A round shape' },
    }));
    expect(result.current.valueDescription).toBe('A round shape');
  });
});

describe('useOneOfTreeField: expandedKeys', () => {
  it("default ('selected'): the value's ancestors", () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, initialValue: 'kor' }));
    expect(result.current.expandedKeys).toEqual(['geo', 'sik']);
  });

  it("'top', as the many-of tree's: the roots with children", () => {
    const { result } = renderHook(() => useOneOfTreeField({ id: 'category', nodes: geo, initialValue: 'kor', expand: 'top' }));
    expect(result.current.expandedKeys).toEqual(['geo']);
  });
});
