// For exhaustiveness checks
export function assertUnreachable(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

/** Escapes the characters that would otherwise be regexp syntax. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A piece of text, and whether it is one of the searched terms. */
export type TextChunk = { text: string; match: boolean };
