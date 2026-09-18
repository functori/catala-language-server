import { createContext } from 'react';
import type { Expected, TraceElement } from './traceUtils';

/** Expand/collapse request broadcast to a whole tree. */
export type ExpandCommand = { open: boolean; nonce: number };

/** Workspace directory the trace locations are relative to. */
export const CwdContext = createContext<string>('');

/** Expected values for the scope under test, or `null` when not testing. */
export const ExpectedContext = createContext<Expected | null>(null);

/** Occurrence index of repeated steps, used to build variable paths. */
export const IndexContext = createContext<Map<TraceElement, number>>(new Map());

/** Forced expansion state, or `null` when nodes decide for themselves. */
export const ExpandContext = createContext<boolean | null>(null);
