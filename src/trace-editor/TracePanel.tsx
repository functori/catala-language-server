import {
  type ReactElement,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  VscodeButton,
  VscodeRadio,
  VscodeRadioGroup,
  VscodeTextfield,
} from '@vscode-elements/react-elements';
import type { TraceElement, TraceTest } from './traceUtils';
import { fieldValue } from './traceUtils';
import type { AddFilter } from './traceMenu';
import { useTraceMenu } from './traceMenu';
import { FilterPins, type Filter } from '../FilterPin';
import TraceTreeView from './TraceTreeView';

type OutputView = 'tree' | 'json';
export type SetFilter = React.Dispatch<React.SetStateAction<Filter[]>>;

export function createAddFilter(setFilters: SetFilter): AddFilter {
  const addFilter: AddFilter = (filter) => {
    let filterToAdd = filter.trim();
    setFilters((savedFilters) => {
      if (
        filterToAdd == '' ||
        savedFilters.some((elt: Filter) => elt.filter == filterToAdd)
      ) {
        return savedFilters;
      } else {
        return [...savedFilters, { filter: filterToAdd, option: 'include' }];
      }
    });
  };
  return addFilter;
}

export default function TracePanel({
  trace,
  cwd,
  test,
  filters,
  setFilters,
  onClose,
}: {
  trace: TraceElement[];
  filters: Filter[];
  setFilters: SetFilter;
  cwd: string;
  test?: TraceTest;
  onClose?: () => void;
}): ReactElement {
  const intl = useIntl();
  const [view, setView] = useState<OutputView>('tree');
  const [expand, setExpand] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<string>('');
  const addFilter = createAddFilter(setFilters);

  // Derived panel spawned by viewWithFilter command are stored here
  const [derived, setDerived] = useState<{ id: number; filter: string }[]>([]);
  const nextDerivedId = useRef(1);

  const spawnPanel = useCallback((spawnFilter: string): void => {
    const id = nextDerivedId.current++;
    setDerived((old) => [...old, { id, filter: spawnFilter }]);
  }, []);

  const menuProps = useTraceMenu(
    useMemo(() => ({ spawnPanel, addFilter }), [addFilter])
  );

  return (
    <div {...menuProps}>
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          margin: 0,
        }}
      >
        <span style={{ fontWeight: 600 }}>
          <FormattedMessage id="trace.label" />
        </span>
        <VscodeRadioGroup
          variant="horizontal"
          onChange={(e) => setView(fieldValue(e) as OutputView)}
        >
          <VscodeRadio
            value="tree"
            label={intl.formatMessage({ id: 'trace.view.tree' })}
            checked={view === 'tree'}
          />
          <VscodeRadio
            value="json"
            label={intl.formatMessage({ id: 'trace.view.json' })}
            checked={view === 'json'}
          />
        </VscodeRadioGroup>
        {onClose && (
          <span
            className="codicon codicon-close"
            role="button"
            title={intl.formatMessage({ id: 'trace.closePanel' })}
            style={{ marginLeft: 'auto', cursor: 'pointer' }}
            onClick={onClose}
          />
        )}
      </div>
      {view === 'tree' ? (
        <>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              margin: '8px 0',
            }}
          >
            <VscodeTextfield
              placeholder={intl.formatMessage({
                id: 'trace.filterPlaceholder',
              })}
              value={filter}
              onInput={(e) => setFilter(fieldValue(e))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addFilter(filter);
                  setFilter('');
                }
              }}
              style={{ flex: 1 }}
            >
              <span
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.preventDefault();
                  addFilter(filter);
                  setFilter('');
                }}
                className="codicon codicon-save"
                slot="content-after"
              />
            </VscodeTextfield>
            <VscodeButton
              icon="expand-all"
              secondary
              title={intl.formatMessage({ id: 'trace.expandAllTitle' })}
              onClick={() => setExpand(true)}
            >
              <FormattedMessage id="trace.expandAll" />
            </VscodeButton>
            <VscodeButton
              icon="collapse-all"
              secondary
              title={intl.formatMessage({ id: 'trace.collapseAllTitle' })}
              onClick={() => setExpand(false)}
            >
              <FormattedMessage id="trace.collapseAll" />
            </VscodeButton>
          </div>
          <FilterPins filters={filters} setFilters={setFilters} />
          <TraceTreeView
            trace={trace}
            filters={filters}
            cwd={cwd}
            expand={expand}
            test={test}
          />
        </>
      ) : (
        <>
          <div style={{ margin: '8px 0' }}>
            <VscodeButton
              icon="copy"
              secondary
              title={intl.formatMessage({ id: 'trace.copyJson' })}
              onClick={() => {
                void navigator.clipboard.writeText(
                  JSON.stringify(trace, null, 2)
                );
              }}
            >
              <FormattedMessage id="trace.copyJson" />
            </VscodeButton>
          </div>
          <pre style={preStyle}>{JSON.stringify(trace, null, 2)}</pre>
        </>
      )}
      {derived.map((d) => (
        <div key={d.id} style={derivedPanelStyle}>
          <TracePanel
            trace={trace}
            cwd={cwd}
            filters={[]}
            setFilters={(): void => {}}
            test={test}
            onClose={() =>
              setDerived((old) => old.filter((o) => o.id !== d.id))
            }
          />
        </div>
      ))}
    </div>
  );
}

// -- Styles -------------------------------------------------------------------

const derivedPanelStyle: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 8,
  borderTop: '1px solid var(--vscode-panel-border, transparent)',
};

/** Preformatted block, shared with the error report in `TraceEditor`. */
export const preStyle: React.CSSProperties = {
  background:
    'var(--vscode-textCodeBlock-background, var(--vscode-editor-background))',
  border: '1px solid var(--vscode-panel-border, transparent)',
  padding: 10,
  borderRadius: 2,
  overflow: 'auto',
  maxHeight: '70vh',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
