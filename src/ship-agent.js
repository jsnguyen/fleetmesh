import { parseFleetCommand } from "./commands.js";
import { createScriptRunner } from "./script-runner.js";
import { formatCommandFailure, formatCommandSuccess } from "./telegram-format.js";
import { isAuthorized, targetMatchesShip } from "./targeting.js";

export function createShipAgent(config, options = {}) {
  const runner = options.runner ?? createScriptRunner({
    configDir: options.configDir,
  });

  return {
    config,
    async handleText(message) {
      return handleTextWithConfig(config, runner, message);
    },
  };
}

export function createReloadingShipAgent(loadRuntimeConfig, options = {}) {
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
      });
      return handleTextWithConfig(runtime.config, runner, message);
    },
  };
}

async function handleTextWithConfig(config, runner, message) {
  if (!isAuthorized(config.telegram, message)) return [];

  const parsed = parseFleetCommand(message.text);
  if (!parsed) return [];

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

  if (!targetMatchesShip(config.ship, parsed.target)) return [];

  const command = config.commands?.[parsed.command];
  if (!command) return [];

  const result = await runner.run(command, parsed.args);
  if (result.ok) return [formatCommandSuccess(config.ship, parsed.command, result.output)];
  return [formatCommandFailure(config.ship, parsed.command, result)];
}

function formatCommandList(config) {
  const names = Object.keys(config.commands ?? {}).sort();
  const header = `${config.ship.name} (${config.ship.id}) commands`;
  if (names.length === 0) return `${header}\nNo commands configured.`;
  return `${header}\n${names.map((name) => `- ${name}`).join("\n")}`;
}
