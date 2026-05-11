import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export const DEFAULT_TELEGRAM_CREDENTIALS_PATH = join(homedir(), ".tgcreds.json");

export async function applyTelegramCredentials(config, options = {}) {
  const telegram = config.telegram ?? {};
  const credentialsPath = options.credentialsPath
    ?? telegram.credentialsPath
    ?? DEFAULT_TELEGRAM_CREDENTIALS_PATH;
  const credentials = await readTelegramCredentials(credentialsPath);
  if (!credentials) return config;

  const userId = normalizeUserId(credentials.user_id);
  const chatIds = normalizeChatIds(credentials);
  const nextTelegram = { ...telegram };

  if (!nextTelegram.botToken && credentials.bot_token) {
    nextTelegram.botToken = credentials.bot_token;
  }

  if (userId !== undefined) {
    if (!Array.isArray(nextTelegram.allowedUserIds) || nextTelegram.allowedUserIds.length === 0) {
      nextTelegram.allowedUserIds = [userId];
    }
  }

  if (!Array.isArray(nextTelegram.allowedChatIds) || nextTelegram.allowedChatIds.length === 0) {
    if (chatIds.length > 0) {
      nextTelegram.allowedChatIds = chatIds;
    } else if (userId !== undefined) {
      nextTelegram.allowedChatIds = [userId];
    }
  }

  return {
    ...config,
    telegram: nextTelegram,
  };
}

export async function readTelegramCredentials(path) {
  const resolvedPath = isAbsolute(path) ? path : resolve(path);

  try {
    const raw = await readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    validateCredentials(parsed, resolvedPath);
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function validateCredentials(credentials, path) {
  if (!credentials || typeof credentials !== "object") {
    throw new Error(`Invalid Telegram credentials in ${path}. Expected a JSON object.`);
  }

  if (credentials.bot_token !== undefined && typeof credentials.bot_token !== "string") {
    throw new Error(`Invalid Telegram credentials in ${path}. bot_token must be a string.`);
  }

  if (credentials.user_id !== undefined && normalizeUserId(credentials.user_id) === undefined) {
    throw new Error(`Invalid Telegram credentials in ${path}. user_id must be a number.`);
  }

  if (credentials.chat_id !== undefined && normalizeSignedInteger(credentials.chat_id) === undefined) {
    throw new Error(`Invalid Telegram credentials in ${path}. chat_id must be a number.`);
  }

  if (credentials.chat_ids !== undefined) {
    if (!Array.isArray(credentials.chat_ids)) {
      throw new Error(`Invalid Telegram credentials in ${path}. chat_ids must be an array.`);
    }

    for (const chatId of credentials.chat_ids) {
      if (normalizeSignedInteger(chatId) === undefined) {
        throw new Error(`Invalid Telegram credentials in ${path}. chat_ids must contain only numbers.`);
      }
    }
  }
}

function normalizeUserId(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function normalizeSignedInteger(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return undefined;
}

function normalizeChatIds(credentials) {
  if (Array.isArray(credentials.chat_ids)) {
    return credentials.chat_ids
      .map(normalizeSignedInteger)
      .filter((value) => value !== undefined);
  }

  const chatId = normalizeSignedInteger(credentials.chat_id);
  return chatId === undefined ? [] : [chatId];
}
