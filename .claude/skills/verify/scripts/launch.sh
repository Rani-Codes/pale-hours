#!/usr/bin/env bash
# Starts an isolated Pale Hours stack for verification: the signaling server
# and the Vite dev server on their own ports, never the user's 8787 and 5173.
# Prints the app URL to drive when both are usable.
set -euo pipefail
root="$(cd "$(dirname "$0")/../../../.." && pwd)"
run="$root/.verify/run"
app_port="${PALE_VERIFY_APP_PORT:-5273}"
signal_port="${PALE_VERIFY_SIGNAL_PORT:-8887}"

if [[ -f "$run/pids" ]]; then
  echo "a verify stack is already recorded in $run; run cleanup.sh first" >&2
  exit 1
fi
for port in "$app_port" "$signal_port"; do
  if lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "port $port is already in use by something this run did not start" >&2
    exit 1
  fi
done
mkdir -p "$run"

[[ -d "$root/client/node_modules" ]] || (cd "$root/client" && npm install --silent)
[[ -d "$root/tools/node_modules" ]] || (cd "$root/tools" && npm install --silent)
(cd "$root/client" && npm run --silent wasm)
(cd "$root/signal" && go build -o "$run/signal" .)

"$run/signal" -addr "localhost:$signal_port" >"$run/signal.log" 2>&1 &
echo "signal $! $signal_port" >"$run/pids"
(cd "$root/client" && exec ./node_modules/.bin/vite --port "$app_port" --strictPort) >"$run/vite.log" 2>&1 &
echo "vite $! $app_port" >>"$run/pids"

for _ in $(seq 1 60); do
  page="$(curl -s "http://localhost:$app_port/" || true)"
  wasm="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$app_port/sim.wasm" || true)"
  sig="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$signal_port/" || true)"
  if [[ "$page" == *"<title>Pale Hours</title>"* && "$wasm" == 200 && "$sig" != 000 ]]; then
    echo "http://localhost:$app_port/?signal=http://localhost:$signal_port"
    exit 0
  fi
  sleep 0.5
done
echo "stack did not become usable; logs in $run" >&2
exit 1
