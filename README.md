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
/run tag:sensor temp_graph
```

`/run status` is a broadcast. Every ship that supports `status` replies.

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

## Telegram Run

Copy `examples/ship.config.json`, set `telegram.botToken`,
`telegram.allowedChatIds`, and `telegram.allowedUserIds`, then run:

```bash
node ./bin/fleetmesh.js --config ./ship.config.json
```
