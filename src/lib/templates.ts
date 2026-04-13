export interface DiagramTemplate {
  name: string;
  description: string;
  code: string;
}

export const templates: DiagramTemplate[] = [
  {
    name: 'Flowchart',
    description: 'Decision flow with branches.',
    code: `flowchart TD
  A[Start] --> B{Valid input?}
  B -->|Yes| C[Transform Data]
  B -->|No| D[Show Error]
  C --> E[Persist]
  D --> F[Retry]
  E --> G[Done]
  F --> A`
  },
  {
    name: 'Sequence',
    description: 'Request/response interaction.',
    code: `sequenceDiagram
  participant User
  participant API
  participant DB
  User->>API: Create document
  API->>DB: Insert metadata
  DB-->>API: OK
  API-->>User: Created`
  },
  {
    name: 'Class',
    description: 'Simple class relationship.',
    code: `classDiagram
  class EditorState {
    +string code
    +string mermaidConfig
    +boolean rough
    +boolean panZoom
  }
  class Serializer {
    +serialize()
    +deserialize()
  }
  EditorState --> Serializer : uses`
  },
  {
    name: 'ER',
    description: 'Entity relationship model.',
    code: `erDiagram
  USER ||--o{ DOCUMENT : owns
  DOCUMENT ||--o{ REVISION : contains
  USER {
    string id
    string email
  }
  DOCUMENT {
    string id
    string title
  }
  REVISION {
    string id
    string createdAt
  }`
  },
  {
    name: 'Gantt',
    description: 'MVP timeline.',
    code: `gantt
  title Mermaid Editor MVP
  dateFormat  YYYY-MM-DD
  section Build
  Core editor     :done, a1, 2026-04-01, 5d
  Share + export  :active, a2, 2026-04-08, 4d
  QA + hardening  :a3, 2026-04-13, 3d`
  }
];

