import type { CSSProperties, ReactElement } from 'react';
import type { IntlShape } from 'react-intl';
import { useIntl } from 'react-intl';

export type Filter = {
  filter: string;
  option: 'include' | 'ignore' | 'exclude';
};

/** How the `include` pins combine; `exclude` pins always prune whatever the
    kind, and `ignore` pins never count. Pins are matched along the path from
    a root down to a node, not on the node alone:
    - `and`: every include pin matches some node of the path;
    - `or`: at least one include pin matches some node of the path. */
export type FilterKind = 'and' | 'or';

export function FilterPins({
  filters,
  setFilters,
  kind,
  setKind,
}: {
  filters: Filter[];
  setFilters: React.Dispatch<React.SetStateAction<Filter[]>>;
  kind?: FilterKind;
  setKind?: (kind: FilterKind) => void;
}): ReactElement | null {
  const intl = useIntl();
  if (filters.length === 0) {
    return null;
  }
  const includes = filters.filter((f) => f.option === 'include').length;
  // Always hand a new array to the setter: React skips the re-render when an
  // updater returns the very same reference.
  const onClickFilter = (filter: string): void => {
    setFilters((old) =>
      old.map((pin) => {
        if (filter == pin.filter) {
          return switchFilter(pin);
        } else {
          return pin;
        }
      })
    );
  };
  const removeFilter = (toRemove: string): void => {
    setFilters((old) => old.filter((current) => current.filter !== toRemove));
  };
  return (
    <div style={pinsStyle}>
      {kind !== undefined && setKind !== undefined && includes >= 2 && (
        <span
          role="button"
          onClick={() => setKind(kind === 'and' ? 'or' : 'and')}
          style={kindStyle}
          title={intl.formatMessage({
            id:
              kind === 'and'
                ? 'filterPin.kind.andTitle'
                : 'filterPin.kind.orTitle',
          })}
        >
          {intl.formatMessage({
            id: kind === 'and' ? 'filterPin.kind.and' : 'filterPin.kind.or',
          })}
        </span>
      )}
      {filters.map((filter) => (
        <span
          key={filter.filter}
          onClick={(e) => {
            e.preventDefault();
            onClickFilter(filter.filter);
          }}
          style={{ ...pinStyle, ...pinBackground(filter.option) }}
          title={titlePin(intl, filter)}
        >
          <span>{filter.filter}</span>
          <span
            className="codicon codicon-close"
            title={intl.formatMessage({ id: 'filterPin.removeFilter' })}
            style={{ cursor: 'pointer' }}
            onClick={() => removeFilter(filter.filter)}
          />
        </span>
      ))}
    </div>
  );
}

function titlePin(intl: IntlShape, filter: Filter): string {
  switch (filter.option) {
    case 'include':
      return intl.formatMessage(
        {
          id: 'filterPin.inclusion',
          defaultMessage: 'Je veux que "{filter}" apparaisse',
        },
        { filter: filter.filter }
      );
    case 'exclude':
      return intl.formatMessage(
        {
          id: 'filterPin.exclusion',
          defaultMessage: 'Je ne veux pas que "{filter}" apparaisse',
        },
        { filter: filter.filter }
      );
    case 'ignore':
      return intl.formatMessage(
        {
          id: 'filterPin.ignore',
          defaultMessage: 'Ignorer le filtre "{filter}"',
        },
        { filter: filter.filter }
      );
  }
}

function pinBackground(
  highlighted: 'include' | 'ignore' | 'exclude'
): React.CSSProperties {
  switch (highlighted) {
    case 'include':
      return {
        backgroundColor: 'var(--vscode-notebookStatusSuccessIcon-foreground)',
      };
    case 'exclude':
      return { backgroundColor: 'var(--vscode-errorForeground)' };
    case 'ignore':
      return {
        backgroundColor: 'var(--vscode-button-background)',
        opacity: '0.5',
      };
  }
}

function switchFilter(filter: Filter): Filter {
  switch (filter.option) {
    case 'include':
      return { filter: filter.filter, option: 'exclude' };
    case 'ignore':
      return { filter: filter.filter, option: 'include' };
    case 'exclude':
      return { filter: filter.filter, option: 'ignore' };
  }
}

// The background is not set here: `pinBackground` gives it the colour of the
// pin's own option, and clicking cycles through them.
const pinStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 6px',
  borderRadius: 4,
  color: 'var(--vscode-badge-foreground)',
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
  cursor: 'pointer',
};

const kindStyle: CSSProperties = {
  ...pinStyle,
  color: 'var(--vscode-button-secondaryForeground)',
  backgroundColor: 'var(--vscode-button-secondaryBackground)',
  fontWeight: 600,
};

const pinsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  margin: '0 0 8px 0',
};
