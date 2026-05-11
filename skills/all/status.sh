#!/usr/bin/env bash
set -euo pipefail

echo "Ship: ${FLEETMESH_SHIP_NAME:-$(hostname)}"
echo "Host: $(hostname)"
echo "Uptime: $(uptime)"

