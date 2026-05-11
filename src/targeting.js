export function isAuthorized(telegramConfig = {}, message) {
  const chatIds = telegramConfig.allowedChatIds ?? [];
  const userIds = telegramConfig.allowedUserIds ?? [];

  if (chatIds.length > 0 && !chatIds.includes(message.chatId)) return false;
  if (userIds.length > 0 && !userIds.includes(message.userId)) return false;
  return true;
}

export function targetMatchesShip(ship, target) {
  if (!target) return true;
  if (target.startsWith("@")) return ship.id === target.slice(1);
  return false;
}
