// ============================================================
// RankMaster Pro - Social Auto-Publisher Engine
// Pinterest, Twitter/X, LinkedIn direct API posting
// ============================================================

export interface SocialPost {
    platform: 'pinterest' | 'twitter' | 'linkedin';
    content: string;
    image_url?: string;
    link_url?: string;
    hashtags?: string[];
    board_id?: string;         // Pinterest
    pin_title?: string;        // Pinterest
    pin_description?: string;  // Pinterest
}

export interface PublishResult {
    platform: string;
    success: boolean;
    post_id?: string;
    post_url?: string;
    error?: string;
}

// ── Pinterest API v5 ────────────────────────────────────────

export async function publishToPinterest(
    post: SocialPost,
    accessToken: string,
    boardId: string
): Promise<PublishResult> {
    try {
        const payload: Record<string, unknown> = {
            board_id: post.board_id || boardId,
            title: post.pin_title || post.content.substring(0, 100),
            description: post.pin_description || post.content,
            link: post.link_url,
            dominant_color: '#e60023',
        };

        if (post.image_url) {
            payload.media_source = { source_type: 'image_url', url: post.image_url };
        }

        const res = await fetch('https://api.pinterest.com/v5/pins', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { platform: 'pinterest', success: false, error: err.message || `HTTP ${res.status}` };
        }

        const data = await res.json();
        return { platform: 'pinterest', success: true, post_id: data.id, post_url: data.link };
    } catch (err) {
        return { platform: 'pinterest', success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
}

// ── Twitter/X API v2 ────────────────────────────────────────

export async function publishToTwitter(
    post: SocialPost,
    bearerToken: string,
    oauthToken?: string,
    oauthSecret?: string
): Promise<PublishResult> {
    try {
        const tweetText = [
            post.content.substring(0, 240),
            post.link_url ? `\n${post.link_url}` : '',
            post.hashtags?.length ? '\n' + post.hashtags.slice(0, 5).map(h => `#${h.replace(/^#/, '')}`).join(' ') : '',
        ].join('').substring(0, 280);

        const res = await fetch('https://api.twitter.com/2/tweets', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: tweetText }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { platform: 'twitter', success: false, error: err.detail || err.title || `HTTP ${res.status}` };
        }

        const data = await res.json();
        return {
            platform: 'twitter',
            success: true,
            post_id: data.data?.id,
            post_url: data.data?.id ? `https://twitter.com/i/web/status/${data.data.id}` : undefined,
        };
    } catch (err) {
        return { platform: 'twitter', success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
}

// ── LinkedIn API v2 ─────────────────────────────────────────

export async function publishToLinkedIn(
    post: SocialPost,
    accessToken: string,
    personUrn: string
): Promise<PublishResult> {
    try {
        const payload: Record<string, unknown> = {
            author: `urn:li:person:${personUrn}`,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: { text: post.content.substring(0, 3000) },
                    shareMediaCategory: post.link_url ? 'ARTICLE' : 'NONE',
                    ...(post.link_url ? {
                        media: [{
                            status: 'READY',
                            originalUrl: post.link_url,
                            title: { text: post.pin_title || '' },
                            description: { text: post.pin_description || post.content.substring(0, 200) },
                        }],
                    } : {}),
                },
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        };

        const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { platform: 'linkedin', success: false, error: err.message || `HTTP ${res.status}` };
        }

        const data = await res.json();
        const postId = data.id?.split(':').pop();
        return {
            platform: 'linkedin',
            success: true,
            post_id: data.id,
            post_url: postId ? `https://www.linkedin.com/feed/update/urn:li:ugcPost:${postId}` : undefined,
        };
    } catch (err) {
        return { platform: 'linkedin', success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
}

// ── AI Content Adapter ──────────────────────────────────────

export function adaptContentForPlatform(
    blogTitle: string,
    blogExcerpt: string,
    blogUrl: string,
    platform: SocialPost['platform'],
    niche: string
): Partial<SocialPost> {
    switch (platform) {
        case 'pinterest':
            return {
                pin_title: blogTitle.substring(0, 100),
                pin_description: `${blogExcerpt.substring(0, 400)}\n\nRead more ↓`,
                content: blogExcerpt.substring(0, 400),
                link_url: blogUrl,
            };
        case 'twitter':
            return {
                content: blogTitle.substring(0, 200),
                link_url: blogUrl,
                hashtags: niche.split(' ').slice(0, 3).concat(['blog', 'tips']),
            };
        case 'linkedin':
            return {
                pin_title: blogTitle,
                pin_description: blogExcerpt.substring(0, 200),
                content: `${blogTitle}\n\n${blogExcerpt.substring(0, 500)}\n\nRead the full post: ${blogUrl}`,
                link_url: blogUrl,
            };
    }
}

// ── #55: Content Atomization Engine ────────────────────────────
// Breaks a blog article into social-ready micro-content pieces

export interface AtomizedContent {
    type: 'tweet' | 'thread_starter' | 'linkedin_post' | 'quote_card' | 'stat_post' | 'question_post';
    platform: 'twitter' | 'linkedin' | 'pinterest';
    content: string;
    hashtags: string[];
    priority: number; // 1-5 (5 = highest value)
}

export function atomizeContent(
    html: string,
    title: string,
    keyword: string,
    blogUrl: string,
    niche: string
): AtomizedContent[] {
    const atoms: AtomizedContent[] = [];
    const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const keywordHashtag = keyword.replace(/[^a-zA-Z0-9]/g, '');
    const nicheHashtag = niche.replace(/[^a-zA-Z0-9]/g, '');
    const baseHashtags = [`#${keywordHashtag}`, `#${nicheHashtag}`].filter(h => h.length > 2);

    // 1. Extract key statistics for stat posts
    const statMatches = plainText.match(/[^.!?]*\d+(?:\.\d+)?%[^.!?]*[.!?]/g) || [];
    for (const stat of statMatches.slice(0, 3)) {
        const cleaned = stat.trim().substring(0, 240);
        atoms.push({
            type: 'stat_post',
            platform: 'twitter',
            content: `📊 ${cleaned}\n\n${blogUrl}`,
            hashtags: baseHashtags,
            priority: 5,
        });
    }

    // 2. Extract questions for question posts
    const questions = plainText.match(/[A-Z][^.!]*\?/g) || [];
    for (const q of questions.slice(0, 2)) {
        atoms.push({
            type: 'question_post',
            platform: 'twitter',
            content: `🤔 ${q.trim().substring(0, 200)}\n\nThe answer might surprise you 👇\n${blogUrl}`,
            hashtags: baseHashtags,
            priority: 4,
        });
    }

    // 3. Extract H2 headings for thread starters
    const headings = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
    const h2Texts = headings
        .map(h => h.replace(/<[^>]+>/g, '').trim())
        .filter(t => t.length > 10 && !/faq|table of contents|key takeaway/i.test(t));

    if (h2Texts.length >= 3) {
        const thread = `🧵 ${title}\n\nKey takeaways:\n\n${h2Texts.slice(0, 5).map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\nFull breakdown 👇\n${blogUrl}`;
        atoms.push({
            type: 'thread_starter',
            platform: 'twitter',
            content: thread.substring(0, 280),
            hashtags: baseHashtags,
            priority: 5,
        });
    }

    // 4. LinkedIn long-form post
    const firstParagraph = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const intro = firstParagraph ? firstParagraph[1].replace(/<[^>]+>/g, '').trim() : '';
    if (intro.length > 50) {
        atoms.push({
            type: 'linkedin_post',
            platform: 'linkedin',
            content: `${title}\n\n${intro.substring(0, 500)}\n\n${h2Texts.slice(0, 3).map(h => `✅ ${h}`).join('\n')}\n\nRead the complete guide: ${blogUrl}\n\n${baseHashtags.join(' ')}`,
            hashtags: baseHashtags,
            priority: 4,
        });
    }

    // 5. Quote card from bold/strong text
    const boldMatches = html.match(/<strong>([\s\S]*?)<\/strong>/gi) || [];
    const quotes = boldMatches
        .map(b => b.replace(/<[^>]+>/g, '').trim())
        .filter(q => q.length >= 20 && q.length <= 150);

    for (const quote of quotes.slice(0, 2)) {
        atoms.push({
            type: 'quote_card',
            platform: 'pinterest',
            content: `"${quote}"\n\n— From: ${title}\n\n${blogUrl}`,
            hashtags: baseHashtags,
            priority: 3,
        });
    }

    return atoms.sort((a, b) => b.priority - a.priority);
}

// ── #56: Auto-Distribution Schedule ────────────────────────────
// Generates optimal posting times for maximum reach

export interface ScheduledPost {
    atom: AtomizedContent;
    scheduledAt: Date;
    dayOffset: number;
    timeSlot: string;
}

export function generateDistributionSchedule(
    atoms: AtomizedContent[],
    publishDate: Date
): ScheduledPost[] {
    // Optimal posting windows per platform (UTC)
    const platformWindows: Record<string, { hour: number; label: string }[]> = {
        twitter: [
            { hour: 13, label: 'Lunch break peak' },
            { hour: 17, label: 'End of workday' },
            { hour: 9, label: 'Morning scroll' },
        ],
        linkedin: [
            { hour: 8, label: 'Pre-work browsing' },
            { hour: 12, label: 'Lunch break' },
            { hour: 17, label: 'End of day' },
        ],
        pinterest: [
            { hour: 20, label: 'Evening browsing' },
            { hour: 14, label: 'Afternoon break' },
        ],
    };

    const schedule: ScheduledPost[] = [];

    // Day 0: Publish announcement (highest priority atoms)
    // Days 1-7: Staggered distribution
    // Days 14, 30: Evergreen re-shares

    const dayOffsets = [0, 1, 2, 3, 5, 7, 14, 30];

    for (let i = 0; i < atoms.length && i < dayOffsets.length; i++) {
        const atom = atoms[i];
        const dayOffset = dayOffsets[i];
        const windows = platformWindows[atom.platform] || platformWindows.twitter;
        const window = windows[i % windows.length];

        const scheduledDate = new Date(publishDate);
        scheduledDate.setDate(scheduledDate.getDate() + dayOffset);
        scheduledDate.setHours(window.hour, 0, 0, 0);

        schedule.push({
            atom,
            scheduledAt: scheduledDate,
            dayOffset,
            timeSlot: window.label,
        });
    }

    return schedule.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
