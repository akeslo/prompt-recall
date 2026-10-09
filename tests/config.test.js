import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('popup/modules/config.js', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('falls back to a passthrough converter when showdown is absent', async () => {
        vi.stubGlobal('showdown', undefined);
        const { converter } = await import('../popup/modules/config.js');
        expect(converter.makeHtml('**x**')).toBe('**x**');
    });

    it('configures showdown with the expected options', async () => {
        const options = {};
        class FakeConverter {
            setOption(key, value) {
                options[key] = value;
            }
        }
        vi.stubGlobal('showdown', { Converter: FakeConverter });
        const { converter } = await import('../popup/modules/config.js');

        expect(converter).toBeInstanceOf(FakeConverter);
        expect(options.noHeaderId).toBe(true);
        expect(options.openLinksInNewWindow).toBe(true);
        expect(options.simpleLineBreaks).toBe(true);
        expect(options.excludeTrailingPunctuationFromURLs).toBe(true);
        expect(options.strikethrough).toBe(true);
        expect(options.tables).toBe(true);
    });

    it('never enables raw-HTML-friendly options', async () => {
        const options = {};
        class FakeConverter {
            setOption(key, value) {
                options[key] = value;
            }
        }
        vi.stubGlobal('showdown', { Converter: FakeConverter });
        await import('../popup/modules/config.js');
        expect(options.noHeaderId).not.toBe(false);
        expect(options.ghMentions).toBeUndefined();
    });
});
