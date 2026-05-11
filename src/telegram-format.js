import { resolve } from "node:path";

export function formatCommandSuccess(ship, commandName, output) {
  const text = output.text?.trim()
    ? `${ship.name} / ${commandName}\n${output.text.trim()}`
    : `${ship.name} / ${commandName}\nDone.`;

  return {
    text,
    attachments: output.attachments ?? [],
  };
}

export function formatCommandFailure(ship, commandName, result) {
  const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
  return {
    text: `${ship.name} / ${commandName}\nFailed${result.exitCode === null ? "" : ` (${result.exitCode})`}.${details ? `\n${details}` : ""}`,
    attachments: [],
  };
}

export function resolveAttachmentPath(configDir, attachment) {
  return {
    ...attachment,
    path: resolve(configDir, attachment.path),
  };
}
