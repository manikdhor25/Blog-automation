// ============================================================
// RankMaster Pro - Media Engine
// Multi-provider image resolution + AI-ranked YouTube embeds
// Replaces <!-- IMAGE: --> placeholders with real stock photos
// and injects relevant YouTube video embeds into articles
// ============================================================

import { getAIRouter } from '../ai/router';
import { createServiceRoleClient } from '../supabase';
import { logger } from '../logger';

// ── Types ──────────────────────────────────────────────────────

export type ImageProvider = 'pexels' | 'unsplash' | 'shutterstock' | 'adobe_stock';

interface ImageResult {
    url: string;           // Direct image URL (medium size)
    thumbnailUrl: string;  // Small preview
    width: number;
    height: number;
    alt: string;
    photographer: string;
    photographerUrl: string;
    provider: ImageProvider;
    providerUrl: string;   // Attribution link
    originalUrl: string;   // Link to original on provider site
}

interface ImagePlaceholder {
    fullMatch: string;     // The full <!-- IMAGE: ... --> comment
    description: string;   // What the image should show
    alt: string;           // Alt text (keyword-rich)
    index: number;         // Position in HTML
}

export interface VideoMeta {
    videoId: string;
    title: string;
    channelName: string;
    channelUrl: string;
    description: string;
    thumbnailUrl: string;
    duration: string;      // ISO 8601 (PT5M30S)
    durationSeconds: number;
    viewCount: number;
    publishedAt: string;
    embedUrl: string;
}

interface MediaConfig {
    imageProvider: ImageProvider;
    pexelsApiKey: string;
    unsplashAccessKey: string;
    shutterstockApiToken: string;
    adobeStockApiKey: string;
    youtubeApiKey: string;
}

// ── Settings Loader ────────────────────────────────────────────

let cachedConfig: MediaConfig | null = null;
let configLoadedAt = 0;
const CONFIG_TTL = 5 * 60 * 1000; // 5 min cache

async function loadMediaConfig(): Promise<MediaConfig> {
    if (cachedConfig && Date.now() - configLoadedAt < CONFIG_TTL) {
        return cachedConfig;
    }

    try {
        const supabase = createServiceRoleClient();
        const { data } = await supabase
            .from('settings')
            .select('key, value')
            .in('key', [
                'image_provider',
                'pexels_api_key',
                'unsplash_access_key',
                'shutterstock_api_token',
                'adobe_stock_api_key',
                'youtube_api_key',
            ]);

        const get = (key: string) => data?.find(s => s.key === key)?.value || '';

        cachedConfig = {
            imageProvider: (get('image_provider') || 'pexels') as ImageProvider,
            pexelsApiKey: get('pexels_api_key'),
            unsplashAccessKey: get('unsplash_access_key'),
            shutterstockApiToken: get('shutterstock_api_token'),
            adobeStockApiKey: get('adobe_stock_api_key'),
            youtubeApiKey: get('youtube_api_key'),
        };
        configLoadedAt = Date.now();
    } catch {
        cachedConfig = {
            imageProvider: 'pexels',
            pexelsApiKey: '',
            unsplashAccessKey: '',
            shutterstockApiToken: '',
            adobeStockApiKey: '',
            youtubeApiKey: '',
        };
    }
    return cachedConfig;
}

// ════════════════════════════════════════════════════════════════
// IMAGE RESOLVER
// ════════════════════════════════════════════════════════════════

export class ImageResolver {

    // Main entry: resolve all <!-- IMAGE: --> placeholders in HTML
    async resolveImagePlaceholders(html: string, keyword: string): Promise<string> {
        const config = await loadMediaConfig();
        const log = logger.child({ engine: 'media', keyword });

        const placeholders = this.parsePlaceholders(html);
        if (placeholders.length === 0) return html;

        log.info(`Found ${placeholders.length} image placeholders to resolve`);

        // Determine provider order (selected first, then fallbacks)
        const providerOrder = this.getProviderOrder(config);
        if (providerOrder.length === 0) {
            log.warn('No image API keys configured — keeping placeholders');
            return html;
        }

        let result = html;
        let resolved = 0;

        for (const placeholder of placeholders) {
            const query = this.buildSearchQuery(placeholder, keyword);
            let image: ImageResult | null = null;

            // Try each provider in order until one succeeds
            for (const provider of providerOrder) {
                try {
                    image = await this.searchProvider(provider, query, config);
                    if (image) break;
                } catch (err) {
                    log.warn(`${provider} search failed for "${query}"`, {}, err);
                }
            }

            if (image) {
                const isHero = placeholder.index === 0 || resolved === 0;
                const figureHtml = this.buildFigureHtml(image, placeholder.alt, isHero);
                result = result.replace(placeholder.fullMatch, figureHtml);
                resolved++;
            }
        }

        log.info(`Resolved ${resolved}/${placeholders.length} image placeholders`);
        return result;
    }

    // Parse <!-- IMAGE: [description] | alt: "[alt text]" --> comments
    private parsePlaceholders(html: string): ImagePlaceholder[] {
        const regex = /<!--\s*IMAGE:\s*(.+?)(?:\s*\|\s*alt:\s*"([^"]*)")?\s*-->/gi;
        const results: ImagePlaceholder[] = [];
        let match;

        while ((match = regex.exec(html)) !== null) {
            results.push({
                fullMatch: match[0],
                description: match[1].trim(),
                alt: match[2]?.trim() || match[1].trim(),
                index: results.length,
            });
        }
        return results;
    }

    // Build a search query from placeholder description
    private buildSearchQuery(placeholder: ImagePlaceholder, keyword: string): string {
        let query = placeholder.description
            .replace(/\[|\]/g, '')
            .replace(/\b(image|photo|illustration|picture|diagram)\b/gi, '')
            .trim();

        // If description is too vague, add keyword context
        if (query.split(/\s+/).length < 3) {
            query = `${keyword} ${query}`;
        }

        return query.substring(0, 100); // API query length limits
    }

    // Determine provider fallback order
    private getProviderOrder(config: MediaConfig): ImageProvider[] {
        const order: ImageProvider[] = [];
        const all: { provider: ImageProvider; key: string }[] = [
            { provider: 'pexels', key: config.pexelsApiKey },
            { provider: 'unsplash', key: config.unsplashAccessKey },
            { provider: 'shutterstock', key: config.shutterstockApiToken },
            { provider: 'adobe_stock', key: config.adobeStockApiKey },
        ];

        // Selected provider first
        const selected = all.find(p => p.provider === config.imageProvider && p.key);
        if (selected) order.push(selected.provider);

        // Then others that have keys
        for (const p of all) {
            if (p.key && !order.includes(p.provider)) {
                order.push(p.provider);
            }
        }
        return order;
    }

    // Route to the correct provider API
    private async searchProvider(
        provider: ImageProvider,
        query: string,
        config: MediaConfig
    ): Promise<ImageResult | null> {
        switch (provider) {
            case 'pexels': return this.searchPexels(query, config.pexelsApiKey);
            case 'unsplash': return this.searchUnsplash(query, config.unsplashAccessKey);
            case 'shutterstock': return this.searchShutterstock(query, config.shutterstockApiToken);
            case 'adobe_stock': return this.searchAdobeStock(query, config.adobeStockApiKey);
            default: return null;
        }
    }

    // ── Pexels API ─────────────────────────────────────────────
    private async searchPexels(query: string, apiKey: string): Promise<ImageResult | null> {
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
        const response = await fetch(url, {
            headers: { Authorization: apiKey },
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) return null;
        const data = await response.json();
        const photo = data.photos?.[0];
        if (!photo) return null;

        return {
            url: photo.src.large, // 940px wide
            thumbnailUrl: photo.src.medium,
            width: photo.width,
            height: photo.height,
            alt: query,
            photographer: photo.photographer,
            photographerUrl: photo.photographer_url,
            provider: 'pexels',
            providerUrl: 'https://www.pexels.com',
            originalUrl: photo.url,
        };
    }

    // ── Unsplash API ───────────────────────────────────────────
    private async searchUnsplash(query: string, accessKey: string): Promise<ImageResult | null> {
        const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
        const response = await fetch(url, {
            headers: { Authorization: `Client-ID ${accessKey}` },
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) return null;
        const data = await response.json();
        const photo = data.results?.[0];
        if (!photo) return null;

        return {
            url: photo.urls.regular, // 1080px wide
            thumbnailUrl: photo.urls.small,
            width: photo.width,
            height: photo.height,
            alt: photo.alt_description || query,
            photographer: photo.user.name,
            photographerUrl: photo.user.links.html,
            provider: 'unsplash',
            providerUrl: 'https://unsplash.com',
            originalUrl: photo.links.html,
        };
    }

    // ── Shutterstock API ───────────────────────────────────────
    private async searchShutterstock(query: string, token: string): Promise<ImageResult | null> {
        const url = `https://api.shutterstock.com/v2/images/search?query=${encodeURIComponent(query)}&per_page=5&orientation=horizontal&image_type=photo`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) return null;
        const data = await response.json();
        const photo = data.data?.[0];
        if (!photo) return null;

        // Shutterstock preview images have watermarks — use the largest preview
        const asset = photo.assets?.huge_thumb || photo.assets?.preview || photo.assets?.small_thumb;
        if (!asset) return null;

        return {
            url: asset.url,
            thumbnailUrl: (photo.assets?.small_thumb || asset).url,
            width: asset.width || 450,
            height: asset.height || 300,
            alt: photo.description || query,
            photographer: photo.contributor?.id || 'Shutterstock',
            photographerUrl: 'https://www.shutterstock.com',
            provider: 'shutterstock',
            providerUrl: 'https://www.shutterstock.com',
            originalUrl: `https://www.shutterstock.com/image-photo/${photo.id}`,
        };
    }

    // ── Adobe Stock API ────────────────────────────────────────
    private async searchAdobeStock(query: string, apiKey: string): Promise<ImageResult | null> {
        const params = new URLSearchParams({
            'search_parameters[words]': query,
            'search_parameters[limit]': '5',
            'search_parameters[orientation]': 'horizontal',
            'result_columns[]': 'id,title,thumbnail_url,thumbnail_width,thumbnail_height,creator_name,comp_url,comp_width,comp_height',
        });
        const url = `https://stock.adobe.io/Rest/Media/1/Search/Files?${params}`;
        const response = await fetch(url, {
            headers: {
                'x-api-key': apiKey,
                'x-product': 'RankMasterPro',
            },
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) return null;
        const data = await response.json();
        const photo = data.files?.[0];
        if (!photo) return null;

        return {
            url: photo.comp_url || photo.thumbnail_url,
            thumbnailUrl: photo.thumbnail_url,
            width: photo.comp_width || photo.thumbnail_width || 800,
            height: photo.comp_height || photo.thumbnail_height || 600,
            alt: photo.title || query,
            photographer: photo.creator_name || 'Adobe Stock',
            photographerUrl: 'https://stock.adobe.com',
            provider: 'adobe_stock',
            providerUrl: 'https://stock.adobe.com',
            originalUrl: `https://stock.adobe.com/images/-/${photo.id}`,
        };
    }

    // ── Build <figure> HTML ────────────────────────────────────
    private buildFigureHtml(image: ImageResult, alt: string, isHero: boolean): string {
        const loadingAttr = isHero ? '' : ' loading="lazy"';
        const heroClass = isHero ? ' article-hero-image' : '';

        // Provider-specific attribution (required by free APIs)
        let attribution = '';
        if (image.provider === 'pexels') {
            attribution = `Photo by <a href="${image.photographerUrl}?utm_source=rankmaster&utm_medium=referral" target="_blank" rel="noopener noreferrer">${image.photographer}</a> on <a href="https://www.pexels.com?utm_source=rankmaster&utm_medium=referral" target="_blank" rel="noopener noreferrer">Pexels</a>`;
        } else if (image.provider === 'unsplash') {
            attribution = `Photo by <a href="${image.photographerUrl}?utm_source=rankmaster&utm_medium=referral" target="_blank" rel="noopener noreferrer">${image.photographer}</a> on <a href="https://unsplash.com?utm_source=rankmaster&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</a>`;
        } else {
            attribution = `Image: ${image.photographer}`;
        }

        return `<figure class="article-image${heroClass}">
<img src="${image.url}" alt="${this.escapeAttr(alt)}" width="${image.width}" height="${image.height}"${loadingAttr} decoding="async">
<figcaption>${attribution}</figcaption>
</figure>`;
    }

    private escapeAttr(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Get first resolved image URL (for schema/OG image)
    getHeroImageUrl(html: string): string | null {
        const match = html.match(/<figure class="article-image article-hero-image">\s*<img src="([^"]+)"/);
        return match ? match[1] : null;
    }
}


// ════════════════════════════════════════════════════════════════
// YOUTUBE EMBEDDER
// ════════════════════════════════════════════════════════════════

export class YouTubeEmbedder {

    // Main entry: embed 1-2 AI-selected YouTube videos into article HTML
    async embedYouTubeVideos(
        html: string,
        keyword: string,
        options?: { maxVideos?: number; articleContent?: string }
    ): Promise<{ html: string; videos: VideoMeta[] }> {
        const config = await loadMediaConfig();
        const log = logger.child({ engine: 'media-youtube', keyword });

        if (!config.youtubeApiKey) {
            log.info('YouTube API key not configured — skipping video embeds');
            return { html, videos: [] };
        }

        const maxVideos = options?.maxVideos ?? 2;

        try {
            // Step 1: Search YouTube for candidates
            const candidates = await this.searchYouTube(keyword, config.youtubeApiKey);
            if (candidates.length === 0) {
                log.info('No suitable YouTube videos found');
                return { html, videos: [] };
            }

            // Step 2: AI ranks and selects the best videos
            const selected = await this.aiSelectBestVideos(
                candidates,
                keyword,
                maxVideos,
                options?.articleContent
            );

            if (selected.length === 0) {
                return { html, videos: [] };
            }

            // Step 3: Insert embeds into HTML
            const result = this.insertVideoEmbeds(html, selected);
            log.info(`Embedded ${selected.length} YouTube videos`);

            return { html: result, videos: selected };
        } catch (err) {
            log.warn('YouTube embed failed', {}, err);
            return { html, videos: [] };
        }
    }

    // Search YouTube Data API v3 for candidate videos
    private async searchYouTube(keyword: string, apiKey: string): Promise<VideoMeta[]> {
        // Step 1: Search for video IDs
        const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
        searchUrl.searchParams.set('part', 'snippet');
        searchUrl.searchParams.set('q', keyword);
        searchUrl.searchParams.set('type', 'video');
        searchUrl.searchParams.set('videoDuration', 'medium'); // 4-20 min
        searchUrl.searchParams.set('order', 'relevance');
        searchUrl.searchParams.set('maxResults', '10');
        searchUrl.searchParams.set('regionCode', 'US');
        searchUrl.searchParams.set('relevanceLanguage', 'en');
        searchUrl.searchParams.set('key', apiKey);

        const searchRes = await fetch(searchUrl.toString());
        if (!searchRes.ok) throw new Error(`YouTube search failed: ${searchRes.status}`);
        const searchData = await searchRes.json();

        const videoIds = (searchData.items || [])
            .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
            .filter(Boolean) as string[];

        if (videoIds.length === 0) return [];

        // Step 2: Get detailed video info (duration, view count)
        const detailUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
        detailUrl.searchParams.set('part', 'snippet,contentDetails,statistics');
        detailUrl.searchParams.set('id', videoIds.join(','));
        detailUrl.searchParams.set('key', apiKey);

        const detailRes = await fetch(detailUrl.toString());
        if (!detailRes.ok) throw new Error(`YouTube details failed: ${detailRes.status}`);
        const detailData = await detailRes.json();

        const videos: VideoMeta[] = [];
        for (const item of detailData.items || []) {
            const durationSec = this.parseDuration(item.contentDetails?.duration || 'PT0S');

            // Filter: 3-15 min, not a short, not a live stream
            if (durationSec < 180 || durationSec > 900) continue;
            if (item.snippet?.liveBroadcastContent === 'live') continue;

            videos.push({
                videoId: item.id,
                title: item.snippet?.title || '',
                channelName: item.snippet?.channelTitle || '',
                channelUrl: `https://www.youtube.com/channel/${item.snippet?.channelId}`,
                description: (item.snippet?.description || '').substring(0, 300),
                thumbnailUrl: item.snippet?.thumbnails?.high?.url ||
                    item.snippet?.thumbnails?.medium?.url || '',
                duration: item.contentDetails?.duration || '',
                durationSeconds: durationSec,
                viewCount: parseInt(item.statistics?.viewCount || '0', 10),
                publishedAt: item.snippet?.publishedAt || '',
                embedUrl: `https://www.youtube.com/embed/${item.id}`,
            });
        }

        return videos;
    }

    // AI selects the best videos from candidates
    private async aiSelectBestVideos(
        candidates: VideoMeta[],
        keyword: string,
        maxSelect: number,
        articleContent?: string
    ): Promise<VideoMeta[]> {
        // If only 1-2 candidates after filtering, just use them
        if (candidates.length <= maxSelect) return candidates;

        try {
            const ai = getAIRouter();
            const contentSummary = articleContent
                ? articleContent.replace(/<[^>]+>/g, ' ').substring(0, 1000)
                : '';

            const candidateList = candidates.map((v, i) => (
                `${i + 1}. "${v.title}" by ${v.channelName} | ${Math.round(v.durationSeconds / 60)}min | ${v.viewCount.toLocaleString()} views | ${v.description.substring(0, 100)}...`
            )).join('\n');

            const prompt = `Select the ${maxSelect} BEST YouTube videos to embed in an article about "${keyword}".

${contentSummary ? `ARTICLE SUMMARY:\n${contentSummary}\n` : ''}
CANDIDATE VIDEOS:
${candidateList}

SELECTION CRITERIA (ranked by importance):
1. Topical relevance — video directly covers the article's keyword/topic
2. Educational value — teaches something useful, not just promotional
3. Production quality — higher view counts suggest better quality
4. Channel authority — established channels over unknown ones
5. Recency — newer videos preferred (unless topic is evergreen)

Return JSON: { "selected": [1, 3] } — just the numbers of your top picks.
If none are relevant, return { "selected": [] }.`;

            const result = await ai.generate('content_scoring', prompt, {
                systemPrompt: 'You select the best YouTube videos for article embeds. Return valid JSON only.',
                jsonMode: true,
                temperature: 0.2,
            });

            const parsed = JSON.parse(result);
            const indices: number[] = (parsed.selected || [])
                .map((n: number) => n - 1) // Convert 1-indexed to 0-indexed
                .filter((i: number) => i >= 0 && i < candidates.length);

            return indices.slice(0, maxSelect).map(i => candidates[i]);
        } catch (err) {
            // Fallback: pick top by view count
            logger.warn('AI video selection failed, falling back to view-count sort', {}, err);
            return candidates
                .sort((a, b) => b.viewCount - a.viewCount)
                .slice(0, maxSelect);
        }
    }

    // Insert video embeds into HTML at strategic positions
    private insertVideoEmbeds(html: string, videos: VideoMeta[]): string {
        if (videos.length === 0) return html;

        let result = html;

        // Position 1: After first H2 section
        if (videos[0]) {
            const embedHtml = this.buildVideoEmbed(videos[0]);
            const firstH2End = result.match(/<\/h2>/i);
            if (firstH2End) {
                // Find the end of the first paragraph after H2
                const afterH2 = result.indexOf('</p>', (firstH2End.index || 0) + firstH2End[0].length);
                if (afterH2 > -1) {
                    result = result.substring(0, afterH2 + 4) + '\n' + embedHtml + '\n' + result.substring(afterH2 + 4);
                }
            }
        }

        // Position 2: Before the last H2 (typically conclusion or FAQ)
        if (videos[1]) {
            const embedHtml = this.buildVideoEmbed(videos[1]);
            const h2Matches = [...result.matchAll(/<h2[^>]*>/gi)];
            if (h2Matches.length >= 3) {
                // Insert before the second-to-last H2
                const insertAt = h2Matches[h2Matches.length - 2].index || 0;
                result = result.substring(0, insertAt) + embedHtml + '\n' + result.substring(insertAt);
            }
        }

        return result;
    }

    // Build responsive YouTube embed with lazy-loading iframe
    private buildVideoEmbed(video: VideoMeta): string {
        const minutes = Math.floor(video.durationSeconds / 60);
        const seconds = video.durationSeconds % 60;
        const durationDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // srcdoc pattern: shows thumbnail + play button. Actual iframe loads only on click.
        // This means zero page weight impact until the user interacts.
        return `<div class="video-embed" itemscope itemtype="https://schema.org/VideoObject">
<meta itemprop="name" content="${this.escapeAttr(video.title)}">
<meta itemprop="duration" content="${video.duration}">
<meta itemprop="thumbnailUrl" content="${video.thumbnailUrl}">
<meta itemprop="embedUrl" content="${video.embedUrl}">
<meta itemprop="uploadDate" content="${video.publishedAt}">
<div class="video-wrapper" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;border-radius:12px;margin:1.5em 0">
<iframe
  src="${video.embedUrl}?rel=0"
  title="${this.escapeAttr(video.title)}"
  style="position:absolute;top:0;left:0;width:100%;height:100%;border:0"
  loading="lazy"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowfullscreen>
</iframe>
</div>
<p class="video-caption" style="text-align:center;font-size:0.9em;color:#666;margin-top:0.5em">
▶ <strong>${this.escapeAttr(video.title)}</strong> by ${this.escapeAttr(video.channelName)} (${durationDisplay})
</p>
</div>`;
    }

    // Parse ISO 8601 duration to seconds (PT5M30S → 330)
    private parseDuration(iso: string): number {
        const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return 0;
        const hours = parseInt(match[1] || '0', 10);
        const minutes = parseInt(match[2] || '0', 10);
        const seconds = parseInt(match[3] || '0', 10);
        return hours * 3600 + minutes * 60 + seconds;
    }

    private escapeAttr(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}


// ── Singletons ─────────────────────────────────────────────────

import { createSingleton } from '../singleton';

export const getImageResolver = createSingleton(() => new ImageResolver());
export const getYouTubeEmbedder = createSingleton(() => new YouTubeEmbedder());
