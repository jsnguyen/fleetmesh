#!/usr/bin/env python3
"""Return latest temperature readings from the Romulus SDR temp web server."""

import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import urlopen


DEFAULT_URL = "http://127.0.0.1:8433/temps"
DISPLAY_ORDER = ["Bedroom", "Living Room", "Garage"]
STALE_AFTER_SECONDS = int(os.environ.get("FLEETMESH_TEMPS_STALE_SECONDS", "300"))
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

    latest = latest_reading(readings)
    header = format_header(latest["time"] if latest else None)
    lines = ["```", header]
    for reading in readings:
        icon = ICONS.get(reading["name"], "•")
        status = freshness_icon(reading["time"])
        lines.append(format_reading_line(status, icon, reading))
    lines.append("```")

    print("\n".join(lines))
    return 0


def ordered_names(payload: dict) -> list[str]:
    known = [name for name in DISPLAY_ORDER if name in payload]
    extra = sorted(name for name in payload if name not in DISPLAY_ORDER)
    return known + extra


def format_reading_line(status: str, icon: str, reading: dict) -> str:
    name = reading["name"]
    temp = ""
    humidity = ""

    raw_value = reading["value"]
    if raw_value != "no numeric reading":
        parts = raw_value.split("  ")
        temp = parts[0] if parts else ""
        humidity = parts[1] if len(parts) > 1 else ""
    else:
        temp = raw_value

    return f"{status} {icon} {name:<11} {temp:>7}   {humidity:>4}".rstrip()


def parse_time(value: str):
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def latest_reading(readings: list[dict]):
    dated = [(parse_time(reading["time"]), reading) for reading in readings]
    dated = [(parsed, reading) for parsed, reading in dated if parsed is not None]
    if not dated:
        return readings[0] if readings else None
    return max(dated, key=lambda item: item[0])[1]


def format_header(value: str | None) -> str:
    parsed = parse_time(value)
    if parsed:
        return f"{parsed.strftime('%Y-%m-%d')}, {format_clock(parsed)}, {age_text(parsed)}"
    if isinstance(value, str) and "T" in value:
        date, time = value.split("T", 1)
        return f"{date}, {time[:5]}, unknown age"
    return "latest"


def format_clock(value: datetime) -> str:
    hour = value.hour
    minute = value.minute
    suffix = "AM" if hour < 12 else "PM"
    hour_12 = hour % 12 or 12
    return f"{hour_12}:{minute:02d}{suffix}"


def age_text(value: datetime) -> str:
    now = datetime.now(value.tzinfo) if value.tzinfo else datetime.now()
    age_seconds = max(0, int((now - value).total_seconds()))
    if age_seconds < 60:
        amount = age_seconds
        unit = "sec"
    elif age_seconds < 3600:
        amount = age_seconds // 60
        unit = "min"
    elif age_seconds < 86400:
        amount = age_seconds // 3600
        unit = "hr"
    else:
        amount = age_seconds // 86400
        unit = "day"
    plural = "" if amount == 1 else "s"
    return f"{amount} {unit}{plural} ago"


def freshness_icon(value: str | None) -> str:
    parsed = parse_time(value)
    if not parsed:
        return "🔴"
    now = datetime.now(parsed.tzinfo) if parsed.tzinfo else datetime.now()
    age_seconds = max(0, int((now - parsed).total_seconds()))
    return "🟢" if age_seconds <= STALE_AFTER_SECONDS else "🔴"


if __name__ == "__main__":
    raise SystemExit(main())
