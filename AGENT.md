# FleetMesh Agent Instructions

This repo implements FleetMesh, a controllerless Telegram command mesh. Each
computer is a **ship**. A ship runs the FleetMesh agent as a Linux/systemd
service, listens for Telegram commands, runs allowlisted local scripts, and
replies with script output.

Follow these instructions when adding or changing FleetMesh commands.

## Command Model

Commands are registered in a ship config:

```json
{
  "commands": {
    "status": {
      "script": "./scripts/status.sh",
      "timeoutSeconds": 5
    }
  }
}
```

The script path is resolved relative to the config file directory unless it is
absolute. The running agent reloads config on every Telegram message, so adding
a command does not require restarting `fleetmesh.service`.

## Add A Command

Use the CLI whenever possible:

```bash
node ./bin/fleetmesh.js add-command temp --config ./ship.config.json --timeout 5
```

This updates `ship.config.json` and creates `scripts/temp.sh` if missing.

Repo-managed skills live under:

```text
skills/all/
skills/romulus/
skills/vulcan/
```

Use `skills/all` for commands shared by every ship. Use a ship-specific folder
for commands that only make sense on that machine. The Ansible install/update
playbooks register built-in skills automatically.

On a deployed Linux ship, the normal paths are:

```bash
node ~/fleetmesh/bin/fleetmesh.js add-command temp --config /etc/fleetmesh/ship.config.json --timeout 5
${EDITOR:-vi} /etc/fleetmesh/scripts/temp.sh
```

Do not put Telegram tokens in `ship.config.json`. Credentials belong in:

```text
/etc/fleetmesh/.tgcreds.json
```

or, for local development:

```text
~/.tgcreds.json
```

## Script Rules

Scripts should be small, deterministic, and safe to run from Telegram.

Use this shell header for bash commands:

```bash
#!/usr/bin/env bash
set -euo pipefail
```

Prefer read-only status/check/report commands. For commands that mutate state
or restart services, keep the script narrow and explicit. Do not implement
arbitrary shell execution from Telegram input.

Arguments passed after the command are forwarded to the script:

```text
/run @romulus temp 24h
```

runs:

```bash
./scripts/temp.sh 24h
```

Validate any arguments inside the script before using them.

## Output Format

Plain stdout is valid:

```bash
echo "Current: 72.4 F"
```

For attachments, output minimal JSON:

```json
{
  "text": "Temperature report for the last 24 hours",
  "attachments": [
    { "path": "./out/temp-24h.png", "caption": "Last 24 hours" }
  ]
}
```

Rules:

- If stdout is JSON with `text`, FleetMesh sends `text`.
- If stdout is not JSON, FleetMesh sends stdout as plain text.
- If JSON has `attachments`, FleetMesh uploads those files.
- Attachment paths are resolved relative to the script directory.
- Exit code `0` means success.
- Non-zero exit means failure; stderr is sent back.

Keep Telegram output concise. Large logs should be written to a file and sent as
an attachment.

## Test Locally

Run unit tests:

```bash
npm test
```

Run a command through the local message path:

```bash
node ./bin/fleetmesh.js --config ./examples/ship.config.json --message "/run @sensor-ship temp"
```

For a deployed ship, test with its real config:

```bash
node ~/fleetmesh/bin/fleetmesh.js --config /etc/fleetmesh/ship.config.json --creds /etc/fleetmesh/.tgcreds.json --message "/run @romulus status"
```

Check the service:

```bash
systemctl status fleetmesh
journalctl -u fleetmesh -f
```

## Deployment Notes

Romulus and Vulcan are managed by `ansible/fleetmesh_install.yml`.

The playbook creates `ship.config.json` only if missing and registers built-in
repo skills with `fleetmesh add-command --force`. Commands added directly on a
ship are preserved unless they use the same command name as a built-in skill.

Keep secrets in Ansible Vault, not in repo files.
