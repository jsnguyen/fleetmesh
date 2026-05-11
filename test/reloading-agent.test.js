import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addCommand } from "../src/add-command.js";
import { loadRuntimeConfig } from "../src/config.js";
import { initShip } from "../src/init.js";
import { createReloadingShipAgent } from "../src/ship-agent.js";

test("reloading agent picks up commands added after startup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-reload-"));
  const configPath = join(dir, "ship.config.json");
  await initShip({ configPath, shipId: "ship-one" });
  await allowTestUser(configPath);

  const runner = fakeRunner();
  const agent = createReloadingShipAgent(
    () => loadRuntimeConfig(configPath),
    { runner },
  );

  assert.deepEqual(await agent.handleText({
    text: "/run @ship-one temp",
    chatId: 1,
    userId: 2,
  }), []);

  await addCommand({ configPath, name: "temp" });
  const replies = await agent.handleText({
    text: "/run @ship-one temp",
    chatId: 1,
    userId: 2,
  });

  assert.equal(runner.calls.length, 1);
  assert.match(replies[0].text, /ran temp/);
});

async function allowTestUser(configPath) {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.telegram.allowedChatIds = [1];
  config.telegram.allowedUserIds = [2];
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function fakeRunner() {
  return {
    calls: [],
    async run(command) {
      this.calls.push(command);
      return {
        ok: true,
        output: {
          text: `ran ${command.script.split("/").at(-1).replace(".sh", "")}`,
          attachments: [],
        },
      };
    },
  };
}
