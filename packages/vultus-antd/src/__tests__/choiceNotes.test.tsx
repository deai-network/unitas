import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App as AntApp, theme } from 'antd';
import { useState } from 'react';
import {
  useManyOfField, type FieldCommit, type ManyOfFieldControls, type OneOfChoice, type OneOfChoiceControls,
} from 'vultus-core';
import { ChoiceLabel } from '../ChoiceLabel.js';
import { ChoiceNote } from '../ChoiceNote.js';
import { OneOfSelect } from '../OneOfSelect.js';
import { useManyOfRequest } from '../useManyOfRequest.js';
import { useOneOfField, type OneOfFieldOptions } from 'vultus-core';

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);

/** A reference span painted with colorTextDescription, so tests compare against the live theme rather than a hard-coded hex. */
function DescriptionColorProbe() {
  const { token } = theme.useToken();
  return <span data-testid="probe" style={{ color: token.colorTextDescription }} />;
}

describe('ChoiceNote', () => {
  it('shows the note in the description colour', () => {
    render(<><ChoiceNote note="12" /><DescriptionColorProbe /></>);
    const note = screen.getByText('12');
    const probe = screen.getByTestId('probe');
    expect(note.style.color).not.toBe('');
    expect(note.style.color).toBe(probe.style.color);
  });

  it('renders nothing without a note', () => {
    const { container } = render(<ChoiceNote note={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ChoiceLabel dimmed', () => {
  const base: Pick<OneOfChoiceControls, 'label' | 'enabled' | 'variant' | 'icon'> = {
    label: 'Idle', enabled: true, variant: 'primary', icon: undefined,
  };

  it('a dimmed choice is in the description colour even when enabled and primary', () => {
    render(<><ChoiceLabel choice={{ ...base, dimmed: true }} /><DescriptionColorProbe /></>);
    const label = screen.getByText('Idle');
    const probe = screen.getByTestId('probe');
    expect(label.style.color).toBe(probe.style.color);
  });

  it('not dimmed: the variant colour still applies (unchanged behaviour)', () => {
    render(<><ChoiceLabel choice={{ ...base, dimmed: false }} /><DescriptionColorProbe /></>);
    const label = screen.getByText('Idle');
    const probe = screen.getByTestId('probe');
    expect(label.style.color).not.toBe(probe.style.color);
  });

  it('a choice built without dimmed (as before dimmed existed) is not dimmed: the variant colour applies', () => {
    render(<><ChoiceLabel choice={base} /><DescriptionColorProbe /></>);
    const label = screen.getByText('Idle');
    expect(label.style.color).not.toBe('');
    expect(label.style.color).not.toBe(screen.getByTestId('probe').style.color);
    expect(label.style.fontWeight).toBe('600');
  });

  it('a dimmed, disabled choice is still in the description colour', () => {
    render(<><ChoiceLabel choice={{ ...base, enabled: false, dimmed: true }} /><DescriptionColorProbe /></>);
    const label = screen.getByText('Idle');
    const probe = screen.getByTestId('probe');
    expect(label.style.color).toBe(probe.style.color);
  });
});

type Bucket = 'todo' | 'doing' | 'done';
const BUCKET_CHOICES: OneOfChoice<Bucket>[] = [
  { value: 'todo', label: 'Todo', note: '3' },
  { value: 'doing', label: 'Doing', note: '1', dimmed: true },
  { value: 'done', label: 'Done' },
];

function BucketField() {
  const field = useOneOfField<Bucket>({ id: 'bucket', label: 'Bucket', choices: BUCKET_CHOICES, initialValue: 'todo' } as OneOfFieldOptions<Bucket>);
  return <OneOfSelect field={field} />;
}

async function openList() {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option').length).toBeGreaterThan(0));
}

describe('OneOfSelect notes and dimmed choices', () => {
  it("shows each choice's note, right-aligned after its label", async () => {
    wrap(<BucketField />);
    await openList();
    const option = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option'))
      .find((o) => o.textContent === 'Todo3')!;
    expect(option).toBeTruthy();
    const row = option.querySelector<HTMLElement>('[style*="justify-content"]')!;
    expect(row.style.justifyContent).toBe('space-between');
    const [label, note] = Array.from(row.children) as HTMLElement[];
    expect(label.textContent).toBe('Todo');
    expect(note.textContent).toBe('3');
  });

  it('a dimmed choice is shown in the description colour and is still selectable', async () => {
    wrap(<><BucketField /><DescriptionColorProbe /></>);
    await openList();
    const option = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option'))
      .find((o) => o.textContent === 'Doing1')!;
    const row = option.querySelector<HTMLElement>('[style*="justify-content"]')!;
    const [label] = Array.from(row.children) as HTMLElement[];
    const probe = screen.getByTestId('probe');
    expect(label.style.color).toBe(probe.style.color);
    fireEvent.click(option);
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    expect(document.querySelector('[data-field-id="bucket"]')).toHaveAttribute('data-value', 'doing');
  });

  it('a choice without a note shows only its label', async () => {
    wrap(<BucketField />);
    await openList();
    const option = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option'))
      .find((o) => o.textContent === 'Done')!;
    expect(option).toBeTruthy();
  });
});

function BucketFieldInline() {
  const field = useOneOfField<Bucket>({ id: 'bucket', label: 'Bucket', choices: BUCKET_CHOICES, initialValue: 'todo' } as OneOfFieldOptions<Bucket>);
  return <OneOfSelect field={field} inlineDescriptions />;
}

describe('OneOfSelect inlineDescriptions notes', () => {
  it("shows each choice's note, right-aligned on the label line (the spec: choices show their note in the widgets that list them)", async () => {
    wrap(<BucketFieldInline />);
    await openList();
    const label = Array.from(document.querySelectorAll<HTMLElement>('[data-choice-part="label"]'))
      .find((el) => el.textContent === 'Todo3')!;
    expect(label).toBeTruthy();
    expect(label.style.display).toBe('flex');
    expect(label.style.justifyContent).toBe('space-between');
    const [labelPart, notePart] = Array.from(label.children) as HTMLElement[];
    expect(labelPart.textContent).toBe('Todo');
    expect(notePart.textContent).toBe('3');
  });
});

type Tag = 'a' | 'b' | 'c';
const TAG_CHOICES: OneOfChoice<Tag>[] = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
];

function ManyOfHarness({ fire, confirmation, initial = ['a'] }: {
  fire: (next: Tag[]) => Promise<void> | void;
  confirmation?: FieldCommit<Tag[]>['confirmation'];
  initial?: Tag[];
}) {
  const [stored, setStored] = useState<Tag[]>(initial);
  const field: ManyOfFieldControls<Tag> = useManyOfField<Tag>({
    id: 'tags', label: 'Tags', choices: TAG_CHOICES, value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  const { request, wrap: wrapRequest, asking } = useManyOfRequest(field);
  return wrapRequest(
    <div>
      <button onClick={() => request(['b'])}>request-b</button>
      <button onClick={() => request(['b', 'c'])}>request-bc</button>
      <button onClick={() => request([...stored].reverse())}>request-reordered</button>
      <output>{field.value.join(',')}</output>
      <output data-testid="asking">{String(asking)}</output>
    </div>,
  );
}

describe('useManyOfRequest', () => {
  it('commits the requested list (no confirmation) and shows the stored value', async () => {
    const fire = vi.fn();
    wrap(<ManyOfHarness fire={fire} />);
    fireEvent.click(screen.getByText('request-b'));
    await waitFor(() => expect(fire).toHaveBeenCalledWith(['b']));
  });

  it('nothing while a commit is pending', async () => {
    let resolveFire: () => void = () => {};
    const fire = vi.fn(() => new Promise<void>((resolve) => { resolveFire = resolve; }));
    wrap(<ManyOfHarness fire={fire} />);
    fireEvent.click(screen.getByText('request-b'));
    await waitFor(() => expect(fire).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('request-bc'));
    expect(fire).toHaveBeenCalledTimes(1);
    await act(async () => { resolveFire(); });
  });

  it("asks the confirmation for the requested list first; a cascade modal's OK is labelled with the field's label", async () => {
    const fire = vi.fn();
    wrap(<ManyOfHarness fire={fire}
      confirmation={() => ({ kind: 'cascade-modal', title: 'Change tags?', content: 'Sure?' })} />);
    fireEvent.click(screen.getByText('request-bc'));
    expect(fire).not.toHaveBeenCalled();
    // The title is shown twice (header + confirm paragraph), so a plain findByText would match more than one.
    await waitFor(() => expect(screen.getAllByText('Change tags?').length).toBeGreaterThan(0));
    const ok = screen.getAllByRole('button').find((b) => b.textContent === 'Tags');
    expect(ok).toBeTruthy();
    await act(async () => { fireEvent.click(ok!); });
    expect(fire).toHaveBeenCalledWith(['b', 'c']);
  });

  it('a request equal to the current value as a set (regardless of order) does nothing', () => {
    const fire = vi.fn();
    wrap(<ManyOfHarness fire={fire} initial={['a', 'b']} />);
    fireEvent.click(screen.getByText('request-reordered'));
    expect(fire).not.toHaveBeenCalled();
  });

  it('a double request while a confirmation is open fires once', async () => {
    const fire = vi.fn();
    wrap(<ManyOfHarness fire={fire}
      confirmation={() => ({ kind: 'popconfirm', question: 'Sure?' })} />);
    fireEvent.click(screen.getByText('request-b'));
    await screen.findByText('Sure?');
    fireEvent.click(screen.getByText('request-bc'));
    const ok = screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'))!;
    await act(async () => { fireEvent.click(ok); });
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(['b']);
  });
});
