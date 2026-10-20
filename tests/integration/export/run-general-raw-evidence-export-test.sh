#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
export NODE_PATH="$PROJECT_DIR/node_modules"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
npx tsc src/main/app/desktop-multisource-controller.ts \
  src/main/app/production-collection-runtime.ts src/main/storage/database.ts \
  src/main/storage/state-repository.ts src/main/export/production-data-package-loader.ts \
  src/main/blog-writing-packs/blog-writing-pack-assembler.ts \
  src/main/blog-writing-packs/blog-writing-pack-v2-readiness.ts \
  --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 \
  --esModuleInterop --strict --skipLibCheck
node tests/integration/export/general-raw-evidence-export.integration.cjs "$TMP_ROOT/build" "$TMP_ROOT/work"
