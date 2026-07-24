import type { JsonValue } from '../shared/util_client';
import type {
  RuntimeValueRaw,
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
  | { kind: 'struct'; fields: [string, TraceValue][] }
  | { kind: 'array'; values: TraceValue[] };

export type TraceElement = {
  element: TraceKind;
  pos?: CodeLocation;
  value?: TraceValue;
  trace?: TraceElement[];
};

export type ScopeVariable = { name: string; value?: TraceValue };

export type TraceTest = {
  testing_scope: string;
  tested_scope: ScopeDef;
  test_inputs: TestInputs;
  test_outputs: TestOutputs;
  variables: Map<string, TraceValue>;
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
    // A bare constructor string is an enum with no payload.
    return { kind: 'enum', ctor: value };
  }
  if (Array.isArray(value)) {
    const values: TraceValue[] = [];
    for (const v of value) {
      const tv = traceValueFromJson(v);
      if (tv !== undefined) {
        values.push(tv);
      }
    }
    return { kind: 'array', values };
  }
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, JsonValue>;
    const keys = Object.keys(o);
    if (keys.length === 1 && OPTIONAL_PRESENT.has(keys[0])) {
      // The payload is a `(value, pos)` tuple (serialized as [value, pos]), or
      // just the value; recurse on the inner value.
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
    // Any other object is a struct: its keys are the field names.
    const fields: [string, TraceValue][] = [];
    for (const k of keys) {
      const tv = traceValueFromJson(o[k]);
      if (tv !== undefined) {
        fields.push([k, tv]);
      }
    }
    return { kind: 'struct', fields };
  }
}

export function traceValueFromRuntime(
  rv: RuntimeValueRaw
): TraceValue | undefined {
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
        return traceValueFromRuntime(payload.value.value);
      }
      return {
        kind: 'enum',
        ctor,
        value: traceValueFromRuntime(payload.value.value),
      };
    }
    case 'Struct': {
      const [, m] = rv.value;
      const fields: [string, TraceValue][] = [];
      for (const [k, v] of m) {
        const tv = traceValueFromRuntime(v.value);
        if (tv !== undefined) {
          fields.push([k, tv]);
        }
      }
      return { kind: 'struct', fields };
    }
    case 'Array': {
      const values: TraceValue[] = [];
      for (const v of rv.value) {
        const tv = traceValueFromRuntime(v.value);
        if (tv !== undefined) {
          values.push(tv);
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
  }
}

/**
 * Format a value for display. Containers (enum payloads, structs, arrays) are
 * shown only when `all` is set; otherwise they return `undefined` (they are
 * meant to be shown by walking the structure).
 */
export function formatTraceValue(
  v: TraceValue,
  all = false,
  indent = ''
): string | undefined {
  const inner = indent + '  ';
  switch (v.kind) {
    case 'money':
      return v.value;
    case 'bool':
    case 'integer':
    case 'decimal':
      return String(v.value);
    case 'date': {
      return `${v.value.year}-${String(v.value.month).padStart(2, '0')}-${String(v.value.day).padStart(2, '0')}`;
    }
    case 'duration': {
      return `${v.value.years}y ${v.value.months}m ${v.value.days}d`;
    }
    case 'absent':
      return '--';
    case 'enum':
      if (v.value === undefined) {
        return v.ctor;
      }
      return all
        ? `${v.ctor} ${formatTraceValue(v.value, all, indent) ?? ''}`
        : undefined;
    case 'struct':
      if (!all) return undefined;
      if (v.fields.length === 0) return '{}';
      return `{\n${v.fields
        .map(
          ([k, f]) => `${inner}${k}: ${formatTraceValue(f, all, inner) ?? ''}`
        )
        .join(',\n')}\n${indent}}`;
    case 'array':
      if (!all) return undefined;
      if (v.values.length === 0) return '[]';
      return `[\n${v.values
        .map((x) => `${inner}${formatTraceValue(x, all, inner) ?? ''}`)
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
      return (
        a.fields.length === s.fields.length &&
        a.fields.every(
          ([k, v], i) =>
            s.fields[i][0] === k && traceValueEqual(v, s.fields[i][1])
        )
      );
    }
    case 'array': {
      const arr = b as typeof a;
      return (
        a.values.length === arr.values.length &&
        a.values.every((v, i) => traceValueEqual(v, arr.values[i]))
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

export function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function isSubscopeVar(el: TraceElement): boolean {
  return (
    Array.isArray(el.trace) &&
    el.trace.some((c) => c.element.kind === 'scope_call')
  );
}

export function scopeVariables(trace: TraceElement[]): ScopeVariable[] {
  const out: ScopeVariable[] = [];
  const visit = (elements: TraceElement[], prefix: string): void => {
    for (const el of elements) {
      const trel = el.element;
      const sub = Array.isArray(el.trace) ? el.trace : [];
      if (
        (trel.kind === 'scope_var' || trel.kind === 'loc_var') &&
        typeof trel.name === 'string'
      ) {
        const path = prefix ? `${prefix}.${trel.name}` : trel.name;
        if (isSubscopeVar(el)) {
          visit(sub, path);
        } else {
          if (trel.input !== 'only_input') {
            out.push({ name: path, value: el.value });
          }
          visit(sub, prefix);
        }
      } else {
        visit(sub, prefix);
      }
    }
  };
  visit(trace, '');
  return out;
}

/**
 * The tested scope's outputs: the fields of the result struct carried by its
 * `scope_call` trace element, keyed by output (field) name. These are the
 * resolved output values, avoiding the duplicate scope-variable occurrences
 * that default logic produces elsewhere in the trace.
 */
export function scopeCallOutputs(
  trace: TraceElement[],
  scopeName: string
): Map<string, TraceValue> {
  const out = new Map<string, TraceValue>();
  const visit = (elements: TraceElement[]): boolean => {
    for (const el of elements) {
      if (
        el.element.kind === 'scope_call' &&
        el.element.name === scopeName &&
        el.value?.kind === 'struct'
      ) {
        for (const [name, value] of el.value.fields) {
          out.set(name, value);
        }
        return true;
      }
      if (Array.isArray(el.trace) && visit(el.trace)) {
        return true;
      }
    }
    return false;
  };
  visit(trace);
  return out;
}

function readTraceTestVariables(x: JsonValue): Map<string, TraceValue> {
  const map = new Map<string, TraceValue>();
  if (x !== null && typeof x === 'object' && !Array.isArray(x)) {
    const o = x as Record<string, JsonValue>;
    for (const name of Object.keys(o)) {
      const tv = traceValueFromRuntime(readRuntimeValue(o[name]).value);
      if (tv !== undefined) {
        map.set(name, tv);
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
