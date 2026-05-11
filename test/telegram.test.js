import assert from "node:assert/strict";
import test from "node:test";
import { buildSendMessagePayload } from "../src/telegram.js";

test("send message payload enables Markdown for code block replies", () => {
  assert.deepEqual(buildSendMessagePayload(123, "```\nCPU 0.01\n```"), {
    chat_id: 123,
    text: "```\nCPU 0.01\n```",
    parse_mode: "Markdown",
  });
});

test("send message payload leaves plain replies unparsed", () => {
  assert.deepEqual(buildSendMessagePayload(123, "Done."), {
    chat_id: 123,
    text: "Done.",
  });
});
