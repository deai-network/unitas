// A field's default is its initial value as the field shows it: made fit for the definition as it
// is now. A many-of default naming a choice not offered now (Praeceptor's notes filter: every
// category any edition shows at first, in an edition without one of them) shows without it, and
// writing that shown value back must leave no key, as at first.
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { memoryStore, type ArgStore } from '../argStore.js';
import { ArgStoreProvider } from '../ArgStoreContext.js';
import { initialValueOf, type FieldDefinition } from '../kinds.js';
import { useFieldGroup } from '../useFieldGroup.js';
import { useStoredField } from '../useStoredField.js';

const notes: FieldDefinition = {
  kind: 'manyOf', id: 'notes', choices: [{ value: 'note' }, { value: 'london' }], initialValue: ['note', 'afterword'],
};

function storing(store: ArgStore) {
  return ({ children }: { children?: ReactNode }) => <ArgStoreProvider store={store}>{children}</ArgStoreProvider>;
}

describe('a default naming a choice the field does not offer now', () => {
  it('the default is the initial value without the choices not offered now, and follows them', () => {
    const byEdition: FieldDefinition = {
      kind: 'manyOf', id: 'notes', initialValue: ['note', 'afterword'],
      choices: (ctx: { edition: string }) => ctx.edition === 'hu'
        ? [{ value: 'note' }, { value: 'afterword' }]
        : [{ value: 'note' }],
    };
    expect(initialValueOf(byEdition, { edition: 'en' })).toEqual(['note']);
    expect(initialValueOf(byEdition, { edition: 'hu' })).toEqual(['note', 'afterword']);
  });

  it('group, at first: shows the default narrowed to the choices, as its default', () => {
    const store = memoryStore({});
    const { result } = renderHook(() => useFieldGroup([notes], { stored: true }), { wrapper: storing(store) });
    expect(result.current.values.notes).toEqual(['note']);
    expect(result.current.isDefault('notes')).toBe(true);
  });

  it('group: the value shown at first, written back, leaves no key', () => {
    const store = memoryStore({});
    const { result } = renderHook(() => useFieldGroup([notes], { stored: true }), { wrapper: storing(store) });
    act(() => result.current.byId.notes.setValue(['note', 'london']));
    expect(store.read('notes')).toBe('london,note');
    act(() => result.current.byId.notes.setValue(['note']));
    expect(store.read('notes')).toBeUndefined();
    expect(result.current.isDefault('notes')).toBe(true);
  });

  it('a stored field alone (useStoredField, argOf): the value shown at first, written back, leaves no key', () => {
    const store = memoryStore({});
    const { result } = renderHook(() => useStoredField(notes), { wrapper: storing(store) });
    expect(result.current.options.value).toEqual(['note']);
    act(() => result.current.options.onChange(['note', 'london']));
    act(() => result.current.options.onChange(['note']));
    expect(store.read('notes')).toBeUndefined();
    expect(result.current.isDefault).toBe(true);
  });

  it('a stored field alone: a reset removes the key, and the field shows the narrowed default', () => {
    const store = memoryStore({ notes: 'london' });
    const { result } = renderHook(() => useStoredField(notes), { wrapper: storing(store) });
    expect(result.current.isDefault).toBe(false);
    act(() => result.current.reset());
    expect(store.read('notes')).toBeUndefined();
    expect(result.current.options.value).toEqual(['note']);
    expect(result.current.isDefault).toBe(true);
  });
});

describe('a number default outside the bounds', () => {
  const copies: FieldDefinition = { kind: 'numeric', id: 'copies', min: 1, max: 10, initialValue: 15 };

  it('is clamped as the field shows it, and written back leaves no key', () => {
    expect(initialValueOf(copies, {})).toBe(10);
    const store = memoryStore({});
    const { result } = renderHook(() => useFieldGroup([copies], { stored: true }), { wrapper: storing(store) });
    expect(result.current.values.copies).toBe(10);
    act(() => result.current.byId.copies.setValue(3));
    expect(store.read('copies')).toBe('3');
    act(() => result.current.byId.copies.setValue(10));
    expect(store.read('copies')).toBeUndefined();
    expect(result.current.isDefault('copies')).toBe(true);
  });
});
