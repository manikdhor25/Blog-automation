// ============================================================
// RankMaster Pro - YouTube SEO Optimizer API
// Generate/optimize title, description, tags, chapters for YT
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['optimize', 'from_script', 'list', 'delete']),
    keyword: z.string().max(200).optional(),
    video_topic: z.string().max(500).optional(),
    script_id: z.string().uuid().optional(),
    niche: z.string().max(200).optional(),
    video_duration_minutes: z.number().min(1).max(180).optional(),
    channel_style: z.enum(['educational', 'entertaining', 'review', 'tutorial']).optional(),
    existing_title: z.string().max(300).optional(),
    id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'optimize' || action === 'from_script') {
        const { keyword, video_topic, script_id, niche, video_duration_minutes, channel_style } = parsed.data;

        let scriptContent = '';
        let topic = video_topic || keyword || '';

        if (script_id) {
            const { data: script } = await auth.supabase.from('video_scripts').select('blog_title, keyword, script_data').eq('id', script_id).eq('user_id', auth.user.id).single();
            if (script) {
                topic = script.keyword || script.blog_title;
                scriptContent = (script.script_data as { script?: string })?.script?.substring(0, 1000) || '';
            }
        }

        if (!topic) return NextResponse.json({ error: 'keyword or video_topic required' }, { status: 400 });

        const prompt = `You are a YouTube SEO expert. Optimize a video for maximum discoverability.

Video topic: "${topic}"
Niche: ${niche || 'general'}
Duration: ${video_duration_minutes || 10} minutes
Channel style: ${channel_style || 'educational'}
${scriptContent ? `Script excerpt:\n${scriptContent}` : ''}

YouTube SEO rules:
- Title: 60 chars max, keyword in first 3 words, curiosity gap or number
- Description: keyword in first 100 chars (shown before "more"), YouTube chapters with timestamps, related keywords naturally sprinkled, CTA to subscribe/like, links section
- Tags: exact match keyword first, then variations, then broad terms (max 500 chars total)
- Chapters: every 2-4 minutes for videos over 5 min

Return ONLY valid JSON:
{
  "titles": [
    {"title": "primary title option (60 chars max)", "click_bait_score": 8, "keyword_placement": "front"},
    {"title": "alternative title", "click_bait_score": 7, "keyword_placement": "front"}
  ],
  "description": "full YouTube description (3000 chars, chapters with 00:00 format, keyword-rich, CTA at end)",
  "tags": ["exact keyword", "variation 1", "variation 2", "broad tag 1"],
  "chapters": [
    {"timestamp": "00:00", "title": "Intro"},
    {"timestamp": "01:30", "title": "Main Content"}
  ],
  "end_screen_cta": "what to show on end screen",
  "thumbnail_text": "bold text for thumbnail (max 4 words)",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "seo_score": 85,
  "estimated_monthly_searches": "10K-100K"
}`;

        const result = await routeAI({ task: 'meta_generation', prompt, systemPrompt: 'YouTube SEO expert. Platform-native optimization. Return only JSON.', maxTokens: 2000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Optimization failed' }, { status: 500 });

        try {
            const m = result.content.match(/\{[\s\S]*\}/);
            const data = JSON.parse(m?.[0] || result.content);

            await auth.supabase.from('youtube_optimizations').insert({
                user_id: auth.user.id,
                script_id: script_id || null,
                keyword: topic,
                niche: niche || '',
                optimization_data: data,
                primary_title: data.titles?.[0]?.title || '',
                tag_count: data.tags?.length || 0,
            });

            return NextResponse.json({ optimization: data, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('youtube_optimizations').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('youtube_optimizations').select('id, keyword, primary_title, tag_count, niche, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ optimizations: data || [] });
}
