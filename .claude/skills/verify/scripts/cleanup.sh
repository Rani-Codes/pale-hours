#!/usr/bin/env bash
# Stops only the processes launch.sh recorded, then removes the run state.
# Evidence in .verify/evidence is kept.
set -uo pipefail
root="$(cd "$(dirname "$0")/../../../.." && pwd)"
run="$root/.verify/run"
[[ -f "$run/pids" ]] || { echo "nothing recorded in $run"; exit 0; }
while read -r name pid _; do
  kill "$pid" 2>/dev/null && echo "stopped $name (pid $pid)"
done <"$run/pids"
rm -rf "$run"
echo "evidence kept in $root/.verify/evidence"
