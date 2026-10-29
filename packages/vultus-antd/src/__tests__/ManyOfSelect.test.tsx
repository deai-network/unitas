import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App as AntApp, theme } from 'antd';
import { useState } from 'react';
import { denyWithReason, useManyOfField, type FieldCommit, type ManyOfFieldOptions, type OneOfChoice } from 'vultus-core';
import { ManyOfSelect } from '../ManyOfSelect.js';
import { measureTags, stopMeasuring } from './helpers/measureTags.js';
import { openTooltips } from './helpers/tooltips.js';

type Tag = 'a' | 'b' | 'c';

const CHOICES: OneOfChoice<Tag>[] = [
  { value: 'a', label: 'Alpha', note: '3' },
  { value: 'b', label: 'Beta', note: '1', description: 'The second tag' },
  { value: 'c', label: 'Gamma', description: 'The third tag', enabled: denyWithReason('Not allowed for this task') },
];

function Inside({ ...opts }: Partial<Omit<ManyOfFieldOptions<Tag>, 'value' | 'onChange' | 'commit'>>) {
  const field = useManyOfField<Tag>({ id: 'tags', label: 'Tags', choices: CHOICES, initialValue: ['a'], ...opts } as ManyOfFieldOptions<Tag>);
  return <><ManyOfSelect field={field} /><output>{field.value.join(',')}</output></>;
}

function Committed({ fire, confirmation, initial = ['a'] }: {
  fire: (next: Tag[]) => Promise<void> | void;
  confirmation?: FieldCommit<Tag[]>['confirmation'];
  initial?: Tag[];
}) {
  const [stored, setStored] = useState<Tag[]>(initial);
  const field = useManyOfField<Tag>({
    id: 'tags', label: 'Tags', description: 'Which tags apply', choices: CHOICES, value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><ManyOfSelect field={field} /><output>{field.value.join(',')}</output></>;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;

function root() {
  return document.querySelector<HTMLElement>('[data-field-id="tags"]')!;
}

/** Opens the select's dropdown. */
async function openChoices() {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option').length).toBeGreaterThan(0));
}

/** The open list's option row for a choice, by its label. */
function optionRow(label: string): HTMLElement {
  const found = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option')).find((o) => o.textContent?.startsWith(label));
  if (!found) throw new Error(`no option ${label}`);
  return found;
}

async function choose(label: string) {
  await openChoices();
  fireEvent.click(optionRow(label));
}

afterEach(() => {
  stopMeasuring();
  vi.restoreAllMocks();
});

describe('ManyOfSelect', () => {
  it('shows every choice in the open list, with its note', async () => {
    wrap(<Inside />);
    await openChoices();
    expect(optionRow('Alpha')).toHaveTextContent('3');
    expect(optionRow('Beta')).toHaveTextContent('1');
    expect(optionRow('Gamma')).toBeInTheDocument();
  });

  it('selecting a choice requests the full list, in choice order, regardless of click order', async () => {
    wrap(<Inside initialValue={['b']} />);
    expect(shown()).toBe('b');
    await choose('Alpha');
    await waitFor(() => expect(shown()).toBe('a,b'));
  });

  it('removing a tag requests the list without it', async () => {
    wrap(<Inside initialValue={['a', 'b']} />);
    expect(shown()).toBe('a,b');
    await choose('Alpha');
    await waitFor(() => expect(shown()).toBe('b'));
  });

  it('clearing requests an empty list', async () => {
    wrap(<Inside initialValue={['a', 'b']} />);
    expect(shown()).toBe('a,b');
    fireEvent.click(root().querySelector('.ant-select-clear')!);
    await waitFor(() => expect(shown()).toBe(''));
  });

  it("a selected choice that becomes disabled is marked disabled in the field's options — the same `option.disabled` antd's own tag render reads to drop a selected tag's close icon, so a later custom tagRender can't silently lose it", async () => {
    // `maxTagCount="responsive"` never actually collapses/measures real tags
    // under jsdom: `vitest.setup.ts` stubs `ResizeObserver.observe` as a
    // no-op, so the responsive overflow's container width never resolves and
    // no individual tag node ever mounts here (confirmed empirically: with
    // this stub, antd always renders the summary "+N ..." item and zero
    // per-tag nodes, for any number of selections — see "tags collapse"
    // below). The close icon on a selected tag is something antd's own
    // default tag render derives straight from the matching option's
    // `disabled` — the same `options` array that keeps a disabled choice's
    // row unclickable in the open list (already covered by "a disabled
    // choice cannot be selected" above). This test pins that same signal for
    // a choice that starts selected and enabled, then becomes disabled while
    // still selected — the scenario a future custom `tagRender` ignoring
    // `option.disabled` would silently get wrong.
    const { rerender } = wrap(<Inside initialValue={['a', 'b']} />);
    await openChoices();
    expect(optionRow('Alpha')).not.toHaveClass('ant-select-item-option-disabled');
    const NOW_DISABLED: OneOfChoice<Tag>[] = [
      { value: 'a', label: 'Alpha', note: '3', enabled: denyWithReason('No longer allowed') },
      { value: 'b', label: 'Beta', note: '1', description: 'The second tag' },
      { value: 'c', label: 'Gamma', description: 'The third tag', enabled: denyWithReason('Not allowed for this task') },
    ];
    rerender(<AntApp><Inside initialValue={['a', 'b']} choices={NOW_DISABLED} /></AntApp>);
    await openChoices();
    expect(optionRow('Alpha')).toHaveClass('ant-select-item-option-disabled');
    expect(optionRow('Beta')).not.toHaveClass('ant-select-item-option-disabled');
    // Still selected, just disabled now — this is the "selected choice that
    // becomes disabled" scenario, not a choice that was never selected.
    expect(shown()).toBe('a,b');
  });

  it('a disabled choice cannot be selected; hovering it shows its reason, then its description', async () => {
    wrap(<Inside />);
    await choose('Gamma');
    expect(shown()).toBe('a');
    fireEvent.mouseEnter(optionRow('Gamma').querySelector('span[style]')!);
    await waitFor(() => expect(screen.getByText('Not allowed for this task')).toBeInTheDocument());
    expect(screen.getByText('The third tag')).toBeInTheDocument();
  });

  it('search filters choices by label, accent- and case-insensitive', async () => {
    const ACCENTED: OneOfChoice<Tag>[] = [
      { value: 'a', label: 'Café' },
      { value: 'b', label: 'Beta' },
      { value: 'c', label: 'Gamma' },
    ];
    wrap(<Inside choices={ACCENTED} initialValue={[]} />);
    await openChoices();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cafe' } });
    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('.ant-select-item-option')).map((r) => r.textContent);
      expect(rows).toEqual(['Café']);
    });
  });

  it('data-value is the selected choices, comma-joined', async () => {
    wrap(<Inside />);
    expect(root()).toHaveAttribute('data-value', 'a');
    await choose('Beta');
    await waitFor(() => expect(root()).toHaveAttribute('data-value', 'a,b'));
  });

  it('shows the placeholder while empty', () => {
    wrap(<Inside initialValue={[]} placeholder="Pick some tags" />);
    expect(screen.getByText('Pick some tags')).toBeInTheDocument();
  });

  it('renders nothing when hidden', () => {
    wrap(<Inside hidden />);
    expect(document.querySelector('[data-field-id="tags"]')).toBeNull();
  });

  it('a disabled field: the reason on hover, no change', async () => {
    wrap(<Inside enabled={denyWithReason('Read-only here')} />);
    fireEvent.mouseEnter(root().closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Read-only here')).toBeInTheDocument());
    expect(shown()).toBe('a');
  });

  it('confirmation for the requested list: asks first, commits on OK', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} confirmation={() => ({ kind: 'popconfirm', question: 'Change tags?' })} />);
    await choose('Beta');
    expect(fire).not.toHaveBeenCalled();
    expect(await screen.findByText('Change tags?')).toBeInTheDocument();
    const ok = screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'));
    expect(ok).toBeTruthy();
    await act(async () => { fireEvent.click(ok!); });
    expect(fire).toHaveBeenCalledWith(['a', 'b']);
  });

  it('while a confirmation is open, the widget holds back its tooltip (it would cover it)', async () => {
    wrap(<Committed fire={vi.fn()} confirmation={() => ({ kind: 'popconfirm', question: 'Change tags?' })} />);
    fireEvent.mouseEnter(root().closest('span[style]')!);
    await choose('Beta');
    expect(await screen.findByText('Change tags?')).toBeInTheDocument();
    expect(openTooltips()).toHaveLength(0);
  });

  it('pending shows a loading select', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed fire={fire} />);
    await choose('Beta');
    expect(fire).toHaveBeenCalledWith(['a', 'b']);
    await waitFor(() => expect(root()).toHaveClass('ant-select-loading'));
    await act(async () => { finish(); });
    await waitFor(() => expect(root()).not.toHaveClass('ant-select-loading'));
  });

  it('pending locks it: the list (open after the pick) closes and stays closed, the combobox stays focusable and is said unavailable; no clear icon, its search read-only, Backspace removes nothing; back to normal after', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed fire={fire} />);
    await choose('Beta');
    expect(fire).toHaveBeenCalledWith(['a', 'b']);
    const combobox = screen.getByRole('combobox');
    await waitFor(() => expect(combobox).toHaveAttribute('aria-disabled', 'true'));
    expect(combobox).not.toBeDisabled();
    expect(root()).not.toHaveClass('ant-select-disabled');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    expect(combobox).toHaveAttribute('readonly');
    expect(root().querySelector('.ant-select-clear')).toBeNull();
    fireEvent.mouseDown(combobox);
    fireEvent.keyDown(combobox, { key: 'ArrowDown', keyCode: 40, which: 40 });
    fireEvent.keyDown(combobox, { key: 'Backspace', keyCode: 8, which: 8 });
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    expect(fire).toHaveBeenCalledTimes(1);
    expect(shown()).toBe('a');
    await act(async () => { finish(); });
    await waitFor(() => expect(combobox).not.toHaveAttribute('aria-disabled'));
    expect(shown()).toBe('a,b');
    expect(combobox).not.toHaveAttribute('readonly');
    expect(root().querySelector('.ant-select-clear')).not.toBeNull();
  });

  it('pending keeps the disabled look: the disabled text colour and background, the not-allowed cursor, no remove icon on the tags', async () => {
    measureTags();
    function DisabledProbe() {
      const { token } = theme.useToken();
      return <span data-testid="probe" style={{ color: token.colorTextDisabled, background: token.colorBgContainerDisabled }} />;
    }
    wrap(<><Inside initialValue={['a', 'b']} pending /><DisabledProbe /></>);
    const probe = screen.getByTestId('probe');
    expect(root().style.color).toBe(probe.style.color);
    expect(root().style.background).toBe(probe.style.background);
    expect(root().style.cursor).toBe('not-allowed');
    expect(screen.getByRole('combobox').style.cursor).toBe('not-allowed');
    await waitFor(() => expect(root().querySelectorAll('.ant-select-selection-item-remove')).toHaveLength(2));
    for (const remove of Array.from(root().querySelectorAll<HTMLElement>('.ant-select-selection-item-remove'))) {
      expect(remove.style.display).toBe('none');
    }
  });

  it('not enabled and pending: disabled as before, not marked locked', () => {
    wrap(<Inside pending enabled={denyWithReason('Read-only here')} />);
    expect(root()).toHaveClass('ant-select-disabled');
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-disabled');
    expect(root().style.cursor).toBe('');
  });

  describe('groups', () => {
    type Model = 'opus' | 'sonnet' | 'opus-4' | 'sonnet-4';
    function Grouped() {
      const field = useManyOfField<Model>({
        id: 'models', label: 'Models', initialValue: ['opus'],
        choices: [
          { value: 'opus', label: 'Opus 5' },
          { value: 'opus-4', label: 'Opus 4', group: 'Older versions' },
          { value: 'sonnet', label: 'Sonnet 5' },
          { value: 'sonnet-4', label: 'Sonnet 4', group: 'Older versions' },
        ],
      });
      return <><ManyOfSelect field={field} /><output>{field.value.join(',')}</output></>;
    }

    it('lists the ungrouped choices first, then each group under its header', async () => {
      wrap(<Grouped />);
      fireEvent.mouseDown(screen.getByRole('combobox'));
      await waitFor(() => expect(document.querySelectorAll('.ant-select-item').length).toBeGreaterThan(0));
      const rows = Array.from(document.querySelectorAll('.ant-select-item')).map((r) => (
        r.classList.contains('ant-select-item-group') ? `## ${r.textContent}` : r.textContent));
      expect(rows).toEqual(['Opus 5', 'Sonnet 5', '## Older versions', 'Opus 4', 'Sonnet 4']);
    });

    it('a grouped choice is chosen like any other', async () => {
      wrap(<Grouped />);
      fireEvent.mouseDown(screen.getByRole('combobox'));
      await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option').length).toBeGreaterThan(0));
      fireEvent.click(Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option')).find((o) => o.textContent === 'Sonnet 4')!);
      await waitFor(() => expect(screen.getByRole('status').textContent).toBe('opus,sonnet-4'));
    });
  });

  describe('tags collapse (Review Focus 5)', () => {
    it('maxTagCount="responsive": many selections collapse behind a "+N ..." item instead of one tag per choice', async () => {
      const MANY: OneOfChoice<Tag>[] = Array.from({ length: 20 }, (_, i) => ({ value: `t${i}` as Tag, label: `Choice number ${i}` }));
      function Many() {
        const field = useManyOfField<Tag>({
          id: 'many', label: 'Many', choices: MANY, initialValue: MANY.map((c) => c.value),
        });
        return <div style={{ width: 200 }}><ManyOfSelect field={field} /></div>;
      }
      wrap(<Many />);
      // Without `maxTagCount="responsive"` every one of the 20 choices would
      // render its own `.ant-select-content-item`; wired up, the overflow
      // mechanism folds them behind a single "rest" item (e.g. "+ 19 ...")
      // instead.
      const items = Array.from(document.querySelectorAll('.ant-select-content-item'));
      const perChoiceTags = items.filter((el) => !el.matches('.ant-select-content-item-rest, .ant-select-content-item-suffix'));
      expect(perChoiceTags).toHaveLength(0);
      expect(document.querySelector('.ant-select-content-item-rest')).toHaveTextContent('+ 19 ...');
    });
  });
});
