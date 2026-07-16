#!/usr/bin/env python3
"""Sync platform-repos.json across workspace bases + artifactgraph MCP."""
from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parent.parent
SSOT_MAP = PKG_ROOT / "platform-repos.json"

# id -> (dirname, role, stack, skill, description)
CATALOG: dict[str, tuple[str, str, str, str, str]] = {
    "portal": ("portal", "frontend", "nuxt4", "platform-base", "Base Nuxt 4 (FE)"),
    "nextjs": ("nextjs", "frontend", "nextjs", "platform-base", "Base Next.js (FE)"),
    "nuxt-nest": (
        "nuxt_nest",
        "fullstack",
        "nuxt4-nest",
        "platform-base",
        "Base Nuxt 4 + NestJS monorepo",
    ),
    "next-nest": (
        "next_nest",
        "fullstack",
        "nextjs-nest",
        "platform-base",
        "Base Next.js + NestJS monorepo",
    ),
    "fast-api-base": ("fast-api-base", "backend", "fastapi", "platform-base", "Base FastAPI (BE)"),
    "api": ("api", "backend", "laravel", "api-base", "Base Laravel 12 (BE)"),
    "integration": ("integration", "backend", "dotnet-integration", "platform-base", "Base .NET (BE)"),
    "line": (
        "line",
        "client",
        "dotnet-line",
        "platform-base",
        "Base WinForms — override in platform-repos.local.json for D:/workspace/line",
    ),
    "base-docs": (
        "base-docs",
        "docs",
        "docs-c4",
        "platform-ai",
        "Base docs hub (R2) — C4 + product Code/common",
    ),
    "base-tests": (
        "base-tests",
        "tests",
        "e2e-plans",
        "platform-ai",
        "Base tests hub (R3) — E2E yaml/md plans only",
    ),
    "artifactgraph": (
        "artifactgraph",
        "tooling",
        "mcp",
        "platform-ai",
        "Local MCP artifactgraph — gaps/tags/gen allowlist (raintr91/artifactgraph)",
    ),
    "hubdocs": (
        "hubdocs",
        "tooling",
        "mcp-docs",
        "platform-ai",
        "MCP hubdocs — docs index / hub tooling (optional sibling repo)",
    ),
}

PROJECT_EXTRAS: dict[str, dict] = {
    "base-docs": {
        "specRoots": {
            "architecture": "architecture",
            "components": "product/components",
            "common": "product/common/code",
            "shared": "product/shared",
        },
        "docsSite": {
            "dev": "pnpm docs:dev",
            "root": ".",
        },
    },
    "base-tests": {
        "testRoots": {
            "landscape": "landscape",
            "scenarios": "scenarios",
            "cases": "cases",
            "suites": "suites",
        },
    },
}

HARNESS_PROFILE_OVERRIDES: dict[str, str] = {
    "artifactgraph": "tooling",
    "hubdocs": "tooling",
}

PRIMARY_BY_DIR = {
    "portal": "portal",
    "nextjs": "nextjs",
    "nuxt_nest": "nuxt-nest",
    "next_nest": "next-nest",
    "fast-api-base": "fast-api-base",
    "api": "api",
    "integration": "integration",
    "line": "line",
    "base-docs": "base-docs",
    "base-tests": "base-tests",
    "artifactgraph": "portal",
    "hubdocs": "hubdocs",
}

PORTAL_EXTRAS = {
    "nuxt-nest-fe": {
        "root": "../nuxt_nest",
        "role": "frontend",
        "stack": "nuxt4",
        "repo": "nuxt_nest",
        "skill": "platform-base",
        "write": True,
    },
    "nuxt-nest-be": {
        "root": "../nuxt_nest/apps/api",
        "role": "backend",
        "stack": "nestjs",
        "repo": "nuxt_nest",
        "skill": "platform-base",
        "write": True,
    },
    "next-nest-fe": {
        "root": "../next_nest",
        "role": "frontend",
        "stack": "nextjs",
        "repo": "next_nest",
        "skill": "platform-base",
        "write": True,
    },
    "next-nest-be": {
        "root": "../next_nest/server",
        "role": "backend",
        "stack": "nestjs",
        "repo": "next_nest",
        "skill": "platform-base",
        "write": True,
    },
}

MONOREPO_EXTRAS = {
    "nuxt_nest": {
        "nuxt-nest-fe": {
            "root": ".",
            "role": "frontend",
            "stack": "nuxt4",
            "repo": "nuxt_nest",
            "skill": "platform-base",
            "write": True,
        },
        "nuxt-nest-be": {
            "root": "apps/api",
            "role": "backend",
            "stack": "nestjs",
            "repo": "nuxt_nest",
            "skill": "platform-base",
            "write": True,
        },
    },
    "next_nest": {
        "next-nest-fe": {
            "root": ".",
            "role": "frontend",
            "stack": "nextjs",
            "repo": "next_nest",
            "skill": "platform-base",
            "write": True,
        },
        "next-nest-be": {
            "root": "server",
            "role": "backend",
            "stack": "nestjs",
            "repo": "next_nest",
            "skill": "platform-base",
            "write": True,
        },
    },
}


def workspace_root() -> Path:
    doc = json.loads(SSOT_MAP.read_text(encoding="utf-8"))
    return (PKG_ROOT / doc.get("workspaceRoot", "..")).resolve()


def load_ssot() -> dict:
    return json.loads(SSOT_MAP.read_text(encoding="utf-8"))


def base_project_ids(ssot: dict) -> list[str]:
    group = ssot.get("defaultGroup", "platform-bases")
    return list(ssot["groups"][group]["projects"])


def rel_root(from_dir: str, to_dir: str) -> str:
    return "." if from_dir == to_dir else f"../{to_dir}"


def stack_group(name: str, fe: str, be: str, desc: str) -> dict:
    return {
        "description": desc,
        "primary": fe,
        "projects": [fe, be],
        "contract": {
            "frontend": fe,
            "backend": be,
            "sourceOfTruth": "docs-features-ir-spec",
        },
    }


def build_for(repo_dirname: str, *, is_mcp: bool, ssot: dict) -> dict:
    base_ids = base_project_ids(ssot)
    projects: dict = {}
    for pid in base_ids:
        if pid not in CATALOG:
            continue
        dirname, role, stack, skill, desc = CATALOG[pid]
        root = dirname if is_mcp and pid != "artifactgraph" else rel_root(repo_dirname, dirname)
        if is_mcp and pid == "artifactgraph":
            root = "."
        entry: dict = {
            "root": root,
            "role": role,
            "stack": stack,
            "repo": dirname,
            "skill": skill,
            "description": desc,
            "write": True,
        }
        if pid in HARNESS_PROFILE_OVERRIDES:
            entry["harnessProfile"] = HARNESS_PROFILE_OVERRIDES[pid]
        if is_mcp:
            entry.pop("skill", None)
            entry.pop("write", None)
        if pid in PROJECT_EXTRAS:
            entry.update(PROJECT_EXTRAS[pid])
        projects[pid] = entry

    primary = PRIMARY_BY_DIR.get(repo_dirname, "portal")
    groups: dict = deepcopy(ssot.get("groups", {}))
    if "platform-bases" in groups:
        groups["platform-bases"] = {
            **groups["platform-bases"],
            "primary": primary,
            "projects": [pid for pid in base_ids if pid in projects],
        }

    if repo_dirname == "portal":
        projects.update(PORTAL_EXTRAS)
        groups["nuxt-nest-stack"] = stack_group(
            "nuxt-nest-stack",
            "nuxt-nest-fe",
            "nuxt-nest-be",
            "Nuxt 4 FE + NestJS BE (monorepo)",
        )
        groups["next-nest-stack"] = stack_group(
            "next-nest-stack",
            "next-nest-fe",
            "next-nest-be",
            "Next.js FE + NestJS BE (monorepo)",
        )
    elif repo_dirname in MONOREPO_EXTRAS:
        projects.update(MONOREPO_EXTRAS[repo_dirname])
        if repo_dirname == "nuxt_nest":
            groups["nuxt-nest-stack"] = stack_group(
                "nuxt-nest-stack",
                "nuxt-nest-fe",
                "nuxt-nest-be",
                "Nuxt 4 FE + NestJS BE (this monorepo)",
            )
        else:
            groups["next-nest-stack"] = stack_group(
                "next-nest-stack",
                "next-nest-fe",
                "next-nest-be",
                "Next.js FE + NestJS BE (this monorepo)",
            )

    doc: dict = {
        "defaultGroup": ssot.get("defaultGroup", "platform-bases"),
        "harness": deepcopy(ssot.get("harness", {})),
        "groups": groups,
        "projects": projects,
    }
    if is_mcp:
        doc = {
            "version": ssot.get("version", 1),
            "description": ssot.get(
                "description",
                "Workspace map for artifactgraph — roots relative to workspaceRoot (or ARTIFACTGRAPH_WORKSPACE).",
            ),
            "workspaceRoot": ssot.get("workspaceRoot", ".."),
            **doc,
        }
    return doc


def main() -> None:
    ssot = load_ssot()
    ws = workspace_root()
    targets = [
        ("portal", False),
        ("nextjs", False),
        ("nuxt_nest", False),
        ("next_nest", False),
        ("fast-api-base", False),
        ("api", False),
        ("integration", False),
        ("line", False),
        ("base-docs", False),
        ("base-tests", False),
        ("artifactgraph", True),
    ]
    if (ws / "hubdocs").is_dir():
        targets.append(("hubdocs", False))

    for dirname, is_mcp in targets:
        root = ws / dirname if not is_mcp else PKG_ROOT
        if not root.is_dir():
            print(f"SKIP missing {dirname}")
            continue
        doc = build_for(dirname, is_mcp=is_mcp, ssot=ssot)
        path = root / "platform-repos.json"
        path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"OK {path}")

    portal = ws / "portal"
    if portal.is_dir():
        example = build_for("portal", is_mcp=False, ssot=ssot)
        (portal / "platform-repos.example.json").write_text(
            json.dumps(example, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print("OK portal/platform-repos.example.json")


if __name__ == "__main__":
    main()
