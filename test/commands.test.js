import assert from "node:assert/strict";
import test from "node:test";
import { parseFleetCommand, splitArgs } from "../src/commands.js";

test("parses fleet and commands requests", () => {
  assert.deepEqual(parseFleetCommand("/fleet"), { kind: "fleet" });
  assert.deepEqual(parseFleetCommand("/commands"), { kind: "commands" });
});

test("parses broadcast run command", () => {
  assert.deepEqual(parseFleetCommand("/run status"), {
    kind: "run",
    target: null,
    command: "status",
    args: [],
  });
});

test("parses targeted run command", () => {
  assert.deepEqual(parseFleetCommand("/run @sensor-ship temp_graph 24h"), {
    kind: "run",
    target: "@sensor-ship",
    command: "temp_graph",
    args: ["24h"],
  });
});

test("parses quoted args", () => {
  assert.deepEqual(splitArgs('/run @ship say "hello there"'), ["/run", "@ship", "say", "hello there"]);
});
