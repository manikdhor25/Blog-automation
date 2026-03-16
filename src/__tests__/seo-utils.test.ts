/**
 * Unit tests for SEO utility functions
 */

// Test SEO scoring logic
describe('SEO Utils', () => {
    describe('Title Length Validation', () => {
        const validateTitleLength = (title: string) => {
            if (!title) return { valid: false, message: 'Title is required' };
            if (title.length < 30) return { valid: false, message: 'Title too short (min 30 chars)' };
            if (title.length > 60) return { valid: false, message: 'Title too long (max 60 chars)' };
            return { valid: true, message: 'Good length' };
        };

        it('rejects empty titles', () => {
            expect(validateTitleLength('')).toEqual({ valid: false, message: 'Title is required' });
        });

        it('rejects short titles', () => {
            expect(validateTitleLength('Short')).toEqual({ valid: false, message: 'Title too short (min 30 chars)' });
        });

        it('accepts valid-length titles', () => {
            const title = 'Best SEO Tools for Small Business Owners 2025';
            expect(validateTitleLength(title)).toEqual({ valid: true, message: 'Good length' });
        });

        it('rejects overly long titles', () => {
            const title = 'This Is An Extremely Long Title That Goes Way Beyond The Recommended Sixty Character Limit For SEO';
            expect(validateTitleLength(title)).toEqual({ valid: false, message: 'Title too long (max 60 chars)' });
        });
    });

    describe('Meta Description Validation', () => {
        const validateMetaDesc = (desc: string) => {
            if (!desc) return { valid: false, score: 0 };
            if (desc.length < 120) return { valid: false, score: 30 };
            if (desc.length > 160) return { valid: false, score: 50 };
            return { valid: true, score: 100 };
        };

        it('scores 0 for missing description', () => {
            expect(validateMetaDesc('')).toEqual({ valid: false, score: 0 });
        });

        it('scores 30 for short description', () => {
            expect(validateMetaDesc('Too short')).toEqual({ valid: false, score: 30 });
        });

        it('scores 100 for optimal length', () => {
            const desc = 'Discover the best SEO tools for small businesses in 2025. Compare features, pricing, and real user reviews to find the perfect tool.';
            expect(validateMetaDesc(desc)).toEqual({ valid: true, score: 100 });
        });
    });

    describe('Slug Generation', () => {
        const generateSlug = (title: string) =>
            title.toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');

        it('converts title to slug', () => {
            expect(generateSlug('Best SEO Tools 2025')).toBe('best-seo-tools-2025');
        });

        it('removes special characters', () => {
            expect(generateSlug('What is SEO? A Guide!')).toBe('what-is-seo-a-guide');
        });

        it('handles multiple spaces', () => {
            expect(generateSlug('SEO   for   Beginners')).toBe('seo-for-beginners');
        });

        it('trims leading/trailing hyphens', () => {
            expect(generateSlug('-leading and trailing-')).toBe('leading-and-trailing');
        });
    });

    describe('Keyword Density Calculation', () => {
        const calcDensity = (content: string, keyword: string) => {
            if (!content || !keyword) return 0;
            const words = content.toLowerCase().split(/\s+/).length;
            const kwLower = keyword.toLowerCase();
            const kwWords = kwLower.split(/\s+/).length;
            let count = 0;
            let pos = content.toLowerCase().indexOf(kwLower);
            while (pos !== -1) {
                count++;
                pos = content.toLowerCase().indexOf(kwLower, pos + 1);
            }
            return parseFloat(((count * kwWords / words) * 100).toFixed(2));
        };

        it('returns 0 for empty content', () => {
            expect(calcDensity('', 'seo')).toBe(0);
        });

        it('calculates single keyword density', () => {
            const content = 'SEO is important. Good SEO helps ranking. Learn SEO today for better SEO results.';
            expect(calcDensity(content, 'SEO')).toBeGreaterThan(0);
        });
    });

    describe('Internal Link Count', () => {
        const countInternalLinks = (html: string, domain: string) => {
            const matches = html.match(new RegExp(`href=["'](?:https?://)?${domain.replace('.', '\\.')}[^"']*["']`, 'gi'));
            return matches ? matches.length : 0;
        };

        it('counts internal links', () => {
            const html = '<a href="https://example.com/about">About</a> <a href="https://example.com/blog">Blog</a> <a href="https://other.com">Other</a>';
            expect(countInternalLinks(html, 'example.com')).toBe(2);
        });

        it('returns 0 for no internal links', () => {
            const html = '<a href="https://google.com">Google</a>';
            expect(countInternalLinks(html, 'example.com')).toBe(0);
        });
    });
});
