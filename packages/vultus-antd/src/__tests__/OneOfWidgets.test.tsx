import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { useState } from 'react';
import { denyWithReason, useOneOfField, type FieldCommit, type OneOfChoice, type OneOfFieldOptions } from 'vultus-core';
import { OneOfSegmented } from '../OneOfSegmented.js';
import { OneOfSelect } from '../OneOfSelect.js';
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
    await waitFor(() => expect(screen.getByText('Plans without editing')).toBeInTheDocument());
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

function Variants({ kind, initial = 'keep', confirmBurn }: { kind: Kind; initial?: Act; confirmBurn?: boolean }) {
  const [stored, setStored] = useState<Act>(initial);
  const field = useOneOfField<Act>({
    id: 'act', label: 'Act', choices: VARIANT_CHOICES, value: stored,
    commit: {
      confirmation: (next) => (confirmBurn && next === 'burn' ? { kind: 'popconfirm', question: 'Burn it?' } : undefined),
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

describe('OneOfSegmented iconOnly', () => {
  it('shows only the icons; the label is the accessible name and leads the tooltip', async () => {
    wrap(<ThemeField kind="OneOfSegmented" iconOnly />);
    expect(screen.queryByText('Dark')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('moon-icon').closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Dark')).toBeInTheDocument());
    expect(screen.getByText('A dark background')).toBeInTheDocument();
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
    await waitFor(() => expect(tooltipParts()).toEqual([['description', 'info-circle', 'Plans without editing']]));
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
