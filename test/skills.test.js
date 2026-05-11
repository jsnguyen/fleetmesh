import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("romulus temps skill formats latest readings in room order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-skill-"));
  const tempsPath = join(dir, "temps.json");
  await writeFile(tempsPath, JSON.stringify({
    Garage: {
      temp_f: 66,
      humidity: null,
      time: "2026-05-11T01:02:00",
    },
    Bedroom: {
      temp_f: 71.234,
      humidity: 44.44,
      time: "2026-05-11T01:00:00",
    },
    "Living Room": {
      temp_f: 70.01,
      humidity: 40.2,
      time: "2026-05-11T01:01:00",
    },
  }));

  const result = await run("python3", ["skills/romulus/latest_temp.py"], {
    FLEETMESH_TEMPS_URL: `file://${tempsPath}`,
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /🌡️ Temps — 2026-05-11/);
  assert.match(result.stdout, /🛏️ Bedroom: 71\.2°F  44%/);
  assert.match(result.stdout, /🛋️ Living Room: 70\.0°F  40%/);
  assert.match(result.stdout, /🛠️ Garage: 66\.0°F/);
  assert.match(result.stdout, /🕒 Bedroom 01:00, Living Room 01:01, Garage 01:02/);
  assert.ok(result.stdout.indexOf("Bedroom") < result.stdout.indexOf("Living Room"));
  assert.ok(result.stdout.indexOf("Living Room") < result.stdout.indexOf("Garage"));
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
