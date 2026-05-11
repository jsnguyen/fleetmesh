#!/usr/bin/env python3
"""Return latest temperature readings from the Romulus SDR temp web server."""

import json
import os
import sys
from collections import defaultdict
from datetime import datetime
from urllib.error import URLError
from urllib.request import urlopen


DEFAULT_URL = "http://127.0.0.1:8433/temps"
DISPLAY_ORDER = ["Bedroom", "Living Room", "Garage"]
ICONS = {
    "Bedroom": "🛏️",
    "Living Room": "🛋️",
    "Garage": "🛠️",
}


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
        print("🌡️ No temperature readings available.")
        return 0

    readings = []
    for name in ordered_names(payload):
        reading = payload[name]
        temp = reading.get("temp_f")
        humidity = reading.get("humidity")
        timestamp = reading.get("time", "unknown time")

        values = []
        if isinstance(temp, (int, float)):
            values.append(f"{temp:.1f}°F")
        if isinstance(humidity, (int, float)):
            values.append(f"{humidity:.0f}%")

        readings.append({
            "name": name,
            "value": "  ".join(values) if values else "no numeric reading",
            "time": timestamp,
        })

    dates = unique_dates(reading["time"] for reading in readings)
    lines = [f"🌡️ Temps — {', '.join(dates) if dates else 'latest'}"]
    for reading in readings:
        icon = ICONS.get(reading["name"], "•")
        lines.append(f"{icon} {reading['name']}: {reading['value']}")

    times = ", ".join(f"{reading['name']} {format_time(reading['time'])}" for reading in readings)
    if times:
        lines.append(f"🕒 {times}")

    print("\n".join(lines))
    return 0


def ordered_names(payload: dict) -> list[str]:
    known = [name for name in DISPLAY_ORDER if name in payload]
    extra = sorted(name for name in payload if name not in DISPLAY_ORDER)
    return known + extra


def parse_time(value: str):
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def unique_dates(values) -> list[str]:
    dates = []
    seen = set()
    for value in values:
        parsed = parse_time(value)
        date = parsed.strftime("%Y-%m-%d") if parsed else str(value).split("T", 1)[0]
        if date and date not in seen:
            dates.append(date)
            seen.add(date)
    return dates


def format_time(value: str) -> str:
    parsed = parse_time(value)
    if parsed:
        return parsed.strftime("%H:%M")
    if isinstance(value, str) and "T" in value:
        return value.split("T", 1)[1][:5]
    return str(value)


if __name__ == "__main__":
    raise SystemExit(main())
