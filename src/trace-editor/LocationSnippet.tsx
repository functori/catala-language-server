import {
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useIntl } from 'react-intl';
import { getVsCodeApi } from '../shared/webviewApi';
import type { TraceDownMessage, TraceUpMessage } from './messages';
import type { CodeLocation } from './traceUtils';
import { posText } from './traceUtils';
import { CwdContext } from './traceContexts';

function resolvePath(cwd: string, file: string): string {
  if (!cwd || isAbsolute(file)) {
    return file;
  }
  return `${cwd.replace(/[\\/]+$/, '')}/${file}`;
}

function isAbsolute(file: string): boolean {
  return file.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(file);
}

export function candidatePaths(cwd: string, file: string): string[] {
  const direct = resolvePath(cwd, file);
  if (isAbsolute(file)) {
    return [direct];
  }
  return [direct, resolvePath(cwd, `_build/${file}`)];
}

// -- Fetching the source lines ------------------------------------------------

type Extract = { file: string; text: string } | null;

const extractCache = new Map<string, Extract>();
const pendingExtracts = new Map<number, (extract: Extract) => void>();
let extractSeq = 0;
let extractListenerAttached = false;

function ensureExtractListener(): void {
  if (extractListenerAttached) {
    return;
  }
  extractListenerAttached = true;
  window.addEventListener('message', (event: MessageEvent): void => {
    const m = event.data as TraceDownMessage;
    if (m?.kind === 'extract') {
      const callback = pendingExtracts.get(m.id);
      if (callback) {
        pendingExtracts.delete(m.id);
        callback(
          m.text === null || m.file === undefined
            ? null
            : { file: m.file, text: m.text }
        );
      }
    }
  });
}

function fetchExtract(files: string[], line: number): Promise<Extract> {
  const key = `${files.join('\u0000')}:${line}`;
  const cached = extractCache.get(key);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  ensureExtractListener();
  const id = extractSeq++;
  return new Promise<Extract>((resolve) => {
    pendingExtracts.set(id, resolve);
    const message: TraceUpMessage = {
      kind: 'requestExtract',
      id,
      files,
      line,
    };
    getVsCodeApi().postMessage(message);
  }).then((result) => {
    extractCache.set(key, result);
    return result;
  });
}

// -- Components ----------------------------------------------------------------

function SnippetBlock({
  pos,
  file,
  children,
}: {
  pos: CodeLocation;
  file: string;
  children: ReactNode;
}): ReactElement {
  const intl = useIntl();
  const [hover, setHover] = useState(false);
  const openLocation = (e: MouseEvent): void => {
    e.stopPropagation();
    const message: TraceUpMessage = {
      kind: 'openLocation',
      files: [file],
      start: pos.start,
      end: pos.end,
    };
    getVsCodeApi().postMessage(message);
  };
  const label = intl.formatMessage(
    { id: 'trace.openLocation' },
    { target: posText(pos) }
  );
  return (
    <div style={snippetStyle}>
      <pre style={sourceStyle}>{children}</pre>
      <button
        type="button"
        style={
          hover
            ? { ...openButtonStyle, ...openButtonHoverStyle }
            : openButtonStyle
        }
        onClick={openLocation}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={label}
        aria-label={label}
      >
        <span className="codicon codicon-go-to-file" />
      </button>
    </div>
  );
}

export function LocationSnippet({
  pos,
}: {
  pos: CodeLocation;
}): ReactElement | null {
  const cwd = useContext(CwdContext);
  const startLine = pos.start.line;
  const endLine = Math.max(startLine, pos.end.line);
  const [extracts, setExtracts] = useState<Extract[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const nums: number[] = [];
    for (let l = startLine; l <= endLine; l++) nums.push(l);
    void Promise.all(
      nums.map((l) => fetchExtract(candidatePaths(cwd, pos.file), l))
    ).then((found) => {
      if (!cancelled) setExtracts(found);
    });
    return (): void => {
      cancelled = true;
    };
  }, [cwd, pos]);

  const file = extracts?.find((e) => e !== null)?.file;
  if (extracts === null || file === undefined) {
    return null;
  }
  const lines = extracts.map((e) => e?.text ?? null);
  if (lines.length > 1) {
    return (
      <SnippetBlock pos={pos} file={file}>
        {lines.map((line) => line ?? '').join('\n')}
      </SnippetBlock>
    );
  }
  const text = lines[0] ?? '';
  const from = Math.max(0, pos.start.character - 1);
  const to = Math.max(from, pos.end.character - 1);
  return (
    <SnippetBlock pos={pos} file={file}>
      {text.slice(0, from)}
      <mark style={markStyle}>{text.slice(from, to) || ' '}</mark>
      {text.slice(to)}
    </SnippetBlock>
  );
}

// -- Styles --------------------------------------------------------------------

const snippetStyle: CSSProperties = {
  position: 'relative',
  margin: '2px 0 4px 22px',
};

const sourceStyle: CSSProperties = {
  margin: 0,
  padding: '2px 40px 2px 6px',
  background:
    'var(--vscode-textCodeBlock-background, var(--vscode-editor-background))',
  border: '1px solid var(--vscode-panel-border, transparent)',
  borderRadius: 2,
  overflowX: 'auto',
  whiteSpace: 'pre',
  userSelect: 'text',
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
};

const openButtonStyle: CSSProperties = {
  position: 'absolute',
  top: 2,
  right: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  padding: 0,
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--vscode-icon-foreground, var(--vscode-foreground))',
  opacity: 0.6,
};

const openButtonHoverStyle: CSSProperties = {
  background: 'var(--vscode-toolbar-hoverBackground, transparent)',
  opacity: 1,
};

const markStyle: CSSProperties = {
  background: 'var(--vscode-editor-findMatchHighlightBackground, yellow)',
  color: 'inherit',
  borderRadius: 2,
};
