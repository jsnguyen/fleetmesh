export function isAuthorized(telegramConfig = {}, message) {
  return authorizeMessage(telegramConfig, message).ok;
}

export function authorizeMessage(telegramConfig = {}, message) {
  const chatIds = telegramConfig.allowedChatIds ?? [];
  const userIds = telegramConfig.allowedUserIds ?? [];

  if (chatIds.length > 0 && !chatIds.includes(message.chatId)) {
    return {
      ok: false,
      reason: "chat_not_allowed",
      chatId: message.chatId,
      userId: message.userId,
      allowedChatIds: chatIds,
      allowedUserIds: userIds,
    };
  }

  if (userIds.length > 0 && !userIds.includes(message.userId)) {
    return {
      ok: false,
      reason: "user_not_allowed",
      chatId: message.chatId,
      userId: message.userId,
      allowedChatIds: chatIds,
      allowedUserIds: userIds,
    };
  }

  return {
    ok: true,
    chatId: message.chatId,
    userId: message.userId,
    allowedChatIds: chatIds,
    allowedUserIds: userIds,
  };
}

export function targetMatchesShip(ship, target) {
  if (!target) return true;
  if (target.startsWith("@")) return ship.id === target.slice(1);
  return false;
}
