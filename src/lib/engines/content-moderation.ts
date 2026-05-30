// ============================================================
// RankMaster Pro - Content Moderation Engine
// Scans content for YMYL topics, harmful/toxic patterns,
// and injects appropriate disclaimers. Provides a safety
// gate before publishing to WordPress.
// ============================================================

export interface ModerationResult {
    safe: boolean;
    ymylCategory: YMYLCategory | null;
    flags: ModerationFlag[];
    disclaimers: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    summary: string;
}

export interface ModerationFlag {
    type: 'ymyl' | 'harmful_advice' | 'medical_claim' | 'legal_claim' | 'financial_claim' | 'toxicity' | 'profanity' | 'misinformation_risk';
    severity: 'low' | 'medium' | 'high' | 'critical';
    text: string;
    suggestion: string;
}

export type YMYLCategory =
    | 'medical_health'
    | 'financial'
    | 'legal'
    | 'safety'
    | 'news_current_events'
    | 'civic_government'
    | null;

// ── YMYL Topic Detection ─────────────────────────────────────

const YMYL_PATTERNS: { category: YMYLCategory; patterns: RegExp[] }[] = [
    {
        category: 'medical_health',
        patterns: [
            /\b(diagnos(?:e|is|ed|ing)|symptom|treatment|medication|dosage|drug|prescription|disease|disorder|syndrome|therapy|clinical|patient)\b/gi,
            /\b(cancer|diabetes|depression|anxiety|adhd|autism|hiv|aids|heart disease|stroke|hypertension)\b/gi,
            /\b(take \d+ mg|before surgery|after surgery|medical advice|consult (?:a |your )?(?:doctor|physician|healthcare))\b/gi,
            /\b(cure|heal|remedy|supplement|vitamin|herb(?:al)?|natural (?:treatment|remedy|cure))\b/gi,
            /\b(side effect|contraindication|interaction|overdose|withdrawal)\b/gi,
        ],
    },
    {
        category: 'financial',
        patterns: [
            /\b(stock market|crypto(?:currency)?|bitcoin|ethereum|portfolio allocation|day trading|stock broker|investment portfolio|investment returns?)\b/gi,
            /\b(tax(?:es|ation)?|irs|deduction|credit score|bankruptcy|debt|loan|mortgage|refinanc)\b/gi,
            /\b(retirement|401k|ira|pension|social security|annuity)\b/gi,
            /\b(guaranteed returns?|get rich|passive income|financial (?:freedom|independence)|make money (?:fast|quick))\b/gi,
        ],
    },
    {
        category: 'legal',
        patterns: [
            /\b(legal advice|attorney|lawyer|lawsuit|litigation|sue|court|judge|verdict|settlement)\b/gi,
            /\b(contract|liability|negligence|malpractice|custody|divorce|probate|will and testament)\b/gi,
            /\b(your rights|illegal|criminal|felony|misdemeanor|statute of limitations)\b/gi,
        ],
    },
    {
        category: 'safety',
        patterns: [
            /\b(poison|toxic|hazardous|flammable|explosive|lethal|dangerous substance)\b/gi,
            /\b(child safety|firearm|weapon|self[- ]harm|suicid(?:e|al)|eating disorder)\b/gi,
            /\b(emergency|911|first aid|cpr|choking|allergic reaction|anaphyla)\b/gi,
        ],
    },
    {
        category: 'civic_government',
        patterns: [
            /\b(vote|voting|election|ballot|candidate|political party|democrat|republican)\b/gi,
            /\b(immigration|visa|asylum|deportation|citizenship|green card)\b/gi,
        ],
    },
];

// ── Harmful Content Detection ─────────────────────────────────

const HARMFUL_ADVICE_PATTERNS: { pattern: RegExp; severity: ModerationFlag['severity']; suggestion: string }[] = [
    // Medical harm
    { pattern: /\b(?:stop taking|quit|discontinue) (?:your )?(medication|prescription|medicine|insulin|antidepressant)/gi, severity: 'critical', suggestion: 'Never advise readers to stop medication without consulting a doctor. Add "consult your healthcare provider" disclaimer.' },
    { pattern: /\b(?:cures?|heals?|eliminates?) (?:cancer|diabetes|depression|anxiety|adhd|autism)/gi, severity: 'critical', suggestion: 'Claiming a cure for serious medical conditions can be dangerous. Use "may help manage symptoms" and cite medical sources.' },
    { pattern: /\b(?:no need for|skip|avoid) (?:a )?(?:doctor|physician|medical|professional|healthcare)/gi, severity: 'high', suggestion: 'Never discourage seeking professional medical help. Add a "consult your doctor" disclaimer.' },

    // Financial harm
    { pattern: /\b(?:guaranteed|risk[- ]free|can'?t lose|100% return|double your money)/gi, severity: 'high', suggestion: 'Financial guarantees are misleading. Add "past performance does not guarantee future results" disclaimer.' },
    { pattern: /\b(?:invest your life savings|put all your money|go all[- ]in on)/gi, severity: 'high', suggestion: 'Never advise putting all savings into one investment. Add investment risk disclaimer.' },

    // Legal harm
    { pattern: /\b(?:this (?:is|constitutes) legal advice|you (?:should|must) sue|file a lawsuit without)/gi, severity: 'high', suggestion: 'Content should not be positioned as legal advice. Add "this is not legal advice, consult an attorney" disclaimer.' },
];

// ── Toxicity & Profanity Detection ─────────────────────────────

const PROFANITY_PATTERNS = [
    /\b(?:fuck|shit|damn|hell|ass|bitch|bastard|crap|dick|piss)\b/gi,
];

const TOXICITY_PATTERNS: { pattern: RegExp; severity: ModerationFlag['severity'] }[] = [
    { pattern: /\b(?:kill yourself|kys|end your life|commit suicide)\b/gi, severity: 'critical' },
    { pattern: /\b(?:racial slur|hate speech|discriminat(?:e|ion|ory))\b/gi, severity: 'high' },
    { pattern: /\b(?:all (?:men|women|blacks|whites|asians|muslims|jews|christians) (?:are|should))\b/gi, severity: 'high' },
];

// ── YMYL Disclaimer Templates ─────────────────────────────────

const YMYL_DISCLAIMERS: Record<string, string> = {
    medical_health: '<div class="disclaimer disclaimer-medical"><strong>⚕️ Medical Disclaimer:</strong> This article is for informational purposes only and does not constitute medical advice. Always consult a qualified healthcare professional before making decisions about your health or treatment.</div>',
    financial: '<div class="disclaimer disclaimer-financial"><strong>💰 Financial Disclaimer:</strong> This article is for informational purposes only and does not constitute financial, investment, or tax advice. Past performance does not guarantee future results. Consult a qualified financial advisor before making investment decisions.</div>',
    legal: '<div class="disclaimer disclaimer-legal"><strong>⚖️ Legal Disclaimer:</strong> This article is for informational purposes only and does not constitute legal advice. Laws vary by jurisdiction. Consult a qualified attorney for legal guidance specific to your situation.</div>',
    safety: '<div class="disclaimer disclaimer-safety"><strong>🛡️ Safety Notice:</strong> This article contains information about potentially dangerous topics. Always follow proper safety procedures and consult professionals when needed. If you or someone you know is in crisis, contact emergency services immediately.</div>',
    civic_government: '',
    news_current_events: '',
};

// ── Main Moderation Function ─────────────────────────────────

/**
 * Scans content for YMYL topics, harmful advice, toxicity,
 * and profanity. Returns moderation result with flags and
 * recommended disclaimers.
 */
export function moderateContent(content: string, niche?: string): ModerationResult {
    const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const flags: ModerationFlag[] = [];
    const disclaimers: string[] = [];

    // 1. YMYL Category Detection
    let ymylCategory: YMYLCategory = null;
    let maxYmylMatches = 0;

    for (const { category, patterns } of YMYL_PATTERNS) {
        let matchCount = 0;
        for (const pattern of patterns) {
            pattern.lastIndex = 0;
            const matches = plainText.match(pattern);
            if (matches) matchCount += matches.length;
        }

        // Need at least 5 matches to classify as YMYL (avoid false positives)
        if (matchCount >= 5 && matchCount > maxYmylMatches) {
            maxYmylMatches = matchCount;
            ymylCategory = category;
        }
    }

    if (ymylCategory) {
        flags.push({
            type: 'ymyl',
            severity: 'medium',
            text: `Content classified as YMYL: ${ymylCategory.replace(/_/g, ' ')}`,
            suggestion: 'YMYL content requires extra scrutiny. Ensure all claims are sourced and add appropriate disclaimers.',
        });

        const disclaimer = YMYL_DISCLAIMERS[ymylCategory];
        if (disclaimer) {
            disclaimers.push(disclaimer);
        }
    }

    // 2. Harmful Advice Detection
    for (const { pattern, severity, suggestion } of HARMFUL_ADVICE_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(plainText)) !== null) {
            flags.push({
                type: 'harmful_advice',
                severity,
                text: match[0].trim(),
                suggestion,
            });
        }
    }

    // 3. Toxicity Detection
    for (const { pattern, severity } of TOXICITY_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(plainText)) !== null) {
            flags.push({
                type: 'toxicity',
                severity,
                text: match[0].trim(),
                suggestion: 'Remove toxic or harmful content immediately.',
            });
        }
    }

    // 4. Profanity Detection
    for (const pattern of PROFANITY_PATTERNS) {
        pattern.lastIndex = 0;
        const matches = plainText.match(pattern);
        if (matches && matches.length > 0) {
            flags.push({
                type: 'profanity',
                severity: 'low',
                text: `${matches.length} profanity instance(s) detected`,
                suggestion: 'Remove or censor profanity for professional blog content.',
            });
        }
    }

    // 5. Specific claim type classification (for YMYL content)
    if (ymylCategory === 'medical_health') {
        const medicalClaims = plainText.match(/\b(?:studies? show|research proves?|clinically proven|scientifically verified)\b/gi);
        if (medicalClaims && medicalClaims.length > 0) {
            // Check if citations exist nearby
            const hasCitations = /<a\s+href/i.test(content) || /\[source\]/i.test(content);
            if (!hasCitations) {
                flags.push({
                    type: 'medical_claim',
                    severity: 'high',
                    text: `${medicalClaims.length} medical claim(s) without source citations`,
                    suggestion: 'Every medical claim must link to a peer-reviewed study or authoritative medical source.',
                });
            }
        }
    }

    if (ymylCategory === 'financial') {
        const financialClaims = plainText.match(/\b(?:guaranteed returns?|risk[- ]free|can'?t lose|will make you (?:rich|wealthy|money))\b/gi);
        if (financialClaims && financialClaims.length > 0) {
            flags.push({
                type: 'financial_claim',
                severity: 'high',
                text: `${financialClaims.length} misleading financial claim(s)`,
                suggestion: 'Remove guarantees. Add "investing involves risk" disclaimer and note past performance doesn\'t guarantee future results.',
            });
        }
    }

    if (ymylCategory === 'legal') {
        const legalClaims = plainText.match(/\b(?:you (?:should|must|need to)|the law (?:requires|says|states))\b/gi);
        if (legalClaims && legalClaims.length > 2) {
            flags.push({
                type: 'legal_claim',
                severity: 'medium',
                text: `${legalClaims.length} directive legal statement(s)`,
                suggestion: 'Use softer language: "you may want to consider" instead of "you must". Laws vary by jurisdiction.',
            });
        }
    }

    // Calculate risk level
    const criticalCount = flags.filter(f => f.severity === 'critical').length;
    const highCount = flags.filter(f => f.severity === 'high').length;

    let riskLevel: ModerationResult['riskLevel'] = 'low';
    if (criticalCount > 0) riskLevel = 'critical';
    else if (highCount >= 2) riskLevel = 'high';
    else if (highCount >= 1 || flags.length >= 3) riskLevel = 'medium';

    const safe = riskLevel !== 'critical';

    // Generate summary
    let summary: string;
    if (flags.length === 0) {
        summary = 'Content passed moderation with no flags.';
    } else if (riskLevel === 'critical') {
        summary = `BLOCKED: ${criticalCount} critical safety issue(s) detected. Content must be revised before publishing.`;
    } else if (riskLevel === 'high') {
        summary = `${flags.length} moderation flag(s) detected including ${highCount} high-severity issue(s). Manual review recommended.`;
    } else {
        summary = `${flags.length} minor moderation flag(s) detected. ${ymylCategory ? 'YMYL disclaimer added.' : ''}`;
    }

    return {
        safe,
        ymylCategory,
        flags,
        disclaimers,
        riskLevel,
        summary,
    };
}

/**
 * Injects YMYL disclaimers into HTML content at the appropriate
 * position (after the first paragraph).
 */
export function injectDisclaimers(html: string, disclaimers: string[]): string {
    if (disclaimers.length === 0) return html;

    const disclaimerBlock = disclaimers.join('\n');

    // Insert after the first paragraph
    const firstParaEnd = html.indexOf('</p>');
    if (firstParaEnd !== -1) {
        return html.slice(0, firstParaEnd + 4) + '\n' + disclaimerBlock + '\n' + html.slice(firstParaEnd + 4);
    }

    // Fallback: prepend
    return disclaimerBlock + '\n' + html;
}
