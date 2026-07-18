# Docs-mark — grill detection

> Used by docs grill / FE grill skills. Grill **flags** and **asks member** — does not auto-tag.

## Grill spec signals — logic

| Signal | Suspected kind | Ask member |
|--------|----------------|------------|
| Endpoint mô tả payment/webhook/MES/ERP | `#call-external` | A local B `#call-external` C defer |
| 2 entity độc lập, 1 flow sync | `#cross-entity-service` | A relationship B cross-entity C split APIs |
| Field/response key không có trên `ir/spec.yaml` entities | `#derived-data` | A add to contract B `#derived-data` C remove |
| Tag có nhưng thiếu block (`externalCalls`, `services`, `derivedData`) | validation fail | Fix via `/docs-mark` |
| `commonRefs` trỏ registry `planned` | HANDOFF debt | Implement or defer in `openQuestions` |

## Grill spec signals — UI & codegen

| Signal | Suspected kind | Ask member |
|--------|----------------|------------|
| Column `render: custom` / `component:` set | `#needs-component: cell-{key}:MoXxx` | A) Mo local B) common C) defer |
| Fuzzy widget (drawer vs sheet, chip vs badge) | `#ui:` / `#needs-ui:` | Member chọn canonical |
| `#needs-component` but Mo* exists elsewhere | promote common-ui | A) copy local B) design registry C) defer |
| `#needs-ui` → design registry `planned` | HANDOFF | Implement `/prototype` or defer |

## Member prompt template

```text
[GRILL-MARK] {short finding}
File/spec: {ref}

Chọn:
A) Giữ local — no mark
B) {suggested tag} — update spec + registry
C) Defer — ghi openQuestions, không block gate
```

If member chooses **B** → run `/docs-mark` in the same session.
