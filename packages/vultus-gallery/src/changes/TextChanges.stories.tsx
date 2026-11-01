import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Space, Tag, Typography } from 'antd';
import { useMemo, useState, type CSSProperties } from 'react';
import { Markdown, VultusProvider, type ChangeMarkComponent, type ChangeMarkProps } from 'vultus-antd';
import { ChangingText, useTextChanges } from 'vultus-core/changes';
import { Example, Showcase } from '../Showcase.js';

type Spelling = 'old' | 'modern';

/**
 * A caption and a paragraph in the old Hungarian spelling and the modern one. To the modern:
 * letters removed (Ferencz, katholikus), a space joined away (szent áldozáshoz), replacements
 * (hivei to hívei, split by the emphasis; t. i. to tudniillik) and a space put in (jóhirű to
 * jó hírű). Back to the old: the same the other way round, so the z and the h come in.
 */
const TEXTS: Record<Spelling, { caption: string; paragraph: string }> = {
  old: {
    caption: 'Szent Ferencz jóhirű hivei',
    paragraph: 'Ferencz *hi*vei a templomban ünnepet ültek, t. i. a katholikus egyház tanítása szerint a szent áldozáshoz járultak.',
  },
  modern: {
    caption: 'Szent Ferenc jó hírű hívei',
    paragraph: 'Ferenc *hí*vei a templomban ünnepet ültek, tudniillik a katolikus egyház tanítása szerint a szentáldozáshoz járultak.',
  },
};

/** DemoMark's fade, in seconds: its keyframes run this long, and its `durations` say so. */
const FADE_S = 2;
const DEMO_KEYFRAMES = '@keyframes vultus-demo-change-lit { from { background-color: rgba(250, 173, 20, 0.55); } to { background-color: transparent; } }'
  + ' @keyframes vultus-demo-change-out { to { opacity: 0; } }';

/**
 * A stand-in for a style library's change mark (e.g. harma-style's change highlight): an amber
 * light fading out over 2 s (a word's and its letters' stack, so the letters read stronger), the
 * removed letters struck through and fading away, with keyframes of its own in a `<style>` element
 * (vultus has no stylesheet for the marks), put in the head once. Removed letters are kept from assistive technology,
 * the tab order and a selection. `durations` gives its own times, the fade's end on both
 * timelines, in place of vultus's defaults (1.55 s and 2.3 s).
 */
const DemoMark: ChangeMarkComponent = Object.assign(
  function DemoMark({ variant, 'data-change': change, children }: ChangeMarkProps) {
    const removed = variant === 'change-removed';
    const style: CSSProperties = variant === 'change-replaced' ? {}
      : removed ? { textDecoration: 'line-through', userSelect: 'none', animation: `vultus-demo-change-out ${FADE_S}s ease-in forwards` }
      : { borderRadius: 3, animation: `vultus-demo-change-lit ${FADE_S}s ease-out forwards` };
    return (
      <>
        {/* React 19 hoists it into the head once (`href`, `precedence`), not once per mark. */}
        <style href="vultus-demo-change-mark" precedence="default">{DEMO_KEYFRAMES}</style>
        <span data-change={change} style={style} aria-hidden={removed || undefined} inert={removed || undefined}>{children}</span>
      </>
    );
  },
  { durations: () => ({ plain: FADE_S * 1000, removals: FADE_S * 1000 }) },
);

/**
 * The caption (`ChangingText`) and the paragraph (`useTextChanges` over vultus-antd's `Markdown`),
 * both switched by one button under a key that stays, so every click is a switch; the tag shows
 * the hook's `active`.
 */
function Versions() {
  const [spelling, setSpelling] = useState<Spelling>('old');
  const { caption, paragraph } = TEXTS[spelling];
  const changes = useTextChanges(paragraph, { key: 'ferenc' });
  // Kept while the plugin is (it changes as a switch starts and ends): Markdown is memoised, and
  // a new list every render would parse the paragraph every render.
  const rehypePlugins = useMemo(() => [changes.rehypePlugin], [changes.rehypePlugin]);
  return (
    <Space orientation="vertical" size={12} style={{ maxWidth: 560 }}>
      <Example label='ChangingText changeKey="caption"'>
        <Typography.Title level={5} style={{ margin: 0 }}>
          <ChangingText changeKey="caption">{caption}</ChangingText>
        </Typography.Title>
      </Example>
      <Example label="useTextChanges + Markdown rehypePlugins / components">
        <Typography>
          <Markdown rehypePlugins={rehypePlugins} components={changes.components}>{paragraph}</Markdown>
        </Typography>
      </Example>
      <Space size={12} align="center" wrap>
        <Button onClick={() => setSpelling((current) => (current === 'old' ? 'modern' : 'old'))}>
          {spelling === 'old' ? 'Modern spelling' : 'Old spelling'}
        </Button>
        <Tag color={changes.active ? 'processing' : 'default'}>active: {String(changes.active)}</Tag>
      </Space>
    </Space>
  );
}

/**
 * Text changes: the same caption and paragraph twice, switching between two spellings on a
 * button. First with no `ChangeMark` lent (the gallery's own `VultusProvider`, from
 * `.storybook/preview.tsx`, lends nothing), so vultus's static fallback draws the marks; then
 * inside `<VultusProvider components={{ ChangeMark: DemoMark }}>`.
 */
const meta: Meta = { title: 'Text changes' };
export default meta;

export const FallbackAndLent: StoryObj = {
  name: 'Fallback vs. a lent ChangeMark',
  render: function Render() {
    return (
      <>
        <Showcase
          title="No ChangeMark lent: vultus's static fallback"
          note="Click Modern spelling, then Old spelling, and again: the key stays, so each click is a switch, and what changed lights up at once in both the caption and the paragraph. Changed words have a translucent green background, their new letters a stronger one; removed letters stay at their place in translucent red, struck through (to the modern: Ferencz's z, katholikus's h, the space of szent áldozáshoz; back: the space of jó hírű, while the z and the h come in green); a replacement shows only its new letters (hívei's í, tudniillik for t. i., and back). Nothing moves. Every switch here removes something, so it runs on the removals timeline: the marks all go 2.3 s after the click (vultus's default; one without removals would end at 1.55 s), the removed letters with them, and active turns false. Removed letters cannot be selected, and screen readers skip them. Light and dark (the toolbar) both read."
        >
          <Versions />
        </Showcase>

        <Showcase
          title="VultusProvider components={{ ChangeMark: DemoMark }}"
          note="The same, with DemoMark lent: a stand-in for a style library's mark, a few lines with a keyframe fade of its own in a <style> element. Click the button: changed words and letters light up amber and fade out over 2 s; removed letters are struck through and fade away, holding their room until the marks go, when the text closes up; a replacement shows its old letters fading beside its new ones. The marks go at 2 s, as the fade ends, on both timelines: DemoMark.durations gives its own times in place of vultus's defaults, so active turns false a little sooner than above. Click again mid-fade: the new switch's marks start lit from the beginning (vultus keys them by the switch), never half faded."
        >
          <VultusProvider components={{ ChangeMark: DemoMark }}>
            <Versions />
          </VultusProvider>
        </Showcase>
      </>
    );
  },
};
