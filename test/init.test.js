import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import test from "node:test";
import { buildShipConfig, initShip, sanitizeShipId } from "../src/init.js";

test("sanitizes ship ids", () => {
  assert.equal(sanitizeShipId("My Laptop.local"), "my-laptop-local");
  assert.equal(sanitizeShipId(" sensor_ship "), "sensor_ship");
});

test("builds minimal ship config", () => {
  assert.deepEqual(buildShipConfig({
    shipId: "sensor-ship",
    shipName: "Temperature Server",
  }), {
    ship: {
      id: "sensor-ship",
      name: "Temperature Server",
    },
    telegram: {
      botUsername: "",
    },
    commands: {
      status: {
        script: "./scripts/status.sh",
        timeoutSeconds: 5,
      },
    },
  });
});

test("initializes config and status script", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-init-"));
  const configPath = join(dir, "ship.config.json");

  const result = await initShip({
    configPath,
    shipId: "sensor-ship",
    shipName: "Temperature Server",
  });

  const config = JSON.parse(await readFile(result.configPath, "utf8"));
  assert.equal(config.ship.id, "sensor-ship");
  assert.equal(config.ship.name, "Temperature Server");
  assert.match(await readFile(result.statusScriptPath, "utf8"), /uptime/);
  assert.equal((await stat(result.statusScriptPath)).mode & 0o111, 0o111);
});

test("refuses to overwrite an existing config by default", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-init-"));
  const configPath = join(dir, "ship.config.json");

  await initShip({ configPath, shipId: "one" });
  await assert.rejects(() => initShip({ configPath, shipId: "two" }), /already exists/);
});
