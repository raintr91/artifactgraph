---
name: platform-mark
extractBundle: platform-mark
description: /platform-mark — tags/lexicon for MCP suggest; product registries stay on code repos.
disable-model-invocation: true
---

# /platform-mark (MCP context)

Trong **artifactgraph**: tags/lexicon phục vụ MCP `suggest_tags`, `analyze`, `draftTags` — **không** bulk-edit `registries/*.json` tại đây (SSOT = product git).

**Lexicon paths:** `vocabularies` trong product `artifactgraph.json` → `@base-docs/.../registry-tags.en.txt` (FE+BE) · `@base-tests/.../testcase-taxonomy.en.txt` (plans)

**MCP lanes:** `artifactgraph_suggest_tags` → `fe` | `docs` | `be` | `plans`

**Policy hub (đọc khi cần):** `@base-docs/platform/toolchain/PLATFORM-MARK.md`

## MCP workflow

1. `artifactgraph_rebuild` sau khi product registries đổi
2. `analyze` / `gaps` trên spec hoặc bullets — local trước cloud
3. Member confirm grill → promote **trên product repo** → `remember`

## Do not (tại MCP repo)

- Sửa `registries/design.registry.json` trên artifactgraph checkout
- Auto-tag không hỏi member
- Thay thế `/spec` hoặc portal `portal:registry` workflow

Chi tiết mark trên code repo: mở portal workspace + skill `platform-mark` bản FE/BE.
