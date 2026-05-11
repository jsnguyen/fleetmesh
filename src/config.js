import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { applyTelegramCredentials } from "./credentials.js";

export async function loadRuntimeConfig(configPath, options = {}) {
  const resolvedConfigPath = resolve(configPath);
  const credentialsPath = options.credentialsPath
    ? resolve(options.credentialsPath)
    : `${homedir()}/.tgcreds.json`;
  const fileConfig = JSON.parse(await readFile(resolvedConfigPath, "utf8"));
  const config = await applyTelegramCredentials(fileConfig, {
    credentialsPath: options.credentialsPath,
  });

  return {
    config,
    configPath: resolvedConfigPath,
    configDir: dirname(resolvedConfigPath),
    credentialsPath,
  };
}
