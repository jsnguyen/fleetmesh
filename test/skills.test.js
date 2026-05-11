import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("romulus latest_temp skill formats latest readings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-skill-"));
  const tempsPath = join(dir, "temps.json");
  await writeFile(tempsPath, JSON.stringify({
    Bedroom: {
      temp_f: 71.234,
      humidity: 44.44,
      time: "2026-05-11T01:00:00",
    },
    Garage: {
      temp_f: 66,
      humidity: null,
      time: "2026-05-11T01:01:00",
    },
  }));

  const result = await run("python3", ["skills/romulus/latest_temp.py"], {
    FLEETMESH_TEMPS_URL: `file://${tempsPath}`,
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Latest temperatures/);
  assert.match(result.stdout, /Bedroom: 71\.23 F, 44\.4% humidity/);
  assert.match(result.stdout, /Garage: 66\.00 F/);
});

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}
