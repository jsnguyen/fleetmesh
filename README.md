# FleetMesh

FleetMesh is a controllerless Telegram command mesh. Each computer is a
**ship**. A ship runs a small Linux/systemd service, listens for Telegram
commands, runs allowlisted local scripts, and replies with the output.

```text
Telegram group
   |
   |-- romulus
   |-- vulcan
```

## Install Path

This is the normal path for adding a new FleetMesh process to Linux machines.

### 1. Create Telegram Bots

Create one Telegram bot per ship with `@BotFather`.

For the default homelab setup:

```text
romulus -> romulus_ship_bot
vulcan  -> vulcan_ship_bot
```

Add both bots to one private Telegram group. If you want broadcast commands like
`/run status` to be seen by all bots, turn off each bot's group privacy in
BotFather.

### 2. Prepare Inventory

Use your existing Ansible inventory:

```ini
[homelab]
vulcan  ansible_user=jsn ansible_python_interpreter=/usr/bin/python3
romulus ansible_user=jsn ansible_python_interpreter=/usr/bin/python3
```

FleetMesh derives ship settings from the inventory hostname:

```text
romulus -> ship id romulus, ship name Romulus, bot username romulus_ship_bot
vulcan  -> ship id vulcan,  ship name Vulcan,  bot username vulcan_ship_bot
```

### 3. Create The Vault

Create a vault file beside the installer:

```bash
cd ansible
ansible-vault create fleetmesh.vault.yml
```

Vault contents:

```yaml
fleetmesh_repo_url: "git@github.com:YOUR_ORG_OR_USER/fleetmesh.git"
fleetmesh_repo_version: main
fleetmesh_telegram_user_id: 123456789
fleetmesh_telegram_chat_id: -1001234567890
fleetmesh_bot_tokens:
  romulus: "telegram-token-for-romulus"
  vulcan: "telegram-token-for-vulcan"
```

Edit it later with:

```bash
ansible-vault edit fleetmesh.vault.yml
```

### 4. Install FleetMesh

Run the single-file installer:

```bash
ansible-playbook -i /path/to/inventory.ini ansible/fleetmesh_install.yml -e @ansible/fleetmesh.vault.yml --ask-vault-pass
```

The installer:

- clones the repo to `~/fleetmesh` on each ship
- writes `/etc/fleetmesh/ship.config.json`
- writes `/etc/fleetmesh/.tgcreds.json`
- writes `/etc/fleetmesh/scripts/status.sh`
- installs and starts `fleetmesh.service`
- enables the service at boot

### 5. Verify

On a ship:

```bash
systemctl status fleetmesh
journalctl -u fleetmesh -f
```

In Telegram:

```text
/fleet
/commands
/run status
/run @romulus status
```

To find the group chat id, temporarily run one bot, send a message in the group,
and check `journalctl -u fleetmesh -f` if authorization fails. Telegram group ids
are usually negative numbers, often starting with `-100`.

## Add A Command

Add a command on a ship:

```bash
node ~/fleetmesh/bin/fleetmesh.js add-command temp --config /etc/fleetmesh/ship.config.json --timeout 5
${EDITOR:-vi} /etc/fleetmesh/scripts/temp.sh
```

The running service reloads config on every Telegram message, so no restart is
needed.

For command-writing rules, see `AGENT.md`.

## Command Output

Scripts can print plain text:

```bash
echo "Current: 72.4 F"
```

Or minimal JSON with attachments:

```json
{
  "text": "Temperature report for the last 24 hours",
  "attachments": [
    { "path": "./out/temp-24h.png", "caption": "Last 24 hours" }
  ]
}
```

If stdout is JSON with `text`, FleetMesh sends `text` and uploads attachments.
Otherwise, stdout is sent as plain text. Exit code decides success or failure.

## Local Development

Run tests:

```bash
npm test
```

Run a local command path:

```bash
node ./bin/fleetmesh.js --config ./examples/ship.config.json --message "/run @sensor-ship temp"
```
