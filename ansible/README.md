# FleetMesh Ansible

`fleetmesh_install.yml` deploys FleetMesh to Linux/systemd ships.
`fleetmesh_update.yml` pulls updates and restarts the service when the checkout
changes.

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

Use `journalctl -u fleetmesh -f -o cat` for cleaner JSON log lines.

Add a command on a ship without restarting the service:

```bash
node ~/fleetmesh/bin/fleetmesh.js add-command temp --config /etc/fleetmesh/ship.config.json --timeout 5
${EDITOR:-vi} /etc/fleetmesh/scripts/temp.sh
```

The running service reloads config on every Telegram message.

Built-in repo skills are registered by install/update:

```text
skills/all/status.sh
skills/romulus/latest_temp.py
```

Romulus temperature command:

```text
/run @romulus temps
```

Edit the vault later with:

```bash
ansible-vault edit fleetmesh.vault.yml
```

Update FleetMesh after pushing repo changes:

```bash
ansible-playbook -i /path/to/inventory.ini fleetmesh_update.yml -e @fleetmesh.vault.yml --ask-vault-pass
```

Update only one ship:

```bash
ansible-playbook -i /path/to/inventory.ini fleetmesh_update.yml -e @fleetmesh.vault.yml --ask-vault-pass --limit romulus
```

## Grafana temperatures

`grafana_install.yml` installs Grafana on `romulus`, installs the SQLite data
source plugin, and provisions the local SDR temperature database as `SDR
Temperatures`. It does not provision a dashboard, so the first dashboard can be
created and refined in Grafana without an Ansible change. Its service can see
the home directory read-only, but filesystem ACLs grant Grafana access only to
the temperature database path.

Add an administrator password to the same vault:

```yaml
grafana_admin_password: "use-a-unique-long-password"
```

The expected temperature database is `~/sdr/sdr/temps.db`. Override it in the
vault when yours lives elsewhere:

```yaml
grafana_temperature_db_path: "/absolute/path/to/temps.db"
```

Install Grafana:

```bash
ansible-playbook -i /path/to/inventory.ini grafana_install.yml -e @fleetmesh.vault.yml --ask-vault-pass
```

After the playbook finishes, open `http://romulus:3000` and sign in with the
vault credentials. The `SDR Temperatures` datasource is ready to query.

## Grafana Cloud temperatures

`grafana_cloud_install.yml` keeps the local Grafana setup intact and sends new
temperature readings from `romulus` to Grafana Cloud every minute. It installs
Grafana Alloy and a loopback-only Prometheus exporter that reads the existing
temperature server.

In Grafana Cloud, open your stack's Prometheus details to get the remote-write
URL and username. Create an access-policy token that can write metrics, then
add all three values to the vault:

```yaml
grafana_cloud_prometheus_url: "https://prometheus-...grafana.net/api/prom/push"
grafana_cloud_prometheus_username: "YOUR_METRICS_INSTANCE_ID"
grafana_cloud_metrics_write_token: "YOUR_ACCESS_POLICY_TOKEN"
```

Push the FleetMesh changes and update Romulus first, so the exporter is present
in its `~/fleetmesh` checkout:

```bash
ansible-playbook -i /path/to/inventory.ini fleetmesh_update.yml -e @fleetmesh.vault.yml --ask-vault-pass --limit romulus
```

Install the Cloud bridge:

```bash
ansible-playbook -i /path/to/inventory.ini grafana_cloud_install.yml -e @fleetmesh.vault.yml --ask-vault-pass
```

After one minute, create panels in Grafana Cloud with these metric names:

```text
sdr_temperature_fahrenheit
sdr_humidity_percent
sdr_temperature_reading_age_seconds
```

Each metric has `room` and `ship` labels. The Cloud bridge starts collecting new
points after installation; it does not copy the existing SQLite history.
