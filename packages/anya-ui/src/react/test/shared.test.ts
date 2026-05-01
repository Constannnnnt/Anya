import { describe, it, expect } from 'vitest';
import { sanitizeUrl } from '../primitives/shared';

describe('sanitizeUrl', () => {
    it('allows valid standard HTTP URLs', () => {
        expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
        expect(sanitizeUrl('https://example.com/path?query=1')).toBe('https://example.com/path?query=1'); });

    it('allows allowed safe schemes', () => {
        expect(sanitizeUrl('mailto:test@example.com')).toBe('mailto:test@example.com');
        expect(sanitizeUrl('tel:+1234567890')).toBe('tel:+1234567890');
        expect(sanitizeUrl('data:image/png;base64,iVBORw0K')).toBe('data:image/png;base64,iVBORw0K');
        expect(sanitizeUrl('blob:http://example.com/some-uuid')).toBe('blob:http://example.com/some-uuid'); });

    it('blocks dangerous schemes by returning about:blank', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
        expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('about:blank');
        expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('about:blank'); });

    it('blocks dangerous schemes bypassing via control characters', () => {
        expect(sanitizeUrl('java\x00script:alert(1)')).toBe('about:blank');
        expect(sanitizeUrl(' javascript:alert(1) ')).toBe('about:blank');
        expect(sanitizeUrl('java\nscript:alert(1)')).toBe('about:blank');
        expect(sanitizeUrl('java\rscript:alert(1)')).toBe('about:blank');
        expect(sanitizeUrl('java\tscript:alert(1)')).toBe('about:blank'); });

    it('allows relative URLs', () => {
        expect(sanitizeUrl('/relative/path')).toBe('/relative/path');
        expect(sanitizeUrl('relative/path')).toBe('relative/path');
        expect(sanitizeUrl('#anchor')).toBe('#anchor');
        expect(sanitizeUrl('?query=1')).toBe('?query=1'); });

    it('handles undefined or empty', () => {
        expect(sanitizeUrl(undefined)).toBeUndefined();
        expect(sanitizeUrl('')).toBe(''); }); });
