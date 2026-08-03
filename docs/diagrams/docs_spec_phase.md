# Sequence Diagram: Docskit Spec Phase (`/api-spec`, `/api-integration-spec`, `/spec`, `/legacy-spec`)

```mermaid
sequenceDiagram
    autonumber
    actor Member as Member / AI Agent
    participant Docskit as Docskit Skill (/api-spec)
    participant AG_MCP as ArtifactGraph MCP
    participant SQLite as IndexStore (SQLite index.db)
    participant FS as Product Repo Filesystem

    Note over Member, FS: Phase 1: API Reuse Pre-flight Check
    Docskit->>AG_MCP: artifactgraph_api_reuse_check({ path: "/api/v1/users", method: "GET" })
    AG_MCP->>SQLite: Query api_route table (or fallback direct YAML scan)
    
    alt Route Already Exists in Another Surface (found: true)
        SQLite-->>AG_MCP: Return matches[] (sourceFile, surface)
        AG_MCP-->>Docskit: Return found: true, draftTags: ["#reuse-api"]
        Docskit->>FS: Apply #reuse-api to current ir/spec.yaml
        Note over Docskit: Skip creating new API contract spec; link to existing
    else Route Is Unique (found: false)
        SQLite-->>AG_MCP: Return matches: []
        AG_MCP-->>Docskit: Return found: false
        Docskit->>AG_MCP: artifactgraph_suggest_tags({ lane: "be", bullets: "user detail endpoint" })
        AG_MCP->>SQLite: Query lexicon tags & keyword hints
        SQLite-->>AG_MCP: Return draftTags: ["#api: rest", "#needs-dto"]
        AG_MCP-->>Docskit: Return suggested tags
        Docskit->>FS: Create new spec file (01-backend-spec.yaml / ir/spec.yaml)
    end

    Note over Member, FS: Phase 2: Spec Split / Render Commands (if allowlisted)
    Docskit->>AG_MCP: artifactgraph_allowlist_check("specSplit")
    AG_MCP->>FS: Check artifactgraph.json commands.specSplit
    FS-->>AG_MCP: Allowed command found
    AG_MCP-->>Docskit: Return status: ok
    Docskit->>AG_MCP: artifactgraph_recommend_command("specSplit", { spec: "ir/spec.yaml" })
    AG_MCP-->>Docskit: Return command string
    Docskit->>FS: Run script in product repo (e.g. pnpm run spec:split)
```
