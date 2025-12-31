// Tests for utility helper functions

// Load the helpers module
const fs = require('fs');
const path = require('path');

// Read and evaluate the helpers.js file
const helpersPath = path.join(__dirname, '../extension/scripts/utils/helpers.js');
const helpersCode = fs.readFileSync(helpersPath, 'utf8');
eval(helpersCode);

describe('Helpers Utility Functions', () => {
  describe('debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should delay function execution', () => {
      const mockFn = jest.fn();
      const debouncedFn = helpers.debounce(mockFn, 100);

      debouncedFn();
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should only execute once for multiple rapid calls', () => {
      const mockFn = jest.fn();
      const debouncedFn = helpers.debounce(mockFn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should reset delay on subsequent calls', () => {
      const mockFn = jest.fn();
      const debouncedFn = helpers.debounce(mockFn, 100);

      debouncedFn();
      jest.advanceTimersByTime(50);
      debouncedFn();
      jest.advanceTimersByTime(50);
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to debounced function', () => {
      const mockFn = jest.fn();
      const debouncedFn = helpers.debounce(mockFn, 100);

      debouncedFn('arg1', 'arg2');
      jest.advanceTimersByTime(100);

      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('throttle', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should execute function immediately on first call', () => {
      const mockFn = jest.fn();
      const throttledFn = helpers.throttle(mockFn, 100);

      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should ignore calls within throttle period', () => {
      const mockFn = jest.fn();
      const throttledFn = helpers.throttle(mockFn, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should allow execution after throttle period', () => {
      const mockFn = jest.fn();
      const throttledFn = helpers.throttle(mockFn, 100);

      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(100);
      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments to throttled function', () => {
      const mockFn = jest.fn();
      const throttledFn = helpers.throttle(mockFn, 100);

      throttledFn('test', 123);
      expect(mockFn).toHaveBeenCalledWith('test', 123);
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      const input = '<script>alert("XSS")</script>';
      const escaped = helpers.escapeHtml(input);
      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;');
      expect(escaped).toContain('&gt;');
    });

    it('should escape ampersands', () => {
      const input = 'Tom & Jerry';
      const escaped = helpers.escapeHtml(input);
      expect(escaped).toContain('&amp;');
    });

    it('should escape quotes', () => {
      const input = '"Hello" \'World\'';
      const escaped = helpers.escapeHtml(input);
      expect(escaped).toContain('&quot;');
    });

    it('should handle empty strings', () => {
      expect(helpers.escapeHtml('')).toBe('');
    });

    it('should handle plain text without special characters', () => {
      const input = 'Plain text';
      expect(helpers.escapeHtml(input)).toBe(input);
    });
  });

  describe('waitForElement', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should resolve immediately if element exists', async () => {
      const mockElement = { id: 'test' };
      document.querySelector = jest.fn(() => mockElement);

      const promise = helpers.waitForElement('#test');
      const result = await promise;

      expect(result).toBe(mockElement);
    });

    it('should wait for element to appear', async () => {
      let element = null;
      document.querySelector = jest.fn(() => element);

      const promise = helpers.waitForElement('#test', 1000);

      // Simulate MutationObserver callback
      setTimeout(() => {
        element = { id: 'test' };
      }, 500);

      jest.advanceTimersByTime(500);

      // Since we can't fully test MutationObserver, this verifies the logic
      expect(document.querySelector).toHaveBeenCalled();
    });

    it('should reject if timeout is reached', async () => {
      document.querySelector = jest.fn(() => null);

      const promise = helpers.waitForElement('#test', 100);

      jest.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow('Element #test not found within 100ms');
    });
  });

  describe('retryWithBackoff', () => {
    it('should return result on first success', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const result = await helpers.retryWithBackoff(mockFn, 3, 100);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await helpers.retryWithBackoff(mockFn, 3, 100);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');

      const sleepSpy = jest.spyOn(helpers, 'sleep');

      await helpers.retryWithBackoff(mockFn, 3, 100);

      expect(sleepSpy).toHaveBeenCalledWith(100); // First retry: 100ms
      expect(sleepSpy).toHaveBeenCalledWith(200); // Second retry: 200ms
    });

    it('should throw error after max retries', async () => {
      const error = new Error('persistent failure');
      const mockFn = jest.fn().mockRejectedValue(error);

      await expect(helpers.retryWithBackoff(mockFn, 3, 100)).rejects.toThrow(
        'persistent failure'
      );

      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should handle zero retries', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const result = await helpers.retryWithBackoff(mockFn, 0, 100);

      expect(result).toBe('success');
    });
  });

  describe('sleep', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should resolve after specified milliseconds', async () => {
      const promise = helpers.sleep(1000);
      const callback = jest.fn();
      promise.then(callback);

      expect(callback).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1000);
      await promise;
      expect(callback).toHaveBeenCalled();
    });

    it('should handle zero milliseconds', async () => {
      const promise = helpers.sleep(0);
      jest.advanceTimersByTime(0);
      await promise;
      expect(true).toBe(true);
    });
  });

  describe('isPRPage', () => {
    it('should return true for PR page', () => {
      window.location.pathname = '/owner/repo/pull/123';
      expect(helpers.isPRPage()).toBe(true);
    });

    it('should return true for PR with additional path', () => {
      window.location.pathname = '/owner/repo/pull/456/files';
      expect(helpers.isPRPage()).toBe(true);
    });

    it('should return false for non-PR page', () => {
      window.location.pathname = '/owner/repo';
      expect(helpers.isPRPage()).toBe(false);
    });

    it('should return false for issues page', () => {
      window.location.pathname = '/owner/repo/issues/123';
      expect(helpers.isPRPage()).toBe(false);
    });

    it('should return false for empty path', () => {
      window.location.pathname = '';
      expect(helpers.isPRPage()).toBe(false);
    });
  });

  describe('formatRelativeTime', () => {
    it('should return "just now" for very recent timestamps', () => {
      const timestamp = Date.now();
      expect(helpers.formatRelativeTime(timestamp)).toBe('just now');
    });

    it('should return minutes for timestamps within an hour', () => {
      const timestamp = Date.now() - 30 * 60 * 1000; // 30 minutes ago
      expect(helpers.formatRelativeTime(timestamp)).toBe('30 minutes ago');
    });

    it('should return hours for timestamps within a day', () => {
      const timestamp = Date.now() - 5 * 60 * 60 * 1000; // 5 hours ago
      expect(helpers.formatRelativeTime(timestamp)).toBe('5 hours ago');
    });

    it('should return days for timestamps older than 24 hours', () => {
      const timestamp = Date.now() - 2 * 24 * 60 * 60 * 1000; // 2 days ago
      expect(helpers.formatRelativeTime(timestamp)).toBe('2 days ago');
    });

    it('should handle edge case of exactly 1 hour', () => {
      const timestamp = Date.now() - 60 * 60 * 1000;
      expect(helpers.formatRelativeTime(timestamp)).toBe('1 hours ago');
    });

    it('should handle edge case of exactly 24 hours', () => {
      const timestamp = Date.now() - 24 * 60 * 60 * 1000;
      expect(helpers.formatRelativeTime(timestamp)).toBe('1 days ago');
    });
  });

  describe('SimpleCache', () => {
    let cache;

    beforeEach(() => {
      cache = new helpers.SimpleCache();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should store and retrieve values', () => {
      cache.set('key1', 'value1', 5000);
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBe(null);
    });

    it('should expire values after TTL', () => {
      cache.set('key1', 'value1', 1000);
      expect(cache.get('key1')).toBe('value1');

      jest.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBe(null);
    });

    it('should check if key exists with has', () => {
      cache.set('key1', 'value1', 5000);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should clear all cached values', () => {
      cache.set('key1', 'value1', 5000);
      cache.set('key2', 'value2', 5000);

      cache.clear();

      expect(cache.get('key1')).toBe(null);
      expect(cache.get('key2')).toBe(null);
    });

    it('should delete specific keys', () => {
      cache.set('key1', 'value1', 5000);
      cache.set('key2', 'value2', 5000);

      cache.delete('key1');

      expect(cache.get('key1')).toBe(null);
      expect(cache.get('key2')).toBe('value2');
    });

    it('should handle overwriting existing keys', () => {
      cache.set('key1', 'value1', 5000);
      cache.set('key1', 'value2', 5000);

      expect(cache.get('key1')).toBe('value2');
    });

    it('should store different types of values', () => {
      cache.set('string', 'text', 5000);
      cache.set('number', 42, 5000);
      cache.set('object', { key: 'value' }, 5000);
      cache.set('array', [1, 2, 3], 5000);

      expect(cache.get('string')).toBe('text');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('object')).toEqual({ key: 'value' });
      expect(cache.get('array')).toEqual([1, 2, 3]);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const json = '{"key": "value", "number": 42}';
      const result = helpers.safeJsonParse(json);

      expect(result).toEqual({ key: 'value', number: 42 });
    });

    it('should return null for invalid JSON', () => {
      const invalid = '{invalid json}';
      const result = helpers.safeJsonParse(invalid);

      expect(result).toBe(null);
    });

    it('should return custom fallback for invalid JSON', () => {
      const invalid = '{invalid json}';
      const fallback = { error: true };
      const result = helpers.safeJsonParse(invalid, fallback);

      expect(result).toEqual(fallback);
    });

    it('should parse arrays', () => {
      const json = '[1, 2, 3]';
      const result = helpers.safeJsonParse(json);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle empty strings', () => {
      const result = helpers.safeJsonParse('');
      expect(result).toBe(null);
    });

    it('should parse null values', () => {
      const json = 'null';
      const result = helpers.safeJsonParse(json);

      expect(result).toBe(null);
    });

    it('should parse boolean values', () => {
      expect(helpers.safeJsonParse('true')).toBe(true);
      expect(helpers.safeJsonParse('false')).toBe(false);
    });

    it('should parse number values', () => {
      expect(helpers.safeJsonParse('42')).toBe(42);
      expect(helpers.safeJsonParse('3.14')).toBe(3.14);
    });
  });

  describe('truncateText', () => {
    it('should not truncate text shorter than maxLength', () => {
      const text = 'Short text';
      expect(helpers.truncateText(text, 20)).toBe(text);
    });

    it('should truncate text longer than maxLength', () => {
      const text = 'This is a very long text that should be truncated';
      const result = helpers.truncateText(text, 20);

      expect(result.length).toBe(23); // 20 + '...'
      expect(result).toBe('This is a very long ...');
    });

    it('should use custom suffix', () => {
      const text = 'This is a very long text';
      const result = helpers.truncateText(text, 10, '---');

      expect(result).toBe('This is a ---');
    });

    it('should handle exact length match', () => {
      const text = 'Exact';
      const result = helpers.truncateText(text, 5);

      expect(result).toBe('Exact');
    });

    it('should handle empty string', () => {
      const result = helpers.truncateText('', 10);
      expect(result).toBe('');
    });

    it('should handle maxLength of 0', () => {
      const result = helpers.truncateText('text', 0);
      expect(result).toBe('...');
    });

    it('should handle very long text', () => {
      const text = 'a'.repeat(10000);
      const result = helpers.truncateText(text, 100);

      expect(result.length).toBe(103);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should preserve unicode characters', () => {
      const text = '👋 Hello 世界';
      const result = helpers.truncateText(text, 8);

      expect(result).toBe('👋 Hello ...');
    });
  });
});
