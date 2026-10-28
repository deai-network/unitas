import type { Meta, StoryObj } from '@storybook/react-vite';
import { Space, Tag } from 'antd';
import { useState, type CSSProperties } from 'react';
import {
  ActionButton, BoolCheckbox, BoolSwitch, OneOfSegmented, OneOfSelect, SpinnerScope, VultusProvider,
  useAction, useBoolField, useOneOfField, useSpinnerKey,
  type SpinnerComponent, type SpinnerProps,
} from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';

/** antd's names for the height of its own Spin indicator, or a height in px (SpinnerProps.size). */
const SIZE_PX: Record<'small' | 'default' | 'large', number> = { small: 14, default: 20, large: 32 };

/**
 * A stand-in for an app's own spinner (e.g. daeo-style's DaeoSpinner): a small
 * two-colour CSS ring, visibly not antd's `<Spin>`, so the slot is obvious
 * wherever it lands. `title` and `aria-label` carry the spinner's identity and
 * accessible label; `data-spinner-key` is read by this story's own demo and
 * by tooling that inspects the DOM.
 */
const DemoSpinner: SpinnerComponent = ({ spinnerKey, size, label }: SpinnerProps) => {
  const px = typeof size === 'number' ? size : SIZE_PX[size ?? 'default'];
  const border = Math.max(2, Math.round(px / 7));
  const style: CSSProperties = {
    display: 'inline-block',
    width: px,
    height: px,
    borderRadius: '50%',
    border: `${border}px solid #ffc53d`,
    borderTopColor: '#1677ff',
    borderRightColor: '#1677ff',
    animation: 'vultus-demo-spinner-spin 0.8s linear infinite',
    verticalAlign: 'middle',
  };
  return (
    <>
      <style>{'@keyframes vultus-demo-spinner-spin { to { transform: rotate(360deg); } }'}</style>
      <span role="status" title={spinnerKey} aria-label={label ?? 'Loading'} data-spinner-key={spinnerKey} style={style} />
    </>
  );
};

/**
 * Providers/Spinner slot: ActionButton (slow fire), BoolSwitch and
 * BoolCheckbox (slow commit) and OneOfSelect (slow commit), inside
 * `<VultusProvider components={{ Spinner: DemoSpinner }}>` — DemoSpinner
 * replaces antd's `<Spin>`/loading icon at every site. A nested
 * `<SpinnerScope name="demo-scope">` repeats the same controls to show key
 * prefixing; a third column with no `components` shows today's antd
 * spinners for comparison (the gallery's own outer `VultusProvider`, from
 * `.storybook/preview.tsx`, lends nothing).
 */
const meta: Meta = { title: 'Providers/Spinner slot' };
export default meta;

interface DemoArgs { latencyMs: number }

/** The sites again: ActionButton, BoolSwitch, BoolCheckbox, OneOfSelect, OneOfSegmented, plus the key each expects (read off useSpinnerKey, so this tag is live — not copy typed out by hand). */
function Controls({ latencyMs }: { latencyMs: number }) {
  const [stored, setStored] = useState(true);
  const [mode, setMode] = useState<'default' | 'turbo'>('default');
  const action = useAction({ id: 'go', label: 'Run', fire: () => delay(latencyMs) });
  const field = useBoolField({
    id: 'notify',
    label: 'Notify me',
    value: stored,
    commit: { fire: async (next) => { await delay(latencyMs); setStored(next); } },
  });
  const oneOf = useOneOfField<'default' | 'turbo'>({
    id: 'mode',
    label: 'Mode',
    choices: [{ value: 'default', label: 'Default' }, { value: 'turbo', label: 'Turbo' }],
    value: mode,
    commit: { fire: async (next) => { await delay(latencyMs); setMode(next); } },
  });
  const actionKey = useSpinnerKey('vultus:action:go');
  const fieldKey = useSpinnerKey('vultus:field:notify');
  const oneOfKey = useSpinnerKey('vultus:field:mode');
  return (
    <Space orientation="vertical" size={12}>
      <Space size={24} align="center" wrap>
        <Example label="ActionButton (slow fire)"><ActionButton action={action} /></Example>
        <Example label="BoolSwitch (slow commit)"><BoolSwitch field={field} /></Example>
        <Example label="BoolCheckbox (same field)"><BoolCheckbox field={field} /></Example>
        <Example label="OneOfSelect (slow commit)"><OneOfSelect field={oneOf} /></Example>
        <Example label="OneOfSegmented (same field)"><OneOfSegmented field={oneOf} /></Example>
      </Space>
      <Space size={8} wrap>
        <Tag>action: {actionKey}</Tag>
        <Tag>field: {fieldKey}</Tag>
        <Tag>one-of: {oneOfKey}</Tag>
      </Space>
    </Space>
  );
}

export const Slot: StoryObj<DemoArgs> = {
  name: 'DemoSpinner vs. antd, scoped and unscoped',
  args: { latencyMs: 6000 },
  argTypes: { latencyMs: { control: { type: 'range', min: 0, max: 8000, step: 200 } } },
  render: function Render({ latencyMs }) {
    return (
      <>
        <Showcase
          title="Unscoped: VultusProvider components={{ Spinner: DemoSpinner }}"
          note="Click Run, flip the switch or checkbox, or pick a different mode in the select or the segmented control: each shows DemoSpinner (the two-colour ring, not antd's blue spin) while pending — in the button in place of its loading icon, right after the switch (which itself shows no built-in loading state), after the checkbox's label, as the select's suffix icon, and after the segmented control. Hover any ring for its key as a tooltip (DemoSpinner's title prop); the tags below show the same keys live. Expected: vultus:action:go, vultus:field:notify (shared by the switch and checkbox), vultus:field:mode."
        >
          <VultusProvider components={{ Spinner: DemoSpinner }}>
            <Controls latencyMs={latencyMs} />
          </VultusProvider>
        </Showcase>

        <Showcase
          title={'Scoped: the same, inside <SpinnerScope name="demo-scope">'}
          note="Same controls and provider, nested one level deeper in a SpinnerScope. Every key below gains the demo-scope/ prefix, so this instance stays distinguishable from the unscoped one above (and from further instances, e.g. one SpinnerScope per optio process). Expected: demo-scope/vultus:action:go, demo-scope/vultus:field:notify, demo-scope/vultus:field:mode."
        >
          <VultusProvider components={{ Spinner: DemoSpinner }}>
            <SpinnerScope name="demo-scope">
              <Controls latencyMs={latencyMs} />
            </SpinnerScope>
          </VultusProvider>
        </Showcase>

        <Showcase
          title="No components: today's antd spinners (for comparison)"
          note="No Spinner lent here (just the gallery's own bare VultusProvider from preview.tsx, which lends nothing) — every site falls back to its unchanged antd look: the button's own loading icon, Spin next to the checkbox and after the segmented control, a loading Switch, the Select's default loading icon. Use the controls panel (latencyMs) to slow all three columns down together."
        >
          <Controls latencyMs={latencyMs} />
        </Showcase>
      </>
    );
  },
};
