import type { EditorState, HistoryEntry } from '../types';

const STATE_KEY = 'mermaid-editor:last-state';
const HISTORY_KEY = 'mermaid-editor:history';
const MAX_HISTORY = 20;

const safeParse = <T>(value: string | null): T | null => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const saveState = (state: EditorState): void => {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
};

export const loadState = (): EditorState | null => {
  return safeParse<EditorState>(localStorage.getItem(STATE_KEY));
};

export const loadHistory = (): HistoryEntry[] => {
  const entries = safeParse<HistoryEntry[]>(localStorage.getItem(HISTORY_KEY));
  if (!entries || !Array.isArray(entries)) {
    return [];
  }
  return entries;
};

export const saveHistory = (entries: HistoryEntry[]): void => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
};

const isEquivalentState = (a: EditorState, b: EditorState): boolean => {
  return (
    a.code === b.code &&
    a.mermaidConfig === b.mermaidConfig &&
    a.updateMode === b.updateMode &&
    a.panZoom === b.panZoom &&
    a.rough === b.rough
  );
};

export const pushHistoryEntry = (
  entries: HistoryEntry[],
  state: EditorState
): HistoryEntry[] => {
  const latest = entries[0];
  if (latest && isEquivalentState(latest.state, state)) {
    return entries;
  }

  const next: HistoryEntry = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    state,
    timestamp: new Date().toISOString()
  };

  return [next, ...entries].slice(0, MAX_HISTORY);
};

