import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyTelegramCredentials, readTelegramCredentials } from "../src/credentials.js";

test("reads Telegram credentials file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-creds-"));
  const path = join(dir, ".tgcreds.json");
  await writeFile(path, JSON.stringify({ bot_token: "token", user_id: 123 }));

  assert.deepEqual(await readTelegramCredentials(path), {
    bot_token: "token",
    user_id: 123,
  });
});

test("missing credentials file is optional", async () => {
  assert.equal(await readTelegramCredentials("/tmp/fleetmesh-missing-creds.json"), null);
});

test("applies credentials without overriding config auth lists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-creds-"));
  const path = join(dir, ".tgcreds.json");
  await writeFile(path, JSON.stringify({ bot_token: "token", user_id: 123 }));

  const config = await applyTelegramCredentials({
    telegram: {
      allowedUserIds: [999],
      allowedChatIds: [888],
    },
  }, { credentialsPath: path });

  assert.equal(config.telegram.botToken, "token");
  assert.deepEqual(config.telegram.allowedUserIds, [999]);
  assert.deepEqual(config.telegram.allowedChatIds, [888]);
});

test("uses user id as default allowed user and direct chat", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-creds-"));
  const path = join(dir, ".tgcreds.json");
  await writeFile(path, JSON.stringify({ bot_token: "token", user_id: "123" }));

  const config = await applyTelegramCredentials({ telegram: {} }, { credentialsPath: path });

  assert.equal(config.telegram.botToken, "token");
  assert.deepEqual(config.telegram.allowedUserIds, [123]);
  assert.deepEqual(config.telegram.allowedChatIds, [123]);
});

test("uses chat id for group authorization when present", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-creds-"));
  const path = join(dir, ".tgcreds.json");
  await writeFile(path, JSON.stringify({ bot_token: "token", user_id: 123, chat_id: -100456 }));

  const config = await applyTelegramCredentials({ telegram: {} }, { credentialsPath: path });

  assert.equal(config.telegram.botToken, "token");
  assert.deepEqual(config.telegram.allowedUserIds, [123]);
  assert.deepEqual(config.telegram.allowedChatIds, [-100456]);
});

test("uses chat ids array for multiple authorized chats", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-creds-"));
  const path = join(dir, ".tgcreds.json");
  await writeFile(path, JSON.stringify({ bot_token: "token", user_id: 123, chat_ids: [-100456, "789"] }));

  const config = await applyTelegramCredentials({ telegram: {} }, { credentialsPath: path });

  assert.deepEqual(config.telegram.allowedChatIds, [-100456, 789]);
});
