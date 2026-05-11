import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";

export async function writeSystemdService(options = {}) {
  const configPath = resolve(options.configPath ?? "ship.config.json");
  const credentialsPath = resolve(options.credentialsPath ?? `${dirname(configPath)}/.tgcreds.json`);
  const nodePath = options.nodePath ?? "/usr/bin/env node";
  const binPath = resolve(options.binPath ?? new URL("../bin/fleetmesh.js", import.meta.url).pathname);
  const serviceName = sanitizeServiceName(options.name ?? "fleetmesh");
  const systemdDir = resolve(options.systemdDir ?? "/etc/systemd/system");
  const unitPath = resolve(systemdDir, `${serviceName}.service`);
  const user = options.user ?? "fleetmesh";
  const group = options.group ?? user;

  await mkdir(systemdDir, { recursive: true });
  await writeFile(unitPath, systemdUnit({
    description: options.description ?? `FleetMesh ship agent (${serviceName})`,
    nodePath,
    binPath,
    configPath,
    credentialsPath,
    user,
    group,
    workingDirectory: options.workingDirectory ?? dirname(binPath),
  }));
  await chmod(unitPath, 0o644);

  return {
    serviceName,
    unitPath,
  };
}

export function systemdUnit({
  description,
  nodePath,
  binPath,
  configPath,
  credentialsPath,
  user,
  group,
  workingDirectory,
}) {
  return `[Unit]
Description=${description}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${user}
Group=${group}
WorkingDirectory=${workingDirectory}
ExecStart=${nodePath} ${binPath} --config ${configPath} --creds ${credentialsPath}
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`;
}

export async function writeLaunchAgent(options = {}) {
  const configPath = resolve(options.configPath ?? "ship.config.json");
  const nodePath = resolve(options.nodePath ?? process.execPath);
  const binPath = resolve(options.binPath ?? new URL("../bin/fleetmesh.js", import.meta.url).pathname);
  const serviceName = sanitizeServiceName(options.name ?? `fleetmesh.${basename(dirname(configPath))}`);
  const label = `com.fleetmesh.${serviceName}`;
  const launchAgentsDir = resolve(options.launchAgentsDir ?? `${homedir()}/Library/LaunchAgents`);
  const logDir = resolve(options.logDir ?? `${homedir()}/Library/Logs/FleetMesh`);
  const plistPath = resolve(launchAgentsDir, `${label}.plist`);

  await mkdir(launchAgentsDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
  await writeFile(plistPath, launchAgentPlist({
    label,
    nodePath,
    binPath,
    configPath,
    stdoutPath: resolve(logDir, `${serviceName}.out.log`),
    stderrPath: resolve(logDir, `${serviceName}.err.log`),
  }));
  await chmod(plistPath, 0o644);

  return {
    label,
    plistPath,
  };
}

export function launchAgentPlist({ label, nodePath, binPath, configPath, stdoutPath, stderrPath }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>${escapeXml(binPath)}</string>
    <string>--config</string>
    <string>${escapeXml(configPath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
</dict>
</plist>
`;
}

export function sanitizeServiceName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ship";
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
