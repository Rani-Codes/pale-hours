#!/usr/bin/env bash
# Read-only: is the recorded verify stack worth driving? Exits nonzero with a reason if not.
set -uo pipefail
root="$(cd "$(dirname "$0")/../../../.." && pwd)"
run="$root/.verify/run"
fail() { echo "DOCTOR FAIL: $*"; exit 1; }

[[ -f "$run/pids" ]] || fail "no verify stack recorded; run launch.sh"
while read -r name pid port; do
  kill -0 "$pid" 2>/dev/null || fail "$name (pid $pid) is not running"
  owner="$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1)"
  [[ "$owner" == "$pid" ]] || fail "$name port $port is owned by pid ${owner:-none}, not our pid $pid"
  echo "ok   $name pid $pid listening on $port"
  [[ "$name" == vite ]] && app_port="$port"
  [[ "$name" == signal ]] && signal_port="$port"
done <"$run/pids"

curl -s "http://localhost:$app_port/" | grep -q "<title>Pale Hours</title>" || fail "app page is not Pale Hours"
newest_go="$(find "$root/sim" -name '*.go' -newer "$root/client/public/sim.wasm" | head -1)"
[[ -z "$newest_go" ]] || fail "sim.wasm is older than $newest_go; rerun launch.sh after cleanup.sh"
echo "ok   sim.wasm is newer than every sim source"
# Joining a code that cannot exist exercises the room API without creating anything.
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:$signal_port/rooms/0000/join")"
[[ "$code" == 404 ]] || fail "signal join of a missing room returned $code, want 404"
echo "ok   signal room API answers"
echo "drive: http://localhost:$app_port/?signal=http://localhost:$signal_port"
