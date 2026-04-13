import { fromBase64, fromUint8Array, toBase64, toUint8Array } from 'js-base64';
import { deflate, inflate } from 'pako';
import type { EditorState } from '../types';

type SerdeType = 'base64' | 'pako';

const normalizeState = (value: unknown): EditorState => {
  const source = (value ?? {}) as Partial<EditorState>;
  return {
    code: typeof source.code === 'string' ? source.code : '',
    mermaidConfig: typeof source.mermaidConfig === 'string' ? source.mermaidConfig : '',
    panZoom: source.panZoom ?? true,
    renderCount: typeof source.renderCount === 'number' ? source.renderCount : 0,
    rough: source.rough ?? false,
    updateMode: source.updateMode === 'manual' ? 'manual' : 'auto'
  };
};

export const serializeState = (state: EditorState, serde: SerdeType = 'pako'): string => {
  const json = JSON.stringify(state);
  if (serde === 'pako') {
    const compressed = deflate(new TextEncoder().encode(json), { level: 9 });
    return `pako:${fromUint8Array(compressed, true)}`;
  }
  return `base64:${toBase64(json, true)}`;
};

export const deserializeState = (encoded: string): EditorState => {
  if (!encoded) {
    throw new Error('No encoded state found');
  }

  let type: SerdeType = 'base64';
  let payload = encoded;

  if (encoded.includes(':')) {
    const [candidateType, candidatePayload] = encoded.split(':', 2);
    if (candidateType === 'pako' || candidateType === 'base64') {
      type = candidateType;
      payload = candidatePayload;
    } else {
      throw new Error(`Unknown serialization format: ${candidateType}`);
    }
  }

  const json =
    type === 'pako'
      ? inflate(toUint8Array(payload), { to: 'string' })
      : fromBase64(payload);

  return normalizeState(JSON.parse(json) as unknown);
};

