import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { useMessageSink } from 'vultus-core';
import { VultusProvider } from '../VultusProvider.js';

function Fire({ text, severity }: { text: string; severity?: 'info' | 'warning' | 'error' }) {
  const sink = useMessageSink();
  return <button onClick={() => sink(text, severity)}>fire</button>;
}

describe('VultusProvider', () => {
  it('default sink shows the error through antd message under the app ConfigProvider', async () => {
    const { getByText } = render(
      <ConfigProvider prefixCls="vx">
        <VultusProvider>
          <Fire text="it broke" />
        </VultusProvider>
      </ConfigProvider>,
    );
    getByText('fire').click();
    await waitFor(() => {
      expect(document.body.querySelector('.vx-message')?.textContent).toContain('it broke');
    });
  });

  it('default sink shows warnings and infos with their own severity', async () => {
    const { getByText } = render(
      <ConfigProvider prefixCls="vx">
        <VultusProvider>
          <Fire text="3 pairs skipped" severity="warning" />
        </VultusProvider>
      </ConfigProvider>,
    );
    getByText('fire').click();
    await waitFor(() => {
      const notice = document.body.querySelector('.vx-message-warning');
      expect(notice?.textContent).toContain('3 pairs skipped');
    });
  });

  it('a supplied messageSink replaces the default', () => {
    const seen: string[] = [];
    const { getByText } = render(
      <VultusProvider messageSink={(t) => { seen.push(t); }}>
        <Fire text="custom" />
      </VultusProvider>,
    );
    getByText('fire').click();
    expect(seen).toEqual(['custom']);
  });
});
