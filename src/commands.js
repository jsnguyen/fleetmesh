export function parseFleetCommand(text) {
  const tokens = splitArgs(text ?? "");
  if (tokens.length === 0) return null;

  const [head, ...rest] = tokens;
  if (head === "/fleet") return { kind: "fleet" };
  if (head === "/commands") return { kind: "commands" };
  if (head !== "/run") return null;

  let target = null;
  let command;
  let args;

  if (rest[0]?.startsWith("@")) {
    target = rest[0];
    command = rest[1];
    args = rest.slice(2);
  } else {
    command = rest[0];
    args = rest.slice(1);
  }

  if (!command) return null;
  return { kind: "run", target, command, args };
}

export function splitArgs(input) {
  const args = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for (const char of input.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) args.push(current);
  return args;
}
