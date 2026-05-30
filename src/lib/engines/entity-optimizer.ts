// ============================================================
// RankMaster Pro - Entity Optimizer Engine
// #46 — NLP Entity Extraction & Saturation Analysis
// Ensures content covers the entities Google associates with a topic
// ============================================================

import { getAIRouter } from '../ai/router';
import { createSingleton } from '../singleton';

// ── Types ──────────────────────────────────────────────────────

export interface Entity {
    name: string;
    type: 'Person' | 'Organization' | 'Product' | 'Concept' | 'Location' | 'Technology' | 'Event';
    importance: 'critical' | 'important' | 'supplementary';
    wikiUrl?: string;      // For sameAs schema
    description?: string;  // Brief description
}

export interface EntityAnalysis {
    foundEntities: Entity[];
    expectedEntities: Entity[];
    missingEntities: Entity[];
    saturationScore: number;     // 0-100
    recommendations: string[];
    schemaEntities: EntitySchemaItem[];
}

export interface EntitySchemaItem {
    '@type': string;
    name: string;
    sameAs?: string;
    description?: string;
}

// ── Entity Optimizer Class ────────────────────────────────────

export class EntityOptimizer {

    /**
     * Extract named entities from content using AI
     */
    async extractEntities(content: string): Promise<Entity[]> {
        const ai = getAIRouter();
        const fullText = content.replace(/<[^>]+>/g, ' ');

        // CT-1 FIX: Chunked processing — split into overlapping 3500-char windows
        // to ensure entities from the entire article are captured.
        const CHUNK_SIZE = 3500;
        const OVERLAP = 500;
        const chunks: string[] = [];
        for (let i = 0; i < fullText.length; i += CHUNK_SIZE - OVERLAP) {
            chunks.push(fullText.substring(i, i + CHUNK_SIZE));
            if (i + CHUNK_SIZE >= fullText.length) break;
        }

        const allEntities: Entity[] = [];
        const seenNames = new Set<string>();

        for (const chunk of chunks) {
            const prompt = `Extract ALL named entities from this content. Include people, organizations, products, technologies, concepts, and locations.

CONTENT:
${chunk}

Return JSON:
{
  "entities": [
    {
      "name": "Google",
      "type": "Organization",
      "importance": "critical",
      "wikiUrl": "https://en.wikipedia.org/wiki/Google",
      "description": "Multinational technology company"
    }
  ]
}

Rules:
- Include EVERY proper noun and key concept mentioned
- Type must be one of: Person, Organization, Product, Concept, Technology, Location, Event
- importance: "critical" (central to the topic), "important" (mentioned meaningfully), "supplementary" (brief mention)
- wikiUrl: Wikipedia or authoritative URL if known`;

            try {
                const result = await ai.generate('entity_extraction', prompt, {
                    systemPrompt: 'You are an NER (Named Entity Recognition) specialist. Extract entities accurately. Return valid JSON.',
                    jsonMode: true,
                    temperature: 0.2,
                });

                const parsed = JSON.parse(result);
                for (const e of (parsed.entities || [])) {
                    const key = (e.name || '').toLowerCase().trim();
                    if (key && !seenNames.has(key)) {
                        seenNames.add(key);
                        allEntities.push({
                            name: e.name,
                            type: e.type || 'Concept',
                            importance: e.importance || 'supplementary',
                            wikiUrl: e.wikiUrl,
                            description: e.description,
                        });
                    }
                }
            } catch {
                // Continue processing remaining chunks even if one fails
            }
        }

        return allEntities;
    }

    /**
     * Get expected entities for a keyword based on competitor content
     */
    async getExpectedEntities(
        keyword: string,
        competitorContent?: string[]
    ): Promise<Entity[]> {
        const ai = getAIRouter();

        const competitorContext = competitorContent && competitorContent.length > 0
            ? `\nCOMPETITOR CONTENT EXCERPTS:\n${competitorContent.map((c, i) => `--- Competitor ${i + 1} ---\n${c.substring(0, 1000)}`).join('\n')}`
            : '';

        const prompt = `What entities (people, organizations, products, concepts, technologies) does Google associate with the topic "${keyword}"?

List the entities that would appear in 60%+ of top-ranking pages for this keyword.${competitorContext}

Return JSON:
{
  "entities": [
    {
      "name": "Entity Name",
      "type": "Organization",
      "importance": "critical",
      "wikiUrl": "https://...",
      "description": "Brief description"
    }
  ]
}

Include 10-20 entities, ordered by importance.`;

        try {
            const result = await ai.generate('entity_extraction', prompt, {
                systemPrompt: 'You are a topical entity expert. Identify entities Google associates with search topics. Return valid JSON.',
                jsonMode: true,
                temperature: 0.3,
            });

            const parsed = JSON.parse(result);
            return (parsed.entities || []).map((e: Entity) => ({
                name: e.name,
                type: e.type || 'Concept',
                importance: e.importance || 'important',
                wikiUrl: e.wikiUrl,
                description: e.description,
            }));
        } catch {
            return [];
        }
    }

    /**
     * Score entity saturation — how many expected entities are present
     */
    scoreEntitySaturation(content: string, expectedEntities: Entity[]): number {
        if (expectedEntities.length === 0) return 100;

        const textContent = content.replace(/<[^>]+>/g, ' ').toLowerCase();
        let found = 0;
        let weightedFound = 0;
        let totalWeight = 0;

        for (const entity of expectedEntities) {
            const weight = entity.importance === 'critical' ? 3
                : entity.importance === 'important' ? 2
                : 1;
            totalWeight += weight;

            if (textContent.includes(entity.name.toLowerCase())) {
                found++;
                weightedFound += weight;
            }
        }

        return totalWeight > 0
            ? Math.round((weightedFound / totalWeight) * 100)
            : 100;
    }

    /**
     * Find missing entities that should be added to content
     */
    suggestMissingEntities(content: string, expectedEntities: Entity[]): Entity[] {
        const textContent = content.replace(/<[^>]+>/g, ' ').toLowerCase();
        return expectedEntities.filter(entity =>
            !textContent.includes(entity.name.toLowerCase())
        );
    }

    /**
     * Full analysis pipeline: extract, compare, score, recommend
     */
    async analyzeEntities(
        content: string,
        keyword: string,
        competitorContent?: string[]
    ): Promise<EntityAnalysis> {
        const [foundEntities, expectedEntities] = await Promise.all([
            this.extractEntities(content),
            this.getExpectedEntities(keyword, competitorContent),
        ]);

        const missingEntities = this.suggestMissingEntities(content, expectedEntities);
        const saturationScore = this.scoreEntitySaturation(content, expectedEntities);

        const recommendations: string[] = [];

        if (saturationScore < 50) {
            recommendations.push(`Low entity coverage (${saturationScore}%). Add mentions of: ${missingEntities.slice(0, 5).map(e => e.name).join(', ')}`);
        } else if (saturationScore < 75) {
            recommendations.push(`Moderate entity coverage. Consider adding: ${missingEntities.slice(0, 3).map(e => e.name).join(', ')}`);
        }

        const criticalMissing = missingEntities.filter(e => e.importance === 'critical');
        if (criticalMissing.length > 0) {
            recommendations.push(`CRITICAL entities missing: ${criticalMissing.map(e => e.name).join(', ')}`);
        }

        // #47 — Generate schema entities for SameAs linking
        const schemaEntities: EntitySchemaItem[] = foundEntities
            .filter(e => e.wikiUrl && e.importance !== 'supplementary')
            .map(e => ({
                '@type': e.type === 'Person' ? 'Person'
                    : e.type === 'Organization' ? 'Organization'
                    : e.type === 'Product' ? 'Product'
                    : e.type === 'Location' ? 'Place'
                    : 'Thing',
                name: e.name,
                sameAs: e.wikiUrl,
                description: e.description,
            }));

        return {
            foundEntities,
            expectedEntities,
            missingEntities,
            saturationScore,
            recommendations,
            schemaEntities,
        };
    }
}

export const getEntityOptimizer = createSingleton(() => new EntityOptimizer());
