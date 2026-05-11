const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export const nullLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export function createLogger(options = {}) {
  const level = options.level ?? process.env.FLEETMESH_LOG_LEVEL ?? "info";
  const threshold = LEVELS[level] ?? LEVELS.info;
  const sink = options.sink ?? console;

  return {
    debug(event, fields = {}) {
      writeLog(sink, threshold, "debug", event, fields);
    },
    info(event, fields = {}) {
      writeLog(sink, threshold, "info", event, fields);
    },
    warn(event, fields = {}) {
      writeLog(sink, threshold, "warn", event, fields);
    },
    error(event, fields = {}) {
      writeLog(sink, threshold, "error", event, fields);
    },
  };
}

function writeLog(sink, threshold, level, event, fields) {
  if (LEVELS[level] < threshold) return;

  const entry = cleanObject({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  const line = JSON.stringify(entry);
  if (level === "error" && typeof sink.error === "function") sink.error(line);
  else if (level === "warn" && typeof sink.warn === "function") sink.warn(line);
  else sink.log(line);
}

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cleanObject(item)]),
  );
}
