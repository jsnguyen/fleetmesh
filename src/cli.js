import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { applyTelegramCredentials } from "./credentials.js";
import { initShip } from "./init.js";
import { createShipAgent } from "./ship-agent.js";
import { startTelegramPolling } from "./telegram.js";

export async function main(argv) {
  if (argv[0] === "init") {
    const result = await initShip({
      configPath: readArg(argv, "--config"),
      shipId: readArg(argv, "--id"),
      shipName: readArg(argv, "--name"),
      tags: readListArg(argv, "--tags"),
      botUsername: readArg(argv, "--bot-username"),
      force: hasFlag(argv, "--force"),
    });
    console.log(`Initialized ship ${result.shipId}`);
    console.log(`Config: ${result.configPath}`);
    console.log(`Status script: ${result.statusScriptPath}`);
    return;
  }

  const configPath = readArg(argv, "--config") ?? "ship.config.json";
  const credentialsPath = readArg(argv, "--creds");
  const onceMessage = readArg(argv, "--message");
  const fileConfig = JSON.parse(await readFile(configPath, "utf8"));
  const config = await applyTelegramCredentials(fileConfig, { credentialsPath });
  const agent = createShipAgent(config, {
    configDir: dirname(resolve(configPath)),
  });

  if (onceMessage) {
    const replies = await agent.handleText({
      text: onceMessage,
      chatId: config.telegram?.allowedChatIds?.[0] ?? 0,
      userId: config.telegram?.allowedUserIds?.[0] ?? 0,
    });
    for (const reply of replies) {
      console.log(reply.text);
      for (const attachment of reply.attachments ?? []) {
        console.log(`attachment: ${attachment.path}`);
      }
    }
    return;
  }

  if (!config.telegram?.botToken) {
    throw new Error("Missing Telegram bot token. Set telegram.botToken or create ~/.tgcreds.json.");
  }

  await startTelegramPolling(agent, config.telegram.botToken);
}

function readArg(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function readListArg(argv, name) {
  const value = readArg(argv, name);
  if (!value) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function hasFlag(argv, name) {
  return argv.includes(name);
}
