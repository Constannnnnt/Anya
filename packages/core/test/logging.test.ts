import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  consoleLogger,
  silentLogger,
  setLogger,
  getLogger,
  Logger
} from '../src/logging';

describe('Logging Utilities', () => {
  describe('consoleLogger', () => {
    let debugSpy: any;
    let infoSpy: any;
    let warnSpy: any;
    let errorSpy: any;

    beforeEach(() => {
      debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should call console.debug', () => {
      consoleLogger.debug('test debug message', { a: 1 });
      expect(debugSpy).toHaveBeenCalledWith('test debug message', { a: 1 });
    });

    it('should call console.info', () => {
      consoleLogger.info('test info message', [1, 2]);
      expect(infoSpy).toHaveBeenCalledWith('test info message', [1, 2]);
    });

    it('should call console.warn', () => {
      consoleLogger.warn('test warn message');
      expect(warnSpy).toHaveBeenCalledWith('test warn message');
    });

    it('should call console.error', () => {
      const err = new Error('test error');
      consoleLogger.error('test error message', err);
      expect(errorSpy).toHaveBeenCalledWith('test error message', err);
    });
  });

  describe('silentLogger', () => {
    let debugSpy: any;
    let infoSpy: any;
    let warnSpy: any;
    let errorSpy: any;

    beforeEach(() => {
      debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should not call console.debug', () => {
      silentLogger.debug('test debug message');
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('should not call console.info', () => {
      silentLogger.info('test info message');
      expect(infoSpy).not.toHaveBeenCalled();
    });

    it('should not call console.warn', () => {
      silentLogger.warn('test warn message');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should not call console.error', () => {
      silentLogger.error('test error message');
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('setLogger and getLogger', () => {
    let originalLogger: Logger;

    beforeEach(() => {
      originalLogger = getLogger();
    });

    afterEach(() => {
      setLogger(originalLogger);
    });

    it('should get the default logger (consoleLogger)', () => {
      expect(getLogger()).toBe(consoleLogger);
    });

    it('should override the logger and return the new one', () => {
      const customLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      setLogger(customLogger);
      expect(getLogger()).toBe(customLogger);
    });

    it('should be able to set the logger to silentLogger', () => {
      setLogger(silentLogger);
      expect(getLogger()).toBe(silentLogger);
    });
  });
});
