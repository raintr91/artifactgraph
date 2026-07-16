# Platform mark — grill detection (portal)

> Used by `/dev-grill-docs`, `/grill-with-docs`, `/grill-prototype`, code review.  
> Grill **flags** and **asks member** — does not auto-tag.

## Grill spec signals — logic

| Signal | Suspected kind | Ask member |
|--------|----------------|------------|
| Endpoint mô tả payment/webhook/MES/ERP | `#call-external` | A local B `#call-external` C integration-base only |
| 2 entity độc lập, 1 flow sync | `#cross-entity-service` | A relationship B cross-entity C split APIs |
| Field/response key không có trên `ir/spec.yaml` entities | `#derived-data` | A add to contract B `#derived-data` C remove |
| Tag có nhưng thiếu block (`externalCalls`, `services`, `derivedData`) | validation fail | Fix via `/platform-mark` |
| `commonRefs` trỏ registry `planned` | HANDOFF debt | Implement or defer in `openQuestions` |

## Grill spec signals — UI & codegen

| Signal | Suspected kind | Ask member |
|--------|----------------|------------|
| Column `render: custom` / `component:` set | `#needs-component: cell-{key}:MoXxx` | A) Mo local B) common `base-docs/product/common/yaml/...` C) defer |
| Fuzzy widget (drawer vs sheet, chip vs badge) | `#ui:` / `#widget:` / `#needs-ui:` | Member chọn canonical — `lookupAlias()` |
| `#needs-component` but Mo* exists in another feature | promote common-ui | A) copy local B) design registry `implemented` C) defer |
| `#needs-ui` → design registry `planned` | HANDOFF | Implement `/prototype` or defer |
| `overrideCommonPattern: true` without reason | custom shell | A) revert B) keep + notes C) defer |
| `#manual-composable:` in tags | split composable | A) feature-local B) `#common:` C) `#needs-common:` |
| Same toolbar block (export, bulk) as common list spec | reuse common yaml | A) `#shell: DataListPage` only B) add common widget refs |

## Grill code signals

| Signal | Suspected kind | Ask member |
|--------|----------------|------------|
| Same hook/service logic ≥2 features | `#common:*` | A local B global common C defer |
| Same Mo* molecule copy-pasted | promote design registry | A local B common-ui C defer |
| File > ~200 lines, mixed concerns | split + maybe `#common:*` or Mo* | A split only B split + mark |
| Outbound HTTP outside `apiFetch` / services | `#call-external` | A move B mark external |
| Copy-paste auth/session/policy | `#common:auth-*` | A local B promote common |
| portal-gen HANDOFF item still open after `/prototype` | missing Mo* / tag mismatch | Fix prototype or update spec tags |

## Dev-grill — Common candidates table (required output)

Before `pnpm portal:gen:dry`, list in handoff notes (Vietnamese):

| Vị trí | Phát hiện | Gợi ý tag | Member chọn |
|--------|-----------|-----------|-------------|
| `ui.columns[status]` | render custom | `#needs-component: cell-status:MoStatusChip` | A/B/C |
| toolbar export | lặp list khác | `#common:export-csv` | A/B/C |
| filter date range | widget planned | `#needs-ui: DateRangePicker` | A/B/C |

Empty table OK when no candidates.

## Member prompt template

```text
[GRILL-MARK] {short finding}
File/spec: {ref}

Chọn:
A) Giữ local — no mark
B) {suggested tag} — update spec + registry + refactor (if code)
C) Defer — ghi openQuestions, không block gate
```

If member chooses **B** → run `/platform-mark` logic in same session.

## Gate pass criteria

- [ ] Every custom column has `#needs-component` or registry `implemented` Mo*
- [ ] Every `tags:` / `marks[]` has required spec blocks per kind
- [ ] Every `commonRefs[]` id exists in `platform-common.registry.json`
- [ ] `#needs-component` entries appear in portal-gen HANDOFF until Mo* on disk
- [ ] `implemented` entries: `path` (+ `symbol` for logic) exist on disk
- [ ] `planned` entries: listed in HANDOFF or `openQuestions`
- [ ] `pnpm portal:registry` and `pnpm platform-common:registry` exit 0 when marks present
