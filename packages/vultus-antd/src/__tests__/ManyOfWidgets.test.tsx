import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { useState } from 'react';
import {
  denyWithReason, useManyOfField, type FieldCommit, type ManyOfFieldOptions, type OneOfChoice,
} from 'vultus-core';
import { ManyOfCheckboxes } from '../ManyOfCheckboxes.js';
import { ManyOfSwitches } from '../ManyOfSwitches.js';
import { openTooltips } from './helpers/tooltips.js';

type Tag = 'a' | 'b' | 'c';

const CHOICES: OneOfChoice<Tag>[] = [
  { value: 'a', label: 'Alpha', note: '3' },
  { value: 'b', label: 'Beta', note: '1', description: 'The second tag' },
  { value: 'c', label: 'Gamma', description: 'The third tag', enabled: denyWithReason('Not allowed for this task') },
];

const widgets = { ManyOfCheckboxes, ManyOfSwitches } as const;
type Kind = keyof typeof widgets;

function Inside({ kind, vertical, ...opts }: { kind: Kind; vertical?: boolean } & Partial<Omit<ManyOfFieldOptions<Tag>, 'value' | 'onChange' | 'commit'>>) {
  const field = useManyOfField<Tag>({ id: 'tags', label: 'Tags', choices: CHOICES, initialValue: ['a'], ...opts } as ManyOfFieldOptions<Tag>);
  const Widget = widgets[kind];
  return <><Widget field={field} vertical={vertical} /><output>{field.value.join(',')}</output></>;
}

function Committed({ kind, fire, confirmation, initial = ['a'] }: {
  kind: Kind;
  fire: (next: Tag[]) => Promise<void> | void;
  confirmation?: FieldCommit<Tag[]>['confirmation'];
  initial?: Tag[];
}) {
  const [stored, setStored] = useState<Tag[]>(initial);
  const field = useManyOfField<Tag>({
    id: 'tags', label: 'Tags', choices: CHOICES, value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  const Widget = widgets[kind];
  return <><Widget field={field} /><output>{field.value.join(',')}</output></>;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;

/**
 * The clickable choice element to use when testing with 'click' alone: for
 * ManyOfCheckboxes `data-choice-value` lands on the checkbox's own input (it
 * is forwarded straight onto the Checkbox), so the matched element is the
 * checkbox itself; for ManyOfSwitches it lands on the row wrapping the
 * switch and its label, so the switch is found inside it.
 */
function choiceInput(kind: Kind, value: Tag): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-choice-value="${value}"]`)!;
  return kind === 'ManyOfCheckboxes' ? el : within(el).getByRole('switch');
}

function root() {
  return document.querySelector<HTMLElement>('[data-field-id="tags"]')!;
}

describe.each(['ManyOfCheckboxes', 'ManyOfSwitches'] as Kind[])('%s', (kind) => {
  it('renders choices with notes', () => {
    wrap(<Inside kind={kind} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    if (kind === 'ManyOfCheckboxes') {
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    }
  });

  it('click requests the toggled list (added, then removed)', async () => {
    wrap(<Inside kind={kind} />);
    expect(shown()).toBe('a');
    fireEvent.click(choiceInput(kind, 'b'));
    await waitFor(() => expect(shown()).toBe('a,b'));
    fireEvent.click(choiceInput(kind, 'a'));
    await waitFor(() => expect(shown()).toBe('b'));
  });

  it('a disabled choice is not clickable', () => {
    wrap(<Inside kind={kind} />);
    expect(choiceInput(kind, 'c')).toBeDisabled();
    fireEvent.click(choiceInput(kind, 'c'));
    expect(shown()).toBe('a');
  });

  it('confirmation for the requested list: asks first, commits on OK', async () => {
    const fire = vi.fn();
    wrap(<Committed kind={kind} fire={fire}
      confirmation={() => ({ kind: 'popconfirm', question: 'Change tags?' })} />);
    fireEvent.click(choiceInput(kind, 'b'));
    expect(fire).not.toHaveBeenCalled();
    expect(await screen.findByText('Change tags?')).toBeInTheDocument();
    const ok = screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'));
    expect(ok).toBeTruthy();
    await act(async () => { fireEvent.click(ok!); });
    expect(fire).toHaveBeenCalledWith(['a', 'b']);
  });

  it('pending disables the control and shows a spinner', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed kind={kind} fire={fire} />);
    fireEvent.click(choiceInput(kind, 'b'));
    expect(fire).toHaveBeenCalledWith(['a', 'b']);
    await waitFor(() => expect(choiceInput(kind, 'a')).toBeDisabled());
    expect(document.querySelector('.ant-spin')).toBeTruthy();
    await act(async () => { finish(); });
    await waitFor(() => expect(choiceInput(kind, 'a')).not.toBeDisabled());
    expect(document.querySelector('.ant-spin')).toBeNull();
  });

  it('vertical: lays out the choices in a column', () => {
    wrap(<Inside kind={kind} vertical />);
    expect(root().style.flexDirection).toBe('column');
  });

  it('row (default): lays out the choices horizontally', () => {
    wrap(<Inside kind={kind} />);
    expect(root().style.flexDirection).toBe('row');
  });

  it('data-value is the selected choices, comma-joined', async () => {
    wrap(<Inside kind={kind} />);
    expect(root()).toHaveAttribute('data-value', 'a');
    fireEvent.click(choiceInput(kind, 'b'));
    await waitFor(() => expect(root()).toHaveAttribute('data-value', 'a,b'));
  });

  it('the field label is the group\'s accessible name', () => {
    wrap(<Inside kind={kind} />);
    expect(screen.getByRole('group', { name: 'Tags' })).toBeInTheDocument();
  });

  it('an enabled field: hovering a choice shows its description; a disabled choice its reason, then its description', async () => {
    wrap(<Inside kind={kind} />);
    fireEvent.mouseEnter(choiceInput(kind, 'c').closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Not allowed for this task')).toBeInTheDocument());
    expect(screen.getByText('The third tag')).toBeInTheDocument();
  });

  it('a disabled field: the reason for the whole control on hover, no change', async () => {
    wrap(<Inside kind={kind} enabled={denyWithReason('Read-only here')} />);
    fireEvent.mouseEnter(root().closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Read-only here')).toBeInTheDocument());
    fireEvent.click(choiceInput(kind, 'b'));
    expect(shown()).toBe('a');
  });

  it('while a confirmation is open, the widget holds back its tooltips (they would cover it)', async () => {
    wrap(<Committed kind={kind} fire={vi.fn()}
      confirmation={() => ({ kind: 'popconfirm', question: 'Change tags?' })} />);
    fireEvent.mouseEnter(choiceInput(kind, 'b').closest('span[style]')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    fireEvent.click(choiceInput(kind, 'b'));
    expect(await screen.findByText('Change tags?')).toBeInTheDocument();
    expect(openTooltips()).toHaveLength(0);
  });

  it('renders nothing when hidden', () => {
    wrap(<Inside kind={kind} hidden />);
    expect(document.querySelector('[data-field-id="tags"]')).toBeNull();
  });
});

describe('ManyOfSwitches: the label also toggles', () => {
  it('clicking the label next to the switch toggles the choice, same as the switch', async () => {
    wrap(<Inside kind="ManyOfSwitches" />);
    fireEvent.click(screen.getByText('Beta'));
    await waitFor(() => expect(shown()).toBe('a,b'));
    fireEvent.click(screen.getByText('Alpha'));
    await waitFor(() => expect(shown()).toBe('b'));
  });

  it('clicking a disabled choice\'s label does nothing', () => {
    wrap(<Inside kind="ManyOfSwitches" />);
    fireEvent.click(screen.getByText('Gamma'));
    expect(shown()).toBe('a');
  });
});
