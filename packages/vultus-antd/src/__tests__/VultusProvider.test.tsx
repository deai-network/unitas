import { memo } from 'react';
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { useMessageSink, useVultusComponents, type SpinnerProps } from 'vultus-core';
import { VultusProvider } from '../VultusProvider.js';
import { defaultVultusTexts, useVultusTexts } from '../texts.js';

function Fire({ text, severity }: { text: string; severity?: 'info' | 'warning' | 'error' }) {
  const sink = useMessageSink();
  return <button onClick={() => sink(text, severity)}>fire</button>;
}

function SpinnerA(_props: SpinnerProps) { return null; }
function SpinnerB(_props: SpinnerProps) { return null; }

function ComponentsProbe() {
  const { Spinner } = useVultusComponents();
  return <div data-testid="probe">{Spinner ? Spinner.name : 'none'}</div>;
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

  it('provides components to a probe below', () => {
    const { getByTestId } = render(
      <VultusProvider components={{ Spinner: SpinnerA }}>
        <ComponentsProbe />
      </VultusProvider>,
    );
    expect(getByTestId('probe').textContent).toBe('SpinnerA');
  });

  it('a nested provider without components still sees the outer components', () => {
    const { getByTestId } = render(
      <VultusProvider components={{ Spinner: SpinnerA }}>
        <VultusProvider>
          <ComponentsProbe />
        </VultusProvider>
      </VultusProvider>,
    );
    expect(getByTestId('probe').textContent).toBe('SpinnerA');
  });

  it('a nested provider with components overrides the outer ones', () => {
    const { getByTestId } = render(
      <VultusProvider components={{ Spinner: SpinnerA }}>
        <VultusProvider components={{ Spinner: SpinnerB }}>
          <ComponentsProbe />
        </VultusProvider>
      </VultusProvider>,
    );
    expect(getByTestId('probe').textContent).toBe('SpinnerB');
  });

  it('without any provider, components is empty', () => {
    const { getByTestId } = render(<ComponentsProbe />);
    expect(getByTestId('probe').textContent).toBe('none');
  });

  it('an explicit Spinner: undefined in a nested provider clears the inherited one', () => {
    const { getByTestId } = render(
      <VultusProvider components={{ Spinner: SpinnerA }}>
        <VultusProvider components={{ Spinner: undefined }}>
          <ComponentsProbe />
        </VultusProvider>
      </VultusProvider>,
    );
    expect(getByTestId('probe').textContent).toBe('none');
  });

  it('a fresh inline components object with the same Spinner does not re-render consumers below', () => {
    let renderCount = 0;
    const CountingProbe = memo(function CountingProbe() {
      renderCount += 1;
      useVultusComponents();
      return null;
    });
    const { rerender } = render(
      <VultusProvider components={{ Spinner: SpinnerA }}>
        <CountingProbe />
      </VultusProvider>,
    );
    expect(renderCount).toBe(1);

    // A new object literal every time, as the natural inline call site produces, but the
    // same Spinner reference: the merged context value must stay referentially stable.
    rerender(
      <VultusProvider components={{ Spinner: SpinnerA }}>
        <CountingProbe />
      </VultusProvider>,
    );
    expect(renderCount).toBe(1);

    // A different Spinner: the context value must change and the consumer must re-render.
    rerender(
      <VultusProvider components={{ Spinner: SpinnerB }}>
        <CountingProbe />
      </VultusProvider>,
    );
    expect(renderCount).toBe(2);
  });
});

function TextsProbe() {
  const texts = useVultusTexts();
  return <div data-testid="textsProbe">{texts.currentState}|{texts.switchTo}|{texts.done}|{texts.search}|{texts.joiningWords.join(',')}</div>;
}

describe('VultusProvider texts', () => {
  it('merges every VultusTexts key, not just currentState/switchTo', () => {
    const { getByTestId } = render(
      <VultusProvider texts={{ done: 'Kész', search: 'Keresés', joiningWords: ['és', 'a', 'az'] }}>
        <TextsProbe />
      </VultusProvider>,
    );
    expect(getByTestId('textsProbe').textContent).toBe(
      `${defaultVultusTexts.currentState}|${defaultVultusTexts.switchTo}|Kész|Keresés|és,a,az`,
    );
  });

  it('an omitted key keeps its default', () => {
    const { getByTestId } = render(
      <VultusProvider texts={{ done: 'Kész' }}>
        <TextsProbe />
      </VultusProvider>,
    );
    expect(getByTestId('textsProbe').textContent).toBe(
      `${defaultVultusTexts.currentState}|${defaultVultusTexts.switchTo}|Kész|${defaultVultusTexts.search}|${defaultVultusTexts.joiningWords.join(',')}`,
    );
  });

  it('a fresh inline texts object with the same joiningWords content keeps the merged texts referentially stable', () => {
    let renderCount = 0;
    const CountingProbe = memo(function CountingProbe() {
      renderCount += 1;
      useVultusTexts();
      return null;
    });
    const { rerender } = render(
      <VultusProvider texts={{ joiningWords: ['and', 'of', 'the'] }}>
        <CountingProbe />
      </VultusProvider>,
    );
    expect(renderCount).toBe(1);

    // A new object literal every time, as the natural inline call site produces, but the
    // same content: the merged context value must stay referentially stable.
    rerender(
      <VultusProvider texts={{ joiningWords: ['and', 'of', 'the'] }}>
        <CountingProbe />
      </VultusProvider>,
    );
    expect(renderCount).toBe(1);

    // Different content: the context value must change and the consumer must re-render.
    rerender(
      <VultusProvider texts={{ joiningWords: ['and', 'of', 'the', 'plus'] }}>
        <CountingProbe />
      </VultusProvider>,
    );
    expect(renderCount).toBe(2);
  });
});
