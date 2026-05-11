import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createShipAgent } from "./ship-agent.js";
import { startTelegramPolling } from "./telegram.js";

export async function main(argv) {
  const configPath = readArg(argv, "--config") ?? "ship.config.json";
  const onceMessage = readArg(argv, "--message");
  const config = JSON.parse(await readFile(configPath, "utf8"));
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
    throw new Error("Missing telegram.botToken. Use --message for local command testing.");
  }

  await startTelegramPolling(agent, config.telegram.botToken);
}

function readArg(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}
