import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { Image } from '../src/primitives/Image';
import { Link } from '../src/primitives/Link';
import { Iframe } from '../src/primitives/Iframe';
import { sanitizeUrl, isValidUrl } from '../src/primitives/shared';

describe('Security: URL Validation', () => {
    describe('isValidUrl', () => {
        it('allows safe http and https URLs', () => {
            expect(isValidUrl('http://example.com')).toBe(true);
            expect(isValidUrl('https://example.com/image.png')).toBe(true);
        });

        it('allows relative paths', () => {
            expect(isValidUrl('/path/to/resource')).toBe(true);
            expect(isValidUrl('./path/to/resource')).toBe(true);
            expect(isValidUrl('../path/to/resource')).toBe(true);
            expect(isValidUrl('path/to/resource')).toBe(true);
        });

        it('allows safe data and blob URLs', () => {
            expect(isValidUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')).toBe(true);
            expect(isValidUrl('blob:https://example.com/uuid')).toBe(true);
        });

        it('blocks dangerous javascript: URLs', () => {
            expect(isValidUrl('javascript:alert(1)')).toBe(false);
            expect(isValidUrl('  javascript:alert(1)')).toBe(false);
            expect(isValidUrl('JAVAscript:alert(1)')).toBe(false);
        });

        it('blocks dangerous data:text/html URLs', () => {
            expect(isValidUrl('data:text/html,<html><script>alert(1)</script></html>')).toBe(false);
        });
    });

    describe('sanitizeUrl', () => {
        it('returns about:blank for dangerous URLs', () => {
            expect(sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
        });

        it('returns the URL for safe URLs', () => {
            expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
        });
    });

    describe('Components', () => {
        it('Image component sanitizes its src', () => {
            const ImageView = Image.render;
            const { container } = render(
                <ImageView id="test" props={{ src: 'javascript:alert(1)' }} onInteraction={() => {}} />
            );
            const img = container.querySelector('img');
            expect(img?.getAttribute('src')).toBe('about:blank');
        });

        it('Link component sanitizes its href', () => {
            const LinkView = Link.render;
            const { container } = render(
                <LinkView id="test" props={{ text: 'Click me', href: 'javascript:alert(1)' }} onInteraction={() => {}} />
            );
            const a = container.querySelector('a');
            expect(a?.getAttribute('href')).toBe('about:blank');
        });

        it('Iframe defaults to a restrictive sandbox without allow-same-origin', () => {
            const IframeView = Iframe.render;
            const { container } = render(
                <IframeView id="frame" props={{ src: 'https://example.com/embed' }} onInteraction={() => {}} />
            );
            const iframe = container.querySelector('iframe');
            expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-presentation');
        });

        it('Iframe sanitizes dangerous sources to about:blank', () => {
            const IframeView = Iframe.render;
            const { container } = render(
                <IframeView id="frame" props={{ src: 'javascript:alert(1)' }} onInteraction={() => {}} />
            );
            const iframe = container.querySelector('iframe');
            expect(iframe?.getAttribute('src')).toBe('about:blank');
        });
    });
});
