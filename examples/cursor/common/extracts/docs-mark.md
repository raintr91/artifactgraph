# Docs-mark — member annotation

> Skill: `/docs-mark` · Registries: `registries/common.registry.json` + `registries/design.registry.json`

## When to use

Member (or agent after grill prompt) marks **spec** and/or **code** — **not** during round-1 `/spec` or bulk `/dev-grill-docs`.

Grill lanes ask first; member confirms → apply mark in same session.

## Mark kinds — logic (`registries/common.registry.json`)

| kind | Tag | Spec block |
|------|-----|------------|
| common | `#common:{id}` | `marks[]` + optional `commonRefs[]` on routes/endpoints |
| needs-common | `#needs-common:{id}` | `marks[]` — registry `status: planned` |
| call-external | `#call-external` | `technicalMarks[]` + `externalCalls[]` |
| cross-entity-service | `#cross-entity-service` | `technicalMarks[]` + `services[]` |
| derived-data | `#derived-data` | `technicalMarks[]` + `derivedData` |

## Mark kinds — UI (`registries/design.registry.json`)

| kind | Tag | Spec / gen |
|------|-----|------------|
| needs-component | `#needs-component: {slot}:MoXxx[:prop]` | `tags:` — Codegenkit HANDOFF until Mo* exists |
| needs-ui | `#needs-ui: {Widget}` | `tags:` — widget `planned` in design registry |
| common-ui | Mo* in design registry `implemented` | promote after `/prototype`; re-run Codegenkit gen |

## Spec block — `marks[]` (`ir/spec.yaml`)

```yaml
marks:
  - id: MK-STATUS-CHIP-001
    kind: needs-component
    tag: "#needs-component: cell-status:MoStatusChip:label"
    registryId: MoStatusChip
    reason: "Cột status render custom"
    source: docs-mark
```

## Registry — common / design

- `status`: `planned` | `implemented`
- Validate via FE Codegenkit / product registry scripts (not docs-hub shell)

## Workflow (each `/docs-mark` session)

1. Resolve scope: feature slug, `ir/spec.yaml`, optional code paths
2. Read `tags:`, `marks[]`, `technicalMarks[]`, both registries
3. Apply member intent — one concern per mark
4. Update spec YAML (`tags:` and/or `marks[]`)
5. Upsert correct registry entry
6. If `planned` → HANDOFF / `openQuestions`
7. Optional: `artifactgraph_remember` after confirm B

## Do not

- Rewrite full contract like `/spec`
- Auto-mark without member confirmation
- Treat `artifactgraph_gen` as required
