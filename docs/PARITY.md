# Parity + context-orphan (legacy)

## Field / rule / label drift → `parity-drift` (CONFIRM A/B/C)

create≠edit validate, labels, empty policies, FE≠BE — member must pick canon.

## Data-scope mismatch → `context-orphan` (WARN ONLY)

Screen **displays** `screenData`. Action **uses** `usesData`. If `usesData` ⊄ `screenData` → **warn**.  
No A/B/C, no remember required, no handoff gate.

```bash
artifactgraph parity --project portal --findings examples/parity/sample-findings.yaml
```

MCP: `artifactgraph_parity_check`
