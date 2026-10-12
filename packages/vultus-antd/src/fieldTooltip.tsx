import type { ReactNode } from 'react';
import type { FieldControls } from 'vultus-core';
import { ReasonMarkdown } from './ReasonMarkdown.js';
import type { VultusTexts } from './texts.js';

type DescribedField = Pick<FieldControls<unknown, unknown>, 'enabled' | 'whyDisabled' | 'description' | 'valueDescription'>;

type DescribedChoice = { label: string; enabled: boolean; whyDisabled?: string; description?: string };

/** "Current state: <what the current value means>" (markdown), or nothing without a value description. */
function currentState(field: DescribedField, texts: VultusTexts): string | undefined {
  return field.valueDescription ? `${texts.currentState} ${field.valueDescription}` : undefined;
}

/**
 * What a field's tooltip says. Enabled: what the field is, then its current
 * state (the value's description, led by "Current state:", so it is not read
 * as a promise of what the field does); `withState` false leaves the state
 * out (OneOfSlider, whose marks say it). Disabled: why, then what the field
 * is; the current state is left out, since its description usually says what
 * a click would do. A reason is led by a no-entry sign, a description by an
 * info sign, so the two never read as one text.
 */
export function fieldTooltip(field: DescribedField, texts: VultusTexts, withState = true): ReactNode | undefined {
  const state = withState ? currentState(field, texts) : undefined;
  return stack(field.enabled
    ? [field.description && <TooltipPart kind="description" text={field.description} />,
      state && <ReasonMarkdown>{state}</ReasonMarkdown>]
    : [field.whyDisabled && <TooltipPart kind="reason" text={field.whyDisabled} />,
      field.description && <TooltipPart kind="description" text={field.description} />]);
}

/**
 * What leads a choice's description where every choice is on show
 * (shownChoiceTooltip: OneOfSegmented's segments, OneOfSlider's marks): "Current state:" for the
 * current choice, "Switch to:" for another enabled one (what a click does),
 * nothing for a disabled one (it cannot be switched to; its reason says why).
 */
export function choiceLead(choice: { enabled: boolean }, current: boolean, texts: VultusTexts): string | undefined {
  if (current) return texts.currentState;
  return choice.enabled ? texts.switchTo : undefined;
}

/**
 * What a one-of field's choice says on hover: its description; a disabled
 * choice its reason first (each led by its sign, as in fieldTooltip).
 * `withLabel` leads with the label (an icon-only choice, whose label is not
 * shown); `withDescription` false leaves the description out (shown in the
 * list itself), so only a disabled choice's reason remains. `lead` (see
 * choiceLead) goes before the description.
 */
export function choiceTooltip(
  choice: DescribedChoice, withLabel = false, withDescription = true, lead?: string,
): ReactNode | undefined {
  return stack([withLabel && choice.label, ...choiceParts(choice, withDescription, lead)]);
}

/**
 * What a choice shown on an enabled one-of field's control says on hover (a
 * segment of OneOfSegmented, a mark of OneOfSlider): the field's description,
 * led by its info sign as in fieldTooltip, so the choice is read as a value of
 * that field, then the choice's reason and description (as choiceTooltip,
 * `lead` before the description). `withLabel` leads with the choice's label,
 * before the field's description (an icon-only choice, named nowhere else).
 * A choice with nothing of its own still shows the field's description.
 */
export function shownChoiceTooltip(
  field: Pick<DescribedField, 'description'>, choice: DescribedChoice, withLabel = false, lead?: string,
): ReactNode | undefined {
  return stack([
    withLabel && choice.label,
    field.description && <TooltipPart kind="description" text={field.description} />,
    ...choiceParts(choice, true, lead),
  ]);
}

/**
 * A choice's own tooltip paragraphs, unstacked: a disabled one's reason, then
 * its description (led by `lead` when given).
 */
function choiceParts(choice: DescribedChoice, withDescription: boolean, lead?: string): ReactNode[] {
  const description = choice.description && (lead ? `${lead} ${choice.description}` : choice.description);
  return [
    !choice.enabled && choice.whyDisabled && <TooltipPart kind="reason" text={choice.whyDisabled} />,
    withDescription && description && <TooltipPart kind="description" text={description} />,
  ];
}

/** Tooltip paragraphs one under the other, the empty ones left out. */
function stack(parts: ReactNode[]): ReactNode | undefined {
  const present = parts.filter(Boolean);
  if (present.length === 0) return undefined;
  return (
    <>
      {present.map((part, index) => (
        <div key={index} style={{ marginTop: index > 0 ? 6 : 0 }}>{part}</div>
      ))}
    </>
  );
}

/**
 * One tooltip paragraph (markdown) led by its sign: why something is disabled
 * by a gray no-entry sign (the tooltip's own colour, dimmed: a disabled thing
 * is no danger, so not the danger colour; owner ruling 2026-10-09), what
 * something is by an info sign.
 */
function TooltipPart({ kind, text }: { kind: 'reason' | 'description'; text: string }) {
  return (
    <div data-tooltip-part={kind} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ flex: 'none', opacity: kind === 'reason' ? 0.65 : undefined }}>
        {kind === 'reason' ? <StopIcon /> : <InfoCircleIcon />}
      </span>
      <div style={{ minWidth: 0 }}><ReasonMarkdown>{text}</ReasonMarkdown></div>
    </div>
  );
}

/** Markdown as plain text, for accessible descriptions: links keep their text, emphasis and code markers go. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|\*|_|`)/g, '');
}

/** The field's accessible description: what it is, then its current state (as the enabled tooltip). */
export function fieldAccessibleDescription(field: DescribedField, texts: VultusTexts): string | undefined {
  return [field.description, currentState(field, texts)].filter(Boolean).map((t) => plainText(t!)).join(' ') || undefined;
}

// antd's InfoCircleOutlined and StopOutlined, inlined (as EllipsisIcon in
// CombinedActionButton) so vultus-antd needs no @ant-design/icons dependency;
// same markup as the icon components.
function InfoCircleIcon() {
  return (
    <span role="img" aria-label="info-circle" className="anticon anticon-info-circle">
      <svg viewBox="64 64 896 896" focusable="false" data-icon="info-circle" width="1em" height="1em" fill="currentColor" aria-hidden="true">
        <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z" />
        <path d="M464 336a48 48 0 1096 0 48 48 0 10-96 0zm72 112h-48c-4.4 0-8 3.6-8 8v272c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8V456c0-4.4-3.6-8-8-8z" />
      </svg>
    </span>
  );
}

function StopIcon() {
  return (
    <span role="img" aria-label="stop" className="anticon anticon-stop">
      <svg viewBox="64 64 896 896" focusable="false" data-icon="stop" width="1em" height="1em" fill="currentColor" aria-hidden="true">
        <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372 0-89 31.3-170.8 83.5-234.8l523.3 523.3C682.8 852.7 601 884 512 884zm288.5-137.2L277.2 223.5C341.2 171.3 423 140 512 140c205.4 0 372 166.6 372 372 0 89-31.3 170.8-83.5 234.8z" />
      </svg>
    </span>
  );
}
