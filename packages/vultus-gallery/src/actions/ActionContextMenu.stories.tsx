import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeleteOutlined, FileTextOutlined } from '@ant-design/icons';
import { Tag, theme } from 'antd';
import { useState, type CSSProperties, type MouseEvent } from 'react';
import { ActionContextMenu, denyWithReason, useAction } from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';

/**
 * ActionContextMenu: a right-click menu of actions (useAction) on one child
 * element, with CombinedActionButton's rows and confirmations. The children
 * here are an interval bar's segments, as Praeceptor's: links whose left click
 * is their own (it only counts here).
 */
const meta: Meta = { title: 'Actions/ActionContextMenu' };
export default meta;

export const Menus: StoryObj = {
  name: 'Rows, confirmations, pending',
  render: function Render() {
    const { token } = theme.useToken();
    const [clicks, setClicks] = useState(0);
    const showLog = useAction({ id: 'show-log', label: 'Show log', icon: <FileTextOutlined />, fire: () => delay(300) });
    const drop = useAction({
      id: 'drop', label: 'Drop', variant: 'danger', icon: <DeleteOutlined />,
      confirmation: { kind: 'popconfirm', question: 'Drop the proposals of 1–100?' }, fire: () => delay(600),
    });
    const locked = useAction({ id: 'locked', label: 'Drop', variant: 'danger', enabled: denyWithReason('The run is **still going**.'), fire: () => {} });
    const secret = useAction({ id: 'secret', label: 'Never shown', invisible: true, fire: () => {} });
    const generate = useAction({ id: 'generate', label: 'Generate proposals', variant: 'primary', fire: () => delay(4000) });
    const reset = useAction({
      id: 'reset', label: 'Reset', variant: 'danger',
      confirmation: { kind: 'cascade-modal', title: 'Reset 101–299?', content: 'Its proposals and their history go too.' },
      fire: () => delay(400),
    });
    const purge = useAction({
      id: 'purge', label: 'Purge', variant: 'danger',
      confirmation: { kind: 'typing', title: 'Purge the source', entityName: 'grok', description: 'This cannot be undone.' },
      fire: () => delay(400),
    });

    const segment = (background: string, color: string = token.colorTextLightSolid): CSSProperties => ({
      display: 'inline-block', padding: '4px 12px', borderRadius: token.borderRadiusSM, background, color, textDecoration: 'none',
    });
    const leftClick = (e: MouseEvent) => { e.preventDefault(); setClicks((n) => n + 1); };

    return (
      <Showcase
        title="Right click"
        note="Right-click a segment (or focus it with Tab and press the menu key or Shift+F10) for its menu, at the pointer instead of the browser's. The rows are CombinedActionButton's: a disabled action greyed with its reason on hover, an invisible one left out, primary and danger only while enabled; a confirmation is asked as there, the popconfirm pointing at the segment. Pick Generate proposals, then right-click again within 4 s: the row is locked with the spinner, looking disabled but keeping the keyboard focus, and picking it does nothing. A left click is the segment's own (counted below); a segment with no visible action keeps the browser's own menu."
      >
        <Example label="popconfirm (Drop)">
          <ActionContextMenu actions={[showLog, drop]}>
            <a href="#segment" onClick={leftClick} style={segment(token.colorPrimary)}>1–100 · v3</a>
          </ActionContextMenu>
        </Example>
        <Example label="disabled with reason; one invisible">
          <ActionContextMenu actions={[showLog, locked, secret]}>
            <a href="#segment" onClick={leftClick} style={segment(token.colorPrimary)}>101–200 · v4</a>
          </ActionContextMenu>
        </Example>
        <Example label="pending (slow fire)">
          <ActionContextMenu actions={[generate]}>
            <a href="#segment" onClick={leftClick} style={segment(token.colorWarning)}>201–299</a>
          </ActionContextMenu>
        </Example>
        <Example label="cascade-modal, typing">
          <ActionContextMenu actions={[reset, purge]}>
            <a href="#segment" onClick={leftClick} style={segment(token.colorError)}>300–310</a>
          </ActionContextMenu>
        </Example>
        <Example label="no visible action: the browser's menu">
          <ActionContextMenu actions={[secret]}>
            <a href="#segment" onClick={leftClick} style={segment(token.colorBgContainerDisabled, token.colorTextDisabled)}>311–320</a>
          </ActionContextMenu>
        </Example>
        <Example label="left clicks (the segments' own)">
          <Tag>{clicks}</Tag>
        </Example>
      </Showcase>
    );
  },
};
