# FleetMesh

FleetMesh is a controllerless Telegram command mesh. Each computer runs a small
agent and is called a **ship**. Ships listen in a Telegram fleet channel, decide
whether an order applies to them, run allowlisted local scripts, and reply.

```text
Telegram Fleet Channel
   |
   |-- Ship: macbook
   |-- Ship: workstation
   |-- Ship: sensor-ship
```

## Commands

```text
/fleet
/commands
/run status
/run @sensor-ship temp
```

`/run status` is a broadcast. Every ship that supports `status` replies.

For instructions on writing new ship commands, see `AGENT.md`.

## Command Output

Scripts can print plain text:

```bash
echo "Current: 72.4 F"
```

Or minimal JSON:

```json
{
  "text": "Temperature report for the last 24 hours",
  "attachments": [
    { "path": "./out/temp-24h.png", "caption": "Last 24 hours" }
  ]
}
```

If stdout is JSON with `text`, FleetMesh sends that text and uploads any
attachments. Otherwise, stdout is sent as plain text. Exit code decides success.

## Local Test Run

```bash
npm test
node ./bin/fleetmesh.js --config ./examples/ship.config.json --message "/run @sensor-ship temp"
```

## Initialize A Ship

Create a starter config and status script:

```bash
node ./bin/fleetmesh.js init --id sensor-ship --name "Temperature Server"
```

This writes:

```text
ship.config.json
scripts/status.sh
```

Credentials still live outside the repo in `~/.tgcreds.json`.

Add a command while the ship service is already running:

```bash
node ./bin/fleetmesh.js add-command temp --config ./ship.config.json --timeout 5
```

This updates `ship.config.json` and creates `scripts/temp.sh` if it does not
exist. The running ship reloads config for every Telegram message, so no restart
is needed.

## Background Service

Linux/systemd is the primary deployment target.

For Romulus and Vulcan, use the Ansible playbook in `ansible/`. It installs
FleetMesh as a systemd service named `fleetmesh.service` and enables it at boot.

For a single Linux ship, generate a systemd unit locally:

```bash
sudo node ./bin/fleetmesh.js service install --config /etc/fleetmesh/ship.config.json --creds /etc/fleetmesh/.tgcreds.json --name fleetmesh
```

Then start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fleetmesh.service
```

Logs are available with:

```bash
journalctl -u fleetmesh -f
```

## Telegram Run

Create `~/.tgcreds.json`:

```json
{
  "bot_token": "telegram-bot-token",
  "user_id": 123456789
}
```

Then copy `examples/ship.config.json`, set `telegram.botUsername` if the bot is
running in a group, and run:

```bash
node ./bin/fleetmesh.js --config ./ship.config.json
```

You can use a different credentials file with:

```bash
node ./bin/fleetmesh.js --config ./ship.config.json --creds ./local.tgcreds.json
```
