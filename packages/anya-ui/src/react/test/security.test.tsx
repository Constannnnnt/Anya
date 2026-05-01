import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { Image } from '../primitives/Image';
import { Link } from '../primitives/Link';
import { Iframe } from '../primitives/Iframe';
import {
    isValidEmbedUrl,
    isValidMediaUrl,
    isValidNavigationUrl,
    isValidUrl,
    sanitizeEmbedUrl,
    sanitizeMediaUrl,
    sanitizeNavigationUrl,
    sanitizeUrl, } from '../primitives/shared';

describe('Security: URL Validation', () => {
    describe('isValidUrl', () => {
        it('allows safe http and https URLs', () => {
            expect(isValidUrl('http://example.com')).toBe(true);
            expect(isValidUrl('https://example.com/image.png')).toBe(true); });

        it('allows relative paths', () => {
            expect(isValidUrl('/path/to/resource')).toBe(true);
            expect(isValidUrl('./path/to/resource')).toBe(true);
            expect(isValidUrl('../path/to/resource')).toBe(true);
            expect(isValidUrl('path/to/resource')).toBe(true); });

        it('blocks scheme-relative URLs that escape the current origin', () => {
            expect(isValidUrl('//evil.example/path')).toBe(false);
            expect(isValidUrl('///evil.example/path')).toBe(false); });

        it('allows safe data and blob URLs', () => {
            expect(isValidUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')).toBe(true);
            expect(isValidUrl('blob:https://example.com/uuid')).toBe(true); });

        it('blocks dangerous javascript: URLs', () => {
            expect(isValidUrl('javascript:alert(1)')).toBe(false);
            expect(isValidUrl('  javascript:alert(1)')).toBe(false);
            expect(isValidUrl('JAVAscript:alert(1)')).toBe(false); });

        it('blocks dangerous data:text/html URLs', () => {
            expect(isValidUrl('data:text/html,<html><script>alert(1)</script></html>')).toBe(false); }); });

    describe('sanitizeUrl', () => {
        it('returns about:blank for dangerous URLs', () => {
            expect(sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
            expect(sanitizeUrl('//evil.example/path')).toBe('about:blank'); });

        it('returns the URL for safe URLs', () => {
            expect(sanitizeUrl('https://example.com')).toBe('https://example.com'); }); });

    describe('target-specific URL sanitizers', () => {
        it('restricts navigation URLs to navigational schemes', () => {
            expect(isValidNavigationUrl('mailto:test@example.com')).toBe(true);
            expect(isValidNavigationUrl('https://example.com')).toBe(true);
            expect(isValidNavigationUrl('data:image/png;base64,iVBORw0K')).toBe(false);
            expect(sanitizeNavigationUrl('data:image/png;base64,iVBORw0K')).toBe('about:blank'); });

        it('restricts media URLs to media-safe schemes', () => {
            expect(isValidMediaUrl('data:image/png;base64,iVBORw0K')).toBe(true);
            expect(isValidMediaUrl('blob:https://example.com/uuid')).toBe(true);
            expect(isValidMediaUrl('mailto:test@example.com')).toBe(false);
            expect(sanitizeMediaUrl('mailto:test@example.com')).toBe('about:blank'); });

        it('restricts embed URLs to http and https', () => {
            expect(isValidEmbedUrl('https://example.com/embed')).toBe(true);
            expect(isValidEmbedUrl('/embed/local')).toBe(true);
            expect(isValidEmbedUrl('data:text/html,<p>x</p>')).toBe(false);
            expect(sanitizeEmbedUrl('data:text/html,<p>x</p>')).toBe('about:blank'); }); });

    describe('Components', () => {
        it('Image component sanitizes its src', () => {
            const ImageView = Image.render;
            const { container } = render(
                <ImageView id="test" props={{ src: 'javascript:alert(1)' } } onInteraction={() => { } } />
            );
            const img = container.querySelector('img');
            expect(img?.getAttribute('src')).toBe('about:blank'); });

        it('Link component sanitizes its href', () => {
            const LinkView = Link.render;
            const { container } = render(
                <LinkView id="test" props={{ text: 'Click me', href: 'javascript:alert(1)' } } onInteraction={() => { } } />
            );
            const a = container.querySelector('a');
            expect(a?.getAttribute('href')).toBe('about:blank'); });

        it('Link component blocks scheme-relative external targets', () => {
            const LinkView = Link.render;
            const { container } = render(
                <LinkView id="test" props={{ text: 'Click me', href: '//evil.example/path' } } onInteraction={() => { } } />
            );
            const a = container.querySelector('a');
            expect(a?.getAttribute('href')).toBe('about:blank'); });

        it('Iframe defaults to a restrictive sandbox without allow-same-origin', () => {
            const IframeView = Iframe.render;
            const { container } = render(
                <IframeView id="frame" props={{ src: 'https://example.com/embed' } } onInteraction={() => { } } />
            );
            const iframe = container.querySelector('iframe');
            expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-presentation'); });

        it('Iframe allows same-origin for trusted media embed providers', () => {
            const IframeView = Iframe.render;
            const { container } = render(
                <IframeView id="frame" props={{ src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } } onInteraction={() => { } } />
            );
            const iframe = container.querySelector('iframe');
            expect(iframe?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
            expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-presentation'); });

        it('Iframe sanitizes dangerous sources to about:blank', () => {
            const IframeView = Iframe.render;
            const { container } = render(
                <IframeView id="frame" props={{ src: 'javascript:alert(1)' } } onInteraction={() => { } } />
            );
            const iframe = container.querySelector('iframe');
            expect(iframe?.getAttribute('src')).toBe('about:blank'); });

        it('Iframe blocks non-embed-safe schemes even if they are generically safe', () => {
            const IframeView = Iframe.render;
            const { container } = render(
                <IframeView id="frame" props={{ src: 'data:text/html,<p>hi</p>' } } onInteraction={() => { } } />
            );
            const iframe = container.querySelector('iframe');
            expect(iframe?.getAttribute('src')).toBe('about:blank'); });

        it('Image blocks navigation-only schemes', () => {
            const ImageView = Image.render;
            const { container } = render(
                <ImageView id="test" props={{ src: 'mailto:test@example.com' } } onInteraction={() => { } } />
            );
            const img = container.querySelector('img');
            expect(img?.getAttribute('src')).toBe('about:blank'); }); }); });
