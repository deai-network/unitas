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
import { useStoredField, useStoredFields } from '../useStoredField.js';

const notes: FieldDefinition = {
  kind: 'manyOf', id: 'notes', choices: [{ value: 'note' }, { value: 'london' }], initialValue: ['note', 'afterword'],
};

function storing(store: ArgStore) {
  return ({ children }: { children?: ReactNode }) => <ArgStoreProvider store={store}>{children}</ArgStoreProvider>;
}

/** A memory store whose hrefFor gives the query a write of the changes would leave, as a URL store's link does. */
function linkingStore(initial: Record<string, string> = {}): ArgStore & { snapshot(): Record<string, string> } {
  const store = memoryStore(initial);
  return {
    ...store,
    hrefFor(changes) {
      const next = store.snapshot();
      for (const { key, raw } of changes) {
        if (raw === undefined) delete next[key];
        else next[key] = raw;
      }
      return `?${new URLSearchParams(next).toString()}`;
    },
  };
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

  it('guard, the precondition: a group at first shows the default narrowed to the choices, as its default', () => {
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

  it('guard, reset: a stored field alone resets by removing the key, and shows the narrowed default', () => {
    const store = memoryStore({ notes: 'london' });
    const { result } = renderHook(() => useStoredField(notes), { wrapper: storing(store) });
    expect(result.current.isDefault).toBe(false);
    act(() => result.current.reset());
    expect(store.read('notes')).toBeUndefined();
    expect(result.current.options.value).toEqual(['note']);
    expect(result.current.isDefault).toBe(true);
  });

  it('stored fields (useStoredFields): a stored value equal to the narrowed default counts as default', () => {
    const store = memoryStore({ notes: 'note' });
    const { result } = renderHook(() => useStoredFields([notes]), { wrapper: storing(store) });
    expect(result.current.isDefault('notes')).toBe(true);
    expect(result.current.changedCount).toBe(0);
    act(() => store.write([{ key: 'notes', raw: 'london' }], 'replace'));
    expect(result.current.isDefault('notes')).toBe(false);
    expect(result.current.changedCount).toBe(1);
  });
});

describe('a stored group whose notes choices follow its edition field', () => {
  const edition: FieldDefinition = { kind: 'oneOf', id: 'edition', choices: [{ value: 'en' }, { value: 'hu' }] };
  // The afterword is a choice only in the 'hu' edition; the default names it in every edition.
  const notesByEdition: FieldDefinition = {
    kind: 'manyOf', id: 'notes', initialValue: ['note', 'afterword'],
    choices: (ctx: { values: { edition: string } }) => ctx.values.edition === 'hu'
      ? [{ value: 'note' }, { value: 'afterword' }]
      : [{ value: 'note' }],
  };
  const FIELDS = [edition, notesByEdition];

  it('in the edition without the afterword, the shown default written back leaves no key', () => {
    const store = linkingStore();
    const { result } = renderHook(() => useFieldGroup(FIELDS, { stored: true }), { wrapper: storing(store) });
    expect(result.current.values.notes).toEqual(['note']);
    expect(result.current.isDefault('notes')).toBe(true);
    act(() => result.current.byId.notes.setValue([]));
    expect(store.read('notes')).toBe('');
    act(() => result.current.byId.notes.setValue(['note']));
    expect(store.read('notes')).toBeUndefined();
    expect(result.current.isDefault('notes')).toBe(true);
  });

  it('in the edition without the afterword, the link for the shown default carries no notes key', () => {
    const store = linkingStore();
    const { result } = renderHook(() => useFieldGroup(FIELDS, { stored: true }), { wrapper: storing(store) });
    expect(result.current.byId.notes.hrefFor?.(['note'])).toBe('?');
    expect(result.current.byId.notes.hrefFor?.([])).toBe('?notes=');
  });

  it('switching to the edition with the afterword widens the shown default, still with no key', () => {
    const store = linkingStore();
    const { result } = renderHook(() => useFieldGroup(FIELDS, { stored: true }), { wrapper: storing(store) });
    act(() => result.current.byId.notes.setValue([]));
    act(() => result.current.byId.notes.setValue(['note']));
    act(() => result.current.byId.edition.setValue('hu'));
    expect(store.snapshot()).toEqual({ edition: 'hu' });
    expect(result.current.values.notes).toEqual(['note', 'afterword']);
    expect(result.current.isDefault('notes')).toBe(true);
    expect(result.current.byId.notes.hrefFor?.(['note', 'afterword'])).toBe('?edition=hu');
    expect(result.current.byId.notes.hrefFor?.(['note'])).toBe('?edition=hu&notes=note');
  });

  it('a value set in the edition with the afterword is the default again in the edition without it', () => {
    const store = linkingStore({ edition: 'hu' });
    const { result } = renderHook(() => useFieldGroup(FIELDS, { stored: true }), { wrapper: storing(store) });
    act(() => result.current.byId.notes.setValue(['note']));
    expect(store.read('notes')).toBe('note');
    expect(result.current.isDefault('notes')).toBe(false);
    act(() => result.current.byId.edition.setValue('en'));
    expect(store.snapshot()).toEqual({ notes: 'note' });
    expect(result.current.values.notes).toEqual(['note']);
    expect(result.current.isDefault('notes')).toBe(true);
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
