// ============================================================
// RankMaster Pro - Video Script Generator API
// Blog post → YouTube script, Shorts, Podcast outline
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['generate', 'list', 'delete']),
    post_id: z.string().uuid().optional(),
    blog_title: z.string().max(500).optional(),
    blog_content: z.string().max(10000).optional(),
    keyword: z.string().max(200).optional(),
    niche: z.string().max(200).optional(),
    format: z.enum(['youtube_long', 'youtube_short', 'podcast', 'tiktok', 'reel']).optional(),
    channel_style: z.enum(['educational', 'entertaining', 'review', 'tutorial', 'listicle']).optional(),
    target_duration_minutes: z.number().min(1).max(60).optional(),
    id: z.string().uuid().optional(),
});

const FORMAT_CONFIGS = {
    youtube_long: { maxTokens: 3000, durationLabel: '8-15 min', wordTarget: '1500-2500 words script' },
    youtube_short: { maxTokens: 800, durationLabel: '60 sec', wordTarget: '150-200 words, hook in first 3 seconds' },
    podcast: { maxTokens: 2500, durationLabel: '20-30 min', wordTarget: 'conversational outline with talking points' },
    tiktok: { maxTokens: 600, durationLabel: '30-60 sec', wordTarget: '100-150 words, viral hook' },
    reel: { maxTokens: 600, durationLabel: '30-60 sec', wordTarget: '100-150 words, visual-first script' },
};

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate') {
        const { post_id, blog_title, blog_content, keyword, niche, format = 'youtube_long', channel_style = 'educational' } = parsed.data;

        let title = blog_title || '';
        let content = blog_content || '';

        if (post_id && (!title || !content)) {
            const { data: post } = await auth.supabase.from('posts').select('title, content_markdown, content_html').eq('id', post_id).eq('user_id', auth.user.id).single();
            if (post) {
                title = title || post.title;
                content = content || post.content_markdown || post.content_html?.replace(/<[^>]+>/g, ' ') || '';
            }
        }

        if (!title && !keyword) return NextResponse.json({ error: 'blog_title or keyword required' }, { status: 400 });

        const config = FORMAT_CONFIGS[format];
        const contentSnippet = content.substring(0, 3000);

        const formatPrompts: Record<string, string> = {
            youtube_long: `Write a complete YouTube video script for a ${channel_style} channel. Include: [HOOK] (first 30 seconds to stop scroll), [INTRO] (what viewers will learn), main content sections with b-roll suggestions, [TRANSITION] cues, [OUTRO] with subscribe CTA, and [DESCRIPTION] (YouTube SEO description with timestamps). Target: ${config.wordTarget}.`,
            youtube_short: `Write a YouTube Shorts script. Must hook in first 2 seconds. Pattern: Hook → Problem → Solution → CTA. No fluff. Every word earns its place. Target: ${config.wordTarget}.`,
            podcast: `Write a podcast episode outline and script. Include: episode intro, talking points with timestamps, story examples, guest question prompts (if applicable), sponsor slot placement, outro. Conversational tone. Target: ${config.wordTarget}.`,
            tiktok: `Write a TikTok video script. Ultra-punchy hook (first word must be a question or shocking stat). Fast cuts indicated with [CUT]. On-screen text suggestions in [CAPTION]. Target: ${config.wordTarget}.`,
            reel: `Write an Instagram Reel script. Visual-first — describe what appears on screen in [VISUAL] tags, voiceover in regular text. Hook in first frame. Trending audio suggestion. Target: ${config.wordTarget}.`,
        };

        const prompt = `You are an expert ${format.replace('_', ' ')} scriptwriter in the ${niche || 'general'} niche.

Blog post: "${title}"
Target keyword: "${keyword || title}"
Blog content excerpt:
${contentSnippet}

${formatPrompts[format]}

Return ONLY valid JSON:
{
  "video_title": "YouTube-optimized title (max 70 chars, includes keyword)",
  "video_description": "SEO description with keyword in first line, timestamps, links placeholder",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "thumbnail_text": "bold text for thumbnail (max 6 words)",
  "script": "full script with [stage directions], [B-ROLL: description], [CUT], etc.",
  "sections": [
    {"title": "Hook", "duration_seconds": 30, "content": "..."},
    {"title": "Main Content", "duration_seconds": 480, "content": "..."}
  ],
  "hook": "the first 1-2 sentences — most critical part",
  "cta": "call to action text",
  "estimated_duration": "${config.durationLabel}",
  "word_count": 1800
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: `Expert ${format} scriptwriter. Punchy, engaging, platform-native. Return only JSON.`, maxTokens: config.maxTokens, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            const scriptData = JSON.parse(jsonMatch?.[0] || result.content);

            // Save
            const { data: saved } = await auth.supabase.from('video_scripts').insert({
                user_id: auth.user.id,
                post_id: post_id || null,
                blog_title: title,
                keyword: keyword || title,
                format,
                channel_style,
                niche: niche || '',
                video_title: scriptData.video_title,
                script_data: scriptData,
                word_count: scriptData.word_count || 0,
            }).select('id').single();

            return NextResponse.json({ script: scriptData, id: saved?.id, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('video_scripts').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('video_scripts').select('id, blog_title, keyword, format, video_title, word_count, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ scripts: data || [] });
}
