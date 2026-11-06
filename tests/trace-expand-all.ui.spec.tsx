import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import TracePanel, { type FilterCommand } from '../src/trace-editor/TracePanel';
import type { TraceElement } from '../src/trace-editor/traceUtils';
import enMessages from '../src/locales/en.json';

const v = (name: string): TraceElement => ({
  element: { kind: 'scope_var', name },
  value: { kind: 'integer', value: 1 },
});

// Depth 0 and 1 open by default, so `deep` only shows once expanded.
const trace: TraceElement[] = [
  {
    element: { kind: 'scope_call', name: 'Top' },
    trace: [
      {
        element: { kind: 'scope_call', name: 'Mid' },
        trace: [
          {
            element: { kind: 'scope_call', name: 'Low' },
            trace: [v('deep')],
          },
          v('alpha'),
          v('beta'),
        ],
      },
    ],
  },
];

const panel = (filterRequest: FilterCommand | null): React.JSX.Element => (
  <IntlProvider locale="en" messages={enMessages}>
    <TracePanel trace={trace} cwd="" filterRequest={filterRequest} />
  </IntlProvider>
);

describe('Expand all after filters', () => {
  it('expands again once the filters are removed', () => {
    const { rerender } = render(panel(null));
    const expand = screen.getByText('Expand');
    fireEvent.click(expand);
    expect(screen.queryByText('deep')).not.toBeNull();
    rerender(panel({ filter: 'alpha', nonce: 1 }));
    rerender(panel({ filter: 'beta', nonce: 2 }));
    for (const close of screen.getAllByTitle('Remove this filter'))
      fireEvent.click(close);
    expect(screen.queryByText('deep')).toBeNull();
    fireEvent.click(expand);
    expect(screen.queryByText('deep')).not.toBeNull();
  });
});
