#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
export NODE_PATH="$PROJECT_DIR/node_modules"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
npx tsc src/main.ts forge.env.d.ts --rootDir src --outDir "$TMP_ROOT/build" \
  --module commonjs --target ES2022 --esModuleInterop --noImplicitAny --skipLibCheck
node tests/integration/app/packaged-qa-isolation.integration.cjs "$TMP_ROOT/build" "$PROJECT_DIR"
