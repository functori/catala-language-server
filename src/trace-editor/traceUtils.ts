import type { JsonValue } from '../shared/util_client';
import type {
  RuntimeValueRaw,
  RuntimeValue,
  ScopeDef,
  TestInputs,
  TestOutputs,
} from '../generated/catala_types';
import {
  readRuntimeValue,
  readScopeDef,
  readTestInputs,
  readTestOutputs,
} from '../generated/catala_types';
import type { IntlShape } from 'react-intl';
import type { Filter } from '../FilterPin';

export type CodeLocation = {
  file: string;
  start: { line: number; character: number };
  end: { line: number; character: number };
  law_headings?: string[];
};

export type TraceKind = { kind: string; decl_pos?: CodeLocation } & Record<
  string,
  JsonValue
>;

export type TraceValue =
  | { kind: 'absent' }
  | { kind: 'bool'; value: boolean }
  | { kind: 'integer'; value: number }
  | { kind: 'decimal'; value: number }
  | { kind: 'money'; value: string }
  | { kind: 'date'; value: { year: number; month: number; day: number } }
  | {
      kind: 'duration';
      value: { years: number; months: number; days: number };
    }
  | { kind: 'enum'; ctor: string; value?: TraceValue }
  | { kind: 'struct'; fields: Record<string, TraceValue> }
  | { kind: 'array'; values: [TraceValue, string | undefined][] };

export type TraceElement = {
  element: TraceKind;
  pos?: CodeLocation;
  value?: TraceValue;
  trace?: TraceElement[];
};

export type TraceVariable =
  | { kind: 'value'; name: string; value?: TraceValue; source?: TraceElement }
  | {
      kind: 'step';
      name: string;
      variables: TraceVariable[];
      value?: TraceValue;
      index?: number;
      source?: TraceElement;
    };

// The step a test's variable paths are relative to, as returned by
// `traceVariablesForTest`.
export type TestedScope = {
  variable: Extract<TraceVariable, { kind: 'step' }>;
  // Path of that step in the whole variable tree: prepend it to a path coming
  // from `traceVariablesForTest` to get one that is absolute.
  path: string;
};

export type TraceTest = {
  testing_scope: string;
  tested_scope: ScopeDef;
  test_inputs: TestInputs;
  test_outputs: TestOutputs;
  variables: Map<string, TraceValue | null>;
  description: string;
  title: string;
};

const OPTIONAL_PRESENT = new Set(['Present', 'Présent', 'Obecny']);
const OPTIONAL_ABSENT = new Set(['Absent', 'Nieobecny']);

function traceValueFromJson(value: JsonValue): TraceValue | undefined {
  if (typeof value === 'boolean') {
    return { kind: 'bool', value };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { kind: 'integer', value }
      : { kind: 'decimal', value };
  }
  if (typeof value === 'string') {
    if (OPTIONAL_ABSENT.has(value)) {
      return { kind: 'absent' };
    }
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (date) {
      return {
        kind: 'date',
        value: {
          year: Number(date[1]),
          month: Number(date[2]),
          day: Number(date[3]),
        },
      };
    }
    const rational = /^(-?\d+)\/(\d+)$/.exec(value);
    if (rational) {
      return {
        kind: 'decimal',
        value: Number(rational[1]) / Number(rational[2]),
      };
    }
    if (/^-?\d+\.\d+$/.test(value)) {
      return { kind: 'money', value: parseFloat(value).toFixed(2) };
    }
    if (/^-?\d+$/.test(value)) {
      return { kind: 'integer', value: Number(value) };
    }
    return { kind: 'enum', ctor: value };
  }
  if (Array.isArray(value)) {
    const values: [TraceValue, string | undefined][] = [];
    for (const v of value) {
      const tv = traceValueFromJson(v);
      if (tv !== undefined) {
        values.push([tv, undefined]);
      }
    }
    return { kind: 'array', values };
  }
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, JsonValue>;
    const keys = Object.keys(o);
    if (keys.length === 1 && OPTIONAL_PRESENT.has(keys[0])) {
      const x = o[keys[0]];
      const inner = Array.isArray(x) && x.length > 0 ? x[0] : x;
      return traceValueFromJson(inner);
    }

    if (
      typeof o.years === 'number' &&
      typeof o.months === 'number' &&
      typeof o.days === 'number'
    ) {
      return {
        kind: 'duration',
        value: { years: o.years, months: o.months, days: o.days },
      };
    }
    let fields: Record<string, TraceValue> = {};
    for (const k of keys) {
      const tv = traceValueFromJson(o[k]);
      if (tv !== undefined) {
        fields[k] = tv;
      }
    }
    return { kind: 'struct', fields };
  }
}

export function traceValueFromRuntime(v: RuntimeValue): TraceValue | undefined {
  const rv = v.value;
  switch (rv.kind) {
    case 'Money':
      return { kind: 'money', value: (rv.value / 100).toFixed(2) };
    case 'Bool':
      return { kind: 'bool', value: rv.value };
    case 'Integer':
      return { kind: 'integer', value: rv.value };
    case 'Decimal':
      return { kind: 'decimal', value: rv.value };
    case 'Date':
      return { kind: 'date', value: rv.value };
    case 'Duration':
      return { kind: 'duration', value: rv.value };
    case 'Enum': {
      const [ctor, payload] = rv.value[1];
      if (payload === null) {
        return OPTIONAL_ABSENT.has(ctor)
          ? { kind: 'absent' }
          : { kind: 'enum', ctor };
      }
      if (OPTIONAL_PRESENT.has(ctor)) {
        return traceValueFromRuntime(payload.value);
      }
      return {
        kind: 'enum',
        ctor,
        value: traceValueFromRuntime(payload.value),
      };
    }
    case 'Struct': {
      const [, m] = rv.value;
      let fields: Record<string, TraceValue> = {};
      for (const [k, v] of m) {
        const tv = traceValueFromRuntime(v);
        if (tv !== undefined) {
          fields[k] = tv;
        }
      }
      return { kind: 'struct', fields };
    }
    case 'Array': {
      const values: [TraceValue, string | undefined][] = [];
      for (const item of rv.value) {
        const tv = traceValueFromRuntime(item);
        if (tv !== undefined) {
          const label = item.attrs.find(
            (a) => a.kind === 'ArrayItemLabel'
          )?.value;
          values.push([tv, label]);
        }
      }
      return { kind: 'array', values };
    }
  }
}

export function traceValueToRuntime(
  tv: TraceValue
): RuntimeValueRaw | undefined {
  switch (tv.kind) {
    case 'money':
      return { kind: 'Money', value: parseFloat(tv.value) * 100 };
    case 'bool':
      return { kind: 'Bool', value: tv.value };
    case 'integer':
      return { kind: 'Integer', value: tv.value };
    case 'decimal':
      return { kind: 'Decimal', value: tv.value };
    case 'date':
      return { kind: 'Date', value: tv.value };
    case 'duration':
      return { kind: 'Duration', value: tv.value };
    case 'absent': {
      const decl = {
        enum_name: 'Optional',
        constructors: new Map([['Absent', null]]),
        ctor_attrs: new Map(),
      };
      return { kind: 'Enum', value: [decl, ['Absent', null]] };
    }
    case 'enum': {
      if (tv.value === undefined) {
        const decl = {
          enum_name: tv.ctor,
          constructors: new Map([[tv.ctor, null]]),
          ctor_attrs: new Map(),
        };
        return { kind: 'Enum', value: [decl, [tv.ctor, null]] };
      }
    }
  }
}

export function formatTraceValue(
  v: TraceValue,
  intl: IntlShape,
  lang = 'en',
  all = false,
  indent = ''
): string | undefined {
  const inner = indent + '  ';
  switch (v.kind) {
    case 'money':
      return v.value;
    case 'bool':
      return intl.formatMessage({
        id: v.value ? 'true' : 'false',
      });
    case 'integer':
    case 'decimal':
      return String(v.value);
    case 'date': {
      const d = new Date(v.value.year, v.value.month, v.value.day);
      return intl.formatDate(d);
    }
    case 'duration': {
      switch (lang) {
        case 'en':
          return `${v.value.years}y ${v.value.months}m ${v.value.days}d`;
        case 'fr':
          return `${v.value.days}j ${v.value.months}m ${v.value.years}a`;
        default:
          return 'Unexpected language for duration';
      }
    }
    case 'absent':
      return 'Absent';
    case 'enum':
      if (v.value === undefined) {
        return v.ctor;
      }
      return all
        ? `${v.ctor} ${formatTraceValue(v.value, intl, lang, all, indent) ?? ''}`
        : undefined;
    case 'struct':
      if (!all) return undefined;
      if (Object.keys(v.fields).length === 0) return '{}';
      return `{\n${Object.entries(v.fields)
        .map(
          ([k, f]) =>
            `${inner}${k}: ${formatTraceValue(f, intl, lang, all, inner) ?? ''}`
        )
        .join(',\n')}\n${indent}}`;
    case 'array':
      if (!all) return undefined;
      if (v.values.length === 0) return '[]';
      return `[\n${v.values
        .map(
          ([x, label]) =>
            `${inner}${label ? `${label}: ` : ''}${formatTraceValue(x, intl, lang, all, inner) ?? ''}`
        )
        .join(',\n')}\n${indent}]`;
  }
}

export function traceValueEqual(a: TraceValue, b: TraceValue): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'absent':
      return true;
    case 'bool':
    case 'integer':
    case 'decimal':
    case 'money':
      return a.value === (b as typeof a).value;
    case 'date': {
      const d = (b as typeof a).value;
      return (
        a.value.year === d.year &&
        a.value.month === d.month &&
        a.value.day === d.day
      );
    }
    case 'duration': {
      const d = (b as typeof a).value;
      return (
        a.value.years === d.years &&
        a.value.months === d.months &&
        a.value.days === d.days
      );
    }
    case 'enum': {
      const e = b as typeof a;
      if (a.ctor !== e.ctor) return false;
      if (a.value === undefined || e.value === undefined) {
        return a.value === e.value;
      }
      return traceValueEqual(a.value, e.value);
    }
    case 'struct': {
      const s = b as typeof a;
      const keys = Object.keys(a.fields);
      return (
        keys.length === Object.keys(s.fields).length &&
        keys.every(
          (k) =>
            s.fields[k] !== undefined &&
            traceValueEqual(a.fields[k], s.fields[k])
        )
      );
    }
    case 'array': {
      const arr = b as typeof a;
      return (
        a.values.length === arr.values.length &&
        a.values.every(([x], i) => traceValueEqual(x, arr.values[i][0]))
      );
    }
  }
}

function traceElementFromJson(e: JsonValue): TraceElement | null {
  if (
    e === null ||
    typeof e !== 'object' ||
    Array.isArray(e) ||
    typeof (e as Record<string, JsonValue>).element !== 'object' ||
    (e as Record<string, JsonValue>).element === null
  ) {
    return null;
  }
  const o = e as Record<string, JsonValue>;
  const element = o.element as Record<string, JsonValue>;
  if (!('kind' in element)) {
    return null;
  }
  const trace = Array.isArray(o.trace)
    ? o.trace
        .map(traceElementFromJson)
        .filter((x): x is TraceElement => x !== null)
    : undefined;
  return {
    element: element as unknown as TraceKind,
    pos: o.pos as unknown as CodeLocation | undefined,
    value: o.value !== undefined ? traceValueFromJson(o.value) : undefined,
    trace,
  };
}

export function traceFromJson(trace: JsonValue): TraceElement[] | null {
  if (!Array.isArray(trace)) {
    return null;
  }
  const elements = trace.map(traceElementFromJson);
  const looksLikeTrace = elements.every((e) => e !== null);
  return !looksLikeTrace ? null : (elements as TraceElement[]);
}

function mergeSteps(l: TraceVariable[]): TraceVariable[] {
  let acc: TraceVariable[] = [];
  for (const tv of l) {
    if (tv.kind === 'step') {
      const variables = mergeSteps(tv.variables);
      if (variables.length === 1 && variables[0].kind === 'step') {
        acc.push({ ...variables[0], name: `${tv.name}.${variables[0].name}` });
      } else {
        const vs = variables.filter(
          (tv) =>
            tv.kind === 'step' ||
            (tv.value !== undefined &&
              tv.value.kind !== 'struct' &&
              tv.value.kind !== 'array' &&
              !(tv.value.kind === 'enum' && tv.value.value !== undefined))
        );
        if (vs.length !== 0) acc.push({ ...tv, variables });
      }
    } else {
      acc.push(tv);
    }
  }
  return acc;
}

function traceVariablesAux(
  trace: TraceElement[],
  acc: TraceVariable[] = []
): TraceVariable[] {
  for (const te of trace) {
    const k = te.element;
    const varCond =
      (k.kind === 'scope_var' && k.input !== 'only_input') ||
      k.kind === 'local_var';
    if (
      (k.kind === 'scope_call' || varCond) &&
      te.trace !== undefined &&
      typeof k.name === 'string'
    ) {
      const variables = traceVariablesAux(te.trace);
      if (variables.length === 0 && te.value !== undefined) {
        acc.push({
          kind: 'value',
          name: k.name,
          value: te.value,
          source: te,
        });
      } else if (variables.length !== 0) {
        if (
          varCond &&
          typeof k.name === 'string' &&
          te.value !== undefined &&
          te.value.kind !== 'struct' &&
          te.value.kind !== 'array'
        ) {
          acc.push({
            kind: 'value',
            name: k.name,
            value: te.value,
            source: te,
          });
        }
        acc.push({
          kind: 'step',
          name: k.name,
          variables,
          value: te.value,
          source: te,
        });
      }
    } else {
      if (varCond && typeof k.name === 'string') {
        acc.push({ kind: 'value', name: k.name, value: te.value, source: te });
      }
      if (te.trace !== undefined) {
        traceVariablesAux(te.trace, acc);
      }
    }
  }
  return acc;
}

function indexDuplicateSteps(variables: TraceVariable[]): TraceVariable[] {
  const counts = new Map<string, number>();
  for (const v of variables) {
    if (v.kind === 'step') counts.set(v.name, (counts.get(v.name) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return variables.map((v) => {
    if (v.kind !== 'step') return v;
    const step = { ...v, variables: indexDuplicateSteps(v.variables) };
    if ((counts.get(v.name) ?? 0) > 1) {
      const i = seen.get(v.name) ?? 0;
      seen.set(v.name, i + 1);
      return { ...step, index: i };
    }
    return step;
  });
}

function traceVariables(trace: TraceElement[]): TraceVariable[] {
  return indexDuplicateSteps(mergeSteps(traceVariablesAux(trace)));
}

export function stepIndexMap(trace: TraceElement[]): Map<TraceElement, number> {
  const map = new Map<TraceElement, number>();
  const walk = (variables: TraceVariable[]): void => {
    for (const v of variables) {
      if (v.kind !== 'step') continue;
      if (v.index !== undefined && v.source !== undefined) {
        map.set(v.source, v.index);
      }
      walk(v.variables);
    }
  };
  walk(traceVariables(trace));
  return map;
}

export function fieldValue(e: Event): string {
  return (e.target as { value?: string } | null)?.value ?? '';
}

/** A location as `file:line`, the way both the tree and a snippet name one. */
export function posText(pos?: CodeLocation): string {
  if (!pos) return '';
  return `${pos.file}:${pos.start.line}`;
}

/**
 * Height left for the panels under the editor's header. The editor measures it
 * and sets it on their container; each panel caps itself with it. Declared
 * here rather than in any of them, since the editor, the data panel and the
 * tree view all need it.
 */
export const PANEL_HEIGHT_VAR = '--trace-panel-height';

export function variableSegment(v: TraceVariable): string {
  return v.kind === 'step' && v.index !== undefined
    ? `${v.name}[${v.index}]`
    : v.name;
}

export function variablePath(prefix: string, v: TraceVariable): string {
  const segment = variableSegment(v);
  return prefix ? `${prefix}.${segment}` : segment;
}

export function findTraceValue(
  path: string,
  variables: TraceVariable[],
  prefix = ''
): TraceValue | undefined {
  for (const v of variables) {
    const childPath = variablePath(prefix, v);
    if (childPath === path) return v.value;
    if (v.kind === 'step') {
      const tv = findTraceValue(path, v.variables, childPath);
      if (tv !== undefined) return tv;
    }
  }
  return undefined;
}

function findScope(
  scope: string,
  variables: TraceVariable[],
  prefix = ''
): TestedScope | undefined {
  for (const v of variables) {
    if (v.kind === 'step') {
      const path = variablePath(prefix, v);
      if (v.name.split('.').includes(scope)) return { variable: v, path };
      const sc = findScope(scope, v.variables, path);
      if (sc !== undefined) return sc;
    }
  }
}

// The returned variables are those of the tested scope, so the paths built from
// them are relative to it; the third element is that anchor.
export function traceVariablesForTest(
  trace: TraceElement[],
  scope: string
): [TraceVariable[], Record<string, TraceValue>, TestedScope?] {
  let variables: TraceVariable[] = [];
  let outputs: Record<string, TraceValue> = {};
  let testedScope: TestedScope | undefined;
  if (trace !== undefined) {
    testedScope = findScope(scope, traceVariables(trace));
    if (testedScope !== undefined) {
      const value = testedScope.variable.value;
      variables = testedScope.variable.variables;
      if (value?.kind === 'struct') {
        outputs = value.fields;
      } else if (value !== undefined) {
        outputs = { output: value };
      }
    }
  }
  return [variables, outputs, testedScope];
}

function readTraceTestVariables(x: JsonValue): Map<string, TraceValue | null> {
  const map = new Map<string, TraceValue | null>();
  if (x !== null && typeof x === 'object' && !Array.isArray(x)) {
    const o = x as Record<string, JsonValue>;
    for (const name of Object.keys(o)) {
      if (o[name] === 'None') {
        map.set(name, null);
      } else if (Array.isArray(o[name]) && o[name][0] === 'Some') {
        const tv = traceValueFromRuntime(readRuntimeValue(o[name][1]));
        if (tv !== undefined) {
          map.set(name, tv);
        }
      }
    }
  }
  return map;
}

export function readTraceTest(x: JsonValue): TraceTest {
  const o = x as Record<string, JsonValue>;
  return {
    testing_scope: o['testing_scope'] as string,
    tested_scope: readScopeDef(o['tested_scope']),
    test_inputs: readTestInputs(o['test_inputs']),
    test_outputs: readTestOutputs(o['test_outputs']),
    variables: readTraceTestVariables(o['variables']),
    description: o['description'] as string,
    title: o['title'] as string,
  };
}

// -- Trace kind description ---------------------------------------------------

export type Tone = 'scope' | 'branch' | 'error' | 'plain';

export type Described = {
  symbol: string;
  label: string;
  detail?: string;
  tone: Tone;
  showsValue: boolean;
  showsCode: boolean;
};

export function detail(x: JsonValue): string {
  return typeof x === 'string' ? x : '';
}

export function describeKind(kind: TraceKind, intl: IntlShape): Described {
  const t = (id: string): string => intl.formatMessage({ id });
  switch (kind.kind) {
    case 'scope_call':
      return {
        symbol: '→',
        label: t('trace.kind.scope'),
        detail: detail(kind.name),
        tone: 'scope',
        showsValue: true,
        showsCode: true,
      };
    case 'scope_var': {
      const label =
        kind.input === 'reentrant'
          ? t('trace.kind.scopeContextVariable')
          : kind.input === 'only_input'
            ? t('trace.kind.scopeInputVariable')
            : t('trace.kind.scopeVariable');
      return {
        symbol: '≔',
        label,
        detail: detail(kind.name),
        tone: 'plain',
        showsValue: true,
        showsCode: kind.input !== 'only_input',
      };
    }
    case 'local_var':
      return {
        symbol: '≔',
        label: t('trace.kind.localVariable'),
        detail: detail(kind.name),
        tone: 'plain',
        showsValue: true,
        showsCode: true,
      };
    case 'local_tup':
      return {
        symbol: '≔',
        label: t('trace.kind.localVariables'),
        detail: Array.isArray(kind.names)
          ? (kind.names as unknown[]).map(String).join(', ')
          : undefined,
        tone: 'plain',
        showsValue: true,
        showsCode: true,
      };
    case 'function_call':
      return {
        symbol: '→',
        label: t('trace.kind.function'),
        detail: detail(kind.name),
        tone: 'scope',
        showsValue: true,
        showsCode: true,
      };
    case 'branch_condition':
      return {
        symbol: '⊡',
        label: t('trace.kind.condition'),
        tone: 'branch',
        showsValue: true,
        showsCode: true,
      };
    case 'if_branching':
      return {
        symbol: '⊸',
        label: t('trace.kind.branchTaken'),
        tone: 'branch',
        showsValue: false,
        showsCode: true,
      };
    case 'match_branching':
      return {
        symbol: '⊸',
        label: t('trace.kind.branchCase'),
        detail: detail(kind.constructor as unknown as JsonValue),
        tone: 'branch',
        showsValue: false,
        showsCode: true,
      };
    case 'assertion':
      return {
        symbol: '⊹',
        label: t('trace.kind.assertion'),
        tone: 'plain',
        showsValue: false,
        showsCode: true,
      };
    case 'exception':
      return {
        symbol: '⊕',
        label: t('trace.kind.definition'),
        detail: kind.label !== undefined ? detail(kind.label) : undefined,
        tone: 'plain',
        showsValue: false,
        showsCode: true,
      };
    case 'error':
      return {
        symbol: '⨉',
        label: t('trace.kind.error'),
        detail: [detail(kind.type), detail(kind.message)]
          .filter(Boolean)
          .join(': '),
        tone: 'error',
        showsValue: false,
        showsCode: true,
      };
    default:
      return {
        symbol: '•',
        label: kind.kind,
        tone: 'plain',
        showsValue: false,
        showsCode: true,
      };
  }
}

// -- Expected vs. computed values ---------------------------------------------

export type Match = 'match' | 'mismatch' | undefined;

export type Expected = {
  variables: Map<string, TraceValue | null>;
  output: Map<string, Match>;
};

export function nodeMatchState(
  expected: Expected,
  path: string,
  value: TraceValue
): Match {
  const varExp = expected.variables.get(path);
  if (varExp !== undefined && varExp !== null) {
    return traceValueEqual(varExp, value) ? 'match' : 'mismatch';
  }
  return expected.output.get(path);
}

export function subtreeHasMismatch(
  el: TraceElement,
  childPrefix: string,
  expected: Expected,
  stepIndices: Map<TraceElement, number>
): boolean {
  const newPrefix = (c: TraceElement): string => {
    if (
      (c.element.kind === 'scope_call' ||
        c.element.kind === 'scope_var' ||
        c.element.kind === 'local_var') &&
      typeof c.element.name === 'string'
    ) {
      const segment = indexedSegment(c, c.element.name, stepIndices);
      return childPrefix ? `${childPrefix}.${segment}` : segment;
    } else {
      return childPrefix;
    }
  };
  if (
    (el.element.kind === 'scope_call' ||
      el.element.kind === 'scope_var' ||
      el.element.kind === 'local_var') &&
    el.trace !== undefined
  ) {
    const scopeMismatch = el.trace.some((c) =>
      subtreeHasMismatch(c, newPrefix(c), expected, stepIndices)
    );
    if (scopeMismatch) return true;
  }
  if (
    (el.element.kind === 'scope_var' || el.element.kind === 'local_var') &&
    el.value !== undefined
  ) {
    if (nodeMatchState(expected, childPrefix, el.value) === 'mismatch') {
      return true;
    }
  }
  if (el.trace !== undefined) {
    return el.trace.some((c) =>
      subtreeHasMismatch(c, newPrefix(c), expected, stepIndices)
    );
  }
  return false;
}

// -- Filtering ----------------------------------------------------------------

export function filterMatches(
  el: TraceElement,
  filters: Filter[],
  intl: IntlShape
): [Filter[], boolean] {
  const { label, detail } = describeKind(el.element, intl);
  const value =
    el.value !== undefined ? formatTraceValue(el.value, intl) : undefined;
  const text = [
    label,
    detail ?? '',
    value ?? '',
    posText(el.pos),
    JSON.stringify(el.element),
  ]
    .join(' ')
    .toLowerCase();
  let remaining_filters = [];
  let exclusion = false;
  for (let filter of filters) {
    if (text.includes(filter.filter) && filter.option == 'include') {
      continue;
    } else if (filter.option == 'ignore') {
      continue;
    } else if (text.includes(filter.filter) && filter.option == 'exclude') {
      exclusion = true;
    } else {
      remaining_filters.push(filter);
    }
  }
  return [remaining_filters, exclusion];
}

export function subtreeMatches(
  el: TraceElement,
  filters: Filter[],
  intl: IntlShape
): boolean {
  let [remaining_filters, forbidden] = filterMatches(el, filters, intl);
  if (forbidden) {
    return false;
  }
  // If the only remaining filters are exclude type and that there are no more
  // children, filter matches
  let without_exclude = remaining_filters.filter((f) => f.option != 'exclude');
  const children = Array.isArray(el.trace) ? el.trace : [];
  if (without_exclude.length == 0 && children.length == 0) {
    return true;
  }
  return children.some((c) => subtreeMatches(c, remaining_filters, intl));
}

export function indexedSegment(
  el: TraceElement,
  name: string,
  stepIndices: Map<TraceElement, number>
): string {
  const index = stepIndices.get(el);
  return index !== undefined ? `${name}[${index}]` : name;
}

function stepInto(
  te: TraceElement,
  prefix: string,
  testedScope: string | undefined,
  stepIndices: Map<TraceElement, number>
): {
  children: TraceElement[];
  prefix: string;
  testedScope: string | undefined;
} {
  const merged =
    te.element.kind === 'scope_var' &&
    typeof te.element.name === 'string' &&
    te.trace?.length === 1 &&
    te.trace[0].element.kind === 'scope_call' &&
    typeof te.trace[0].element.name === 'string';
  const node = merged && te.trace ? te.trace[0] : te;
  const displayName = merged
    ? `${te.element.name as string}.${node.element.name as string}`
    : (te.element.name as string);
  let childPrefix = prefix;
  let nextTestedScope = testedScope;
  if (
    (node.element.kind === 'scope_call' ||
      node.element.kind === 'scope_var' ||
      node.element.kind === 'local_var') &&
    typeof node.element.name === 'string'
  ) {
    if (node.element.name === testedScope) {
      nextTestedScope = undefined;
    } else {
      const segment = indexedSegment(node, displayName, stepIndices);
      childPrefix = prefix ? `${prefix}.${segment}` : segment;
    }
  }
  return {
    children: node.trace ?? [],
    prefix: childPrefix,
    testedScope: nextTestedScope,
  };
}

export function closestFilterMatch(
  roots: TraceElement[],
  filters: Filter[],
  intl: IntlShape,
  stepIndices: Map<TraceElement, number>,
  testedScope: string | undefined
): {
  roots: TraceElement[];
  prefix: string;
  testedScope: string | undefined;
} {
  let level = roots;
  let prefix = '';
  let scope = testedScope;
  let active = filters;
  let closest = { roots, prefix, testedScope: scope };
  for (;;) {
    const matching = level.filter((el) => subtreeMatches(el, active, intl));
    if (matching.length !== 1) {
      return closest;
    }
    const [only] = matching;
    closest = { roots: [only], prefix, testedScope: scope };
    const [remaining, excluded] = filterMatches(only, active, intl);
    if (excluded || remaining.every((pin) => pin.option === 'exclude')) {
      return closest;
    }
    const stepped = stepInto(only, prefix, scope, stepIndices);
    if (stepped.children.length === 0) {
      return closest;
    }
    level = stepped.children;
    active = remaining;
    prefix = stepped.prefix;
    scope = stepped.testedScope;
  }
}
