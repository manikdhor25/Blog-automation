// ============================================================
// RankMaster Pro - Keyword Density & TF-IDF Analyzer Engine
// ============================================================

export interface DensityResult {
    keyword: string;
    count: number;
    density_pct: number;
    status: 'optimal' | 'under' | 'over' | 'keyword_stuffing';
    recommendation: string;
}

export interface TFIDFTerm {
    term: string;
    tf: number;
    tfidf_score: number;
    in_title: boolean;
    in_headings: boolean;
    is_lsi: boolean;
}

export interface DensityReport {
    word_count: number;
    primary_keyword: DensityResult;
    secondary_keywords: DensityResult[];
    top_terms: TFIDFTerm[];
    lsi_coverage_score: number;
    over_optimized_terms: string[];
    missing_lsi_opportunities: string[];
    readability_score: number;
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'that', 'this', 'it', 'its', 'from', 'into', 'about', 'up', 'out', 'as', 'so', 'if', 'not', 'no', 'we', 'you', 'he', 'she', 'they', 'i', 'my', 'your', 'our', 'their', 'his', 'her']);

export function analyzeKeywordDensity(
    content: string,
    primaryKeyword: string,
    secondaryKeywords: string[] = [],
    title: string = '',
    headings: string[] = []
): DensityReport {
    const cleanContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const words = cleanContent.split(/\s+/).filter(w => w.length > 2);
    const wordCount = words.length;

    const countKeyword = (kw: string): number => {
        const kwLower = kw.toLowerCase();
        const pattern = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        return (cleanContent.match(pattern) || []).length;
    };

    const getStatus = (density: number, kw: string): { status: DensityResult['status']; recommendation: string } => {
        if (density > 3) return { status: 'keyword_stuffing', recommendation: `Reduce "${kw}" — ${density.toFixed(1)}% is over-optimized. Target 1-2%.` };
        if (density > 2) return { status: 'over', recommendation: `"${kw}" at ${density.toFixed(1)}% is slightly high. Aim for 1-2%.` };
        if (density < 0.5) return { status: 'under', recommendation: `"${kw}" at ${density.toFixed(1)}% is too low. Include 3-5 more times naturally.` };
        return { status: 'optimal', recommendation: `"${kw}" density ${density.toFixed(1)}% is optimal.` };
    };

    // Primary keyword
    const primaryCount = countKeyword(primaryKeyword);
    const primaryDensity = wordCount > 0 ? (primaryCount / wordCount) * 100 : 0;
    const primaryStatus = getStatus(primaryDensity, primaryKeyword);

    // Secondary keywords
    const secondaryResults: DensityResult[] = secondaryKeywords.slice(0, 10).map(kw => {
        const count = countKeyword(kw);
        const density = wordCount > 0 ? (count / wordCount) * 100 : 0;
        const status = getStatus(density, kw);
        return { keyword: kw, count, density_pct: parseFloat(density.toFixed(2)), ...status };
    });

    // TF-IDF calculation
    const wordFreq = new Map<string, number>();
    for (const word of words) {
        if (!STOP_WORDS.has(word) && word.length > 3) {
            wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        }
    }

    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
        if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
            const bigram = `${words[i]} ${words[i + 1]}`;
            wordFreq.set(bigram, (wordFreq.get(bigram) || 0) + 1);
        }
    }

    const titleLower = title.toLowerCase();
    const headingsLower = headings.map(h => h.toLowerCase()).join(' ');

    const topTerms: TFIDFTerm[] = [...wordFreq.entries()]
        .filter(([term, freq]) => freq >= 2 && term.split(' ').every(w => !STOP_WORDS.has(w)))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([term, freq]) => ({
            term,
            tf: parseFloat(((freq / wordCount) * 100).toFixed(2)),
            tfidf_score: freq * (1 / (freq + 1)), // simplified TF-IDF
            in_title: titleLower.includes(term),
            in_headings: headingsLower.includes(term),
            is_lsi: !term.includes(primaryKeyword.toLowerCase()) && freq >= 3,
        }));

    // Over-optimized terms (non-keyword terms with >2% density)
    const overOptimized = topTerms
        .filter(t => t.tf > 2 && !t.term.includes(primaryKeyword.toLowerCase()))
        .map(t => t.term);

    // LSI coverage score (how many high-freq terms appear in title/headings)
    const lsiInStructure = topTerms.filter(t => t.is_lsi && (t.in_title || t.in_headings)).length;
    const lsiTotal = topTerms.filter(t => t.is_lsi).length;
    const lsiScore = lsiTotal > 0 ? Math.round((lsiInStructure / lsiTotal) * 100) : 0;

    // Simple readability (avg sentence length)
    const sentences = cleanContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const avgSentenceLen = sentences.length > 0 ? sentences.reduce((s, sent) => s + sent.split(/\s+/).length, 0) / sentences.length : 0;
    const readabilityScore = Math.max(0, Math.min(100, Math.round(100 - Math.abs(avgSentenceLen - 15) * 3)));

    return {
        word_count: wordCount,
        primary_keyword: {
            keyword: primaryKeyword,
            count: primaryCount,
            density_pct: parseFloat(primaryDensity.toFixed(2)),
            ...primaryStatus,
        },
        secondary_keywords: secondaryResults,
        top_terms: topTerms.slice(0, 20),
        lsi_coverage_score: lsiScore,
        over_optimized_terms: overOptimized,
        missing_lsi_opportunities: topTerms.filter(t => t.is_lsi && !t.in_title && !t.in_headings && t.tf > 0.5).map(t => t.term).slice(0, 5),
        readability_score: readabilityScore,
    };
}
