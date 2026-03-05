/**
 * Lightweight logger abstraction for host-controlled logging sinks.
 * The core runtime calls this boundary instead of importing console directly.
 */
export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

function bindConsoleMethod(method: 'debug' | 'info' | 'warn' | 'error') {
  return (...args: unknown[]) => {
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
