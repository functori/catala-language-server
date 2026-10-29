import {
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { WebviewApi } from 'vscode-webview';
import {
  VscodeButton,
  VscodeOption,
  VscodeProgressRing,
  VscodeSingleSelect,
  VscodeTextfield,
} from '@vscode-elements/react-elements';
import { setVsCodeApi } from '../shared/webviewApi';
import type { TraceDownMessage, TraceUpMessage } from './messages';
import type { TraceElement, TraceTest } from './traceUtils';
import { fieldValue, PANEL_HEIGHT_VAR, readTraceTest } from './traceUtils';
import { DataPanel } from './TraceData';
import TracePanel, { preStyle, type FilterCommand } from './TracePanel';
import type { Step } from 'react-joyride';
import { useJoyride } from 'react-joyride';
import {
  type Chapter,
  HelpButton,
  placeChapters,
  TutoLoader,
  TutoMenu,
  tutoLocale,
  tutoOptions,
} from '../shared/Tutorial';

type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'success'; trace: TraceElement[] }
  | { status: 'error'; message: string };

type Props = {
  vscode: WebviewApi<unknown>;
};

type ScopeWithInfo = {
  scopeName: string;
  test: TraceTest | undefined;
};

const PANE_LAYOUTS = ['data', 'both', 'trace'] as const;
type PaneLayout = (typeof PANE_LAYOUTS)[number];

const BOTTOM_MARGIN = 12;

export default function TraceEditor({ vscode }: Props): ReactElement {
  const intl = useIntl();
  const [cwd, setCwd] = useState('');
  const [scopes, setScopes] = useState<Map<string, TraceTest | undefined>>(
    new Map()
  );
  const [scope, setScope] = useState<ScopeWithInfo>({
    scopeName: '',
    test: undefined,
  });
  const [scopePreset, setScopePreset] = useState(false);
  const [runState, setRunState] = useState<RunState>({ status: 'idle' });
  const [initialized, setInitialized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [layout, setLayout] = useState<PaneLayout>('both');
  const [filterRequest, setFilterRequest] = useState<FilterCommand | null>(
    null
  );

  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => (): void => {
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
    },
    []
  );
  const markCopied = (): void => {
    setCopied(true);
    if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  const {
    controls,
    state: tutoState,
    Tour,
  } = useJoyride({
    continuous: true,
    steps: tutoSteps,
    options: tutoOptions,
    locale: tutoLocale(intl),
    loaderComponent: TutoLoader,
  });

  // The tour starts in three renders: the panes are laid out for it, then the
  // steps are cut to what this layout shows, then Joyride is started on them.
  const [tutoPhase, setTutoPhase] = useState<'idle' | 'layout' | 'start'>(
    'idle'
  );
  // The layout of the tutorial, kept apart from the user's one so that the
  // tutorial never changes it: once it is over, the panes are back as they
  // were, slider position and dragged width included.
  const [tuto, setTuto] = useState(false);
  const shownLayout: PaneLayout = tuto ? 'both' : layout;

  const startTuto = (): void => {
    setTuto(true);
    setTutoPhase('layout');
  };
  useEffect(() => {
    if (tutoPhase === 'layout') {
      setTutoPhase('start');
    } else if (tutoPhase === 'start') {
      // Joyride has been handed the steps just computed.
      setTutoPhase('idle');
      controls.start();
    }
  }, [tutoPhase, controls]);
  useEffect(() => {
    if (tutoState.status === 'finished' || tutoState.status === 'skipped') {
      setTuto(false);
    }
  }, [tutoState.status]);

  const requestFilter = (filter: string): void =>
    setFilterRequest((prev) => ({ filter, nonce: (prev?.nonce ?? 0) + 1 }));

  useEffect(() => {
    setVsCodeApi(vscode);
  }, [vscode]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      const message = event.data as TraceDownMessage;
      switch (message.kind) {
        case 'init': {
          const scopeMap = new Map<string, TraceTest | undefined>(
            message.scopes.map(([s, json]) => {
              return [s, json !== null ? readTraceTest(json) : undefined];
            })
          );
          setCwd(message.cwd);
          setScopes(scopeMap);
          setScopePreset(message.scope !== undefined);
          setScope((prev: ScopeWithInfo): ScopeWithInfo => {
            // Preselect the requested scope if one was provided.
            if (message.scope !== undefined) {
              return {
                scopeName: message.scope,
                test: scopeMap.get(message.scope),
              };
            }
            if (prev.scopeName !== '') {
              return prev;
            }
            const first = scopeMap.entries().next().value;
            return first
              ? { scopeName: first[0], test: first[1] }
              : { scopeName: '', test: undefined };
          });
          setInitialized(true);
          // Show a pre-computed trace directly, if one was provided.
          if (message.trace !== undefined) {
            setRunState({ status: 'success', trace: message.trace });
          }
          // Or run the trace immediately if requested.
          if (message.run) {
            const runScope =
              message.scope ?? scopeMap.keys().next().value ?? '';
            if (runScope) {
              setRunState({ status: 'running' });
              post(vscode, { kind: 'run', scope: runScope });
            }
          }
          break;
        }
        case 'scopes': {
          const extra = new Map<string, TraceTest | undefined>(
            message.scopes.map(([s, json]) => [
              s,
              json !== null ? readTraceTest(json) : undefined,
            ])
          );
          setScopes((prev) => {
            const merged = new Map(prev);
            for (const [name, test] of extra) {
              if (!merged.has(name)) merged.set(name, test);
            }
            return merged;
          });
          setScope((prev: ScopeWithInfo): ScopeWithInfo => {
            if (prev.scopeName !== '') {
              return prev;
            }
            const first = extra.entries().next().value;
            return first ? { scopeName: first[0], test: first[1] } : prev;
          });
          break;
        }
        case 'result':
          if (message.ok) {
            setRunState({ status: 'success', trace: message.trace });
          } else {
            setRunState({ status: 'error', message: message.error });
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    post(vscode, { kind: 'ready' });

    return (): void => {
      window.removeEventListener('message', handleMessage);
    };
  }, [vscode]);

  const onRunScope = (): void => {
    const trimmed = scope.scopeName.trim();
    if (!trimmed) {
      setRunState({
        status: 'error',
        message: intl.formatMessage({ id: 'trace.noScope' }),
      });
      return;
    }
    setRunState({ status: 'running' });
    post(vscode, { kind: 'run', scope: trimmed });
  };

  const running = runState.status === 'running';

  const resultsRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState<string>();
  useLayoutEffect(() => {
    const element = resultsRef.current;
    if (element === null) {
      return;
    }
    const measure = (): void => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      setPanelHeight(`calc(100vh - ${Math.round(top)}px - ${BOTTOM_MARGIN}px)`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return (): void => observer.disconnect();
  }, [initialized, scopePreset, scopes.size]);

  if (!initialized) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}
      >
        <VscodeProgressRing />
        <FormattedMessage id="trace.loading" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Tour}
      <HelpButton onStart={startTuto} />
      {tutoState.status === 'running' && (
        <TutoMenu
          state={tutoState}
          controls={controls}
          chapters={tutoChapters}
          corner="bottom"
        />
      )}
      <div style={titleRowStyle}>
        <h2 style={{ margin: 0 }}>
          <FormattedMessage id="trace.viewer.title" />
          {(scopePreset || scopes.size === 1) &&
            scope.scopeName &&
            `  —  ${scope.scopeName}`}
        </h2>
        <VscodeButton
          id="traceRun"
          icon="play"
          disabled={running}
          onClick={onRunScope}
        >
          <FormattedMessage id={running ? 'trace.running' : 'trace.run'} />
        </VscodeButton>
        <VscodeButton
          id="traceOpenGui"
          icon="tools"
          onClick={(event) => {
            event.preventDefault();
            post(vscode, { kind: 'openInTestEditor' });
          }}
        >
          <FormattedMessage id={'tooltip.openGui'} />
        </VscodeButton>
        {runState.status === 'success' && (
          <VscodeButton
            id="traceCopyJson"
            icon={copied ? 'check' : 'copy'}
            secondary
            title={intl.formatMessage({
              id: copied ? 'trace.copiedJson' : 'trace.copyJson',
            })}
            onClick={() => {
              void navigator.clipboard.writeText(
                JSON.stringify(runState.trace, null, 2)
              );
              markCopied();
            }}
          >
            <FormattedMessage
              id={copied ? 'trace.copiedJson' : 'trace.copyJson'}
            />
          </VscodeButton>
        )}
        {scope.test !== undefined && (
          <LayoutSlider layout={shownLayout} onLayout={setLayout} />
        )}
      </div>

      {!scopePreset && scopes.size !== 1 && (
        <label className="trace-scope-select" style={fieldStyle}>
          <span style={{ fontWeight: 600 }}>
            <FormattedMessage id="trace.scope" />
          </span>
          {scopes.size > 0 ? (
            <VscodeSingleSelect
              value={scope.scopeName}
              onChange={(e) => {
                const s = fieldValue(e);
                setScope({ scopeName: s, test: scopes.get(s) });
              }}
              style={{ width: '100%' }}
            >
              {[...scopes.keys()].map((s) => (
                <VscodeOption key={s} value={s}>
                  {s}
                </VscodeOption>
              ))}
            </VscodeSingleSelect>
          ) : (
            <VscodeTextfield
              value={scope.scopeName}
              placeholder={intl.formatMessage({ id: 'trace.scopePlaceholder' })}
              onInput={(e) => {
                const s = fieldValue(e);
                setScope({ scopeName: s, test: scopes.get(s) });
              }}
              style={{ width: '100%' }}
            />
          )}
        </label>
      )}

      <div
        ref={resultsRef}
        style={{ [PANEL_HEIGHT_VAR]: panelHeight } as React.CSSProperties}
      >
        {scope.test !== undefined ? (
          <SplitPane
            layout={shownLayout}
            tuto={tuto}
            left={
              <DataPanel
                testing_scope={scope.test.testing_scope}
                vscode={vscode}
                addFilter={requestFilter}
                test={scope.test}
                trace={
                  runState.status === 'success' ? runState.trace : undefined
                }
                intl={intl}
              />
            }
            right={
              <TraceResult
                filterRequest={filterRequest}
                runState={runState}
                cwd={cwd}
                test={scope.test}
              />
            }
          />
        ) : (
          <TraceResult
            filterRequest={filterRequest}
            runState={runState}
            cwd={cwd}
          />
        )}
      </div>
    </div>
  );
}

// -- Tutorial -----------------------------------------------------------------
// Most targets only exist once a trace has run, or for a scope that has a test:
// Joyride skips the steps whose target is missing.

const tutoStep = (id: string, target: string, extra?: Partial<Step>): Step => ({
  id,
  content: <FormattedMessage id={id} />,
  target,
  ...extra,
});

// The first pill of this kind in the tree, whatever its row: a pill only
// exists for the rows it applies to (a compound value, a position in the
// code), so looking for the pill itself finds one whenever the trace has any.
// With none, there is nothing to explain and Joyride skips the step.
const treePill = (labelId: string): string =>
  `.trace-tree .internal [data-pill="${labelId}"]`;

// The pill is opened before its step is shown, as a click on it would, so that
// the step shows what it opens. Opened pills are left open.
function tutoPillStep(id: string, labelId: string): Step {
  const clickOnPill = (wantActive: boolean) => async (): Promise<void> => {
    const pill = document.querySelector<HTMLElement>(treePill(labelId));
    if (pill !== null && pill.dataset.active !== `${wantActive}`) {
      pill.click();
      // Lets React render what the pill opens before the step is placed.
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  };
  return tutoStep(id, treePill(labelId), {
    placement: 'right',
    before: clickOnPill(true),
    after: clickOnPill(false),
  });
}

// The name of an internal variable, a likely text to filter on, is selected
// for the user to right-click it: the menu is the one of VS Code, outside of
// the page, which the tutorial can neither open nor point at.
const treeLabel = '.trace-tree .internal .trace-node-label';

const tutoSelectionStep: Step = tutoStep('trace.tuto.selection', treeLabel, {
  placement: 'left',
  // The right click must go through.
  blockTargetInteraction: false,
  before: async () => {
    const label = document.querySelector(treeLabel);
    if (label !== null) {
      window.getSelection()?.selectAllChildren(label);
    }
  },
  after: async () => {
    window.getSelection()?.removeAllRanges();
  },
});

const tutoWelcome: Step[] = [
  // The message invites to open the menu: the click must go through.
  tutoStep('trace.tuto.welcome', '.tuto-menu', {
    blockTargetInteraction: false,
  }),
];

const tutoChapters = placeChapters(
  [
    {
      title: 'trace.tuto.chapter.toolbar',
      steps: [
        // No way back to the welcome step: the default buttons, without 'back'.
        tutoStep('trace.tuto.run', '#traceRun', {
          buttons: ['close', 'primary'],
        }),
        tutoStep('trace.tuto.openGui', '#traceOpenGui'),
        tutoStep('trace.tuto.copyJson', '#traceCopyJson'),
        tutoStep('trace.tuto.scope', '.trace-scope-select'),
        tutoStep('trace.tuto.layout', '.trace-layout-slider'),
      ],
    },
    {
      title: 'trace.tuto.chapter.data',
      steps: [
        tutoStep('trace.tuto.data', '.trace-data-panel', {
          placement: 'right',
        }),
        tutoStep('trace.tuto.sections', '.trace-section-header'),
        tutoStep('trace.tuto.expected', '.trace-data-expected'),
        tutoStep('trace.tuto.value', '.trace-data-value'),
        tutoStep('trace.tuto.edit', '.trace-data-edit'),
      ],
    },
    {
      title: 'trace.tuto.chapter.trace',
      steps: [
        tutoStep('trace.tuto.filter', '.trace-filter'),
        tutoStep('trace.tuto.expand', '.trace-expand-coll'),
        // On the left, over the data panel: the tree reaches down to the bottom
        // of the view, which leaves no room for the tooltip above or below it.
        tutoStep('trace.tuto.tree', '.trace-tree', { placement: 'left' }),
        tutoSelectionStep,
        tutoPillStep('trace.tuto.pillValue', 'trace.value'),
        tutoPillStep('trace.tuto.pillCode', 'trace.code'),
      ],
    },
  ] satisfies Chapter[],
  tutoWelcome.length
);

const tutoSteps: Step[] = [
  ...tutoWelcome,
  ...tutoChapters.flatMap((chapter) => chapter.steps),
  tutoStep('trace.tuto.end', 'body', { placement: 'center' }),
];

function LayoutSlider({
  layout,
  onLayout,
}: {
  layout: PaneLayout;
  onLayout: (layout: PaneLayout) => void;
}): ReactElement {
  const intl = useIntl();
  const [dragging, setDragging] = useState<number>();
  const index = dragging ?? PANE_LAYOUTS.indexOf(layout);
  const commit = (): void => {
    if (dragging !== undefined) {
      onLayout(PANE_LAYOUTS[dragging]);
      setDragging(undefined);
    }
  };
  return (
    <span className="trace-layout-slider" style={layoutSliderStyle}>
      <span className="trace-layout-label">
        <FormattedMessage id="trace.layout.data" />
      </span>
      <input
        type="range"
        className="trace-layout-range"
        min={0}
        max={PANE_LAYOUTS.length - 1}
        step={1}
        value={index}
        list="trace-layout-stops"
        aria-label={intl.formatMessage({ id: 'trace.layout.label' })}
        onChange={(e) => setDragging(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <datalist id="trace-layout-stops">
        {PANE_LAYOUTS.map((_, i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <span className="trace-layout-label">
        <FormattedMessage id="trace.layout.trace" />
      </span>
    </span>
  );
}

function TraceResult({
  runState,
  cwd,
  test,
  filterRequest,
}: {
  runState: RunState;
  cwd: string;
  test?: TraceTest;
  filterRequest: FilterCommand | null;
}): ReactElement | null {
  switch (runState.status) {
    case 'idle':
      return null;
    case 'running':
      return (
        <p>
          <FormattedMessage id="trace.running" />
        </p>
      );
    case 'error':
      return (
        <div>
          <p style={{ color: 'var(--vscode-errorForeground)' }}>
            <FormattedMessage id="trace.error" />
          </p>
          <pre style={preStyle}>{runState.message}</pre>
        </div>
      );
    case 'success':
      return (
        <TracePanel
          trace={runState.trace}
          cwd={cwd}
          test={test}
          filterRequest={filterRequest}
        />
      );
  }
}

function post(vscode: WebviewApi<unknown>, message: TraceUpMessage): void {
  vscode.postMessage(message);
}

// Width of the data pane during the tutorial, whatever the user dragged it to,
// as fractions of the split: the default one, widened as much as the data
// overflows it, but never past the maximum, which leaves the trace room for
// its steps.
const TUTO_BASE_WIDTH = 0.25;
const TUTO_MAX_WIDTH = 0.6;

function SplitPane({
  left,
  right,
  layout,
  tuto,
}: {
  left: ReactElement;
  right: ReactElement;
  layout: PaneLayout;
  /** During the tutorial, the width the user dragged is set aside, kept for
   *  afterwards, and the panes can no longer be resized. */
  tuto?: boolean;
}): ReactElement {
  const intl = useIntl();
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  // Null until measured: the pane is first laid out at the base width, then
  // widened by what overflows it at that width.
  const [tutoWidth, setTutoWidth] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const w = containerRef.current.getBoundingClientRect().width;
      if (w > 0) {
        setLeftWidth(w * 0.25);
      }
    }
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!draggingRef.current || !containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const w = e.clientX - rect.left;
      setLeftWidth(Math.max(120, Math.min(w, rect.width - 120)));
    };
    const onUp = (): void => {
      draggingRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const split = layout === 'both';
  const tutoSplit = tuto === true && split;

  useLayoutEffect(() => {
    const pane = leftRef.current;
    const container = containerRef.current;
    if (!tutoSplit) {
      setTutoWidth(null);
      return;
    }
    if (tutoWidth !== null || pane === null || container === null) {
      return;
    }
    // The overflow may be the pane's own or that of the panel it holds, which
    // scrolls by itself.
    const overflow = Math.max(
      ...[pane, pane.firstElementChild]
        .filter((e) => e !== null)
        .map((e) => e.scrollWidth - e.clientWidth)
    );
    const total = container.getBoundingClientRect().width;
    setTutoWidth(
      Math.min(total * TUTO_BASE_WIDTH + overflow, total * TUTO_MAX_WIDTH)
    );
  }, [tutoSplit, tutoWidth]);

  const shownWidth = tutoSplit
    ? (tutoWidth ?? `${TUTO_BASE_WIDTH * 100}%`)
    : (leftWidth ?? '25%');

  // The inactive pane is hidden rather than dropped: changing the shape of the
  // tree would remount the panels and wipe their filters, view mode and
  // expansion state.
  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', alignItems: 'stretch', width: '100%' }}
    >
      <div
        ref={leftRef}
        style={{
          width: split ? shownWidth : '100%',
          flex: split ? '0 0 auto' : '1 1 auto',
          minWidth: 0,
          overflow: 'auto',
          display: layout === 'trace' ? 'none' : undefined,
        }}
      >
        {left}
      </div>
      <div
        onMouseDown={() => {
          draggingRef.current = tuto !== true;
        }}
        title={intl.formatMessage({ id: 'trace.dragToResize' })}
        style={{
          flex: '0 0 auto',
          width: 6,
          margin: '0 6px',
          cursor: 'col-resize',
          background: 'var(--vscode-panel-border, transparent)',
          borderRadius: 2,
          display: split ? undefined : 'none',
        }}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: layout === 'data' ? 'none' : undefined,
        }}
      >
        {right}
      </div>
    </div>
  );
}

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
};

const layoutSliderStyle: React.CSSProperties = {
  marginLeft: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
