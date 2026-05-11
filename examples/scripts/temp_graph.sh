#!/usr/bin/env bash
printf '%s\n' '{
  "text": "Temperature report for the last 24 hours",
  "attachments": [
    { "path": "./out/temp-24h.txt", "caption": "Sample graph placeholder" }
  ]
}'
