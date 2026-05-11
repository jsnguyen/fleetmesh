import { addCommand } from "./add-command.js";
import { loadRuntimeConfig } from "./config.js";
import { initShip } from "./init.js";
import { createLogger, nullLogger } from "./logger.js";
import { writeLaunchAgent, writeSystemdService } from "./service.js";
import { createReloadingShipAgent, createShipAgent } from "./ship-agent.js";
import { startTelegramPolling } from "./telegram.js";

export async function main(argv) {
  if (argv[0] === "init") {
    const result = await initShip({
      configPath: readArg(argv, "--config"),
      shipId: readArg(argv, "--id"),
      shipName: readArg(argv, "--name"),
      botUsername: readArg(argv, "--bot-username"),
      force: hasFlag(argv, "--force"),
    });
    console.log(`Initialized ship ${result.shipId}`);
    console.log(`Config: ${result.configPath}`);
    console.log(`Status script: ${result.statusScriptPath}`);
    return;
  }

  if (argv[0] === "add-command") {
    const result = await addCommand({
      configPath: readArg(argv, "--config"),
      name: argv[1],
      script: readArg(argv, "--script"),
      timeoutSeconds: readNumberArg(argv, "--timeout"),
      force: hasFlag(argv, "--force"),
    });
    console.log(`Added command ${result.commandName}`);
    console.log(`Config: ${result.configPath}`);
    console.log(`${result.createdScript ? "Created" : "Using"} script: ${result.scriptPath}`);
    return;
  }

  if (argv[0] === "service" && argv[1] === "install") {
    const result = await writeSystemdService({
      configPath: readArg(argv, "--config"),
      credentialsPath: readArg(argv, "--creds"),
      name: readArg(argv, "--name"),
      user: readArg(argv, "--user"),
      group: readArg(argv, "--group"),
      systemdDir: readArg(argv, "--systemd-dir"),
    });
    console.log(`Installed systemd service ${result.serviceName}.service`);
    console.log(`Unit: ${result.unitPath}`);
    console.log(`Start it with: systemctl enable --now ${result.serviceName}.service`);
    return;
  }

  if (argv[0] === "service" && argv[1] === "install-launchd") {
    const result = await writeLaunchAgent({
      configPath: readArg(argv, "--config"),
      name: readArg(argv, "--name"),
      launchAgentsDir: readArg(argv, "--launch-agents-dir"),
      logDir: readArg(argv, "--log-dir"),
    });
    console.log(`Installed launchd service ${result.label}`);
    console.log(`Plist: ${result.plistPath}`);
    console.log(`Start it with: launchctl bootstrap gui/$(id -u) ${result.plistPath}`);
    return;
  }

  const configPath = readArg(argv, "--config") ?? "ship.config.json";
  const credentialsPath = readArg(argv, "--creds");
  const onceMessage = readArg(argv, "--message");
  const loadConfig = () => loadRuntimeConfig(configPath, { credentialsPath });
  const runtime = await loadConfig();
  const config = runtime.config;
  const logger = onceMessage ? nullLogger : createLogger();
  const agent = onceMessage
    ? createShipAgent(config, { configDir: runtime.configDir, logger })
    : createReloadingShipAgent(loadConfig, {
        initialConfig: config,
        initialConfigDir: runtime.configDir,
        logger,
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

  await startTelegramPolling(agent, config.telegram.botToken, { logger });
}

function readArg(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function readNumberArg(argv, name) {
  const value = readArg(argv, name);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a number.`);
  return number;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}
