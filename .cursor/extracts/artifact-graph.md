# Artifact graph — load per phase

Extract bundles: `.cursor/extracts/extract-registry.json`

Path root: `base-docs Code / `--id``

| Phase | Primary artifacts | Do not load |
|-------|-------------------|-------------|
| legacy-spec | write `base-docs/product/legacy-dynamics/…/_legacy.dynamics.yaml`, Code `*.bundle.yaml` | gen, ir/spec, codegen/* |
| /spec | `*.bundle.yaml` (spec + design), template | legacy/* |
| bqa-grill | `ir/design.yaml`, `ir/legacy.yaml` ui slice, common bundles, `review` | ir/spec gen fields, legacy source |
| dev-grill | `ir/design`, `ir/legacy`, write `gen` / ir/spec | legacy source, models/ |
| grill-with-docs | bundle + ir/* reconcile | legacy source, archaeology |
| portal:gen | **`ir/spec.yaml`** | bundle, legacy, design |
| docs:render | **`*.bundle.yaml`** | — |
| prototype | **`ir/spec.yaml`** + HANDOFF | legacy IR |
| /test | `*.test.yaml`, ir/spec testIds | legacy-api-migration |
| /unit | ir/spec + `{function}/generated/unit.manifest.json` | legacy/* |
| /model | ir/spec entities + project-config | trace full |
| /grill-api | legacy/api-migration | models/ |
| update-spec-legacy | trace slice + bundle.legacy patch | macro legacy read |

Generated output: `{function}/generated/` (HANDOFF, manifests) — cạnh bundle, không trong `ir/`.
