import { render, screen } from '@testing-library/react';
import {
  VultusComponentsContext,
  useVultusComponents,
  SpinnerScope,
  useSpinnerKey,
  type VultusComponents,
  type SpinnerComponent,
} from '../Components.js';

function ComponentsProbe() {
  const components = useVultusComponents();
  return <span data-testid="probe">{JSON.stringify(components)}</span>;
}

test('defaults to no components', () => {
  render(<ComponentsProbe />);
  expect(screen.getByTestId('probe').textContent).toBe('{}');
});

function KeyProbe({ localKey }: { localKey: string }) {
  const key = useSpinnerKey(localKey);
  return <span data-testid="key">{key}</span>;
}

test('scopes keys: none, one, nested', () => {
  const { rerender } = render(<KeyProbe localKey="vultus:action:send" />);
  expect(screen.getByTestId('key').textContent).toBe('vultus:action:send');

  rerender(
    <SpinnerScope name="optio:process:p1">
      <KeyProbe localKey="vultus:action:send" />
    </SpinnerScope>,
  );
  expect(screen.getByTestId('key').textContent).toBe('optio:process:p1/vultus:action:send');

  rerender(
    <SpinnerScope name="a">
      <SpinnerScope name="b">
        <KeyProbe localKey="vultus:action:send" />
      </SpinnerScope>
    </SpinnerScope>,
  );
  expect(screen.getByTestId('key').textContent).toBe('a/b/vultus:action:send');
});

test('provides components through the context', () => {
  const Spinner: SpinnerComponent = (props) => (
    <span data-testid="spinner">{props.spinnerKey}</span>
  );
  const value: VultusComponents = { Spinner };

  render(
    <VultusComponentsContext.Provider value={value}>
      <ComponentsSpinnerProbe />
    </VultusComponentsContext.Provider>,
  );

  expect(screen.getByTestId('spinner').textContent).toBe('vultus:action:send');
});

function ComponentsSpinnerProbe() {
  const { Spinner } = useVultusComponents();
  if (!Spinner) throw new Error('expected a Spinner');
  return <Spinner spinnerKey="vultus:action:send" />;
}
