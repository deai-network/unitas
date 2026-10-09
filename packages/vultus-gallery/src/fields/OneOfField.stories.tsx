import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Space, Tag } from 'antd';
import { useState } from 'react';
import { OneOfSegmented, OneOfSelect, OneOfSlider, denyWithReason, useOneOfField, type OneOfChoice } from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';

/**
 * useOneOfField: a field whose value is one of a list of choices (moxb's
 * OneOf). Each choice has a label, a description (shown when hovering it, and
 * as the field's current state while it is chosen) and may be disabled with a
 * reason. The same field renders as OneOfSelect, OneOfSegmented and, for
 * ordered choices, OneOfSlider.
 */
const meta: Meta = { title: 'Fields/One of' };
export default meta;

type Mode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'dontAsk' | 'bypassPermissions';

const NEEDS_GATE = 'Needs the permission gate: this task has no one to answer Claude\'s questions (permission_gate is off).';
const NO_BYPASS = 'Not allowed for this task (allow_bypass_permissions).';

function modeChoices(permissionGate: boolean, bypassAllowed: boolean): OneOfChoice<Mode>[] {
  return [
    { value: 'default', label: 'Manual', description: 'Asks before editing files or running commands',
      enabled: permissionGate || denyWithReason(NEEDS_GATE) },
    { value: 'acceptEdits', label: 'Accept edits', description: 'Edits files without asking; asks before other commands' },
    { value: 'plan', label: 'Plan', description: 'Reads and plans without editing; asks you to approve the plan',
      enabled: permissionGate || denyWithReason(NEEDS_GATE) },
    { value: 'auto', label: 'Auto', description: 'A classifier reviews each action instead of you; risky actions are blocked' },
    { value: 'dontAsk', label: 'Don\'t ask', description: 'Runs only pre-approved tools; refuses anything that would need approval' },
    { value: 'bypassPermissions', label: 'Bypass', description: 'Runs **everything** without asking', variant: 'danger',
      enabled: bypassAllowed || denyWithReason(NO_BYPASS) },
  ];
}

interface PermissionArgs { permissionGate: boolean; bypassAllowed: boolean; readOnly: boolean; latencyMs: number }

export const PermissionMode: StoryObj<PermissionArgs> = {
  name: 'Permission mode (Claude Code)',
  args: { permissionGate: false, bypassAllowed: true, readOnly: false, latencyMs: 600 },
  argTypes: { latencyMs: { control: { type: 'range', min: 0, max: 3000, step: 100 } } },
  render: function Render({ permissionGate, bypassAllowed, readOnly, latencyMs }) {
    const [stored, setStored] = useState<Mode>('acceptEdits');
    const field = useOneOfField<Mode>({
      id: 'session.permission_mode',
      label: 'Permissions',
      description: 'How Claude asks before it acts. See [permission modes](https://code.claude.com/docs/en/permission-modes).',
      choices: modeChoices(permissionGate, bypassAllowed),
      enabled: readOnly ? denyWithReason('The session has ended.') : true,
      value: stored,
      commit: {
        confirmation: (next) => (next === 'bypassPermissions'
          ? { kind: 'popconfirm', question: 'Switch to Bypass? Claude will run everything without asking.' }
          : undefined),
        fire: async (next) => { await delay(latencyMs); setStored(next); },
      },
    });
    return (
      <Showcase
        title="Permission mode"
        note="The Claude Code session control: all six modes are always listed. Without the permission gate, Manual and Plan (they ask the operator) are disabled with the reason; Bypass (a danger choice: red while it can be chosen, and its confirmation's OK is a danger button) is disabled unless the task allows it, and asks for a confirmation; while Bypass is current, the closed select shows it red too. Hover the closed select for the field's description and current state, and each choice (in the list or on the segmented control) for its description or reason. Changes commit to a pretend server (latency); 'readOnly' disables the whole field."
      >
        <Space size={32} align="center" wrap>
          <Example label="OneOfSelect"><OneOfSelect field={field} /></Example>
          <Example label="OneOfSegmented"><OneOfSegmented field={field} /></Example>
          <Example label="field.value"><Tag>{field.value}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

function Preference<T extends string>({ id, label, description, choices, initial, iconOnly }: {
  id: string; label: string; description: string; choices: OneOfChoice<T>[]; initial: T; iconOnly?: boolean;
}) {
  const field = useOneOfField<T>({ id, label, description, choices, initialValue: initial });
  return (
    <Space size={16} align="center">
      <Example label={label}><OneOfSegmented field={field} size="small" iconOnly={iconOnly} /></Example>
      <Tag>{field.value}</Tag>
    </Space>
  );
}

export const HeaderPreferences: StoryObj = {
  name: 'Header preferences (segmented)',
  render: () => (
    <Showcase
      title="Header preferences"
      note="Short choices that are always visible, as OneOfSegmented: the value lives inside each field. A choice may carry an icon (shown before its label); iconOnly shows just the icons, the label becoming the accessible name and leading the tooltip. Descriptions are markdown. Hover a segment for its description."
    >
      <Space orientation="vertical" size={16}>
        <Preference id="pref.theme" label="Theme (iconOnly)" description="The colour scheme." initial="light" iconOnly
          choices={[
            { value: 'light', label: 'Light', description: 'A *light* background', icon: <SunOutlined /> },
            { value: 'dark', label: 'Dark', description: 'A *dark* background', icon: <MoonOutlined /> },
          ]} />
        <Preference id="pref.theme2" label="Theme (icon and label)" description="The colour scheme." initial="dark"
          choices={[
            { value: 'light', label: 'Light', description: 'A *light* background', icon: <SunOutlined /> },
            { value: 'dark', label: 'Dark', description: 'A *dark* background', icon: <MoonOutlined /> },
          ]} />
        <Preference id="pref.language" label="Language" description="The interface language." initial="en"
          choices={[{ value: 'en', label: 'EN', description: 'English' }, { value: 'de', label: 'DE', description: 'Deutsch' }]} />
        <Preference id="pref.mode" label="Mode" description="How much the interface shows." initial="simple"
          choices={[{ value: 'simple', label: 'Simple', description: 'The essentials only' }, { value: 'complex', label: 'Complex', description: 'Every setting and detail' }]} />
      </Space>
    </Showcase>
  ),
};

type Channel = 'stable' | 'beta' | 'nightly' | 'legacy';

export const Variants: StoryObj = {
  name: 'Primary and danger choices',
  render: function Render() {
    const [stored, setStored] = useState<Channel>('stable');
    const field = useOneOfField<Channel>({
      id: 'release.channel',
      label: 'Release channel',
      description: 'Which builds this installation follows.',
      choices: [
        { value: 'stable', label: 'Stable', description: 'Tested releases (recommended)', variant: 'primary' },
        { value: 'beta', label: 'Beta', description: 'Release candidates' },
        { value: 'nightly', label: 'Nightly', description: 'Untested builds; may break', variant: 'danger' },
        { value: 'legacy', label: 'Legacy', description: 'The old build line', variant: 'danger',
          enabled: denyWithReason('No longer supported.') },
      ],
      value: stored,
      commit: {
        confirmation: (next) => (next === 'nightly' ? { kind: 'popconfirm', question: 'Follow untested nightly builds?' } : undefined),
        fire: async (next) => { await delay(300); setStored(next); },
      },
    });
    return (
      <Showcase
        title="Primary and danger choices"
        note="A choice's variant, as an action's: primary is bold in the primary colour, danger in the danger colour, as in CombinedActionButton's list. A disabled choice (Legacy) is never tinted. The closed select mirrors the current choice; choosing Nightly asks a confirmation whose OK is a danger button."
      >
        <Space size={32} align="center" wrap>
          <Example label="OneOfSelect"><OneOfSelect field={field} /></Example>
          <Example label="OneOfSegmented"><OneOfSegmented field={field} /></Example>
          <Example label="field.value"><Tag>{field.value}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

type Effort = 'low' | 'medium' | 'high' | 'max';

interface EffortArgs { maxOnThisModel: boolean; compact: boolean; readOnly: boolean; latencyMs: number }

export const Effort: StoryObj<EffortArgs> = {
  name: 'Effort (slider)',
  args: { maxOnThisModel: false, compact: false, readOnly: false, latencyMs: 600 },
  argTypes: { latencyMs: { control: { type: 'range', min: 0, max: 3000, step: 100 } } },
  render: function Render({ maxOnThisModel, compact, readOnly, latencyMs }) {
    const [stored, setStored] = useState<Effort>('medium');
    const field = useOneOfField<Effort>({
      id: 'session.effort',
      label: 'Effort',
      description: 'How much should the model think before it answers?',
      choices: [
        { value: 'low', label: 'Low', description: 'Answers quickly' },
        { value: 'medium', label: 'Medium', description: 'Thinks a little' },
        { value: 'high', label: 'High', description: 'Thinks **carefully**' },
        { value: 'max', label: 'Max', description: 'Thinks as long as it needs; slow and costly', variant: 'danger',
          enabled: maxOnThisModel || denyWithReason('Not on this model.') },
      ],
      enabled: readOnly ? denyWithReason('The session has ended.') : true,
      value: stored,
      commit: {
        confirmation: (next) => (next === 'max' ? { kind: 'popconfirm', question: 'Think as long as it needs? Answers get slow and costly.' } : undefined),
        fire: async (next) => { await delay(latencyMs); setStored(next); },
      },
    });
    return (
      <Showcase
        title="Effort"
        note="Ordered choices as OneOfSlider: each choice a mark on the track, the handle on the current one. Hover the slider anywhere for the field's description and current state, a mark for its own description (Max: its reason first while disabled). A choice is requested once per move, when it ends (release, a mark click, an arrow key), not at each step of a drag; a move that ends on a disabled choice requests nothing and the handle returns. While the requested choice is asked and committed (latency) the handle stays on it. 'compact' sets markStyle to a smaller font, as in a dense toolbar. The same field as OneOfSegmented for comparison; changes commit to a pretend server (latency)."
      >
        <Space size={32} align="center" wrap>
          <Example label="OneOfSlider"><OneOfSlider field={field} markStyle={compact ? { fontSize: 11 } : undefined} /></Example>
          <Example label="OneOfSegmented"><OneOfSegmented field={field} /></Example>
          <Example label="field.value"><Tag>{field.value}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

type ModelId = 'default' | 'opus' | 'sonnet' | 'claude-opus-5' | 'claude-opus-4-8' | 'claude-sonnet-5';

export const GroupedChoices: StoryObj<{ inlineDescriptions: boolean }> = {
  name: 'Grouped choices (model list)',
  args: { inlineDescriptions: true },
  render: function Render({ inlineDescriptions }) {
    const field = useOneOfField<ModelId>({
      id: 'session.model',
      label: 'Model',
      description: 'Which model should Claude use?',
      initialValue: 'default',
      choices: [
        { value: 'default', label: 'Default (recommended)', description: 'Opus 5.5 - Best for everyday, complex tasks' },
        { value: 'opus', label: 'Opus 5.5', description: 'For complex work and everyday tasks' },
        { value: 'sonnet', label: 'Sonnet 5.5', description: 'Most efficient for simpler tasks' },
        { value: 'claude-opus-5', label: 'Opus 5', description: 'Best for everyday, complex tasks', group: 'Older versions' },
        { value: 'claude-opus-4-8', label: 'Opus 4.8', description: 'Best for everyday, complex tasks', group: 'Older versions' },
        { value: 'claude-sonnet-5', label: 'Sonnet 5', description: 'Efficient for routine tasks', group: 'Older versions' },
      ],
    });
    return (
      <Showcase
        title="Grouped choices"
        note="A choice may name a group: OneOfSelect lists the choices without one first, then each group under its heading. Here Claude Code's model list: the current models, then older versions of each family. inlineDescriptions shows each description in the open list under its label instead of in a tooltip (the closed select shows the label only)."
      >
        <Space size={32} align="center" wrap>
          <Example label="OneOfSelect"><OneOfSelect field={field} inlineDescriptions={inlineDescriptions} /></Example>
          <Example label="field.value"><Tag>{field.value}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};
