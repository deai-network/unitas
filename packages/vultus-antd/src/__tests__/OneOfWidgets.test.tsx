import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { App as AntApp, theme } from 'antd';
import { useState } from 'react';
import { denyWithReason, useOneOfField, type FieldCommit, type OneOfChoice, type OneOfFieldOptions } from 'vultus-core';
import { OneOfSegmented } from '../OneOfSegmented.js';
import { OneOfSelect } from '../OneOfSelect.js';
import { VultusProvider } from '../VultusProvider.js';
import { openTooltips } from './helpers/tooltips.js';

type Mode = 'manual' | 'plan' | 'bypass';

const CHOICES: OneOfChoice<Mode>[] = [
  { value: 'manual', label: 'Manual', description: 'Asks before acting' },
  { value: 'plan', label: 'Plan', description: 'Plans without editing' },
  { value: 'bypass', label: 'Bypass', description: 'Runs everything', enabled: denyWithReason('Not allowed for this task') },
];

const widgets = { OneOfSelect, OneOfSegmented } as const;
type Kind = keyof typeof widgets;

function Inside({ kind, ...opts }: { kind: Kind } & Partial<Omit<OneOfFieldOptions<Mode>, 'value' | 'onChange' | 'commit'>>) {
  const field = useOneOfField<Mode>({ id: 'mode', label: 'Mode', choices: CHOICES, initialValue: 'manual', ...opts } as OneOfFieldOptions<Mode>);
  const Widget = widgets[kind];
  return <><Widget field={field} /><output>{field.value}</output></>;
}

function Committed({ kind, fire, confirmation }: {
  kind: Kind;
  fire: (next: Mode) => Promise<void> | void;
  confirmation?: FieldCommit<Mode>['confirmation'];
}) {
  const [stored, setStored] = useState<Mode>('manual');
  const field = useOneOfField<Mode>({
    id: 'mode', label: 'Mode', choices: CHOICES, value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  const Widget = widgets[kind];
  return <><Widget field={field} /><output>{field.value}</output></>;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;

/** The element of a choice the user points at or clicks. */
function choiceElement(kind: Kind, label: string): HTMLElement {
  if (kind === 'OneOfSelect') {
    const options = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option'));
    const found = options.find((o) => o.textContent === label);
    if (!found) throw new Error(`no option ${label}`);
    return found;
  }
  return screen.getByText(label);
}

/** Opens the select's dropdown (nothing to open for a segmented control). */
async function openChoices(kind: Kind) {
  if (kind !== 'OneOfSelect') return;
  fireEvent.mouseDown(screen.getByRole('combobox'));
  await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option').length).toBeGreaterThan(0));
}

async function choose(kind: Kind, label: string) {
  await openChoices(kind);
  fireEvent.click(choiceElement(kind, label));
}

async function hoverChoice(kind: Kind, label: string) {
  await openChoices(kind);
  fireEvent.mouseEnter(choiceElement(kind, label).querySelector('span[style]') ?? choiceElement(kind, label));
}

describe.each(['OneOfSelect', 'OneOfSegmented'] as Kind[])('%s', (kind) => {
  it('shows the value and changes it inside the field', async () => {
    wrap(<Inside kind={kind} />);
    expect(shown()).toBe('manual');
    await choose(kind, 'Plan');
    await waitFor(() => expect(shown()).toBe('plan'));
  });

  it('hovering a choice shows its description', async () => {
    wrap(<Inside kind={kind} />);
    await hoverChoice(kind, 'Plan');
    // (OneOfSegmented leads it with "Switch to:".)
    await waitFor(() => expect(screen.getByText(/Plans without editing$/)).toBeInTheDocument());
  });

  it('a disabled choice cannot be chosen; hovering it shows its reason, then its description', async () => {
    wrap(<Inside kind={kind} />);
    await choose(kind, 'Bypass');
    expect(shown()).toBe('manual');
    await hoverChoice(kind, 'Bypass');
    await waitFor(() => expect(screen.getByText('Not allowed for this task')).toBeInTheDocument());
    expect(screen.getByText('Runs everything')).toBeInTheDocument();
  });

  it('commit: fires with the requested choice, then shows the stored value', async () => {
    const fire = vi.fn();
    wrap(<Committed kind={kind} fire={fire} />);
    await choose(kind, 'Plan');
    await waitFor(() => expect(fire).toHaveBeenCalledWith('plan'));
    await waitFor(() => expect(shown()).toBe('plan'));
  });

  it('confirmation for the requested choice: asks first, runs on OK', async () => {
    const fire = vi.fn();
    wrap(<Committed kind={kind} fire={fire}
      confirmation={(next) => (next === 'plan' ? { kind: 'popconfirm', question: 'Switch to Plan?' } : undefined)} />);
    await choose(kind, 'Plan');
    expect(fire).not.toHaveBeenCalled();
    expect(await screen.findByText('Switch to Plan?')).toBeInTheDocument();
    const ok = screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'));
    expect(ok).toBeTruthy();
    await act(async () => { fireEvent.click(ok!); });
    expect(fire).toHaveBeenCalledWith('plan');
  });

  it("a cascade modal's OK reads the chosen choice's label, from the first request on", async () => {
    const fire = vi.fn();
    wrap(<Committed kind={kind} fire={fire} confirmation={() => ({ kind: 'cascade-modal', title: 'Switch the mode?', content: 'Sure?' })} />);
    await choose(kind, 'Plan');
    const ok = await screen.findByRole('button', { name: 'Plan' });
    expect(fire).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(ok); });
    expect(fire).toHaveBeenCalledWith('plan');
  });

  it('while a confirmation is open, the widget holds back its tooltips (they would cover it)', async () => {
    wrap(<Committed kind={kind} fire={vi.fn()}
      confirmation={(next) => (next === 'plan' ? { kind: 'popconfirm', question: 'Switch to Plan?' } : undefined)} />);
    // Pointing at what is about to be chosen: the closed select, or the segment.
    const point = async () => {
      if (kind === 'OneOfSelect') fireEvent.mouseEnter(document.querySelector('[data-field-id="mode"]')!.closest('span[style]')!);
      else await hoverChoice(kind, 'Plan');
    };
    await point();
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    await choose(kind, 'Plan');
    expect(await screen.findByText('Switch to Plan?')).toBeInTheDocument();
    // The pointer stays on the widget, or comes back to it (the select's list has closed).
    await point();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(openTooltips()).toHaveLength(0);
  });

  it('a disabled field: the reason on hover, no change', async () => {
    wrap(<Inside kind={kind} enabled={denyWithReason('Read-only here')} />);
    const root = document.querySelector<HTMLElement>('[data-field-id="mode"]')!;
    fireEvent.mouseEnter(root.closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Read-only here')).toBeInTheDocument());
    if (kind === 'OneOfSegmented') fireEvent.click(screen.getByText('Plan'));
    expect(shown()).toBe('manual');
  });

  it('renders nothing when hidden', () => {
    wrap(<Inside kind={kind} hidden />);
    expect(document.querySelector('[data-field-id="mode"]')).toBeNull();
  });
});

describe('OneOfSelect closed', () => {
  it('its tooltip says what the field is, then the current state (the current choice\'s description)', async () => {
    wrap(<Inside kind="OneOfSelect" description="How Claude asks for permission" />);
    const root = document.querySelector<HTMLElement>('[data-field-id="mode"]')!;
    fireEvent.mouseEnter(root.closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('How Claude asks for permission')).toBeInTheDocument());
    expect(screen.getByText('Current state: Asks before acting')).toBeInTheDocument();
  });
});

type Act = 'keep' | 'boost' | 'burn' | 'nuke';
const VARIANT_CHOICES: OneOfChoice<Act>[] = [
  { value: 'keep', label: 'Keep' },
  { value: 'boost', label: 'Boost', variant: 'primary' },
  { value: 'burn', label: 'Burn', variant: 'danger' },
  { value: 'nuke', label: 'Nuke', variant: 'danger', enabled: denyWithReason('Never') },
];
const PRIMARY = { color: 'rgb(22, 119, 255)', fontWeight: '600' };
const DANGER = { color: 'rgb(255, 77, 79)' };

function Variants({ kind, initial = 'keep', confirmBurn, burnModal }: { kind: Kind; initial?: Act; confirmBurn?: boolean; burnModal?: boolean }) {
  const [stored, setStored] = useState<Act>(initial);
  const field = useOneOfField<Act>({
    id: 'act', label: 'Act', choices: VARIANT_CHOICES, value: stored,
    commit: {
      confirmation: (next) => {
        if (next !== 'burn') return undefined;
        if (confirmBurn) return { kind: 'popconfirm', question: 'Burn it?' };
        return burnModal ? { kind: 'cascade-modal', title: 'Burn it?', content: 'Sure?' } : undefined;
      },
      fire: (next) => setStored(next),
    },
  });
  const Widget = widgets[kind];
  return <><Widget field={field} /><output>{field.value}</output></>;
}

/** A choice's label as shown in the list (select) or on its segment. */
async function choiceLabel(kind: Kind, label: string): Promise<HTMLElement> {
  if (kind === 'OneOfSelect') {
    if (!document.querySelector('.ant-select-item-option')) {
      fireEvent.mouseDown(screen.getByRole('combobox'));
      await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option').length).toBe(4));
    }
    const option = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option')).find((o) => o.textContent === label)!;
    return Array.from(option.querySelectorAll<HTMLElement>('span')).find((s) => s.textContent === label && s.children.length === 0)!;
  }
  return screen.getByText(label);
}

describe.each(['OneOfSelect', 'OneOfSegmented'] as Kind[])('%s variants', (kind) => {
  it('a primary choice is bold in the primary colour, a danger one in the danger colour, a disabled one plain', async () => {
    wrap(<Variants kind={kind} />);
    expect(await choiceLabel(kind, 'Boost')).toHaveStyle(PRIMARY);
    expect(await choiceLabel(kind, 'Burn')).toHaveStyle(DANGER);
    expect(await choiceLabel(kind, 'Nuke')).not.toHaveStyle(DANGER);
    expect(await choiceLabel(kind, 'Keep')).not.toHaveStyle(PRIMARY);
  });

  it('a danger choice\'s confirmation has a danger OK', async () => {
    wrap(<Variants kind={kind} confirmBurn />);
    await choose(kind, 'Burn');
    expect(await screen.findByText('Burn it?')).toBeInTheDocument();
    const ok = screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'))!;
    expect(ok).toHaveClass('ant-btn-dangerous');
  });

  it("a danger choice's cascade modal: its OK, named after the choice, is a danger button", async () => {
    wrap(<Variants kind={kind} burnModal />);
    await choose(kind, 'Burn');
    expect(await screen.findByRole('button', { name: 'Burn' })).toHaveClass('ant-btn-dangerous');
  });
});

describe('OneOfSelect closed, variants', () => {
  it('mirrors the current choice\'s variant', () => {
    wrap(<Variants kind="OneOfSelect" initial="burn" />);
    const selected = document.querySelector<HTMLElement>('.ant-select-content, .ant-select-selection-item')!;
    expect(within(selected).getByText('Burn')).toHaveStyle(DANGER);
  });
});

describe('OneOfSelect native titles', () => {
  it('neither the options nor the closed select carry a native title (it would fight the tooltips)', async () => {
    wrap(<Inside kind="OneOfSelect" />);
    const titled = () => Array.from(document.querySelectorAll<HTMLElement>('[title]')).filter((e) => e.getAttribute('title'));
    expect(titled()).toEqual([]);
    await openChoices('OneOfSelect');
    expect(titled()).toEqual([]);
  });
});

describe('OneOfSelect option tooltips', () => {
  it('are anchored on the whole option row, so they open beside the list', async () => {
    wrap(<Inside kind="OneOfSelect" />);
    await openChoices('OneOfSelect');
    const option = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option')).find((o) => o.textContent === 'Plan')!;
    expect(option.querySelector<HTMLElement>('span[style]')).toHaveStyle({ display: 'block' });
  });
});

type Theme = 'light' | 'dark';
const THEMES: OneOfChoice<Theme>[] = [
  { value: 'light', label: 'Light', description: 'A **light** background', icon: <span data-testid="sun-icon" /> },
  { value: 'dark', label: 'Dark', description: 'A dark background', icon: <span data-testid="moon-icon" /> },
];

function ThemeField({ kind, iconOnly }: { kind: Kind; iconOnly?: boolean }) {
  const field = useOneOfField<Theme>({ id: 'theme', label: 'Theme', description: 'The *colour* scheme', choices: THEMES, initialValue: 'light' });
  return kind === 'OneOfSegmented'
    ? <OneOfSegmented field={field} iconOnly={iconOnly} />
    : <OneOfSelect field={field} />;
}

describe.each(['OneOfSelect', 'OneOfSegmented'] as Kind[])('%s icons and markdown', (kind) => {
  it('shows a choice\'s icon before its label', async () => {
    wrap(<ThemeField kind={kind} />);
    await openChoices(kind);
    const moon = screen.getAllByTestId('moon-icon').at(-1)!;
    expect(moon.parentElement?.textContent).toContain('Dark');
  });

  it('renders a choice\'s description as markdown', async () => {
    wrap(<ThemeField kind={kind} />);
    await hoverChoice(kind, 'Light');
    await waitFor(() => expect(screen.getByText('light', { selector: 'strong' })).toBeInTheDocument());
  });
});

describe('OneOfSegmented while pending (the app\'s own)', () => {
  it('holds back its segments\' tooltips: a "Switch to" it could not act on would mislead', async () => {
    wrap(<Inside kind="OneOfSegmented" pending />);
    await hoverChoice('OneOfSegmented', 'Plan');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(openTooltips()).toHaveLength(0);
  });

  it('is locked, not disabled: its radios stay focusable, the group is said unavailable; a click or an arrow key requests nothing', () => {
    wrap(<Inside kind="OneOfSegmented" pending />);
    const group = screen.getByRole('radiogroup');
    expect(group).not.toHaveClass('ant-segmented-disabled');
    expect(group).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('radio', { name: 'Manual' })).not.toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Plan' })).not.toBeDisabled();
    // A disabled choice stays disabled.
    expect(screen.getByRole('radio', { name: 'Bypass' })).toBeDisabled();
    fireEvent.click(screen.getByText('Plan'));
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Manual' }), { key: 'ArrowRight' });
    expect(shown()).toBe('manual');
    expect(screen.getByRole('radio', { name: 'Manual' })).toBeChecked();
  });

  it('keeps the disabled look: every segment in the disabled text colour, with the not-allowed cursor', () => {
    function DisabledColorProbe() {
      const { token } = theme.useToken();
      return <span data-testid="probe" style={{ color: token.colorTextDisabled }} />;
    }
    wrap(<><Inside kind="OneOfSegmented" pending /><DisabledColorProbe /></>);
    const color = screen.getByTestId('probe').style.color;
    expect(color).not.toBe('');
    const items = Array.from(document.querySelectorAll<HTMLElement>('.ant-segmented-item'));
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.style.color).toBe(color);
      expect(item.style.cursor).toBe('not-allowed');
    }
  });

  it('not enabled and pending: disabled as before, not marked locked', () => {
    wrap(<Inside kind="OneOfSegmented" pending enabled={denyWithReason('Read-only here')} />);
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveClass('ant-segmented-disabled');
    expect(group).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('radio', { name: 'Manual' })).toBeDisabled();
    expect(document.querySelector<HTMLElement>('.ant-segmented-item')!.style.cursor).toBe('');
  });
});

describe('OneOfSegmented while its commit is pending', () => {
  it('is locked: focusable, said unavailable, another choice requests nothing; back to normal after', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed kind="OneOfSegmented" fire={fire} />);
    await choose('OneOfSegmented', 'Plan');
    expect(fire).toHaveBeenCalledWith('plan');
    const group = screen.getByRole('radiogroup');
    await waitFor(() => expect(group).toHaveAttribute('aria-disabled', 'true'));
    expect(screen.getByRole('radio', { name: 'Plan' })).not.toBeDisabled();
    fireEvent.click(screen.getByText('Plan'));
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Manual' }), { key: 'ArrowRight' });
    expect(fire).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: 'Manual' })).toBeChecked();
    await act(async () => { finish(); });
    await waitFor(() => expect(group).not.toHaveAttribute('aria-disabled'));
    expect(screen.getByRole('radio', { name: 'Plan' })).toBeChecked();
    expect(shown()).toBe('plan');
  });
});

/** The closed select's root (antd's `.ant-select`, carrying the field's id). */
const selectRoot = () => document.querySelector<HTMLElement>('[data-field-id="mode"]')!;
const isListOpen = () => screen.getByRole('combobox').getAttribute('aria-expanded') === 'true';
/** The keys that open a closed select: the arrows, Enter and Space. */
function pressOpeningKeys(target: HTMLElement) {
  for (const [key, keyCode] of [['ArrowDown', 40], ['Enter', 13], [' ', 32]] as const) {
    fireEvent.keyDown(target, { key, keyCode, which: keyCode });
  }
}

describe('OneOfSelect while its commit is pending', () => {
  it('is locked: the combobox stays focusable (not disabled), is said unavailable, still loading; the list does not open, nothing is requested; back to normal after', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed kind="OneOfSelect" fire={fire} />);
    await choose('OneOfSelect', 'Plan');
    expect(fire).toHaveBeenCalledWith('plan');
    const combobox = screen.getByRole('combobox');
    await waitFor(() => expect(combobox).toHaveAttribute('aria-disabled', 'true'));
    expect(combobox).not.toBeDisabled();
    expect(selectRoot()).not.toHaveClass('ant-select-disabled');
    expect(selectRoot()).toHaveClass('ant-select-loading');
    fireEvent.mouseDown(combobox);
    pressOpeningKeys(combobox);
    expect(isListOpen()).toBe(false);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(shown()).toBe('manual');
    await act(async () => { finish(); });
    await waitFor(() => expect(combobox).not.toHaveAttribute('aria-disabled'));
    expect(shown()).toBe('plan');
    fireEvent.mouseDown(combobox);
    await waitFor(() => expect(isListOpen()).toBe(true));
  });
});

describe('OneOfSelect while pending (the app\'s own)', () => {
  it('an open list closes as pending starts and stays closed, whatever asks to open it; it does not reopen by itself after', async () => {
    const { rerender } = wrap(<Inside kind="OneOfSelect" />);
    await openChoices('OneOfSelect');
    const combobox = screen.getByRole('combobox');
    expect(isListOpen()).toBe(true);
    rerender(<AntApp><Inside kind="OneOfSelect" pending /></AntApp>);
    expect(isListOpen()).toBe(false);
    expect(combobox).toHaveAttribute('aria-disabled', 'true');
    fireEvent.mouseDown(combobox);
    pressOpeningKeys(combobox);
    expect(isListOpen()).toBe(false);
    rerender(<AntApp><Inside kind="OneOfSelect" /></AntApp>);
    expect(isListOpen()).toBe(false);
    expect(combobox).not.toHaveAttribute('aria-disabled');
    fireEvent.mouseDown(combobox);
    await waitFor(() => expect(isListOpen()).toBe(true));
  });

  it('an opening asked for while locked shows nothing as pending ends, not even for a moment', () => {
    const { rerender } = wrap(<Inside kind="OneOfSelect" pending />);
    const combobox = screen.getByRole('combobox');
    fireEvent.mouseDown(combobox);
    pressOpeningKeys(combobox);
    rerender(<AntApp><Inside kind="OneOfSelect" /></AntApp>);
    // A list shown for a single commit would have been mounted (antd keeps it after).
    expect(document.querySelector('.ant-select-dropdown')).toBeNull();
    expect(isListOpen()).toBe(false);
  });

  it('a list open as the field turns disabled is closed, and stays closed when it is enabled again', async () => {
    const { rerender } = wrap(<Inside kind="OneOfSelect" />);
    await openChoices('OneOfSelect');
    expect(isListOpen()).toBe(true);
    rerender(<AntApp><Inside kind="OneOfSelect" enabled={denyWithReason('Read-only here')} /></AntApp>);
    expect(isListOpen()).toBe(false);
    rerender(<AntApp><Inside kind="OneOfSelect" /></AntApp>);
    expect(isListOpen()).toBe(false);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(isListOpen()).toBe(false);
  });

  it('keeps the disabled look: the disabled text colour and background, the not-allowed cursor', () => {
    function DisabledProbe() {
      const { token } = theme.useToken();
      return <span data-testid="probe" style={{ color: token.colorTextDisabled, background: token.colorBgContainerDisabled }} />;
    }
    wrap(<><Inside kind="OneOfSelect" pending /><DisabledProbe /></>);
    const probe = screen.getByTestId('probe');
    expect(probe.style.color).not.toBe('');
    expect(selectRoot().style.color).toBe(probe.style.color);
    expect(selectRoot().style.background).toBe(probe.style.background);
    expect(selectRoot().style.cursor).toBe('not-allowed');
    expect(screen.getByRole('combobox').style.cursor).toBe('not-allowed');
  });

  it('not enabled and pending: disabled as before, its reason on hover, not marked locked', async () => {
    wrap(<Inside kind="OneOfSelect" pending enabled={denyWithReason('Read-only here')} />);
    expect(selectRoot()).toHaveClass('ant-select-disabled');
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-disabled');
    expect(selectRoot().style.cursor).toBe('');
    fireEvent.mouseEnter(selectRoot().closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Read-only here')).toBeInTheDocument());
  });
});

describe('OneOfSegmented iconOnly', () => {
  it('shows only the icons; the label is the accessible name and leads the tooltip, before the field\'s description', async () => {
    wrap(<ThemeField kind="OneOfSegmented" iconOnly />);
    expect(screen.queryByText('Dark')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('moon-icon').closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Dark')).toBeInTheDocument());
    expect(screen.getByText(/A dark background$/)).toBeInTheDocument();
    expect(openTooltips()[0]).toHaveTextContent(/^Dark\s*The colour scheme\s*Switch to: A dark background$/);
  });
});

describe('field descriptions in markdown', () => {
  it('the closed select\'s tooltip renders the field description and the current state as markdown', async () => {
    wrap(<ThemeField kind="OneOfSelect" />);
    const root = document.querySelector<HTMLElement>('[data-field-id="theme"]')!;
    fireEvent.mouseEnter(root.closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('colour', { selector: 'em' })).toBeInTheDocument());
    expect(screen.getByText('light', { selector: 'strong' })).toBeInTheDocument();
  });

  it('the accessible description is plain text, without markdown markers', () => {
    wrap(<ThemeField kind="OneOfSelect" />);
    const select = document.querySelector<HTMLElement>('[data-field-id="theme"]')!;
    const described = select.getAttribute('aria-description') ?? select.querySelector('[aria-description]')?.getAttribute('aria-description');
    expect(described).toBe('The colour scheme Current state: A light background');
  });
});

/** The tooltip paragraphs on screen, as [kind, icon, text]. */
function tooltipParts(): [string | null, string | null, string][] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="tooltip"] [data-tooltip-part]')).map((part) => [
    part.getAttribute('data-tooltip-part'),
    part.querySelector('[role="img"]')?.getAttribute('aria-label') ?? null,
    part.textContent ?? '',
  ]);
}

describe.each(['OneOfSelect', 'OneOfSegmented'] as Kind[])('%s tooltip paragraphs', (kind) => {
  it('a disabled choice with a description: the reason led by a no-entry sign, then the description by an info sign', async () => {
    wrap(<Inside kind={kind} />);
    await hoverChoice(kind, 'Bypass');
    await waitFor(() => expect(tooltipParts()).toEqual([
      ['reason', 'stop', 'Not allowed for this task'],
      ['description', 'info-circle', 'Runs everything'],
    ]));
  });

  it('only a description: still led by the info sign', async () => {
    wrap(<Inside kind={kind} />);
    await hoverChoice(kind, 'Plan');
    // A segment says what picking it does (OneOfSegmented: "Switch to:").
    const lead = kind === 'OneOfSegmented' ? 'Switch to: ' : '';
    await waitFor(() => expect(tooltipParts()).toEqual([['description', 'info-circle', `${lead}Plans without editing`]]));
  });

  it('only a reason: still led by the no-entry sign', async () => {
    wrap(<Inside kind={kind} initialValue="manual"
      choices={[{ value: 'manual', label: 'Manual' }, { value: 'plan', label: 'Plan', enabled: denyWithReason('Nope') }]} />);
    await hoverChoice(kind, 'Plan');
    await waitFor(() => expect(tooltipParts()).toEqual([['reason', 'stop', 'Nope']]));
  });
});

describe('field tooltip paragraphs', () => {
  it('a disabled field: its reason led by the no-entry sign, its description by the info sign', async () => {
    wrap(<Inside kind="OneOfSelect" description="What it is" enabled={denyWithReason('Read-only here')} />);
    const root = document.querySelector<HTMLElement>('[data-field-id="mode"]')!;
    fireEvent.mouseEnter(root.closest('span[style]')!);
    await waitFor(() => expect(tooltipParts()).toEqual([
      ['reason', 'stop', 'Read-only here'],
      ['description', 'info-circle', 'What it is'],
    ]));
  });
});

describe('OneOfSegmented: the field\'s description on each segment', () => {
  const FIELD = 'How Claude asks for permission';

  it('an enabled field: each segment\'s tooltip leads with the field\'s description (info sign), then the choice\'s', async () => {
    wrap(<Inside kind="OneOfSegmented" description={FIELD} />);
    await hoverChoice('OneOfSegmented', 'Plan');
    await waitFor(() => expect(tooltipParts()).toEqual([
      ['description', 'info-circle', FIELD],
      ['description', 'info-circle', 'Switch to: Plans without editing'],
    ]));
  });

  it('a disabled choice: the field\'s description, then the choice\'s reason, then its description', async () => {
    wrap(<Inside kind="OneOfSegmented" description={FIELD} />);
    await hoverChoice('OneOfSegmented', 'Bypass');
    await waitFor(() => expect(tooltipParts()).toEqual([
      ['description', 'info-circle', FIELD],
      ['reason', 'stop', 'Not allowed for this task'],
      ['description', 'info-circle', 'Runs everything'],
    ]));
  });

  it('a segment with nothing of its own still shows the field\'s description', async () => {
    wrap(<Inside kind="OneOfSegmented" description={FIELD}
      choices={[{ value: 'manual', label: 'Manual' }, { value: 'plan', label: 'Plan' }]} />);
    await hoverChoice('OneOfSegmented', 'Plan');
    await waitFor(() => expect(tooltipParts()).toEqual([['description', 'info-circle', FIELD]]));
  });

  it('no field description: as before, a segment shows its choice\'s own, one with nothing of its own no tooltip', async () => {
    wrap(<Inside kind="OneOfSegmented"
      choices={[{ value: 'manual', label: 'Manual', description: 'Asks before acting' }, { value: 'plan', label: 'Plan' }]} />);
    await hoverChoice('OneOfSegmented', 'Plan');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(openTooltips()).toHaveLength(0);
    await hoverChoice('OneOfSegmented', 'Manual');
    await waitFor(() => expect(tooltipParts()).toEqual([['description', 'info-circle', 'Current state: Asks before acting']]));
  });

  it('a disabled field: as before, only the whole control\'s tooltip (its reason, then its description)', async () => {
    wrap(<Inside kind="OneOfSegmented" description={FIELD} enabled={denyWithReason('Read-only here')} />);
    await hoverChoice('OneOfSegmented', 'Plan');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(openTooltips()).toHaveLength(1);
    expect(tooltipParts()).toEqual([
      ['reason', 'stop', 'Read-only here'],
      ['description', 'info-circle', FIELD],
    ]);
  });

  it('the accessible description is as before: the field\'s description, then the current state', () => {
    wrap(<Inside kind="OneOfSegmented" description={FIELD} />);
    const root = document.querySelector<HTMLElement>('[data-field-id="mode"]')!;
    expect(root.getAttribute('aria-description')).toBe(`${FIELD} Current state: Asks before acting`);
  });
});

describe('OneOfSegmented: the current choice and the others', () => {
  it('the current segment\'s description is led by "Current state:"', async () => {
    wrap(<Inside kind="OneOfSegmented" />);
    await hoverChoice('OneOfSegmented', 'Manual');
    await waitFor(() => expect(tooltipParts()).toEqual([['description', 'info-circle', 'Current state: Asks before acting']]));
  });

  it('another enabled segment\'s description is led by "Switch to:"', async () => {
    wrap(<Inside kind="OneOfSegmented" />);
    await hoverChoice('OneOfSegmented', 'Plan');
    await waitFor(() => expect(tooltipParts()).toEqual([['description', 'info-circle', 'Switch to: Plans without editing']]));
  });

  it('a disabled segment: its reason, then its description without "Switch to:" (it cannot be switched to)', async () => {
    wrap(<Inside kind="OneOfSegmented" />);
    await hoverChoice('OneOfSegmented', 'Bypass');
    await waitFor(() => expect(tooltipParts()).toEqual([
      ['reason', 'stop', 'Not allowed for this task'],
      ['description', 'info-circle', 'Runs everything'],
    ]));
  });

  it('both leads are translated through VultusProvider\'s texts', async () => {
    render(
      <VultusProvider texts={{ currentState: 'Jelenleg:', switchTo: 'Váltás erre:' }}>
        <AntApp><Inside kind="OneOfSegmented" /></AntApp>
      </VultusProvider>,
    );
    await hoverChoice('OneOfSegmented', 'Plan');
    await waitFor(() => expect(tooltipParts()).toEqual([['description', 'info-circle', 'Váltás erre: Plans without editing']]));
    await hoverChoice('OneOfSegmented', 'Manual');
    await waitFor(() => expect(tooltipParts()).toContainEqual(['description', 'info-circle', 'Jelenleg: Asks before acting']));
  });
});

describe('the no-entry sign', () => {
  it('is gray (the tooltip\'s own colour, dimmed), not the danger colour: a disabled choice is no danger', async () => {
    wrap(<Inside kind="OneOfSegmented" />);
    await hoverChoice('OneOfSegmented', 'Bypass');
    await waitFor(() => expect(document.querySelector('[role="tooltip"] [data-tooltip-part="reason"]')).not.toBeNull());
    const sign = document.querySelector<HTMLElement>('[role="tooltip"] [data-tooltip-part="reason"] [aria-label="stop"]')!.parentElement!;
    expect(sign).toHaveStyle({ opacity: '0.65' });
    expect(sign.style.color).toBe('');
  });
});

describe('OneOfSelect groups', () => {
  type Model = 'opus' | 'sonnet' | 'opus-4' | 'sonnet-4';
  function Grouped() {
    const field = useOneOfField<Model>({
      id: 'model', label: 'Model', initialValue: 'opus',
      choices: [
        { value: 'opus', label: 'Opus 5' },
        { value: 'opus-4', label: 'Opus 4', group: 'Older versions' },
        { value: 'sonnet', label: 'Sonnet 5' },
        { value: 'sonnet-4', label: 'Sonnet 4', group: 'Older versions', description: 'The previous Sonnet' },
      ],
    });
    return <><OneOfSelect field={field} /><output>{field.value}</output></>;
  }

  it('lists the ungrouped choices first, then each group under its header', async () => {
    wrap(<Grouped />);
    await openChoices('OneOfSelect');
    const rows = Array.from(document.querySelectorAll('.ant-select-item')).map((r) => (
      r.classList.contains('ant-select-item-group') ? `## ${r.textContent}` : r.textContent));
    expect(rows).toEqual(['Opus 5', 'Sonnet 5', '## Older versions', 'Opus 4', 'Sonnet 4']);
  });

  it('a grouped choice is described and chosen like any other', async () => {
    wrap(<Grouped />);
    await hoverChoice('OneOfSelect', 'Sonnet 4');
    await waitFor(() => expect(screen.getByText('The previous Sonnet')).toBeInTheDocument());
    fireEvent.click(choiceElement('OneOfSelect', 'Sonnet 4'));
    await waitFor(() => expect(shown()).toBe('sonnet-4'));
  });
});

describe('OneOfSelect inlineDescriptions', () => {
  const DESCRIBED: OneOfChoice<Mode>[] = [
    { value: 'manual', label: 'Manual', description: 'Asks before acting' },
    { value: 'plan', label: 'Plan', description: 'Plans **without** editing; a longer description that has to wrap' },
    { value: 'bypass', label: 'Bypass', description: 'Runs everything', enabled: denyWithReason('Not allowed for this task') },
  ];
  function Described() {
    const field = useOneOfField<Mode>({ id: 'mode', label: 'Mode', choices: DESCRIBED, initialValue: 'manual' });
    return <><OneOfSelect field={field} inlineDescriptions /><output>{field.value}</output></>;
  }
  /** An open list's row, by the choice's label. */
  const row = (label: string) => Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option'))
    .find((o) => o.querySelector('[data-choice-part="label"]')?.textContent === label)!;
  const part = (label: string, which: 'label' | 'description') =>
    row(label).querySelector<HTMLElement>(`[data-choice-part="${which}"]`)!;

  it('each item: its label as a bold heading, then its description, smaller and wrapping (markdown)', async () => {
    wrap(<Described />);
    await openChoices('OneOfSelect');
    expect(part('Plan', 'label')).toHaveStyle({ fontWeight: '600' });
    const description = part('Plan', 'description');
    expect(description).toHaveStyle({ fontSize: '12px', whiteSpace: 'normal' });
    expect(within(description).getByText('without', { selector: 'strong' })).toBeInTheDocument();
  });

  it('hovering an item opens no tooltip; a disabled item shows only its reason', async () => {
    wrap(<Described />);
    await openChoices('OneOfSelect');
    fireEvent.mouseEnter(part('Plan', 'label'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(openTooltips()).toHaveLength(0);
    fireEvent.mouseEnter(row('Bypass').querySelector('span[style]')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).toHaveTextContent('Not allowed for this task');
    expect(openTooltips()[0]).not.toHaveTextContent('Runs everything');
  });

  it('the closed select shows the label only', () => {
    wrap(<Described />);
    const selected = document.querySelector<HTMLElement>('.ant-select-content, .ant-select-selection-item')!;
    expect(selected).toHaveTextContent('Manual');
    expect(selected).not.toHaveTextContent('Asks before acting');
  });

  it('the list is at least 320px wide, so descriptions wrap readably', async () => {
    wrap(<Described />);
    await openChoices('OneOfSelect');
    const list = document.querySelector<HTMLElement>('.ant-select-dropdown')!;
    expect(list.style.width || list.style.minWidth).toBe('320px');
  });

  it('a choice is chosen as before', async () => {
    wrap(<Described />);
    await openChoices('OneOfSelect');
    fireEvent.click(row('Plan'));
    await waitFor(() => expect(shown()).toBe('plan'));
  });
});
