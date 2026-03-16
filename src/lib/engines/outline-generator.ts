// ============================================================
// RankMaster Pro - Outline Generator Engine
// Creates detailed, competitor-informed article outlines
// that drive section-by-section content generation
// ============================================================

import { getAIRouter } from '../ai/router';
import { CompetitorBlueprint, DeepPageContent } from './serp-intelligence';

// ── Outline Types ──────────────────────────────────────────────

export interface OutlineSection {
    h2: string;
    h3s: string[];
    targetWords: number;
    contentType: 'explanation' | 'comparison' | 'list' | 'case_study' | 'stats' | 'how_to';
    snippetTarget: 'paragraph' | 'list' | 'table' | 'none';
    keyDataPoints: string[];
    competitorExcerpts: string[];
    writingAngle: string; // Brief instruction on how to approach this section
}

export interface ArticleOutline {
    title: string;
    metaTitle: string;
    metaDescription: string;
    introHook: string; // The direct-answer opening sentence
    sections: OutlineSection[];
    faqQuestions: { question: string; targetWords: number }[];
    comparisonTable: {
        topic: string;
        columns: string[];
        rowDescriptions: string[];
    };
    keyTakeaways: string[];
    totalTargetWords: number;
}

// ── Outline Generator ──────────────────────────────────────────

export async function generateOutline(
    keyword: string,
    blueprint: CompetitorBlueprint,
    competitors: DeepPageContent[],
    options?: {
        niche?: string;
        language?: string;
        isCluster?: boolean;
        paaQuestions?: string[];
        minWordCount?: number;
        contentLayer?: 'pillar' | 'supporting' | 'micro'; // Step 4: Information Layers
    }
): Promise<ArticleOutline> {
    const ai = getAIRouter();
    const isCluster = options?.isCluster || false;
    const contentLayer = options?.contentLayer || 'supporting';
    const minWords = options?.minWordCount || (isCluster ? 3000 : 1500);

    // DIAGNOSTIC: Log content layer information
    console.log(`[OutlineGenerator] Generating outline for keyword: "${keyword}"`);
    console.log(`[OutlineGenerator] Content layer: ${contentLayer} (Step 4: Information Layers)`);
    if (contentLayer === 'pillar') {
        console.log(`[OutlineGenerator] → Pillar article - targeting broad topic (Level 1)`);
    } else if (contentLayer === 'supporting') {
        console.log(`[OutlineGenerator] → Supporting article - targeting subtopics (Level 2)`);
    } else {
        console.log(`[OutlineGenerator] → Micro article - targeting specific questions (Level 3)`);
    }

    // Data-driven section count: 20% more than competitor average, clamped to [5, 20]
    const fallbackSections = isCluster ? 12 : 8;
    const targetSections = blueprint.avgSectionCount > 0
        ? Math.max(5, Math.min(20, Math.round(blueprint.avgSectionCount * 1.2)))
        : fallbackSections;
    const lang = options?.language || 'en';

    // Build competitor context for the outline prompt
    const consensusTopics = blueprint.consensusHeadings
        .slice(0, 15)
        .map(h => `"${h.heading}" (used by ${h.frequency}/${competitors.length} competitors)`)
        .join('\n');

    const gapsList = blueprint.contentGaps.map(g => `- ${g}`).join('\n');
    const anglesList = blueprint.uniqueAngles.map(a => `- ${a}`).join('\n');
    const statsList = blueprint.keyStatistics
        .slice(0, 10)
        .map(s => `- ${s.stat} (cited by ${s.frequency} competitors)`)
        .join('\n');
    const faqList = blueprint.faqPatterns
        .slice(0, 10)
        .map(q => `- ${q}`)
        .join('\n');
    const paaList = (options?.paaQuestions || [])
        .map(q => `- ${q}`)
        .join('\n');

    // Build competitor title list for differentiation
    const competitorTitles = competitors
        .slice(0, 8)
        .map((c, i) => `${i + 1}. "${c.title}"`)
        .join('\n');

    const prompt = `Create a detailed article outline for the keyword: "${keyword}"
${options?.niche ? `Niche: ${options.niche}` : ''}
${lang !== 'en' ? `Language: Write all headings and descriptions in ${lang}` : ''}

COMPETITOR RESEARCH (from top ${competitors.length} ranked articles in Google US):
- Average word count: ${blueprint.avgWordCount} words
- Average section count: ${blueprint.avgSectionCount} H2 sections
- Most competitors have tables: ${competitors.filter(c => c.hasTables).length}/${competitors.length}

COMPETITOR TITLES (you MUST differentiate from these — do NOT copy their angle):
${competitorTitles || '(No competitor data available)'}

CONSENSUS HEADINGS (topics most competitors cover — you MUST include these):
${consensusTopics}

CONTENT GAPS (topics competitors MISS — you SHOULD exploit these):
${gapsList}

UNIQUE ANGLES (differentiation opportunities):
${anglesList}

KEY STATISTICS frequently cited:
${statsList}

FAQ QUESTIONS from competitors:
${faqList}

PEOPLE ALSO ASK questions:
${paaList}

REQUIREMENTS:
1. Create ${targetSections}-${targetSections + 4} H2 sections
2. Total target: ${minWords}+ words
3. Each H2 must have 2-4 H3 subsections
4. Cover ALL consensus topics PLUS at least 3 content gaps
5. Include specific data points and statistics to reference
6. Mark which sections should target featured snippets (paragraph, list, or table format)
7. Each section needs a "writingAngle" — a brief instruction on HOW to write it (e.g., "Compare with specific metrics", "Tell a story about a real use case", "Present step-by-step with examples")

H2/H3 HEADING RULES (CRITICAL FOR SEO + AEO):
- At least 30% of H2s must include "${keyword}" or a close semantic variation
- At least 2 H2s must be QUESTION-BASED ("What Is...", "How Does...", "Why Should...") for AEO/AI Overview targeting
- Mix heading formats: question-based, action-based ("How to...", "X Steps to..."), and statement-based ("Key Factors", "Proven Strategies")
- NEVER use these generic H2 patterns: "Understanding X", "The Importance of X", "Exploring X", "An Overview of X", "Introduction to X", "Benefits of X" (too vague for ranking)
- Each H2 must be SPECIFIC and convey what the reader GETS from that section
  GOOD: "5 ${keyword} Mistakes That Cost Companies 40% Revenue"
  BAD: "Understanding ${keyword} Best Practices"
- H3s should be specific sub-topics, NOT generic labels like "Overview", "Key Details", "Best Practices"
- At least 1 H3 per section should be a question that a user might search for

TITLE & META TITLE RULES (CRITICAL FOR CTR):

H1 TITLE ("title" field):
- Must include the primary keyword naturally
- Use ONE proven CTR formula:
  * Number + Keyword + Promise: "7 ${keyword} Strategies That Actually Work in ${new Date().getFullYear()}"
  * Keyword + Specific Outcome: "${keyword}: How We Increased Results by 312%"
  * Question + Answer Hook: "Is ${keyword} Worth It? Here's What the Data Shows"
  * Bracket/Parenthetical: "${keyword} Explained [With Real Examples]"
  * Year + Insight: "${keyword} in ${new Date().getFullYear()}: What Changed and Why It Matters"
- Include a POWER WORD: proven, essential, surprising, data-backed, tested, real, actionable, critical
- NEVER use these generic patterns: "Ultimate Guide", "Complete Guide", "Everything You Need to Know", "Comprehensive Overview", "A Deep Dive Into", "All You Need to Know", "Definitive Guide", "101"
- Must be DIFFERENT from all competitor titles listed above — find a unique angle

META TITLE ("metaTitle" field — this appears in Google search results):
- MUST be ≤ 60 characters (Google truncates longer titles)
- Keyword within the first 5 words
- Include a click trigger: year (${new Date().getFullYear()}), number, bracket [Guide], parenthetical (Proven), or power word
- Must be DIFFERENT from the H1 title — shorter, punchier, optimized for SERP clicks
- Example: "${keyword} Guide (${new Date().getFullYear()}) — 7 Proven Tips" or "Best ${keyword} Strategies [Tested & Ranked]"

Return JSON ONLY:
{
  "title": "Clickable H1 — keyword + power word + specific angle, NOT generic",
  "metaTitle": "≤60-char SERP title — keyword upfront, click trigger, DIFFERENT from H1",
  "metaDescription": "155-char description with keyword, benefit, and call-to-action",
  "introHook": "The FIRST sentence of the article — must DIRECTLY answer the keyword query with a specific claim, number, or finding. MUST contain the keyword. NEVER start with: 'In today's...', 'Have you ever...', 'In this article...', 'When it comes to...', 'Let's dive...', 'Are you looking for...'. GOOD: 'The best CRM for small business in 2026 is HubSpot — based on our analysis of 12 platforms across price, features, and ease of use.' BAD: 'In today's competitive landscape, choosing the right CRM can be challenging.'",
  "sections": [
    {
      "h2": "Specific, clickable H2 — include keyword or variation where natural. Use question/action/statement format. NEVER generic like 'Understanding X'",
      "h3s": ["Specific sub-topic H3 (not generic 'Overview')", "Question-format H3 a user might search", "Actionable H3 with clear value"],
      "targetWords": 250,
      "contentType": "explanation|comparison|list|case_study|stats|how_to",
      "snippetTarget": "paragraph|list|table|none",
      "keyDataPoints": ["specific stat or fact to include"],
      "writingAngle": "Brief instruction on approach"
    }
  ],
  "faqQuestions": [
    {"question": "Real question people ask", "targetWords": 60}
  ],
  "comparisonTable": {
    "topic": "What is being compared",
    "columns": ["Feature", "Option A", "Option B", "Option C", "Option D"],
    "rowDescriptions": ["row 1 topic", "row 2 topic", "row 3 topic"]
  },
  "keyTakeaways": ["5-7 specific, actionable takeaways"],
  "totalTargetWords": ${minWords}
}`;

    const systemPrompt = `You are an expert SEO content strategist who creates detailed article outlines that outrank competitors. Your outlines are data-driven, based on actual competitor analysis. Every heading must be specific and unique — never generic. Always respond in valid JSON.`;

    const result = await ai.generate('outline_generation', prompt, {
        systemPrompt,
        jsonMode: true,
        temperature: 0.5,
        maxTokens: isCluster ? 8192 : 4096,
    });

    try {
        const raw = JSON.parse(result);
        const parsed: ArticleOutline = validateOutline(raw, keyword, minWords);

        // Enrich sections with competitor excerpts
        parsed.sections = parsed.sections.map(section => {
            const excerpts = findRelevantExcerpts(section.h2, blueprint.topCompetitorSections);
            return {
                ...section,
                competitorExcerpts: excerpts,
                targetWords: Math.max(section.targetWords || 300, 250),
            };
        });

        // Ensure minimum total target words (proportional redistribution)
        const totalTarget = parsed.sections.reduce((sum, s) => sum + s.targetWords, 0);
        if (totalTarget < minWords) {
            const deficit = minWords - totalTarget;
            parsed.sections = parsed.sections.map(s => {
                const weight = s.targetWords / totalTarget;
                return {
                    ...s,
                    targetWords: s.targetWords + Math.ceil(deficit * weight),
                };
            });
        }

        parsed.totalTargetWords = Math.max(
            parsed.totalTargetWords || minWords,
            parsed.sections.reduce((sum, s) => sum + s.targetWords, 0)
        );

        return parsed;
    } catch {
        // Fallback: build a basic outline from consensus headings
        return buildFallbackOutline(keyword, blueprint, minWords);
    }
}

// ── Helper: find relevant competitor excerpts for a section ────

function findRelevantExcerpts(
    sectionHeading: string,
    topSections: { heading: string; excerpt: string; source: string }[]
): string[] {
    const headingWords = sectionHeading.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const scored = topSections.map(s => {
        const sectionWords = s.heading.toLowerCase().split(/\s+/);
        // Exact word match
        const exactOverlap = headingWords.filter(w => sectionWords.includes(w)).length;
        // Partial/stem match (e.g. "pricing" matches "price")
        const partialOverlap = headingWords.filter(w =>
            !sectionWords.includes(w) &&
            sectionWords.some(sw => (sw.length > 3 && w.length > 3) && (sw.startsWith(w.substring(0, 4)) || w.startsWith(sw.substring(0, 4))))
        ).length * 0.5;
        return { ...s, score: exactOverlap + partialOverlap };
    });

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(s => `[${s.source}]: ${s.excerpt.substring(0, 400)}`);
}

// ── Fallback outline when AI parsing fails ─────────────────────

const FALLBACK_CONTENT_TYPES: Array<OutlineSection['contentType']> = [
    'explanation', 'how_to', 'comparison', 'list', 'stats', 'case_study',
];

function buildFallbackOutline(
    keyword: string,
    blueprint: CompetitorBlueprint,
    minWords: number
): ArticleOutline {
    const headings = blueprint.consensusHeadings.slice(0, 10);
    const sections: OutlineSection[] = headings.map((h, i) => {
        const contentType = FALLBACK_CONTENT_TYPES[i % FALLBACK_CONTENT_TYPES.length];
        const h3s = generateContextualH3s(h.heading, keyword, contentType);
        return {
            h2: h.heading,
            h3s,
            targetWords: Math.ceil(minWords / Math.max(headings.length, 1)),
            contentType,
            snippetTarget: (contentType === 'list' || contentType === 'how_to' ? 'list' :
                contentType === 'comparison' || contentType === 'stats' ? 'table' : 'paragraph') as OutlineSection['snippetTarget'],
            keyDataPoints: blueprint.keyStatistics
                .filter(s => s.stat.toLowerCase().includes(h.heading.toLowerCase().split(' ')[0]) || s.frequency > 2)
                .slice(0, 2)
                .map(s => s.stat),
            competitorExcerpts: [],
            writingAngle: getWritingAngleForType(contentType),
        };
    });

    const titleCased = keyword.replace(/\b\w/g, l => l.toUpperCase());
    return {
        title: `${titleCased}: What the Data Actually Shows (${new Date().getFullYear()})`,
        metaTitle: `${titleCased} — Expert Analysis & Guide (${new Date().getFullYear()})`.substring(0, 60),
        metaDescription: `We analyzed ${blueprint.avgWordCount ? 'top-ranking articles' : 'the latest research'} on ${keyword}. Here are the key findings, comparisons, and actionable tips you need.`.substring(0, 155),
        introHook: `${titleCased} is more nuanced than most guides suggest — here is what the top-performing content actually reveals.`,
        sections,
        faqQuestions: blueprint.faqPatterns.slice(0, 6).map(q => ({
            question: q,
            targetWords: 80,
        })),
        comparisonTable: {
            topic: keyword,
            columns: ['Feature', 'Option A', 'Option B', 'Option C'],
            rowDescriptions: ['Key capability', 'Pricing', 'Best for'],
        },
        keyTakeaways: blueprint.contentGaps.length > 0
            ? blueprint.contentGaps.slice(0, 5)
            : [`Understand the core concepts of ${keyword}`, `Compare top options for ${keyword}`, `Follow proven best practices`],
        totalTargetWords: minWords,
    };
}

function generateContextualH3s(heading: string, keyword: string, contentType: OutlineSection['contentType']): string[] {
    const base = heading.split(' ').slice(0, 3).join(' ');
    switch (contentType) {
        case 'how_to': return [`How ${base} Works`, `Step-by-Step Process`, `Common Mistakes to Avoid`];
        case 'comparison': return [`${base} vs Alternatives`, `Key Differences`, `Which One to Choose`];
        case 'list': return [`Top ${base} Options`, `Evaluation Criteria`, `Our Recommendations`];
        case 'stats': return [`${base} by the Numbers`, `Trends and Patterns`, `What the Data Means`];
        case 'case_study': return [`Real-World ${base} Example`, `Results and Outcomes`, `Lessons Learned`];
        default: return [`What Is ${base}`, `Why ${base} Matters for ${keyword}`, `Key Considerations`];
    }
}

function getWritingAngleForType(contentType: OutlineSection['contentType']): string {
    switch (contentType) {
        case 'how_to': return 'Write step-by-step with concrete examples and common pitfalls';
        case 'comparison': return 'Compare with specific metrics and real data points';
        case 'list': return 'Present as a curated, ranked list with brief justifications';
        case 'stats': return 'Lead with data, cite sources, and interpret what the numbers mean';
        case 'case_study': return 'Tell a specific story with measurable outcomes';
        default: return 'Explain clearly with examples, avoiding generic overviews';
    }
}

// ── Runtime Validation ─────────────────────────────────────────

const VALID_CONTENT_TYPES = ['explanation', 'comparison', 'list', 'case_study', 'stats', 'how_to'];
const VALID_SNIPPET_TARGETS = ['paragraph', 'list', 'table', 'none'];

// Title anti-patterns that must be blocked
const GENERIC_TITLE_PATTERNS = [
    /ultimate guide/i, /complete guide/i, /definitive guide/i,
    /everything you need to know/i, /comprehensive overview/i,
    /a deep dive/i, /all you need to know/i, /\b101\b/,
    /in-depth look/i, /the complete breakdown/i,
    /what you should know/i, /an introduction to/i,
];

const POWER_WORDS = [
    'proven', 'essential', 'surprising', 'data-backed', 'tested',
    'real', 'actionable', 'critical', 'best', 'top', 'actual',
    'effective', 'fastest', 'simple', 'secret', 'expert',
];

function validateTitle(title: string, keyword: string): string {
    let result = title;

    // Strip generic patterns
    for (const pattern of GENERIC_TITLE_PATTERNS) {
        if (pattern.test(result)) {
            // Replace with keyword-focused alternative
            const year = new Date().getFullYear();
            const kw = keyword.replace(/\b\w/g, l => l.toUpperCase());
            result = `${kw}: What the Data Actually Shows (${year})`;
            break;
        }
    }

    // Ensure keyword is present (case-insensitive)
    if (!result.toLowerCase().includes(keyword.toLowerCase())) {
        const kw = keyword.replace(/\b\w/g, l => l.toUpperCase());
        result = `${kw}: ${result}`;
    }

    return result;
}

function validateMetaTitle(metaTitle: string, keyword: string, h1Title: string): string {
    let result = metaTitle;

    // Ensure ≤ 60 chars
    if (result.length > 60) {
        result = result.substring(0, 57) + '...';
    }

    // Ensure keyword is in the first 5 words
    const words = result.split(/\s+/);
    const keywordLower = keyword.toLowerCase();
    const keywordInFirst5 = words.slice(0, 5).some(w =>
        w.toLowerCase().includes(keywordLower.split(' ')[0])
    );
    if (!keywordInFirst5) {
        const kw = keyword.replace(/\b\w/g, l => l.toUpperCase());
        const year = new Date().getFullYear();
        result = `${kw} (${year}) — ${result}`.substring(0, 60);
    }

    // Ensure it's different from H1 (if identical, add a click trigger)
    if (result.toLowerCase() === h1Title.toLowerCase()) {
        const year = new Date().getFullYear();
        result = `${result} [${year} Guide]`.substring(0, 60);
    }

    return result;
}

function validateOutline(raw: Record<string, unknown>, keyword: string, minWords: number): ArticleOutline {
    const rawTitle = typeof raw.title === 'string' && raw.title.length > 0
        ? raw.title : keyword.replace(/\b\w/g, l => l.toUpperCase());
    const title = validateTitle(rawTitle, keyword);

    const rawMetaTitle = typeof raw.metaTitle === 'string' && raw.metaTitle.length > 0
        ? raw.metaTitle : `${title} — Guide`.substring(0, 60);
    const metaTitle = validateMetaTitle(rawMetaTitle, keyword, title);

    const metaDescription = typeof raw.metaDescription === 'string' && raw.metaDescription.length > 0
        ? raw.metaDescription.substring(0, 160) : `Everything you need to know about ${keyword}.`;
    const introHook = typeof raw.introHook === 'string' && raw.introHook.length > 0
        ? raw.introHook : `Here is what you need to know about ${keyword}.`;

    // Validate sections array
    const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
    if (rawSections.length === 0) {
        throw new Error('AI returned empty sections — triggering fallback');
    }

    const sections: OutlineSection[] = rawSections.map((s: Record<string, unknown>) => ({
        h2: typeof s.h2 === 'string' ? s.h2 : 'Untitled Section',
        h3s: Array.isArray(s.h3s) ? s.h3s.filter((h: unknown) => typeof h === 'string') : [],
        targetWords: typeof s.targetWords === 'number' ? Math.max(s.targetWords, 150) : 300,
        contentType: (typeof s.contentType === 'string' && VALID_CONTENT_TYPES.includes(s.contentType)
            ? s.contentType : 'explanation') as OutlineSection['contentType'],
        snippetTarget: (typeof s.snippetTarget === 'string' && VALID_SNIPPET_TARGETS.includes(s.snippetTarget)
            ? s.snippetTarget : 'none') as OutlineSection['snippetTarget'],
        keyDataPoints: Array.isArray(s.keyDataPoints) ? s.keyDataPoints.filter((d: unknown) => typeof d === 'string') : [],
        competitorExcerpts: [],
        writingAngle: typeof s.writingAngle === 'string' ? s.writingAngle : 'Provide detailed explanation with examples',
    }));

    // Validate FAQ
    const faqQuestions = Array.isArray(raw.faqQuestions)
        ? raw.faqQuestions.map((q: Record<string, unknown>) => ({
            question: typeof q.question === 'string' ? q.question : '',
            targetWords: typeof q.targetWords === 'number' ? q.targetWords : 60,
        })).filter((q: { question: string }) => q.question.length > 0)
        : [];

    // Validate comparison table
    const rawTable = raw.comparisonTable as Record<string, unknown> | undefined;
    const comparisonTable = rawTable && typeof rawTable.topic === 'string'
        ? {
            topic: rawTable.topic,
            columns: Array.isArray(rawTable.columns) ? rawTable.columns.filter((c: unknown) => typeof c === 'string') : ['Feature', 'Option A', 'Option B'],
            rowDescriptions: Array.isArray(rawTable.rowDescriptions) ? rawTable.rowDescriptions.filter((r: unknown) => typeof r === 'string') : [],
        }
        : { topic: keyword, columns: ['Feature', 'Option A', 'Option B', 'Option C'], rowDescriptions: ['Key capability', 'Pricing', 'Best for'] };

    const keyTakeaways = Array.isArray(raw.keyTakeaways)
        ? raw.keyTakeaways.filter((t: unknown) => typeof t === 'string')
        : [];

    return {
        title,
        metaTitle,
        metaDescription,
        introHook,
        sections,
        faqQuestions,
        comparisonTable,
        keyTakeaways,
        totalTargetWords: typeof raw.totalTargetWords === 'number' ? raw.totalTargetWords : minWords,
    };
}
