#!/usr/bin/env python3
"""Return latest temperature readings from the Romulus SDR temp web server."""

import json
import os
import re
import sys
from datetime import datetime
from urllib.error import URLError
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.request import urlopen


DEFAULT_URL = "http://127.0.0.1:8433/temps"
DISPLAY_ORDER = ["Bedroom", "Living Room", "Garage"]
STALE_AFTER_SECONDS = int(os.environ.get("FLEETMESH_TEMPS_STALE_SECONDS", "300"))
ICONS = {
    "Bedroom": "🛏️",
    "Living Room": "🛋️",
    "Garage": "🛠️",
}
CHANNEL_NAMES = {
    "0": "Bedroom",
    "1": "Living Room",
    "2": "Garage",
}
ROOM_ALIASES = {
    "bedroom": "Bedroom",
    "living room": "Living Room",
    "livingroom": "Living Room",
    "garage": "Garage",
}


def main() -> int:
    url = os.environ.get("FLEETMESH_TEMPS_URL", DEFAULT_URL)
    timeout = float(os.environ.get("FLEETMESH_TEMPS_TIMEOUT", "5"))

    try:
        payload = fetch_payload(url, timeout)
    except (OSError, URLError, json.JSONDecodeError) as error:
        stream_url = stream_fallback_url(url)
        if not stream_url:
            print(f"failed to read latest temperatures from {url}: {error}", file=sys.stderr)
            return 1
        try:
            payload = fetch_payload(stream_url, timeout)
        except (OSError, URLError, json.JSONDecodeError) as stream_error:
            print(f"failed to read latest temperatures from {url}: {error}", file=sys.stderr)
            print(f"fallback stream failed from {stream_url}: {stream_error}", file=sys.stderr)
            return 1

    if not payload:
        print("🌡️ No temperature readings available.")
        return 0

    readings_by_name = normalize_payload(payload)
    if needs_stream_refresh(readings_by_name):
        stream_url = stream_fallback_url(url)
        if stream_url and stream_url != url:
            try:
                merge_readings(readings_by_name, normalize_payload(fetch_payload(stream_url, timeout)))
            except (OSError, URLError, json.JSONDecodeError):
                pass

    readings = [readings_by_name[name] for name in ordered_names(readings_by_name)]

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


def fetch_payload(url: str, timeout: float):
    with urlopen(url, timeout=timeout) as response:
        content_type = response.headers.get("Content-Type", "")
        if "/stream" in urlparse(url).path or "text/event-stream" in content_type:
            return read_sse_payload(response)
        return json.loads(response.read().decode("utf-8"))


def read_sse_payload(response):
    for raw_line in response:
        line = raw_line.decode("utf-8").strip()
        if not line.startswith("data:"):
            continue
        return json.loads(line.removeprefix("data:").strip())
    return {}


def stream_fallback_url(url: str) -> str | None:
    explicit = os.environ.get("FLEETMESH_TEMPS_STREAM_URL")
    if explicit:
        return explicit

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return None

    path = parsed.path
    if path.endswith("/temps"):
        path = f"{path[:-len('/temps')]}/stream"
    else:
        path = f"{path.rstrip('/')}/stream"

    query = dict(parse_qsl(parsed.query))
    query["days"] = "1"
    return urlunparse(parsed._replace(path=path, query=urlencode(query)))


def normalize_payload(payload: dict) -> dict[str, dict]:
    readings = {}
    for key, value in payload.items():
        name = canonical_room_name(key)
        latest = latest_payload_value(value)
        if not name or not isinstance(latest, dict):
            continue

        reading = build_reading(name, latest)
        if not reading:
            continue
        merge_readings(readings, {name: reading})
    return readings


def latest_payload_value(value):
    if isinstance(value, list):
        values = [item for item in value if isinstance(item, dict)]
        if not values:
            return None
        return max(values, key=lambda item: parse_time(item.get("time")) or datetime.min)
    return value


def canonical_room_name(value: str) -> str | None:
    if not isinstance(value, str):
        return None

    channel = channel_room_name(value)
    if channel:
        return channel

    normalized = re.sub(r"[_-]+", " ", value.strip()).lower()
    normalized = re.sub(r"\s+", " ", normalized)
    return ROOM_ALIASES.get(normalized, value.strip() or None)


def channel_room_name(value: str) -> str | None:
    match = re.search(r"(?:^|_)ch([0-9]+)(?:[^0-9]|$)", value)
    if not match:
        return None
    return CHANNEL_NAMES.get(match.group(1))


def build_reading(name: str, payload: dict) -> dict | None:
    temp = payload.get("temp_f")
    humidity = payload.get("humidity")
    timestamp = payload.get("time", "unknown time")

    values = []
    if isinstance(temp, (int, float)):
        values.append(f"{temp:.1f}°F")
    if isinstance(humidity, (int, float)):
        values.append(f"{humidity:.0f}%")

    return {
        "name": name,
        "value": "  ".join(values) if values else "no numeric reading",
        "time": timestamp,
    }


def merge_readings(target: dict[str, dict], incoming: dict[str, dict]) -> None:
    for name, reading in incoming.items():
        current = target.get(name)
        if current is None:
            target[name] = reading
            continue

        current_time = parse_time(current.get("time"))
        reading_time = parse_time(reading.get("time"))
        if current_time is None or (reading_time is not None and reading_time > current_time):
            target[name] = reading


def missing_display_rooms(readings_by_name: dict) -> list[str]:
    return [name for name in DISPLAY_ORDER if name not in readings_by_name]


def stale_display_rooms(readings_by_name: dict) -> list[str]:
    return [
        name for name in DISPLAY_ORDER
        if name in readings_by_name and is_stale(readings_by_name[name].get("time"))
    ]


def needs_stream_refresh(readings_by_name: dict) -> bool:
    return bool(missing_display_rooms(readings_by_name) or stale_display_rooms(readings_by_name))


def ordered_names(readings_by_name: dict) -> list[str]:
    known = [name for name in DISPLAY_ORDER if name in readings_by_name]
    extra = sorted(name for name in readings_by_name if name not in DISPLAY_ORDER)
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
    return "🔴" if is_stale(value) else "🟢"


def is_stale(value: str | None) -> bool:
    parsed = parse_time(value)
    if not parsed:
        return True
    now = datetime.now(parsed.tzinfo) if parsed.tzinfo else datetime.now()
    age_seconds = max(0, int((now - parsed).total_seconds()))
    return age_seconds > STALE_AFTER_SECONDS


if __name__ == "__main__":
    raise SystemExit(main())
