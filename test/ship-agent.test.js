import assert from "node:assert/strict";
import test from "node:test";
import { createShipAgent } from "../src/ship-agent.js";

const config = {
  ship: {
    id: "sensor-ship",
    name: "Temperature Server",
    tags: ["sensor", "home"],
  },
  telegram: {
    allowedChatIds: [1],
    allowedUserIds: [2],
  },
  commands: {
    temp: { script: "./temp.sh" },
    status: { script: "./status.sh" },
  },
};

test("ignores unauthorized messages", async () => {
  const agent = createShipAgent(config, { runner: fakeRunner() });
  assert.deepEqual(await agent.handleText({ text: "/fleet", chatId: 99, userId: 2 }), []);
});

test("responds to fleet command", async () => {
  const agent = createShipAgent(config, { runner: fakeRunner() });
  const replies = await agent.handleText({ text: "/fleet", chatId: 1, userId: 2 });
  assert.match(replies[0].text, /Temperature Server/);
  assert.match(replies[0].text, /sensor/);
});

test("only matching target runs command", async () => {
  const runner = fakeRunner();
  const agent = createShipAgent(config, { runner });
  assert.deepEqual(await agent.handleText({ text: "/run @other temp", chatId: 1, userId: 2 }), []);
  assert.equal(runner.calls.length, 0);
});

test("tag target runs command", async () => {
  const runner = fakeRunner();
  const agent = createShipAgent(config, { runner });
  const replies = await agent.handleText({ text: "/run tag:sensor temp", chatId: 1, userId: 2 });
  assert.equal(runner.calls.length, 1);
  assert.match(replies[0].text, /72.4 F/);
});

function fakeRunner() {
  return {
    calls: [],
    async run(command, args) {
      this.calls.push({ command, args });
      return {
        ok: true,
        output: {
          text: "Current: 72.4 F",
          attachments: [],
        },
      };
    },
  };
}
