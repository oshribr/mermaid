import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { deserializeState, serializeState } from './lib/serde';
import { copyPngToClipboard, downloadPng, downloadSvg, type PngSizeMode } from './lib/exporters';
import { extractFrontmatter, mergeConfigs } from './lib/frontmatter';
import { loadHistory, loadState, pushHistoryEntry, saveHistory, saveState } from './lib/storage';
import { renderMermaid } from './lib/mermaidRenderer';
import { sanitizeConfig } from './lib/sanitizeConfig';
import { templates } from './lib/templates';
import type { EditorState, HistoryEntry, UpdateMode } from './types';

const DEFAULT_CODE = `flowchart TD
  A[Start] --> B{Valid input?}
  B -->|Yes| C[Render Diagram]
  B -->|No| D[Show Error]
  C --> E[Share URL]
  E --> F[Export PNG/SVG]`;

const DEFAULT_CONFIG = JSON.stringify(
  {
    theme: 'default',
    securityLevel: 'strict'
  },
  null,
  2
);

const DEFAULT_STATE: EditorState = {
  code: DEFAULT_CODE,
  mermaidConfig: DEFAULT_CONFIG,
  updateMode: 'auto',
  panZoom: true,
  renderCount: 0,
  rough: false
};

const getLineFromError = (message: string): number | null => {
  const match = message.match(/line\s+(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
};

const normalizeState = (state: Partial<EditorState>): EditorState => {
  return {
    code: state.code ?? DEFAULT_STATE.code,
    mermaidConfig: state.mermaidConfig ?? DEFAULT_STATE.mermaidConfig,
    panZoom: state.panZoom ?? DEFAULT_STATE.panZoom,
    renderCount: 0,
    rough: state.rough ?? DEFAULT_STATE.rough,
    updateMode: state.updateMode === 'manual' ? 'manual' : 'auto'
  };
};

const sanitizeConfigText = (
  configText: string,
  showConfirm: boolean
): { configText: string; warning: string } => {
  try {
    const parsed = JSON.parse(configText) as unknown;
    const sanitized = sanitizeConfig(parsed);
    if (sanitized.removedPaths.length === 0) {
      return { configText, warning: '' };
    }

    const cleaned = JSON.stringify(sanitized.config, null, 2);
    const warning = `Removed unsafe config paths: ${sanitized.removedPaths.join(', ')}`;
    if (!showConfirm) {
      return { configText: cleaned, warning };
    }

    const shouldRemove = window.confirm(
      `Potentially unsafe Mermaid config was found:\n\n${sanitized.removedPaths.join('\n')}\n\nClick OK to remove it for safety.`
    );
    return shouldRemove ? { configText: cleaned, warning } : { configText, warning: '' };
  } catch {
    return { configText, warning: '' };
  }
};

const decodeInitialState = (): { state: EditorState; warning: string } => {
  const payload = window.location.hash.replace(/^#/, '');
  let sourcePayload = payload;

  // Compatibility with legacy URLs like /#/edit/<encoded>
  if (payload.startsWith('/')) {
    const parts = payload.split('/').filter(Boolean);
    if (parts.length >= 2 && (parts[0] === 'edit' || parts[0] === 'view')) {
      sourcePayload = parts[1];
    }
  }

  if (sourcePayload) {
    try {
      const decoded = normalizeState(deserializeState(sourcePayload));
      const sanitization = sanitizeConfigText(decoded.mermaidConfig, true);
      return {
        state: {
          ...decoded,
          mermaidConfig: sanitization.configText
        },
        warning: sanitization.warning
      };
    } catch {
      return {
        state: DEFAULT_STATE,
        warning: 'Could not parse URL state. Loaded default diagram.'
      };
    }
  }

  const local = loadState();
  if (local) {
    const normalized = normalizeState(local);
    return {
      state: normalized,
      warning: ''
    };
  }

  return {
    state: DEFAULT_STATE,
    warning: ''
  };
};

const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const buttonClass = (active = false): string => {
  return active ? 'btn btn-active' : 'btn';
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 6;
const BUTTON_ZOOM_FACTOR = 1.05;

const normalizeZoom = (value: number): number => {
  return clamp(Math.round(value * 1000) / 1000, MIN_ZOOM, MAX_ZOOM);
};

const parseLength = (value: string | null): number => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};

function App() {
  const [code, setCode] = useState(DEFAULT_STATE.code);
  const [mermaidConfig, setMermaidConfig] = useState(DEFAULT_STATE.mermaidConfig);
  const [updateMode, setUpdateMode] = useState<UpdateMode>(DEFAULT_STATE.updateMode);
  const [rough, setRough] = useState(DEFAULT_STATE.rough);
  const [panZoom, setPanZoom] = useState(DEFAULT_STATE.panZoom);
  const [activeTab, setActiveTab] = useState<'code' | 'config'>('code');
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const [isMobile, setIsMobile] = useState(false);
  const [splitPercent, setSplitPercent] = useState(46);
  const [isDragging, setIsDragging] = useState(false);
  const [renderTick, setRenderTick] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [renderedSvg, setRenderedSvg] = useState('');
  const [renderError, setRenderError] = useState('');
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const [configWarnings, setConfigWarnings] = useState<string[]>([]);
  const [diagramType, setDiagramType] = useState('unknown');
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pngSizeMode, setPngSizeMode] = useState<PngSizeMode>('auto');
  const [pngSize, setPngSize] = useState(1200);
  const [status, setStatus] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [diagramDimensions, setDiagramDimensions] = useState<{ width: number; height: number } | null>(null);

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const previewShellRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLDivElement | null>(null);

  const shareState = useMemo<EditorState>(() => {
    return {
      code,
      mermaidConfig,
      panZoom,
      renderCount: 0,
      rough,
      updateMode
    };
  }, [code, mermaidConfig, panZoom, rough, updateMode]);

  const serializedState = useMemo(() => serializeState(shareState, 'pako'), [shareState]);
  const shareUrl = `${window.location.origin}${window.location.pathname}#${serializedState}`;
  const rendererUrl = import.meta.env.VITE_RENDERER_URL as string | undefined;
  const markdownSnippet = rendererUrl
    ? `[![](${rendererUrl}/img/${serializedState}?type=png)](${shareUrl})`
    : '';

  useEffect(() => {
    const initial = decodeInitialState();
    setCode(initial.state.code);
    setMermaidConfig(initial.state.mermaidConfig);
    setUpdateMode(initial.state.updateMode);
    setRough(initial.state.rough);
    setPanZoom(initial.state.panZoom);
    setHistoryEntries(loadHistory());
    if (initial.warning) {
      setStatus(initial.warning);
    }
    setInitialized(true);
    setRenderTick(1);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!isDragging || isMobile) {
      return;
    }

    const onMove = (event: PointerEvent) => {
      const container = workspaceRef.current;
      if (!container) {
        return;
      }
      const bounds = container.getBoundingClientRect();
      const offset = event.clientX - bounds.left;
      const next = (offset / bounds.width) * 100;
      setSplitPercent(Math.max(25, Math.min(75, next)));
    };

    const onUp = () => setIsDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isDragging, isMobile]);

  useEffect(() => {
    if (!initialized) {
      return;
    }
    const timer = window.setTimeout(() => {
      saveState(shareState);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [initialized, shareState]);

  useEffect(() => {
    if (!initialized) {
      return;
    }
    const timer = window.setTimeout(() => {
      setHistoryEntries((existing) => {
        const next = pushHistoryEntry(existing, shareState);
        if (next !== existing) {
          saveHistory(next);
        }
        return next;
      });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [initialized, shareState]);

  useEffect(() => {
    if (!initialized) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.history.replaceState(undefined, '', `#${serializedState}`);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [initialized, serializedState]);

  useEffect(() => {
    if (!initialized || updateMode === 'manual') {
      return;
    }
    const timer = window.setTimeout(() => {
      setRenderTick((value) => value + 1);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [initialized, updateMode, code, mermaidConfig, rough]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'enter') {
        event.preventDefault();
        setRenderTick((value) => value + 1);
      }
      if ((event.ctrlKey || event.metaKey) && key === 'n') {
        event.preventDefault();
        const confirmed = window.confirm('Create a new diagram and clear current content?');
        if (!confirmed) {
          return;
        }
        setCode(DEFAULT_STATE.code);
        setMermaidConfig(DEFAULT_STATE.mermaidConfig);
        setUpdateMode('auto');
        setRough(false);
        setPanZoom(true);
        setZoom(1);
        setRenderTick((value) => value + 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [initialized]);

  useEffect(() => {
    if (!initialized || renderTick === 0) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      setIsRendering(true);
      setRenderError('');
      setErrorLine(null);
      setConfigWarnings([]);

      let parsedConfig: Record<string, unknown>;
      try {
        parsedConfig = JSON.parse(mermaidConfig) as Record<string, unknown>;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Config JSON is invalid and cannot be parsed.';
        if (!cancelled) {
          setRenderError(`Config error: ${message}`);
        }
        setIsRendering(false);
        return;
      }

      const extracted = extractFrontmatter(code);
      if (extracted.error) {
        if (!cancelled) {
          setRenderError(`Frontmatter error: ${extracted.error}`);
          setIsRendering(false);
        }
        return;
      }

      const sanitizedGlobal = sanitizeConfig(parsedConfig);
      const sanitizedInline = sanitizeConfig(extracted.config);
      const warningPaths = [
        ...sanitizedGlobal.removedPaths,
        ...sanitizedInline.removedPaths.map((path) => `frontmatter.${path}`)
      ];
      if (!cancelled && warningPaths.length > 0) {
        setConfigWarnings(warningPaths);
      }

      const effectiveConfig = mergeConfigs(sanitizedGlobal.config, sanitizedInline.config);
      if (rough) {
        effectiveConfig.look = 'handDrawn';
      }

      try {
        const output = await renderMermaid(extracted.code, effectiveConfig);
        if (!cancelled) {
          setRenderedSvg(output.svg);
          setDiagramType(output.diagramType);
          setIsRendering(false);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unexpected render error. Please check syntax.';
        if (!cancelled) {
          setRenderError(message);
          setErrorLine(getLineFromError(message));
          setIsRendering(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [initialized, renderTick, code, mermaidConfig, rough]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const svg = canvas?.querySelector('svg');
    if (!svg) {
      setDiagramDimensions(null);
      return;
    }

    const viewBox = svg.viewBox?.baseVal;
    const viewBoxWidth = viewBox && Number.isFinite(viewBox.width) ? viewBox.width : 0;
    const viewBoxHeight = viewBox && Number.isFinite(viewBox.height) ? viewBox.height : 0;
    const attrWidth = parseLength(svg.getAttribute('width'));
    const attrHeight = parseLength(svg.getAttribute('height'));
    const rect = svg.getBoundingClientRect();

    const width = viewBoxWidth || attrWidth || rect.width;
    const height = viewBoxHeight || attrHeight || rect.height;
    if (width > 0 && height > 0) {
      setDiagramDimensions({ width, height });
    } else {
      setDiagramDimensions(null);
    }
  }, [renderedSvg]);

  useEffect(() => {
    setZoom(1);
    previewShellRef.current?.scrollTo({ left: 0, top: 0, behavior: 'auto' });
  }, [panZoom, renderedSvg]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const svg = canvas?.querySelector('svg');
    if (!svg) {
      return;
    }

    const edgePaths = Array.from(
      svg.querySelectorAll<SVGPathElement>(
        'g.edgePath path.path, g.edgePath path, path.flowchart-link, path.edge-thickness-normal'
      )
    );
    if (edgePaths.length === 0) {
      return;
    }

    const uniquePaths = Array.from(new Set(edgePaths));
    uniquePaths.forEach((path) => path.classList.add('edge-target'));

    let hoveredPath: SVGPathElement | null = null;
    let pressedPath: SVGPathElement | null = null;

    const clearHoveredPath = () => {
      if (!hoveredPath) {
        return;
      }
      hoveredPath.classList.remove('edge-hovered');
      hoveredPath = null;
    };

    const setHoveredPath = (next: SVGPathElement | null) => {
      if (hoveredPath === next) {
        return;
      }
      clearHoveredPath();
      hoveredPath = next;
      if (hoveredPath) {
        hoveredPath.classList.add('edge-hovered');
      }
    };

    const clearPressedPath = () => {
      if (!pressedPath) {
        return;
      }
      pressedPath.classList.remove('edge-pressed');
      pressedPath = null;
    };

    const setPressedPath = (next: SVGPathElement | null) => {
      if (pressedPath === next) {
        return;
      }
      clearPressedPath();
      pressedPath = next;
      if (pressedPath) {
        pressedPath.classList.add('edge-pressed');
      }
    };

    const findEdgePathTarget = (event: PointerEvent): SVGPathElement | null => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return null;
      }
      const path = target.closest<SVGPathElement>('path.edge-target');
      return path ?? null;
    };

    const onPointerMove = (event: PointerEvent) => {
      setHoveredPath(findEdgePathTarget(event));
    };

    const onPointerDown = (event: PointerEvent) => {
      setPressedPath(findEdgePathTarget(event));
    };

    const onPointerLeave = () => {
      clearHoveredPath();
    };

    const onPointerCancel = () => {
      clearPressedPath();
      clearHoveredPath();
    };

    const onWindowPointerUp = () => {
      clearPressedPath();
    };

    window.addEventListener('pointerup', onWindowPointerUp);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointerleave', onPointerLeave);
    svg.addEventListener('pointercancel', onPointerCancel);

    return () => {
      window.removeEventListener('pointerup', onWindowPointerUp);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointerleave', onPointerLeave);
      svg.removeEventListener('pointercancel', onPointerCancel);
      clearPressedPath();
      clearHoveredPath();
      uniquePaths.forEach((path) => path.classList.remove('edge-target'));
    };
  }, [renderedSvg]);

  useEffect(() => {
    const shell = previewShellRef.current;
    if (!shell || !panZoom) {
      return;
    }

    const zoomAtClientPoint = (nextZoom: number, clientX: number, clientY: number) => {
      const rect = shell.getBoundingClientRect();
      const viewportX = clientX - rect.left;
      const viewportY = clientY - rect.top;
      const anchorX = shell.scrollLeft + viewportX;
      const anchorY = shell.scrollTop + viewportY;
      setZoom((prev) => {
        const safePrev = prev > 0 ? prev : 1;
        const safeNext = normalizeZoom(nextZoom);
        const ratio = safeNext / safePrev;
        window.requestAnimationFrame(() => {
          const current = previewShellRef.current;
          if (!current) {
            return;
          }
          current.scrollLeft = anchorX * ratio - viewportX;
          current.scrollTop = anchorY * ratio - viewportY;
        });
        return safeNext;
      });
    };

    const onWheel = (event: WheelEvent) => {
      // Trackpad pinch surfaces as wheel+ctrlKey in Chromium and several WebViews.
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      setZoom((prev) => {
        const next = normalizeZoom(prev * Math.exp(-event.deltaY * 0.002));
        const rect = shell.getBoundingClientRect();
        const viewportX = event.clientX - rect.left;
        const viewportY = event.clientY - rect.top;
        const anchorX = shell.scrollLeft + viewportX;
        const anchorY = shell.scrollTop + viewportY;
        const ratio = next / (prev > 0 ? prev : 1);
        window.requestAnimationFrame(() => {
          const current = previewShellRef.current;
          if (!current) {
            return;
          }
          current.scrollLeft = anchorX * ratio - viewportX;
          current.scrollTop = anchorY * ratio - viewportY;
        });
        return next;
      });
    };

    // Safari pinch-zoom events.
    let gestureStartZoom = zoom;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      gestureStartZoom = zoom;
    };

    const onGestureChange = (event: Event) => {
      const gesture = event as Event & { scale?: number; clientX?: number; clientY?: number };
      event.preventDefault();
      const scale = Number.isFinite(gesture.scale) ? (gesture.scale as number) : 1;
      const rect = shell.getBoundingClientRect();
      const clientX =
        typeof gesture.clientX === 'number' ? gesture.clientX : rect.left + rect.width / 2;
      const clientY =
        typeof gesture.clientY === 'number' ? gesture.clientY : rect.top + rect.height / 2;
      zoomAtClientPoint(gestureStartZoom * scale, clientX, clientY);
    };

    shell.addEventListener('wheel', onWheel, { passive: false });
    shell.addEventListener('gesturestart', onGestureStart, { passive: false } as AddEventListenerOptions);
    shell.addEventListener('gesturechange', onGestureChange, { passive: false } as AddEventListenerOptions);

    return () => {
      shell.removeEventListener('wheel', onWheel);
      shell.removeEventListener('gesturestart', onGestureStart);
      shell.removeEventListener('gesturechange', onGestureChange);
    };
  }, [panZoom, zoom]);

  useEffect(() => {
    if (!status) {
      return;
    }
    const timer = window.setTimeout(() => {
      setStatus('');
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [status]);

  const applyTemplate = (templateIndex: number) => {
    const template = templates[templateIndex];
    const hasChanges = code.trim() !== DEFAULT_STATE.code.trim() || mermaidConfig !== DEFAULT_CONFIG;
    if (hasChanges) {
      const confirmed = window.confirm('Replace current content with this template?');
      if (!confirmed) {
        return;
      }
    }
    setCode(template.code);
    setActiveTab('code');
    setTemplatesOpen(false);
    setStatus(`Template loaded: ${template.name}`);
    setRenderTick((value) => value + 1);
  };

  const createNewDiagram = () => {
    const confirmed = window.confirm('Create a new diagram and clear current content?');
    if (!confirmed) {
      return;
    }
    setCode(DEFAULT_STATE.code);
    setMermaidConfig(DEFAULT_STATE.mermaidConfig);
    setUpdateMode('auto');
    setRough(false);
    setPanZoom(true);
    setZoom(1);
    setRenderTick((value) => value + 1);
    setStatus('Created a new diagram.');
  };

  const restoreHistoryEntry = (entry: HistoryEntry) => {
    setCode(entry.state.code);
    setMermaidConfig(entry.state.mermaidConfig);
    setUpdateMode(entry.state.updateMode);
    setPanZoom(entry.state.panZoom);
    setRough(entry.state.rough);
    setHistoryOpen(false);
    setRenderTick((value) => value + 1);
    setStatus(`Restored snapshot from ${formatTime(entry.timestamp)}.`);
  };

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copied to clipboard.`);
    } catch {
      setStatus(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  const onDownloadSvg = () => {
    if (!renderedSvg) {
      setStatus('No rendered SVG available yet.');
      return;
    }
    downloadSvg(renderedSvg);
    setStatus('SVG download started.');
  };

  const onDownloadPng = async () => {
    if (!renderedSvg) {
      setStatus('No rendered SVG available yet.');
      return;
    }
    try {
      await downloadPng(renderedSvg, pngSizeMode, pngSize, '#ffffff');
      setStatus('PNG download started.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PNG export failed.';
      setStatus(message);
    }
  };

  const onCopyImage = async () => {
    if (!renderedSvg) {
      setStatus('No rendered SVG available yet.');
      return;
    }
    try {
      await copyPngToClipboard(renderedSvg, pngSizeMode, pngSize, '#ffffff');
      setStatus('Copied image to clipboard.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not copy image.';
      setStatus(message);
    }
  };

  const zoomOut = () => {
    if (!panZoom) {
      return;
    }
    setZoom((value) => normalizeZoom(value / BUTTON_ZOOM_FACTOR));
  };

  const zoomIn = () => {
    if (!panZoom) {
      return;
    }
    setZoom((value) => normalizeZoom(value * BUTTON_ZOOM_FACTOR));
  };

  const resetZoom = () => {
    setZoom(1);
    previewShellRef.current?.scrollTo({ left: 0, top: 0, behavior: 'auto' });
  };

  const effectiveZoom = panZoom ? zoom : 1;
  const previewCanvasStyle = useMemo(() => {
    if (!panZoom || !diagramDimensions) {
      return undefined;
    }
    const width = Math.max(1, Math.ceil(diagramDimensions.width * effectiveZoom) + 32);
    const height = Math.max(1, Math.ceil(diagramDimensions.height * effectiveZoom) + 32);
    return {
      width: `${width}px`,
      minWidth: `${width}px`,
      height: `${height}px`,
      minHeight: `${height}px`
    };
  }, [panZoom, diagramDimensions, effectiveZoom]);

  const previewInnerStyle = useMemo(() => {
    if (!panZoom) {
      return undefined;
    }
    return {
      transform: `scale(${effectiveZoom})`
    };
  }, [panZoom, effectiveZoom]);

  const editorPane = (
    <section className="pane pane-editor">
      <div className="pane-header">
        <div className="segmented">
          <button className={buttonClass(activeTab === 'code')} onClick={() => setActiveTab('code')}>
            Code
          </button>
          <button
            className={buttonClass(activeTab === 'config')}
            onClick={() => setActiveTab('config')}>
            Config
          </button>
        </div>
        <span className="hint">Ctrl/Cmd + Enter to render</span>
      </div>
      <div className="editor-shell">
        {activeTab === 'code' ? (
          <CodeMirror
            value={code}
            height="100%"
            extensions={[markdown()]}
            onChange={(value) => setCode(value)}
            basicSetup={{
              lineNumbers: true
            }}
          />
        ) : (
          <CodeMirror
            value={mermaidConfig}
            height="100%"
            extensions={[json()]}
            onChange={(value) => setMermaidConfig(value)}
            basicSetup={{
              lineNumbers: true
            }}
          />
        )}
      </div>
    </section>
  );

  const previewPane = (
    <section className="pane pane-preview">
      <div className="pane-header">
        <div className="preview-meta">
          <strong>{diagramType}</strong>
          {isRendering ? <span className="chip">Rendering...</span> : null}
          <span className="chip">{updateMode === 'auto' ? 'Auto update' : 'Manual update'}</span>
        </div>
        <div className="preview-actions">
          <label className="small-switch">
            <input
              type="checkbox"
              checked={panZoom}
              onChange={(event) => setPanZoom(event.target.checked)}
            />
            Pan/Zoom
          </label>
          <label className="small-switch">
            <input
              type="checkbox"
              checked={rough}
              onChange={(event) => setRough(event.target.checked)}
            />
            Rough
          </label>
          <button className="btn" onClick={zoomOut} disabled={!panZoom}>
            -
          </button>
          <button className="btn" onClick={resetZoom} disabled={!panZoom}>
            {Math.max(10, Math.round(effectiveZoom * 100))}%
          </button>
          <button className="btn" onClick={zoomIn} disabled={!panZoom}>
            +
          </button>
        </div>
      </div>

      {renderError ? (
        <div className="error-panel">
          <strong>Render error</strong>
          <p>{renderError}</p>
          {errorLine ? <p>Likely line: {errorLine}</p> : null}
        </div>
      ) : null}

      {configWarnings.length > 0 ? (
        <div className="warning-panel">
          <strong>Unsafe config removed:</strong> {configWarnings.join(', ')}
        </div>
      ) : null}

      <div className={`preview-shell${panZoom ? ' panzoom-enabled' : ''}`} ref={previewShellRef}>
        <div
          className={`preview-canvas${panZoom ? ' is-panzoom' : ''}`}
          style={previewCanvasStyle}
          ref={previewCanvasRef}>
          <div className="preview-inner" style={previewInnerStyle} dangerouslySetInnerHTML={{ __html: renderedSvg }} />
        </div>
      </div>

      <div className="preview-footer">
        <div className="png-controls">
          <span>PNG Size</span>
          <select
            value={pngSizeMode}
            onChange={(event) => setPngSizeMode(event.target.value as PngSizeMode)}>
            <option value="auto">Auto</option>
            <option value="width">Width</option>
            <option value="height">Height</option>
          </select>
          <input
            type="number"
            min={100}
            max={8000}
            value={pngSize}
            disabled={pngSizeMode === 'auto'}
            onChange={(event) => setPngSize(Number(event.target.value))}
          />
        </div>
        <div className="footer-actions">
          <button className="btn" onClick={onDownloadPng}>
            Download PNG
          </button>
          <button className="btn" onClick={onDownloadSvg}>
            Download SVG
          </button>
          <button className="btn" onClick={() => void onCopyImage()}>
            Copy Image
          </button>
        </div>
      </div>
    </section>
  );

  return (
    <div className="app-root">
      <header className="app-header">
        <div>
          <h1>Mermaid Editor</h1>
          <p>Live diagramming without AI features</p>
        </div>
        <div className="toolbar">
          <button className={buttonClass(updateMode === 'auto')} onClick={() => setUpdateMode('auto')}>
            Auto
          </button>
          <button
            className={buttonClass(updateMode === 'manual')}
            onClick={() => setUpdateMode('manual')}>
            Manual
          </button>
          <button className="btn btn-accent" onClick={() => setRenderTick((value) => value + 1)}>
            Render
          </button>
          <button className="btn" onClick={() => setTemplatesOpen(true)}>
            Templates
          </button>
          <button className="btn" onClick={() => setShareOpen(true)}>
            Share
          </button>
          <button className="btn" onClick={createNewDiagram}>
            New
          </button>
          <button className="btn" onClick={() => setHistoryOpen((value) => !value)}>
            History
          </button>
        </div>
      </header>

      {isMobile ? (
        <div className="mobile-toggle">
          <button
            className={buttonClass(mobileView === 'edit')}
            onClick={() => setMobileView('edit')}>
            Edit
          </button>
          <button
            className={buttonClass(mobileView === 'preview')}
            onClick={() => setMobileView('preview')}>
            Preview
          </button>
        </div>
      ) : null}

      <main className="app-main">
        <div className="workspace-and-history">
          <div className="workspace" ref={workspaceRef}>
            {isMobile ? (
              mobileView === 'edit' ? (
                editorPane
              ) : (
                previewPane
              )
            ) : (
              <>
                <div className="left-pane" style={{ width: `${splitPercent}%` }}>
                  {editorPane}
                </div>
                <button
                  className="drag-handle"
                  aria-label="Resize panes"
                  onPointerDown={() => setIsDragging(true)}
                />
                <div className="right-pane" style={{ width: `${100 - splitPercent}%` }}>
                  {previewPane}
                </div>
              </>
            )}
          </div>

          {historyOpen ? (
            <aside className="history-pane">
              <div className="history-header">
                <h2>Revision History</h2>
                <p>Local snapshots (latest 20)</p>
              </div>
              <div className="history-list">
                {historyEntries.length === 0 ? (
                  <p className="muted">No snapshots yet.</p>
                ) : (
                  historyEntries.map((entry) => (
                    <button
                      key={entry.id}
                      className="history-entry"
                      onClick={() => restoreHistoryEntry(entry)}>
                      <strong>{formatTime(entry.timestamp)}</strong>
                      <span>{entry.state.code.split('\n')[0]}</span>
                    </button>
                  ))
                )}
              </div>
            </aside>
          ) : null}
        </div>
      </main>

      <footer className="app-footer">
        <span>Privacy: Diagram content stays local by default.</span>
        <span>Security: Unsafe Mermaid config entries are sanitized.</span>
      </footer>

      {templatesOpen ? (
        <div className="modal-backdrop" onClick={() => setTemplatesOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h2>Templates</h2>
            <p>Load a starter diagram.</p>
            <div className="template-grid">
              {templates.map((template, index) => (
                <button key={template.name} className="template-card" onClick={() => applyTemplate(index)}>
                  <strong>{template.name}</strong>
                  <span>{template.description}</span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setTemplatesOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shareOpen ? (
        <div className="modal-backdrop" onClick={() => setShareOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h2>Share Diagram</h2>
            <p>Shareable URL restores code and config state.</p>
            <label className="field">
              Link
              <input type="text" readOnly value={shareUrl} />
            </label>
            <div className="modal-actions">
              <button className="btn" onClick={() => void copyToClipboard(shareUrl, 'Link')}>
                Copy Link
              </button>
            </div>
            {markdownSnippet ? (
              <>
                <label className="field">
                  Markdown Embed
                  <textarea readOnly value={markdownSnippet} rows={3} />
                </label>
                <div className="modal-actions">
                  <button
                    className="btn"
                    onClick={() => void copyToClipboard(markdownSnippet, 'Markdown')}>
                    Copy Markdown
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">
                Markdown embed is disabled. Set <code>VITE_RENDERER_URL</code> to enable it.
              </p>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setShareOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {status ? <div className="status-toast">{status}</div> : null}
    </div>
  );
}

export default App;
