#!/usr/bin/env python3
"""Expose current SDR temperature readings in Prometheus format."""

import json
import logging
import os
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError
from urllib.request import urlopen


TEMPS_URL = os.environ.get("SDR_TEMPS_URL", "http://127.0.0.1:8433/temps")
PORT = int(os.environ.get("SDR_TEMPS_EXPORTER_PORT", "9765"))
ROOMS = {"Bedroom": "bedroom", "Living Room": "living_room", "Garage": "garage"}

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sdr_temperature_exporter")


class MetricsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/metrics":
            self.send_error(404)
            return

        try:
            payload = fetch_temperatures()
            body = render_metrics(payload)
        except (OSError, URLError, json.JSONDecodeError, ValueError) as error:
            log.warning("failed to fetch temperatures: %s", error)
            body = "# HELP sdr_temperature_exporter_up Whether the temperature endpoint is reachable.\n# TYPE sdr_temperature_exporter_up gauge\nsdr_temperature_exporter_up 0\n"

        encoded = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format, *args):
        log.info("%s - %s", self.address_string(), format % args)


def fetch_temperatures():
    with urlopen(TEMPS_URL, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def render_metrics(payload):
    lines = [
        "# HELP sdr_temperature_exporter_up Whether the temperature endpoint is reachable.",
        "# TYPE sdr_temperature_exporter_up gauge",
        "sdr_temperature_exporter_up 1",
        "# HELP sdr_temperature_fahrenheit Latest temperature reading in Fahrenheit.",
        "# TYPE sdr_temperature_fahrenheit gauge",
        "# HELP sdr_humidity_percent Latest humidity reading as a percentage.",
        "# TYPE sdr_humidity_percent gauge",
        "# HELP sdr_temperature_reading_timestamp_seconds Timestamp of the latest reading.",
        "# TYPE sdr_temperature_reading_timestamp_seconds gauge",
        "# HELP sdr_temperature_reading_age_seconds Age of the latest reading.",
        "# TYPE sdr_temperature_reading_age_seconds gauge",
    ]

    for display_name, room in ROOMS.items():
        reading = payload.get(display_name)
        if not isinstance(reading, dict):
            continue
        labels = f'room="{room}"'
        append_metric(lines, "sdr_temperature_fahrenheit", labels, reading.get("temp_f"))
        append_metric(lines, "sdr_humidity_percent", labels, reading.get("humidity"))

        timestamp = parse_time(reading.get("time"))
        if timestamp is not None:
            append_metric(lines, "sdr_temperature_reading_timestamp_seconds", labels, timestamp.timestamp())
            append_metric(lines, "sdr_temperature_reading_age_seconds", labels, max(0, datetime.now(timestamp.tzinfo).timestamp() - timestamp.timestamp()))

    return "\n".join(lines) + "\n"


def append_metric(lines, name, labels, value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return
    lines.append(f"{name}{{{labels}}} {value}")


def parse_time(value):
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def main():
    log.info("serving metrics on http://127.0.0.1:%d/metrics", PORT)
    ThreadingHTTPServer(("127.0.0.1", PORT), MetricsHandler).serve_forever()


if __name__ == "__main__":
    main()
