import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseCommandOutput, runScript } from "../src/script-runner.js";

test("plain stdout becomes text output", () => {
  assert.deepEqual(parseCommandOutput("hello\n"), { text: "hello" });
});

test("json stdout becomes text with attachments", () => {
  assert.deepEqual(parseCommandOutput('{"text":"hi","attachments":[{"path":"./a.png","caption":"A"}]}', "/tmp/base"), {
    text: "hi",
    attachments: [{ path: "/tmp/base/a.png", caption: "A" }],
  });
});

test("runs a local script", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-"));
  const script = join(dir, "ok.sh");
  await writeFile(script, "#!/usr/bin/env bash\necho done\n");
  await chmod(script, 0o755);

  const result = await runScript({ script: "./ok.sh", timeoutSeconds: 2 }, [], dir);
  assert.equal(result.ok, true);
  assert.deepEqual(result.output, { text: "done" });
});

test("captures failing script stderr", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleetmesh-"));
  const script = join(dir, "fail.sh");
  await writeFile(script, "#!/usr/bin/env bash\necho nope >&2\nexit 7\n");
  await chmod(script, 0o755);

  const result = await runScript({ script: "./fail.sh", timeoutSeconds: 2 }, [], dir);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 7);
  assert.match(result.stderr, /nope/);
});
