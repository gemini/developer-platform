import {
  redactDiagnosticValue,
  type DiagnosticEvent,
  type DiagnosticListener,
  type LogLevel,
} from "./diagnostics.js";

export type { DiagnosticEvent, DiagnosticListener, LogLevel };

/** Severity levels, ordered low to high. */
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function emitDiagnostic(
  event: DiagnosticEvent,
  logger: Logger,
  listener?: DiagnosticListener,
): void {
  const safeEvent = redactDiagnosticValue(event) as DiagnosticEvent;
  try {
    listener?.(safeEvent);
  } catch {
    // Diagnostics are best-effort and must never change the API result.
  }
  try {
    logger[safeEvent.level](safeEvent.name, safeEvent);
  } catch {
    // A caller logger must not break the operation it observes.
  }
}

/** Writes safe structured events to the console when enabled. */
export class ConsoleLogger implements Logger {
  private readonly threshold: number;

  constructor(options?: { minLevel?: LogLevel }) {
    this.threshold = LEVEL_ORDER[options?.minLevel ?? "info"];
  }

  private log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    if (LEVEL_ORDER[level] < this.threshold) return;
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
    let consoleWriter = console.log;
    if (level === "warn" || level === "error") {
      consoleWriter = console.error;
    }

    if (meta === undefined) consoleWriter(line);
    else consoleWriter(line, redactDiagnosticValue(meta));
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }
  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }
}

/** Silent logger singleton — avoids allocating a new instance per consumer. */
export const NOOP_LOGGER: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/** @deprecated Use `NOOP_LOGGER` instead of `new NoopLogger()`. */
export class NoopLogger implements Logger {
  debug(_message: string, _meta?: Record<string, unknown>): void {}
  info(_message: string, _meta?: Record<string, unknown>): void {}
  warn(_message: string, _meta?: Record<string, unknown>): void {}
  error(_message: string, _meta?: Record<string, unknown>): void {}
}
