export type UpdateMode = 'auto' | 'manual';

export interface EditorState {
  code: string;
  mermaidConfig: string;
  updateMode: UpdateMode;
  panZoom: boolean;
  rough: boolean;
  renderCount: number;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  state: EditorState;
}

export interface SanitizedConfig {
  config: Record<string, unknown>;
  removedPaths: string[];
}

export interface RenderResult {
  svg: string;
  diagramType: string;
}

