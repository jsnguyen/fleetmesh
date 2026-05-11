import { parseFleetCommand } from "./commands.js";
import { nullLogger } from "./logger.js";
import { createScriptRunner } from "./script-runner.js";
import { formatCommandFailure, formatCommandSuccess } from "./telegram-format.js";
import { authorizeMessage, targetMatchesShip } from "./targeting.js";

export function createShipAgent(config, options = {}) {
  const logger = options.logger ?? nullLogger;
  const runner = options.runner ?? createScriptRunner({
    configDir: options.configDir,
    logger,
  });

  return {
    config,
    async handleText(message) {
      return handleTextWithConfig(config, runner, message, logger);
    },
  };
}

export function createReloadingShipAgent(loadRuntimeConfig, options = {}) {
  const logger = options.logger ?? nullLogger;
  let lastConfig = options.initialConfig;
  let lastConfigDir = options.initialConfigDir;

  return {
    get config() {
      return lastConfig;
    },
    async getConfig() {
      const runtime = await loadRuntimeConfig();
      lastConfig = runtime.config;
      lastConfigDir = runtime.configDir;
      return runtime.config;
    },
    async handleText(message) {
      const runtime = await loadRuntimeConfig();
      lastConfig = runtime.config;
      lastConfigDir = runtime.configDir;
      const runner = options.runner ?? createScriptRunner({
        configDir: lastConfigDir,
        logger,
      });
      return handleTextWithConfig(runtime.config, runner, message, logger);
    },
  };
}

async function handleTextWithConfig(config, runner, message, logger) {
  const auth = authorizeMessage(config.telegram, message);
  if (!auth.ok) {
    logger.warn("message_unauthorized", {
      shipId: config.ship.id,
      reason: auth.reason,
      chatId: auth.chatId,
      userId: auth.userId,
      text: truncate(message.text, 200),
      allowedChatIds: auth.allowedChatIds,
      allowedUserIds: auth.allowedUserIds,
    });
    return [];
  }

  const parsed = parseFleetCommand(message.text);
  if (!parsed) {
    logger.debug("message_ignored_non_command", {
      shipId: config.ship.id,
      chatId: message.chatId,
      userId: message.userId,
    });
    return [];
  }

  logger.info("command_received", {
    shipId: config.ship.id,
    kind: parsed.kind,
    target: parsed.target,
    command: parsed.command,
    argCount: parsed.args?.length ?? 0,
    args: parsed.args,
    chatId: message.chatId,
    userId: message.userId,
  });

  if (parsed.kind === "fleet") {
    return [{
      text: `${config.ship.name} (${config.ship.id}) online`,
    }];
  }

  if (parsed.kind === "commands") {
    return [{
      text: formatCommandList(config),
    }];
  }

  if (!targetMatchesShip(config.ship, parsed.target)) {
    logger.debug("command_ignored_target_mismatch", {
      shipId: config.ship.id,
      target: parsed.target,
      command: parsed.command,
    });
    return [];
  }

  const command = config.commands?.[parsed.command];
  if (!command) {
    logger.info("command_unsupported", {
      shipId: config.ship.id,
      target: parsed.target,
      command: parsed.command,
    });

    if (parsed.target) {
      return [{
        text: `${config.ship.name} / ${parsed.command}\nUnsupported command.`,
      }];
    }

    return [];
  }

  const result = await runner.run(command, parsed.args);
  if (result.ok) {
    logger.info("command_completed", {
      shipId: config.ship.id,
      command: parsed.command,
      exitCode: result.exitCode,
      attachmentCount: result.output.attachments?.length ?? 0,
    });
    return [formatCommandSuccess(config.ship, parsed.command, result.output)];
  }
  logger.warn("command_failed", {
    shipId: config.ship.id,
    command: parsed.command,
    exitCode: result.exitCode,
    stderr: truncate(result.stderr),
  });
  return [formatCommandFailure(config.ship, parsed.command, result)];
}

function formatCommandList(config) {
  const names = Object.keys(config.commands ?? {}).sort();
  const header = `${config.ship.name} (${config.ship.id}) commands`;
  if (names.length === 0) return `${header}\nNo commands configured.`;
  return `${header}\n${names.map((name) => `- ${name}`).join("\n")}`;
}

function truncate(value, maxLength = 500) {
  if (!value) return "";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
