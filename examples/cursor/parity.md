# Legacy parity + context-orphan

> Fold into **one** archaeology turn — do not wait for grill × N.

## Goal

1. **parityFindings** — create≠edit validate; label/text; `null`/`''`/`[]`/omit; FE≠BE.  
   → **Confirm A/B/C** (ép chọn thống nhất) + `remember kind=parity`. Gate handoff nếu còn error chưa confirm.
2. **contextOrphans** — action `usesData` ⊄ `screenData` (data màn đang show).  
   → **Warn only** — không hỏi A/B/C, không ép thống nhất, không block handoff.

## Protocol

1. Inventory + `cloudPromptSlice` (schema dưới).
2. Cloud returns IR + `parityFindings[]` + `contextOrphans[]`.
3. `artifactgraph_parity_check`:
   - `parity-drift` → `askUser[]` A/B/C → member confirm → `remember`
   - `context-orphan` → chỉ `gaps[]` severity warn (show member); **không** vào `askUser`
4. Gate: chỉ `parity-drift` **error** chưa confirm → chưa handoff grill. Orphan không gate.

## Schema

```yaml
parityFindings:
  - id: password.min
    field: password
    surfaces: [register, change-password]
    observed:
      - { surface: register, rules: { min: 8 } }
      - { surface: change-password, rules: { min: 6 } }
    options:
      - { choice: A, label: "min:8 everywhere" }
      - { choice: B, label: "keep drift + openQuestion" }
      - { choice: C, label: defer }

contextOrphans:
  - id: hotel-list.action-uses-order
    hostSurface: hotel-list
    screenData: [hotel, room, amenity]
    action:
      id: send-or-export
      usesData: [order]
    reason: "usesData not subset of screenData"
    # no options — warn only
```

## MCP

- Tool: `artifactgraph_parity_check`
- Package: `docs/PARITY.md` · sample `examples/parity/sample-findings.yaml`
