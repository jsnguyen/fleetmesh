import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addCommand } from "../src/add-command.js";
import { initShip } from "../src/init.js";

test("adds a command and creates a default script", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-add-command-"));
  const configPath = join(dir, "ship.config.json");
  await initShip({ configPath, shipId: "ship-one" });

  const result = await addCommand({
    configPath,
    name: "temp",
    timeoutSeconds: 7,
  });

  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.deepEqual(config.commands.temp, {
    script: "./scripts/temp.sh",
    timeoutSeconds: 7,
  });
  assert.equal(result.createdScript, true);
  assert.match(await readFile(result.scriptPath, "utf8"), /temp command is wired up/);
});

test("refuses to overwrite command unless forced", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-add-command-"));
  const configPath = join(dir, "ship.config.json");
  await initShip({ configPath, shipId: "ship-one" });

  await addCommand({ configPath, name: "temp" });
  await assert.rejects(() => addCommand({ configPath, name: "temp" }), /already exists/);
});
