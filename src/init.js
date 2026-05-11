import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";

export async function initShip(options = {}) {
  const configPath = resolve(options.configPath ?? "ship.config.json");
  const scriptsDir = resolve(dirname(configPath), "scripts");
  const statusScriptPath = resolve(scriptsDir, "status.sh");
  const shipId = options.shipId ?? defaultShipId();
  const shipName = options.shipName ?? shipId;

  if (!options.force && await exists(configPath)) {
    throw new Error(`Config already exists: ${configPath}. Pass --force to overwrite it.`);
  }

  await mkdir(scriptsDir, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(buildShipConfig({
    shipId,
    shipName,
    botUsername: options.botUsername ?? "",
  }), null, 2)}\n`);

  if (options.force || !await exists(statusScriptPath)) {
    await writeFile(statusScriptPath, await statusScript());
    await chmod(statusScriptPath, 0o755);
  }

  return {
    configPath,
    statusScriptPath,
    shipId,
  };
}

export function buildShipConfig({ shipId, shipName, botUsername = "" }) {
  return {
    ship: {
      id: shipId,
      name: shipName,
    },
    telegram: {
      botUsername,
    },
    commands: {
      status: {
        script: "./scripts/status.sh",
        timeoutSeconds: 5,
      },
    },
  };
}

function defaultShipId() {
  return sanitizeShipId(hostname()) || "ship";
}

export function sanitizeShipId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function statusScript() {
  return readFile(new URL("../skills/all/status.sh", import.meta.url), "utf8");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
