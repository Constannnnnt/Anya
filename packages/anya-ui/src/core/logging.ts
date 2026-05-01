/**
 * Lightweight logger abstraction for host-controlled logging sinks.
 * The core runtime calls this boundary instead of importing console directly.
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

let activeLogLevel: LogLevel = LogLevel.SILENT;

function bindConsoleMethod(method: 'debug' | 'info' | 'warn' | 'error') {
  const levelMap: Record<string, LogLevel> = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
  };
  
  const methodLevel = levelMap[method];

  return (...args: unknown[]) => {
    if (activeLogLevel > methodLevel) return;
    const fn = console[method] as (...items: unknown[]) => void;
    fn(...args);
  };
}

export const consoleLogger: Logger = {
  debug: bindConsoleMethod('debug'),
  info: bindConsoleMethod('info'),
  warn: bindConsoleMethod('warn'),
  error: bindConsoleMethod('error'),
};

export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

let activeLogger: Logger = consoleLogger;

/** Override the process-wide logger used by core modules. */
export function setLogger(logger: Logger): void {
  activeLogger = logger;
}

/** Returns the currently active logger implementation. */
export function getLogger(): Logger {
  return activeLogger;
}

/** Set the global log level for the default console logger. */
export function setLogLevel(level: LogLevel): void {
  activeLogLevel = level;
}
