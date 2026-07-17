#!/usr/bin/env bash
# artifactgraph installer (Linux / WSL) — git clone + npm build (needs Node ≥ 22).
#
#   curl -fsSL https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.sh | bash
#
# Upgrade: re-run the same command.
# Uninstall: bash install.sh --uninstall
#
# Env:
#   ARTIFACTGRAPH_REPO          default: raintr91/artifactgraph
#   ARTIFACTGRAPH_INSTALL_DIR   default: ~/.artifactgraph
#   ARTIFACTGRAPH_BIN_DIR       default: ~/.local/bin
#   ARTIFACTGRAPH_WORKSPACE     bases folder (auto: ~/workspace if present)
#   ARTIFACTGRAPH_REF           git ref (default: main)
set -euo pipefail

REPO="${ARTIFACTGRAPH_REPO:-raintr91/artifactgraph}"
INSTALL_DIR="${ARTIFACTGRAPH_INSTALL_DIR:-$HOME/.artifactgraph}"
BIN_DIR="${ARTIFACTGRAPH_BIN_DIR:-$HOME/.local/bin}"
REF="${ARTIFACTGRAPH_REF:-main}"

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$BIN_DIR/artifactgraph" "$BIN_DIR/artifactgraph-mcp"
  rm -rf "$INSTALL_DIR"
  echo "artifactgraph uninstalled ($INSTALL_DIR)."
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "artifactgraph: Node.js ≥ 22 required (node not found)." >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "artifactgraph: git required." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "artifactgraph: npm required." >&2
  exit 1
fi

echo "Installing artifactgraph from github.com/$REPO @$REF → $INSTALL_DIR"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

git clone --depth 1 --branch "$REF" "https://github.com/$REPO.git" "$tmpdir/src"

rm -rf "$INSTALL_DIR"
mkdir -p "$(dirname "$INSTALL_DIR")"
mv "$tmpdir/src" "$INSTALL_DIR"

cd "$INSTALL_DIR"
npm install
npm run build

# Workspace hint for platform-repos (sibling bases under ~/workspace)
WS="${ARTIFACTGRAPH_WORKSPACE:-}"
if [ -z "$WS" ] && [ -d "$HOME/workspace/portal" ]; then
  WS="$HOME/workspace"
fi
if [ -n "$WS" ]; then
  printf '%s\n' "$WS" > "$INSTALL_DIR/workspace.path"
  echo "Wrote workspace.path → $WS"
fi

mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/bin/artifactgraph.mjs" "$BIN_DIR/artifactgraph"
ln -sf "$INSTALL_DIR/bin/artifactgraph-mcp.mjs" "$BIN_DIR/artifactgraph-mcp"
chmod +x "$INSTALL_DIR/bin/"*.mjs

echo "Linked $BIN_DIR/artifactgraph"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo ""
    echo "$BIN_DIR is not on PATH. Add:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac

echo ""
echo "Done. Next:"
echo "  artifactgraph version"
echo "Next:"
echo "  artifactgraph init                                 # agents (↑↓ · Space · Enter)"
echo "  artifactgraph init --target=cursor,claude,kilo --yes"
echo "  cd <product-repo> && artifactgraph init && artifactgraph rebuild"
echo "Docs: docs/INIT.md"
echo ""
echo "Or npx (no global link):"
echo "  npx --yes github:$REPO artifactgraph version"
