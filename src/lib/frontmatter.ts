import { load } from 'js-yaml';

interface FrontmatterResult {
  code: string;
  config: Record<string, unknown>;
  error: string | null;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const deepMerge = (
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> => {
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = output[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      output[key] = deepMerge(current, value);
    } else {
      output[key] = value;
    }
  }
  return output;
};

export const mergeConfigs = (
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> => {
  return deepMerge(base, override);
};

const extractRawFrontmatter = (source: string): { yaml: string; rest: string } | null => {
  const normalized = source.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return null;
  }

  const endMarker = '\n---\n';
  const endIndex = normalized.indexOf(endMarker, 4);
  if (endIndex === -1) {
    return null;
  }

  const yaml = normalized.slice(4, endIndex);
  const rest = normalized.slice(endIndex + endMarker.length);
  return { yaml, rest };
};

export const extractFrontmatter = (source: string): FrontmatterResult => {
  const extracted = extractRawFrontmatter(source);
  if (!extracted) {
    return {
      code: source,
      config: {},
      error: null
    };
  }

  try {
    const parsed = load(extracted.yaml) as unknown;
    if (!isPlainObject(parsed)) {
      return {
        code: extracted.rest,
        config: {},
        error: null
      };
    }

    const config = isPlainObject(parsed.config) ? parsed.config : {};
    return {
      code: extracted.rest,
      config,
      error: null
    };
  } catch (error) {
    return {
      code: extracted.rest,
      config: {},
      error: error instanceof Error ? error.message : 'Frontmatter parsing failed'
    };
  }
};

