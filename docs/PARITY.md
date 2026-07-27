# Parity + context-orphan (legacy)

## Glossary
- `context-orphan` ≠ `/context` doc layer. `context-orphan` refers to data-scope mismatch.
- parity `surfaces[]` ≠ Surfaces navigation layer. Parity `surfaces[]` refers to client surfaces in code.


## Field / rule / label drift → `parity-drift` (CONFIRM A/B/C)

create≠edit validate, labels, empty policies, FE≠BE — member must pick canon.

## Data-scope mismatch → `context-orphan` (WARN ONLY)

Screen **displays** `screenData`. Action **uses** `usesData`. If `usesData` ⊄ `screenData` → **warn**.  
No A/B/C, no remember required, no handoff gate.

```bash
cd <product-repo>
artifactgraph parity --findings /path/to/sample-findings.yaml
```

MCP: `artifactgraph_parity_check`
