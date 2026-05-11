import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

export async function startTelegramPolling(agent, botToken) {
  let offset = 0;
  console.log(`FleetMesh ship ${agent.config.ship.id} listening for Telegram commands.`);

  for (;;) {
    const updates = await telegramRequest(botToken, "getUpdates", {
      offset,
      timeout: 25,
      allowed_updates: ["message"],
    });

    for (const update of updates.result ?? []) {
      offset = Math.max(offset, update.update_id + 1);
      const message = update.message;
      if (!message?.text) continue;

      const replies = await agent.handleText({
        text: stripBotSuffix(message.text, agent.config.telegram?.botUsername),
        chatId: message.chat.id,
        userId: message.from?.id,
      });

      for (const reply of replies) await sendReply(botToken, message.chat.id, reply);
    }
  }
}

async function sendReply(botToken, chatId, reply) {
  await telegramRequest(botToken, "sendMessage", {
    chat_id: chatId,
    text: reply.text.slice(0, 3900),
  });

  for (const attachment of reply.attachments ?? []) {
    await sendAttachment(botToken, chatId, attachment);
  }
}

async function sendAttachment(botToken, chatId, attachment) {
  const path = resolve(attachment.path);
  const extension = extname(path).toLowerCase();
  const method = [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extension)
    ? "sendPhoto"
    : "sendDocument";
  const fileField = method === "sendPhoto" ? "photo" : "document";
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (attachment.caption) form.set("caption", attachment.caption);
  form.set(fileField, new Blob([await readFile(path)]));
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status}`);
}

async function telegramRequest(botToken, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status}`);
  return response.json();
}

function stripBotSuffix(text, botUsername) {
  if (!botUsername) return text;
  return text.replace(new RegExp(`^(/\\w+)@${escapeRegExp(botUsername)}\\b`, "i"), "$1");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
