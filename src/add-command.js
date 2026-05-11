import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function addCommand(options = {}) {
  if (!options.name) throw new Error("Missing command name.");

  const configPath = resolve(options.configPath ?? "ship.config.json");
  const configDir = dirname(configPath);
  const script = options.script ?? `./scripts/${options.name}.sh`;
  const scriptPath = resolve(configDir, script);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.commands ??= {};

  if (config.commands[options.name] && !options.force) {
    throw new Error(`Command already exists: ${options.name}. Pass --force to overwrite it.`);
  }

  config.commands[options.name] = {
    script,
    timeoutSeconds: options.timeoutSeconds ?? 30,
  };

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  let createdScript = false;
  if (!await exists(scriptPath)) {
    await mkdir(dirname(scriptPath), { recursive: true });
    await writeFile(scriptPath, commandScriptTemplate(options.name));
    await chmod(scriptPath, 0o755);
    createdScript = true;
  }

  return {
    configPath,
    scriptPath,
    commandName: options.name,
    createdScript,
  };
}

function commandScriptTemplate(name) {
  return `#!/usr/bin/env bash
set -euo pipefail

echo "${name} command is wired up."
`;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
