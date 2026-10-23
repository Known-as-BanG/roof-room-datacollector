#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
export NODE_PATH="$PROJECT_DIR/node_modules"
TMP_ROOT="$(mktemp -d "$PROJECT_DIR/.tmp-run-export-destination.XXXXXX")"
VITE_PID=""
cleanup() {
  if [ -n "$VITE_PID" ]; then kill "$VITE_PID" >/dev/null 2>&1 || true; fi
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT
npx tsc src/main/app/desktop-multisource-controller.ts src/main/app/desktop-run-export-ipc.ts \
  src/main/app/production-collection-runtime.ts \
  src/main/storage/database.ts src/main/storage/state-repository.ts \
  src/main/export/production-data-package-loader.ts src/preload.ts \
  --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 \
  --esModuleInterop --strict --skipLibCheck
if [ "${1:-integration}" = "ui" ]; then
  UI_TEST_PORT="$(node -e 'const net=require("node:net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
  npx vite --config vite.renderer.config.ts --host 127.0.0.1 --port "$UI_TEST_PORT" --strictPort >"$TMP_ROOT/vite.log" 2>&1 &
  VITE_PID=$!
  node tests/integration/app/run-export-destination-ui.integration.cjs "$TMP_ROOT/build" "$TMP_ROOT/work" "http://127.0.0.1:$UI_TEST_PORT"
else
  node tests/integration/app/run-export-destination.integration.cjs "$TMP_ROOT/build" "$TMP_ROOT/work"
fi
