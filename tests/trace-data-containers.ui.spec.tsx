import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider, createIntl, createIntlCache } from 'react-intl';
import enMessages from '../src/locales/en.json';
import { DataPanel } from '../src/trace-editor/TraceData';
import type { TraceTest, TraceValue } from '../src/trace-editor/traceUtils';

const intl = createIntl(
  { locale: 'en', messages: enMessages, defaultLocale: 'en' },
  createIntlCache()
);

const int = (value: number): TraceValue => ({ kind: 'integer', value });
const struct = (fields: Record<string, TraceValue>): TraceValue => ({
  kind: 'struct',
  fields,
});
const array = (...values: TraceValue[]): TraceValue => ({
  kind: 'array',
  values: values.map((v) => [v, undefined]),
});

function testWith(variables: [string, TraceValue | null][]): TraceTest {
  return {
    testing_scope: 'T',
    tested_scope: { name: 'S', inputs: new Map(), outputs: new Map() },
    test_inputs: new Map(),
    test_outputs: new Map(),
    variables: new Map(variables),
    description: '',
    title: '',
  } as unknown as TraceTest;
}

function renderPanel(
  variables: [string, TraceValue | null][],
  addFilter = vi.fn()
): { addFilter: ReturnType<typeof vi.fn> } {
  render(
    <IntlProvider locale="en" messages={enMessages} defaultLocale="en">
      <DataPanel test={testWith(variables)} intl={intl} addFilter={addFilter} />
    </IntlProvider>
  );
  return { addFilter };
}

const rowOf = (label: string): HTMLElement =>
  screen.getByText(label).closest('tr') as HTMLElement;

describe('DataPanel containers', () => {
  it('shows a struct as a plain row, with no fold and no value', () => {
    renderPanel([['s', struct({ a: int(1), b: int(2) })]]);
    expect(screen.getByText('s')).toBeTruthy();
    // no chevron to expand, and the fields are nowhere to be found
    expect(rowOf('s').querySelector('.codicon-chevron-right')).toBeNull();
    expect(screen.queryByText('a')).toBeNull();
    expect(screen.queryByText('1')).toBeNull();
  });

  it('shows an array the same way', () => {
    renderPanel([['xs', array(int(7), int(8))]]);
    expect(screen.getByText('xs')).toBeTruthy();
    expect(rowOf('xs').querySelector('.codicon-chevron-right')).toBeNull();
    expect(screen.queryByText('7')).toBeNull();
  });

  it('does not expand when the row is clicked', () => {
    renderPanel([['s', struct({ a: int(1) })]]);
    fireEvent.click(rowOf('s'));
    expect(screen.queryByText('a')).toBeNull();
  });

  it('adds a filter when the label is clicked', () => {
    const { addFilter } = renderPanel([['s', struct({ a: int(1) })]]);
    fireEvent.click(screen.getByText('s'));
    expect(addFilter).toHaveBeenCalledWith('s');
  });

  it('keeps showing plain values for non-container variables', () => {
    renderPanel([['n', int(42)]]);
    expect(screen.getByText('n')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });
});

// `traceVariablesAux` only considers an element that carries a `trace`, and
// the tested scope has to be reachable by name for its variables to count as
// computed values.
const traceWith = (value: TraceValue): unknown[] => [
  {
    element: { kind: 'scope_call', name: 'S' },
    trace: [
      {
        element: { kind: 'scope_var', name: 's', input: 'no_input' },
        trace: [],
        value,
      },
    ],
  },
];

function renderWith(
  expected: [string, TraceValue | null][],
  computed: TraceValue
): void {
  render(
    <IntlProvider locale="en" messages={enMessages} defaultLocale="en">
      <DataPanel
        test={testWith(expected)}
        trace={traceWith(computed) as never}
        intl={intl}
        addFilter={vi.fn()}
      />
    </IntlProvider>
  );
}

describe('DataPanel containers from a trace', () => {
  it('keeps a scope whose variables are all containers', () => {
    renderWith([], struct({ a: int(1) }));
    expect(screen.getByText('s')).toBeTruthy();
  });

  it('shows the container without its contents', () => {
    renderWith([], struct({ a: int(1) }));
    expect(screen.queryByText('a')).toBeNull();
    expect(screen.queryByText('1')).toBeNull();
  });
});
