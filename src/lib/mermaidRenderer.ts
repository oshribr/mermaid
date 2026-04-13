import elkLayouts from '@mermaid-js/layout-elk';
import mermaid from 'mermaid';
import type { RenderResult } from '../types';

mermaid.registerLayoutLoaders([...elkLayouts]);

const normalizeConfig = (input: Record<string, unknown>): Record<string, unknown> => {
  const output: Record<string, unknown> = {
    ...input
  };

  const layout = typeof output.layout === 'string' ? output.layout : undefined;
  const theme = typeof output.theme === 'string' ? output.theme : undefined;
  const flowchart = output.flowchart;
  const flowchartConfig =
    typeof flowchart === 'object' && flowchart !== null
      ? { ...(flowchart as Record<string, unknown>) }
      : {};

  // Compatibility with frontmatter examples that use `layout: elk`.
  // Mermaid can consume this directly in recent versions, but mapping to
  // `flowchart.defaultRenderer` keeps behavior consistent across versions.
  if (layout && flowchartConfig.defaultRenderer === undefined) {
    flowchartConfig.defaultRenderer = layout;
  }

  // Mermaid Chart commonly uses `theme: neo` in frontmatter.
  // Mirror that visual style when supported via `look`.
  if (theme === 'neo' && output.look === undefined) {
    output.look = 'neo';
  }

  if (Object.keys(flowchartConfig).length > 0) {
    output.flowchart = flowchartConfig;
  }

  return output;
};

const getDiagramType = (code: string): string => {
  const firstLine = code
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return 'unknown';
  }

  const firstToken = firstLine.split(/[\s{]/)[0];
  return firstToken || 'unknown';
};

export const renderMermaid = async (
  code: string,
  config: Record<string, unknown>
): Promise<RenderResult> => {
  const normalizedConfig = normalizeConfig(config);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    ...normalizedConfig
  });

  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
  // Mermaid injects CSS rules targeting `#<id> ...`; ensure ID starts with a letter
  // so selectors always parse and theme styles are applied.
  const id = `graph-${suffix}`;
  const { svg } = await mermaid.render(id, code);
  return {
    diagramType: getDiagramType(code),
    svg
  };
};
