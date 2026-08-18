import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import enMessages from '../src/locales/en.json';
import ExpectedVariablesEditor from '../src/test-case-editor/ExpectedVariablesEditor';
import type { Test, VariableFailure } from '../src/generated/catala_types';

// The real web components need constructable stylesheets, which jsdom lacks.
// Nothing asserted here depends on them.
vi.mock('@vscode-elements/react-elements', () => ({
  VscodeButton: () => <button />,
  VscodeTextfield: () => <input />,
}));

// A test carrying one auxiliary variable expected to be 42, read from the
// trace at "[0].trace[0]". Both the value and the path are needed for the row
// to be listed.
function testWithVariable(): Test {
  return {
    testing_scope: 'TestCalculImpot',
    tested_scope: {
      name: 'CalculImpot',
      module_name: 'Impot',
      inputs: new Map(),
      outputs: new Map(),
      module_deps: [],
    },
    test_inputs: new Map(),
    test_outputs: new Map(),
    variables: new Map([
      ['taux', { value: { value: { kind: 'Integer', value: 42 }, attrs: [] } }],
    ]),
    variable_paths: new Map([['taux', '[0].trace[0]']]),
    description: '',
    title: 'Test',
  };
}

function renderEditor(failures?: VariableFailure[]): void {
  render(
    <IntlProvider locale="en" messages={enMessages}>
      <ExpectedVariablesEditor
        test={testWithVariable()}
        runTrace={false}
        failures={failures}
        onChange={() => {}}
      />
    </IntlProvider>
  );
}

describe('ExpectedVariablesEditor - reported variable failures', () => {
  it('leaves the value unmarked when the compiler reported no failure', () => {
    renderEditor([]);
    const value = screen.getByText('42');
    expect(value).not.toHaveAttribute('title');
    expect(value.style.color).toBe('');
  });

  it('marks the value and explains the mismatch when one is reported', () => {
    renderEditor([{ name: 'taux', expected: '42', current_value: '17' }]);
    const value = screen.getByText('42');
    expect(value).toHaveAttribute(
      'title',
      'The trace holds 17 where 42 was expected'
    );
    expect(value.style.color).toBe('var(--vscode-errorForeground)');
  });

  it('reports a variable missing from the trace rather than skipping it', () => {
    // `current_value` is absent when the trace holds no value at the declared
    // path, which is a failure all the same.
    renderEditor([{ name: 'taux', expected: '42' }]);
    const value = screen.getByText('42');
    expect(value).toHaveAttribute(
      'title',
      'The trace holds -- where 42 was expected'
    );
    expect(value.style.color).toBe('var(--vscode-errorForeground)');
  });

  it('ignores a failure reported for another variable', () => {
    renderEditor([{ name: 'autre', expected: '1', current_value: '2' }]);
    const value = screen.getByText('42');
    expect(value).not.toHaveAttribute('title');
    expect(value.style.color).toBe('');
  });
});
