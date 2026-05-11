import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  launchAgentPlist,
  sanitizeServiceName,
  systemdUnit,
  writeLaunchAgent,
  writeSystemdService,
} from "../src/service.js";

test("sanitizes service names", () => {
  assert.equal(sanitizeServiceName("Sensor Ship!"), "sensor-ship");
});

test("generates launchd plist", () => {
  const plist = launchAgentPlist({
    label: "com.fleetmesh.sensor",
    nodePath: "/usr/local/bin/node",
    binPath: "/app/bin/fleetmesh.js",
    configPath: "/ships/sensor/ship.config.json",
    stdoutPath: "/logs/out.log",
    stderrPath: "/logs/err.log",
  });

  assert.match(plist, /com\.fleetmesh\.sensor/);
  assert.match(plist, /KeepAlive/);
  assert.match(plist, /ship\.config\.json/);
});

test("generates systemd unit", () => {
  const unit = systemdUnit({
    description: "FleetMesh ship agent",
    nodePath: "/usr/bin/env node",
    binPath: "/opt/fleetmesh/bin/fleetmesh.js",
    configPath: "/etc/fleetmesh/ship.config.json",
    credentialsPath: "/etc/fleetmesh/.tgcreds.json",
    user: "fleetmesh",
    group: "fleetmesh",
    workingDirectory: "/opt/fleetmesh",
  });

  assert.match(unit, /After=network-online\.target/);
  assert.match(unit, /ExecStart=\/usr\/bin\/env node \/opt\/fleetmesh\/bin\/fleetmesh\.js --config \/etc\/fleetmesh\/ship\.config\.json --creds \/etc\/fleetmesh\/\.tgcreds\.json/);
  assert.match(unit, /WantedBy=multi-user\.target/);
});

test("writes systemd service unit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-systemd-"));
  const result = await writeSystemdService({
    configPath: join(dir, "ship.config.json"),
    credentialsPath: join(dir, ".tgcreds.json"),
    name: "fleetmesh",
    systemdDir: join(dir, "systemd"),
    nodePath: "/usr/bin/env node",
    binPath: "/opt/fleetmesh/bin/fleetmesh.js",
    user: "fleetmesh",
    group: "fleetmesh",
  });

  assert.equal(result.serviceName, "fleetmesh");
  assert.match(await readFile(result.unitPath, "utf8"), /fleetmesh\.js/);
});

test("writes launch agent plist", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-service-"));
  const result = await writeLaunchAgent({
    configPath: join(dir, "ship.config.json"),
    name: "sensor",
    launchAgentsDir: join(dir, "LaunchAgents"),
    logDir: join(dir, "Logs"),
    nodePath: "/usr/local/bin/node",
    binPath: "/repo/bin/fleetmesh.js",
  });

  assert.equal(result.label, "com.fleetmesh.sensor");
  assert.match(await readFile(result.plistPath, "utf8"), /com\.fleetmesh\.sensor/);
});
