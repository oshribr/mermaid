# Mermaid Editor (Non-AI)

Web-based Mermaid editor inspired by `mermaid.live`, implemented without AI features.

## Features

- Split-pane code + preview workspace
- Mermaid live render (`auto` and `manual` modes)
- Config JSON editor with sanitization of unsafe values
- URL-hash state sharing (`pako` compression, base64 compatibility)
- SVG/PNG export and clipboard image copy
- Local autosave and local revision history (latest 20 snapshots)
- Template gallery for quick starts
- Mobile edit/preview toggle

## Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Optional Environment Variables

- `VITE_RENDERER_URL` - enables Markdown image embed snippet generation in Share modal.

## Notes

- Diagram content is stored locally by default.
- Unsafe Mermaid config keys/values are sanitized before rendering.
- No AI assistant/generation/repair features are included.

