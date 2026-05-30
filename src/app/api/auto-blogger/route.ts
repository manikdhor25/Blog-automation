import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';
import { runQualityGate } from '@/lib/engines/content-quality-gate';
import { cleanAIPatterns } from '@/lib/engines/human-writing-rules';
import { runQualityControl, type QCInput } from '@/lib/engines/quality-control-engine';
import { moderateContent, injectDisclaimers } from '@/lib/engines/content-moderation';

const CreateScheduleSchema = z.object({
    action: z.literal('create_schedule'),
    site_id: z.string().uuid(),
    niche: z.string().min(1),
    frequency: z.enum(['daily', 'every_2_days', 'weekly', 'twice_weekly']),
    post_type: z.enum(['how_to', 'listicle', 'review', 'comparison', 'news', 'mixed']),
    word_count: z.number().int().min(500).max(5000).default(1500),
    keywords: z.array(z.string()).default([]),
    auto_publish: z.boolean().default(false),
    publish_status: z.enum(['draft', 'publish']).default('draft'),
});

const GenerateNowSchema = z.object({
    action: z.literal('generate_now'),
    schedule_id: z.string().uuid().optional(),
    site_id: z.string().uuid(),
    niche: z.string().min(1),
    post_type: z.enum(['how_to', 'listicle', 'review', 'comparison', 'news', 'mixed']),
    word_count: z.number().int().default(1500),
    keyword: z.string().optional(),
    auto_publish: z.boolean().default(false),
});

const ToggleSchema = z.object({
    action: z.literal('toggle'),
    schedule_id: z.string().uuid(),
    active: z.boolean(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data: schedules } = await supabase.from('auto_blog_schedules')
        .select('*, auto_blog_runs(count)').eq('user_id', user.id).order('created_at', { ascending: false });
    const { data: runs } = await supabase.from('auto_blog_runs')
        .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    return NextResponse.json({ schedules: schedules || [], recent_runs: runs || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'create_schedule') {
        const parsed = CreateScheduleSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const frequencyMap: Record<string, number> = { daily: 1, every_2_days: 2, twice_weekly: 3, weekly: 7 };
        const nextRun = new Date(Date.now() + frequencyMap[d.frequency] * 86400000).toISOString();

        const { data, error } = await supabase.from('auto_blog_schedules').insert({
            user_id: user.id, site_id: d.site_id, niche: d.niche, frequency: d.frequency,
            post_type: d.post_type, word_count: d.word_count, keywords: d.keywords,
            auto_publish: d.auto_publish, publish_status: d.publish_status,
            is_active: true, next_run: nextRun, posts_generated: 0,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ schedule: data });
    }

    if (body.action === 'generate_now') {
        const parsed = GenerateNowSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        // Pick keyword or generate one
        let targetKeyword = d.keyword;
        if (!targetKeyword) {
            const kwPrompt = `Generate 1 high-traffic, low-competition keyword for a ${d.niche} blog. Post type: ${d.post_type}. Return just the keyword, nothing else.`;
            const { text } = await routeAI({ task: 'seo_analysis', prompt: kwPrompt });
            targetKeyword = text.trim().replace(/["']/g, '');
        }

        const postPrompt = `Write a complete SEO-optimized blog post for a ${d.niche} blog.

Keyword: ${targetKeyword}
Post Type: ${d.post_type}
Target Word Count: ${d.word_count} words

CRITICAL QUALITY REQUIREMENTS:
- Write as a real human expert, NOT as AI
- Use short sentences (mostly under 18 words)
- Use contractions: "don't", "you'll", "it's"
- Start some sentences with "But", "And", "So"
- Vary paragraph length: mix 1-line with 3-4 line paragraphs
- Include at least 2 personal opinions or real-world examples
- NEVER use: "Moreover", "Furthermore", "Additionally", "In conclusion", "delve into", "leverage", "seamless", "realm", "It's worth noting", "game-changer"
- Every statistic MUST have a source attribution

STRUCTURE REQUIREMENTS:
- Engaging H1 title with keyword
- Introduction with hook (mention keyword naturally in first 100 words)
- 5-8 H2 sections with H3 sub-sections where appropriate
- Conversational but authoritative tone
- Include practical tips, examples, and actionable advice
- Natural keyword variations throughout
- Conclusion with clear CTA
- Include 3-5 internal link placeholders as [INTERNAL_LINK: topic]
- Include 2-3 affiliate product suggestions as [AFFILIATE: product name]

Return JSON: {
  "title": "post title",
  "slug": "url-slug",
  "meta_description": "155 char meta description",
  "content": "full HTML content",
  "word_count": number,
  "tags": ["tag1", "tag2"],
  "focus_keyword": "keyword",
  "internal_link_suggestions": ["topic1", "topic2"],
  "affiliate_suggestions": ["product1", "product2"]
}`;

        const { text, provider } = await routeAI({ task: 'content_writing', prompt: postPrompt, json: true });
        let postData;
        try { postData = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Failed to parse generated post' }, { status: 500 }); }

        // â”€â”€ Quality Pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Run the same quality gates used by the main content pipeline
        let finalContent = postData.content || '';
        let qualityReport = null;
        let moderationResult = null;

        try {
            // Step 1: Clean AI patterns from generated content
            finalContent = cleanAIPatterns(finalContent);

            // Step 2: Run quality gate (naturalness scoring + targeted section rewrites)
            const gateResult = await runQualityGate(finalContent, targetKeyword, 'en');
            finalContent = gateResult.content;

            // Step 3: Run 10-dimension QC scoring
            const qcInput: QCInput = {
                primaryKeyword: targetKeyword,
                secondaryKeywords: [],
                searchIntent: 'informational',
                targetAudience: 'general',
                content: finalContent,
            };
            qualityReport = runQualityControl(qcInput);

            // Step 4: Content moderation (YMYL detection + disclaimers)
            moderationResult = moderateContent(finalContent, d.niche);
            if (moderationResult.disclaimers.length > 0) {
                finalContent = injectDisclaimers(finalContent, moderationResult.disclaimers);
            }

            // Step 5: Quality threshold â€” if score is below 5.0, force save as draft
            const meetsThreshold = qualityReport.overallScore >= 6.5;
            if (!meetsThreshold) {
                console.warn(`[AutoBlogger] Quality score ${qualityReport.overallScore}/10 below 6.5 threshold â€” forcing draft status`);
            }

            // Update postData with quality-gated content
            postData.content = finalContent;
            postData.quality_score = qualityReport.overallScore;
            postData.quality_decision = qualityReport.publishDecision;
            postData.moderation_risk = moderationResult.riskLevel;

            // Override auto_publish if quality is too low or moderation flagged critical
            if (!meetsThreshold || !moderationResult.safe) {
                d.auto_publish = false; // Force draft
            }
        } catch (qualityError) {
            console.error('[AutoBlogger] Quality pipeline failed â€” saving as draft:', qualityError);
            d.auto_publish = false; // Safety: force draft on pipeline failure
        }

        // Save the run
        const { data: run } = await supabase.from('auto_blog_runs').insert({
            user_id: user.id, site_id: d.site_id, schedule_id: d.schedule_id || null,
            keyword: targetKeyword, title: postData.title, slug: postData.slug,
            word_count: postData.word_count || d.word_count,
            content_preview: postData.content?.substring(0, 500) || '',
            status: 'generated', provider, post_data: postData,
        }).select().single();

        // Update schedule counter
        if (d.schedule_id) {
            await supabase.from('auto_blog_schedules').update({
                posts_generated: supabase.rpc('increment', { x: 1 }) as unknown as number,
                last_run: new Date().toISOString(),
            }).eq('id', d.schedule_id);
        }

        // Auto-publish to WP if enabled
        if (d.auto_publish) {
            const { data: site } = await supabase.from('sites').select('wp_url,wp_username,wp_app_password').eq('id', d.site_id).single();
            if (site?.wp_url && site?.wp_username && site?.wp_app_password) {
                const wpRes = await fetch(`${site.wp_url}/wp-json/wp/v2/posts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`${site.wp_username}:${site.wp_app_password}`).toString('base64')}` },
                    body: JSON.stringify({ title: postData.title, content: postData.content, slug: postData.slug, status: 'draft', meta: { _yoast_wpseo_focuskw: targetKeyword, _yoast_wpseo_metadesc: postData.meta_description } }),
                });
                if (wpRes.ok) {
                    const wpPost = await wpRes.json();
                    await supabase.from('auto_blog_runs').update({ status: 'published', wp_post_id: wpPost.id }).eq('id', run?.id);
                }
            }
        }

        return NextResponse.json({ run, post: postData, provider });
    }

    if (body.action === 'toggle') {
        const parsed = ToggleSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        await supabase.from('auto_blog_schedules').update({ is_active: parsed.data.active }).eq('id', parsed.data.schedule_id).eq('user_id', user.id);
        return NextResponse.json({ toggled: true });
    }

    if (body.action === 'delete_schedule') {
        await supabase.from('auto_blog_schedules').delete().eq('id', body.schedule_id).eq('user_id', user.id);
        return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
