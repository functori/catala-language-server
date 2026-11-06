import { createContext } from 'react';
import type { FilterKind } from '../FilterPin';
import type { Expected, TraceElement } from './traceUtils';

/** Expand/collapse request broadcast to a whole tree. */
export type ExpandCommand = { open: boolean; nonce: number };

/** Workspace directory the trace locations are relative to. */
export const CwdContext = createContext<string>('');

/** Expected values for the scope under test, or `null` when not testing. */
export const ExpectedContext = createContext<Expected | null>(null);

/** Occurrence index of repeated steps, used to build variable paths. */
export const IndexContext = createContext<Map<TraceElement, number>>(new Map());

/** Last expand/collapse request, or `null` when nodes decide for themselves.
 *  The nonce makes a repeated click count after filters reset the nodes. */
export const ExpandContext = createContext<ExpandCommand | null>(null);

/** How the include pins of the enclosing panel combine. */
export const FilterKindContext = createContext<FilterKind>('and');
