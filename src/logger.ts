import type { LogLevel } from "./config.js";

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(private readonly level: LogLevel) {}

  debug(message: string, metadata?: unknown): void {
    this.log("debug", message, metadata);
  }

  info(message: string, metadata?: unknown): void {
    this.log("info", message, metadata);
  }

  warn(message: string, metadata?: unknown): void {
    this.log("warn", message, metadata);
  }

  error(message: string, metadata?: unknown): void {
    this.log("error", message, metadata);
  }

  private log(level: LogLevel, message: string, metadata?: unknown): void {
    if (levelRank[level] < levelRank[this.level]) {
      return;
    }

    const timestamp = new Date().toISOString();
    if (metadata === undefined) {
      console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
      return;
    }

    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, metadata);
  }
}
