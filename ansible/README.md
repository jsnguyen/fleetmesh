# FleetMesh Ansible

`fleetmesh_install.yml` deploys FleetMesh to Linux/systemd ships.

The installer is one YAML file. It clones the FleetMesh git repo into the
SSH/deploy user's home directory and runs the systemd service as that same user.

Use your existing inventory:

```ini
[homelab]
vulcan  ansible_user=jsn ansible_python_interpreter=/usr/bin/python3
romulus ansible_user=jsn ansible_python_interpreter=/usr/bin/python3
```

Create a vault file for FleetMesh variables:

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

Ship id, ship name, and bot username are derived from the inventory hostname.
For `romulus`, that means `romulus`, `Romulus`, and `romulus_ship_bot`.

Deploy:

```bash
ansible-playbook -i /path/to/inventory.ini fleetmesh_install.yml -e @fleetmesh.vault.yml --ask-vault-pass
```

The playbook installs:

```text
/home/YOUR_USER/fleetmesh
/etc/fleetmesh/ship.config.json
/etc/fleetmesh/.tgcreds.json
/etc/fleetmesh/scripts/status.sh
/etc/systemd/system/fleetmesh.service
```

`ship.config.json` and the default `status.sh` are created only if missing, so
commands added directly on a ship are not overwritten by later playbook runs.

FleetMesh is enabled at boot:

```bash
systemctl status fleetmesh
journalctl -u fleetmesh -f
```

Add a command on a ship without restarting the service:

```bash
node ~/fleetmesh/bin/fleetmesh.js add-command temp --config /etc/fleetmesh/ship.config.json --timeout 5
${EDITOR:-vi} /etc/fleetmesh/scripts/temp.sh
```

The running service reloads config on every Telegram message.

Edit the vault later with:

```bash
ansible-vault edit fleetmesh.vault.yml
```
