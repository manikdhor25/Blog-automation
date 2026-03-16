/**
 * Unit tests for content utility functions
 */
import {
    pickTemperature,
    countWordsInHTML,
    getTemplateVariation,
    pickRandom,
    QUALITY_GATE,
    TEMPERATURE_CONFIG,
    WORD_COUNT_MINIMUMS,
} from '@/lib/engines/content-utils';

describe('pickTemperature', () => {
    it('returns informational temperature for generic keywords', () => {
        expect(pickTemperature('seo strategies')).toBe(TEMPERATURE_CONFIG.informational);
    });

    it('returns creative temperature for listicle keywords', () => {
        expect(pickTemperature('best seo tools')).toBe(TEMPERATURE_CONFIG.creative);
        expect(pickTemperature('top 10 plugins')).toBe(TEMPERATURE_CONFIG.creative);
        expect(pickTemperature('wordpress vs wix')).toBe(TEMPERATURE_CONFIG.creative);
    });

    it('returns procedural temperature for how-to keywords', () => {
        expect(pickTemperature('how to install wordpress')).toBe(TEMPERATURE_CONFIG.procedural);
        expect(pickTemperature('step by step guide')).toBe(TEMPERATURE_CONFIG.procedural);
        expect(pickTemperature('seo tutorial for beginners')).toBe(TEMPERATURE_CONFIG.procedural);
    });

    it('respects explicit type override', () => {
        expect(pickTemperature('seo tools', 'conclusion')).toBe(TEMPERATURE_CONFIG.conclusion);
        expect(pickTemperature('seo tools', 'faq')).toBe(TEMPERATURE_CONFIG.faq);
        expect(pickTemperature('seo tools', 'rewrite')).toBe(TEMPERATURE_CONFIG.rewrite);
    });

    it('auto-detects only when type is informational', () => {
        // Even with a listicle keyword, explicit type wins
        expect(pickTemperature('best tools', 'section')).toBe(TEMPERATURE_CONFIG.section);
    });
});

describe('countWordsInHTML', () => {
    it('counts words in plain text', () => {
        expect(countWordsInHTML('hello world')).toBe(2);
    });

    it('strips HTML tags before counting', () => {
        expect(countWordsInHTML('<p>Hello <strong>world</strong></p>')).toBe(2);
    });

    it('strips script tags', () => {
        const html = '<p>Hello</p><script>alert("x")</script><p>World</p>';
        expect(countWordsInHTML(html)).toBe(2);
    });

    it('strips style tags', () => {
        const html = '<style>.foo{color:red}</style><p>Hello World</p>';
        expect(countWordsInHTML(html)).toBe(2);
    });

    it('strips HTML comments', () => {
        const html = '<p>Hello</p><!-- IMAGE: description --><p>World</p>';
        expect(countWordsInHTML(html)).toBe(2);
    });

    it('strips HTML entities', () => {
        const html = '<p>Hello&nbsp;World&amp;All</p>';
        expect(countWordsInHTML(html)).toBe(3);
    });

    it('returns 0 for empty string', () => {
        expect(countWordsInHTML('')).toBe(0);
    });

    it('handles complex HTML content', () => {
        const html = `
            <h1>Welcome to My Blog</h1>
            <p>This is a <a href="/link">paragraph</a> with <em>seven</em> words total.</p>
        `;
        // "Welcome to My Blog This is a paragraph with seven words total"
        expect(countWordsInHTML(html)).toBe(12);
    });
});

describe('getTemplateVariation', () => {
    it('returns all required properties', () => {
        const variation = getTemplateVariation();
        expect(variation).toHaveProperty('faqCount');
        expect(variation).toHaveProperty('takeawaysPosition');
        expect(variation).toHaveProperty('authorBoxPosition');
        expect(variation).toHaveProperty('takeawaysFormat');
        expect(variation).toHaveProperty('h2Count');
        expect(variation).toHaveProperty('imageCount');
    });

    it('produces faqCount between 5 and 8', () => {
        for (let i = 0; i < 20; i++) {
            const { faqCount } = getTemplateVariation();
            expect(faqCount).toBeGreaterThanOrEqual(5);
            expect(faqCount).toBeLessThanOrEqual(8);
        }
    });

    it('produces imageCount between 3 and 5', () => {
        for (let i = 0; i < 20; i++) {
            const { imageCount } = getTemplateVariation();
            expect(imageCount).toBeGreaterThanOrEqual(3);
            expect(imageCount).toBeLessThanOrEqual(5);
        }
    });

    it('produces h2Count from allowed values', () => {
        const allowed = [5, 6, 7, 8];
        for (let i = 0; i < 20; i++) {
            expect(allowed).toContain(getTemplateVariation().h2Count);
        }
    });
});

describe('pickRandom', () => {
    it('picks from the array', () => {
        const items = ['a', 'b', 'c'];
        for (let i = 0; i < 20; i++) {
            expect(items).toContain(pickRandom(items));
        }
    });

    it('returns only element for single-item array', () => {
        expect(pickRandom([42])).toBe(42);
    });
});

describe('Constants', () => {
    it('QUALITY_GATE has sensible thresholds', () => {
        expect(QUALITY_GATE.minNaturalnessScore).toBeGreaterThanOrEqual(50);
        expect(QUALITY_GATE.maxRedoAttempts).toBeGreaterThanOrEqual(1);
    });

    it('WORD_COUNT_MINIMUMS has normal and cluster', () => {
        expect(WORD_COUNT_MINIMUMS.normal).toBeGreaterThan(0);
        expect(WORD_COUNT_MINIMUMS.cluster).toBeGreaterThan(WORD_COUNT_MINIMUMS.normal);
    });

    it('all temperatures are between 0 and 1', () => {
        for (const [, temp] of Object.entries(TEMPERATURE_CONFIG)) {
            expect(temp).toBeGreaterThan(0);
            expect(temp).toBeLessThan(1);
        }
    });
});
