#!/usr/bin/env python3
"""Return latest temperature readings from the Romulus SDR temp web server."""

import json
import os
import sys
from urllib.error import URLError
from urllib.request import urlopen


DEFAULT_URL = "http://127.0.0.1:8433/temps"


def main() -> int:
    url = os.environ.get("FLEETMESH_TEMPS_URL", DEFAULT_URL)
    timeout = float(os.environ.get("FLEETMESH_TEMPS_TIMEOUT", "5"))

    try:
        with urlopen(url, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, URLError, json.JSONDecodeError) as error:
        print(f"failed to read latest temperatures from {url}: {error}", file=sys.stderr)
        return 1

    if not payload:
        print("No temperature readings available.")
        return 0

    lines = ["Latest temperatures:"]
    for name, reading in sorted(payload.items()):
        temp = reading.get("temp_f")
        humidity = reading.get("humidity")
        timestamp = reading.get("time", "unknown time")

        parts = []
        if isinstance(temp, (int, float)):
            parts.append(f"{temp:.2f} F")
        if isinstance(humidity, (int, float)):
            parts.append(f"{humidity:.1f}% humidity")

        value = ", ".join(parts) if parts else "no numeric reading"
        lines.append(f"- {name}: {value} ({timestamp})")

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

