import type { SanitizedConfig } from '../types';

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'secure']);

const hasDangerousString = (value: string): boolean => {
  const lowered = value.toLowerCase();
  return lowered.includes('<') || lowered.includes('>') || lowered.includes('url(data:');
};

const scrubValue = (value: unknown, path: string[], removedPaths: string[]): unknown => {
  if (typeof value === 'string') {
    if (hasDangerousString(value)) {
      removedPaths.push(path.join('.'));
      return '';
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => scrubValue(item, [...path, String(index)], removedPaths));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = [...path, key];
    if (UNSAFE_KEYS.has(key) || key.startsWith('__')) {
      removedPaths.push(nextPath.join('.'));
      continue;
    }

    if (key === 'securityLevel' && typeof childValue === 'string' && childValue !== 'strict') {
      removedPaths.push(nextPath.join('.'));
      continue;
    }

    const scrubbed = scrubValue(childValue, nextPath, removedPaths);
    output[key] = scrubbed;
  }

  return output;
};

export const sanitizeConfig = (raw: unknown): SanitizedConfig => {
  if (!raw || typeof raw !== 'object') {
    return {
      config: {},
      removedPaths: []
    };
  }

  const removedPaths: string[] = [];
  const config = scrubValue(raw, [], removedPaths) as Record<string, unknown>;

  return {
    config,
    removedPaths
  };
};

