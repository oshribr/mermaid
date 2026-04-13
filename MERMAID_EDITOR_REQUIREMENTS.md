# Mermaid Editor Requirements (Non-AI)

## 1) Document Purpose

Define product and technical requirements for building a web-based Mermaid editor similar to [mermaid.live](https://mermaid.live), excluding all AI-assisted capabilities.

This document is intended to be used by product, design, and engineering to plan and implement an MVP and subsequent releases.

## 2) Product Vision

Provide a fast, reliable, privacy-respecting Mermaid editor where users can:

- Write Mermaid syntax
- See live rendered output
- Share diagrams by URL
- Export diagrams as SVG/PNG

without relying on AI generation, AI repair, or AI suggestions.

## 3) Goals and Success Metrics

### 3.1 Goals

- Enable diagram creation and editing entirely in the browser.
- Keep sharing simple through self-contained URLs.
- Support common Mermaid diagram types used by developers and technical writers.
- Offer production-grade export quality (SVG and PNG).
- Keep user data local by default.

### 3.2 Success Metrics (MVP)

- Time to first rendered diagram: under 2 seconds on a typical broadband connection.
- Editor-to-preview update latency: under 300 ms for small/medium diagrams (up to ~500 lines).
- Successful export rate (PNG/SVG): at least 99%.
- Link open success rate for shared URLs: at least 99%.
- Crash-free sessions: at least 99.5%.

## 4) Scope

### 4.1 In Scope (MVP)

- Single-page web app with split view: code editor + rendered preview.
- Mermaid code editing with syntax support and line numbers.
- Live rendering and manual re-render toggle.
- Theme/config editing for Mermaid runtime config (JSON).
- URL-based state sharing (compressed payload in hash).
- Export/download as SVG and PNG.
- Copy share link and Markdown embed snippet.
- Local autosave and restore of last session.
- Starter templates/sample diagrams.
- Diagram parse/render error display with useful line-level feedback.
- Basic keyboard shortcuts and responsive mobile layout.

### 4.2 Out of Scope (MVP)

- Any AI capabilities, including:
- Natural-language-to-diagram generation
- AI diagram repair/suggestions
- AI chat assistants
- Cloud user accounts and multi-device sync.
- Collaborative multi-user editing.
- Server-side persistence of user diagrams.
- Enterprise auth/SSO.

## 5) Users and Primary Use Cases

### 5.1 Target Users

- Developers documenting architecture or flows.
- Technical writers preparing docs with embedded diagrams.
- Students and educators creating visual explanations.
- Product/operations users needing lightweight diagrams.

### 5.2 Core Use Cases

- Write Mermaid code and instantly preview output.
- Open a shared URL and continue editing.
- Export a polished diagram for docs/slides.
- Quickly switch themes/styles and compare results.
- Recover prior draft from local autosave.

## 6) Functional Requirements

### 6.1 Editor Workspace

- The app shall display:
- Left pane: code/config editor
- Right pane: rendered diagram preview
- Toolbar: share, export, settings, and reset/new actions
- User can resize panes on desktop.
- On mobile, user can toggle between code and preview modes.

### 6.2 Code Editing

- Support code editing with:
- Line numbers
- Syntax highlighting for Mermaid
- Undo/redo
- Find (MVP optional if available from editor library)
- Keyboard shortcuts:
- Render/update toggle (`Ctrl/Cmd+Enter` recommended)
- New diagram (`Ctrl/Cmd+N` recommended)
- Editor must not block typing while rendering large diagrams; use debounced rendering and/or async scheduling.

### 6.3 Diagram Rendering

- Use Mermaid runtime for rendering in browser.
- Render updates on code change (debounced), with optional “manual update” mode.
- Supported diagram types: all Mermaid types supported by selected Mermaid version, at minimum:
- Flowchart
- Sequence
- Class
- State
- ER
- Gantt
- Pie
- Mindmap
- Show renderer errors in a dedicated panel and map error position to likely source line where possible.

### 6.4 Mermaid Config Editing

- Provide a config editor (JSON) for Mermaid options (theme, security level restrictions, style vars).
- Validate JSON and surface invalid JSON errors clearly.
- Sanitize or block unsafe config values by default (see Security section).
- Allow user to reset config to default.

### 6.5 Shareable URLs

- App state shall be serializable to URL hash for link sharing.
- State must include at least:
- Mermaid code
- Mermaid config JSON
- UI flags required to recreate render behavior (for example: rough mode, pan/zoom if enabled)
- Use compressed encoding (for example `pako`) with backward-compatible decode support for legacy base64 format.
- Opening a valid shared URL must restore state deterministically.
- Invalid/corrupted URL data should fail gracefully and show recovery guidance.

### 6.6 Export and Copy Actions

- Export SVG locally with preserved diagram fidelity.
- Export PNG locally with selectable size mode:
- Auto
- Fixed width
- Fixed height
- Copy Markdown embed snippet for rendered image URL only if external renderer integration is enabled.
- Copy image to clipboard where browser APIs permit.

### 6.7 Local Persistence and History

- Autosave the latest working state in local storage.
- Restore autosaved state on reload if no explicit URL state is provided.
- Keep a small local revision history (MVP target: 20 revisions) with timestamps.
- User can restore a previous revision.

### 6.8 Templates and Starters

- Include a template picker with sample Mermaid snippets for key diagram types.
- Loading a template replaces editor content only after user confirmation when unsaved changes exist.

### 6.9 Privacy and Security UX

- Provide a short in-product privacy/security note explaining:
- Editor content remains in browser by default
- What external calls occur (if renderer endpoints are configured)
- Provide a user-visible warning/confirmation when importing potentially unsafe config options.

## 7) Non-Functional Requirements

### 7.1 Performance

- First meaningful render under 2 seconds on modern laptop + broadband.
- Subsequent renders for medium diagrams under 300 ms median.
- Memory usage should remain stable during prolonged editing sessions (no unbounded growth).

### 7.2 Reliability

- App remains functional offline after first load if service worker/PWA is enabled.
- Corrupt local storage entries must not break app boot.
- Export and share features must fail with clear actionable messages.

### 7.3 Security

- Default Mermaid security settings must favor safe mode.
- Block or sanitize known unsafe config keys/values (prototype pollution and obvious XSS vectors).
- No evaluation of untrusted script content from diagram input.
- Apply strict Content Security Policy appropriate to Mermaid rendering needs.

### 7.4 Privacy

- No diagram content is sent to backend by default.
- If optional external render URLs are configured, user must be informed.
- Analytics (if enabled) must avoid capturing raw diagram content.

### 7.5 Accessibility

- Keyboard navigable primary controls.
- Sufficient color contrast in default themes.
- ARIA labels for toolbar and dialog actions.
- Screen reader readable error messages and dialogs.

### 7.6 Browser Support

- Latest two versions of Chrome, Edge, Firefox, Safari.
- Graceful degradation for clipboard/image APIs where unsupported.

## 8) Integrations and External Services

### 8.1 Required

- Mermaid JavaScript library.

### 8.2 Optional (Feature-Flagged)

- External renderer endpoint for URL-based SVG/PNG generation.
- External diagram service links (must be non-AI for this product version).
- Product analytics endpoint.

### 8.3 Explicitly Forbidden (for this project)

- AI APIs or AI SDK integrations.
- Any ML-based auto-completion, generation, or repair.

## 9) High-Level Technical Architecture

- Frontend SPA (Svelte/React/Vue acceptable) with TypeScript.
- Editor component (CodeMirror or Monaco).
- Mermaid rendering module wrapped in controlled state pipeline.
- State model:
- `inputState` for editable values
- `validatedState` for render-safe values and diagnostics
- Serialization module for URL/hash encode/decode.
- Persistence module for local storage and revision snapshots.
- Export module for SVG/PNG generation from rendered SVG node.

## 10) Data Model (Conceptual)

```ts
type EditorState = {
  code: string;
  mermaidConfig: string; // JSON string
  updateMode: "auto" | "manual";
  panZoom?: boolean;
  rough?: boolean;
  renderCount?: number;
};

type ValidationState = EditorState & {
  serialized: string;
  diagramType?: string;
  errors: Array<{
    message: string;
    line?: number;
    column?: number;
  }>;
};
```

## 11) User Flows and Acceptance Criteria

### 11.1 Create and Render

- Given a new user lands on `/edit`
- When they enter valid Mermaid code
- Then preview updates and displays rendered diagram
- And no full page reload occurs.

### 11.2 Share and Open

- Given user clicks Share and copies link
- When another user opens that link
- Then editor and preview load with equivalent diagram and config state.

### 11.3 Export

- Given a rendered diagram
- When user downloads SVG or PNG
- Then downloaded file opens successfully and matches visible diagram contents.

### 11.4 Error Recovery

- Given invalid Mermaid syntax
- When render occurs
- Then user sees clear error message and editor remains usable.

### 11.5 Local Restore

- Given unsaved work exists in local storage
- When user reloads app without URL state
- Then last local state is restored automatically.

## 12) QA and Testing Requirements

- Unit tests:
- State serialization/deserialization
- Config sanitation
- Error mapping helpers
- Integration/e2e tests:
- App load and autosave restore
- Shared URL roundtrip
- Export PNG/SVG flows
- Mobile toggle behavior
- Regression tests for corrupt URL/local-storage inputs.

## 13) Release Plan

### Phase 1 (MVP)

- Core editor, render, share URL, export, autosave, templates, error handling.

### Phase 2

- Improved revision history UX, advanced theming controls, better diagnostics.

### Phase 3

- Collaboration and account features (still non-AI unless strategy changes).

## 14) Risks and Mitigations

- Rendering performance on very large diagrams.
- Mitigation: debounce, worker/off-main-thread strategies, manual update mode.
- Browser API differences for clipboard/export.
- Mitigation: capability detection and graceful fallbacks.
- Security risks from permissive config.
- Mitigation: strict defaults, sanitize pipeline, explicit confirmations.

## 15) Open Decisions

- Framework choice (`SvelteKit` vs `React` SPA).
- Whether optional external render endpoints are enabled at launch.
- Exact revision-history depth and storage budget.
- PWA/offline support in MVP or Phase 2.

## 16) Definition of Done (MVP)

- All MVP in-scope features implemented.
- Acceptance criteria in Section 11 pass.
- Cross-browser smoke tests pass on supported browsers.
- Security/privacy review completed.
- Documentation exists for local development, build, deployment, and environment flags.

