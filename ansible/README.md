# FleetMesh Ansible

This deploys Romulus and Vulcan as Linux/systemd FleetMesh ships. Linux is the
primary FleetMesh deployment target.

The playbook is portable: it does not copy FleetMesh from the Ansible checkout.
Each ship clones the FleetMesh git repo into the SSH/deploy user's home
directory and runs the systemd service as that same user. It does not create a
dedicated `fleetmesh` service user.

Edit `inventory.ini` first:

```ini
[fleetmesh]
Romulus ansible_host=romulus.local
Vulcan ansible_host=vulcan.local
```

Put secrets in Ansible Vault:

```bash
mkdir -p group_vars/all
ansible-vault create group_vars/all/vault.yml
```

Example vault contents:

```yaml
vault_telegram_user_id: 123456789
vault_romulus_bot_token: "telegram-token-for-romulus"
vault_vulcan_bot_token: "telegram-token-for-vulcan"
```

Set your repo URL in `group_vars/fleetmesh.yml`:

```yaml
fleetmesh_repo_url: "git@github.com:YOUR_ORG_OR_USER/fleetmesh.git"
fleetmesh_repo_version: main
```

Ship id, ship name, and bot username are derived from the inventory hostname by
default. For `Romulus`, that means `romulus`, `Romulus`, and
`romulus_ship_bot`.

Deploy:

```bash
cd ansible
ansible-playbook deploy.yml --ask-vault-pass
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
