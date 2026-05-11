import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createLogger } from "./logger.js";

export async function startTelegramPolling(agent, botToken, options = {}) {
  const logger = options.logger ?? createLogger();
  let offset = 0;
  const initialConfig = await resolveAgentConfig(agent);
  logger.info("telegram_polling_started", {
    shipId: initialConfig.ship.id,
    botUsername: initialConfig.telegram?.botUsername,
    allowedChatIds: initialConfig.telegram?.allowedChatIds,
    allowedUserIds: initialConfig.telegram?.allowedUserIds,
  });

  for (;;) {
    let updates;
    try {
      updates = await telegramRequest(botToken, "getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message"],
      });
    } catch (error) {
      logger.error("telegram_poll_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(5000);
      continue;
    }

    logger.info("telegram_poll_result", {
      offset,
      updateCount: updates.result?.length ?? 0,
    });

    for (const update of updates.result ?? []) {
      offset = Math.max(offset, update.update_id + 1);
      const message = update.message;
      if (!message?.text) {
        logger.debug("telegram_update_ignored_no_text", {
          updateId: update.update_id,
          messageId: message?.message_id,
          chatId: message?.chat?.id,
          chatType: message?.chat?.type,
          userId: message?.from?.id,
        });
        continue;
      }
      const config = await resolveAgentConfig(agent);
      const text = stripBotSuffix(message.text, config.telegram?.botUsername);
      const botSuffixStripped = text !== message.text;

      logger.info("telegram_message_received", {
        updateId: update.update_id,
        messageId: message.message_id,
        chatId: message.chat.id,
        chatType: message.chat.type,
        chatTitle: message.chat.title,
        chatUsername: message.chat.username,
        userId: message.from?.id,
        fromUsername: message.from?.username,
        originalText: summarizeText(message.text),
        normalizedText: summarizeText(text),
        botSuffixStripped,
      });

      const replies = await agent.handleText({
        text,
        chatId: message.chat.id,
        userId: message.from?.id,
      });

      logger.info("telegram_replies_prepared", {
        updateId: update.update_id,
        chatId: message.chat.id,
        chatType: message.chat.type,
        chatTitle: message.chat.title,
        replyCount: replies.length,
        replies: replies.map((reply) => ({
          text: summarizeText(reply.text),
          attachmentCount: reply.attachments?.length ?? 0,
        })),
      });

      for (const reply of replies) {
        try {
          await sendReply(botToken, {
            id: message.chat.id,
            type: message.chat.type,
            title: message.chat.title,
          }, reply, logger);
        } catch (error) {
          logger.error("telegram_reply_error", {
            chatId: message.chat.id,
            chatType: message.chat.type,
            chatTitle: message.chat.title,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
}

async function resolveAgentConfig(agent) {
  if (typeof agent.getConfig === "function") return agent.getConfig();
  return agent.config;
}

async function sendReply(botToken, chat, reply, logger) {
  await telegramRequest(botToken, "sendMessage", {
    chat_id: chat.id,
    text: reply.text.slice(0, 3900),
  });
  logger.info("telegram_reply_sent", {
    chatId: chat.id,
    chatType: chat.type,
    chatTitle: chat.title,
    replyText: summarizeText(reply.text),
    textBytes: Buffer.byteLength(reply.text),
    attachmentCount: reply.attachments?.length ?? 0,
  });

  for (const attachment of reply.attachments ?? []) {
    await sendAttachment(botToken, chat.id, attachment, logger);
  }
}

async function sendAttachment(botToken, chatId, attachment, logger) {
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
  logger.info("telegram_attachment_sent", {
    chatId,
    method,
    path,
  });
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

function summarizeText(text) {
  const trimmed = text.trim();
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 120)}...`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
