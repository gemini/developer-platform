import {
  redactDiagnosticValue,
  type DiagnosticEvent,
  type DiagnosticListener,
  type LogLevel,
} from "./diagnostics.js";
import type { BoundaryRecord } from "../utils/boundary-value.js";

export type { DiagnosticEvent, DiagnosticListener, LogLevel };

/** Severity levels from low to high. */
const LEVEL_ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, meta?: BoundaryRecord): void;
  info(message: string, meta?: BoundaryRecord): void;
  warn(message: string, meta?: BoundaryRecord): void;
  error(message: string, meta?: BoundaryRecord): void;
}

export function emitDiagnostic(
  event: DiagnosticEvent,
  logger: Logger,
  listener?: DiagnosticListener,
): void {
  if (!listener && logger === NOOP_LOGGER) return;
  // SAFETY: Redaction preserves the diagnostic event shape while replacing sensitive values.
  const safeEvent = redactDiagnosticValue(event) as DiagnosticEvent;
  try {
    listener?.(safeEvent);
  } catch {
    // Diagnostics must not change the API result.
  }
  try {
    logger[safeEvent.level](safeEvent.name, safeEvent);
  } catch {
    // A caller logger must not stop the observed operation.
  }
}

/** Write safe structured events to the console when enabled. */
export class ConsoleLogger implements Logger {
  private readonly threshold: number;

  constructor(options?: { minLevel?: LogLevel }) {
    this.threshold = LEVEL_ORDER[options?.minLevel ?? "info"];
  }

  private log(
    level: LogLevel,
    message: string,
    meta?: BoundaryRecord,
  ): void {
    if (LEVEL_ORDER[level] < this.threshold) return;
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
    let consoleWriter = console.log;
    if (level === "warn" || level === "error") {
      consoleWriter = console.error;
    }

    if (meta === undefined) consoleWriter(line);
    else consoleWriter(line, meta);
  }

  debug(message: string, meta?: BoundaryRecord): void {
    this.log("debug", message, meta);
  }
  info(message: string, meta?: BoundaryRecord): void {
    this.log("info", message, meta);
  }
  warn(message: string, meta?: BoundaryRecord): void {
    this.log("warn", message, meta);
  }
  error(message: string, meta?: BoundaryRecord): void {
    this.log("error", message, meta);
  }
}

/** Silent logger shared by consumers. */
export const NOOP_LOGGER: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
