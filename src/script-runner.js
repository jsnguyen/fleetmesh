import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function createScriptRunner({ configDir = process.cwd() } = {}) {
  return {
    run(command, args = []) {
      return runScript(command, args, configDir);
    },
  };
}

export async function runScript(command, args, configDir) {
  if (!command?.script) {
    return { ok: false, exitCode: 1, stderr: "Command has no script configured." };
  }

  const scriptPath = resolve(configDir, command.script);
  const timeoutMs = Math.max(1, command.timeoutSeconds ?? 30) * 1000;

  try {
    await access(scriptPath);
  } catch {
    return { ok: false, exitCode: 127, stderr: `Script not found: ${scriptPath}` };
  }

  return new Promise((resolveResult) => {
    const child = spawn(scriptPath, args, {
      cwd: dirname(scriptPath),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolveResult({
        ok: false,
        exitCode: null,
        stdout,
        stderr: `Timed out after ${command.timeoutSeconds ?? 30}s`,
      });
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({ ok: false, exitCode: 1, stdout, stderr: error.message });
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = parseCommandOutput(stdout, dirname(scriptPath));
      resolveResult({
        ok: exitCode === 0,
        exitCode,
        stdout,
        stderr,
        output,
      });
    });
  });
}

export function parseCommandOutput(stdout, attachmentBaseDir = process.cwd()) {
  const trimmed = stdout.trim();
  if (!trimmed) return { text: "" };

  try {
    const parsed = JSON.parse(trimmed);
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      attachments: Array.isArray(parsed.attachments)
        ? parsed.attachments
            .filter((item) => item && typeof item.path === "string")
            .map((item) => ({
              path: resolve(attachmentBaseDir, item.path),
              caption: typeof item.caption === "string" ? item.caption : undefined,
            }))
        : [],
    };
  } catch {
    return { text: stdout.trimEnd() };
  }
}
