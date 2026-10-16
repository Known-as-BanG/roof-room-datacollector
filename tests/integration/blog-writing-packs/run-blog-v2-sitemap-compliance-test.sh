#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
export NODE_PATH="$PROJECT_DIR/node_modules"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
npx tsc src/main/blog-writing-packs/*.ts src/main/sources/bitkimark/bitkimark-sitemap-source.ts \
  --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 \
  --esModuleInterop --strict --skipLibCheck
node tests/integration/blog-writing-packs/blog-v2-sitemap-compliance.integration.cjs "$TMP_ROOT/build" "$TMP_ROOT/work"
