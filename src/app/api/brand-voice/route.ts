import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const SaveVoiceSchema = z.object({
    action: z.literal('save'),
    name: z.string().min(1),
    site_id: z.string().uuid().optional(),
    tone: z.array(z.string()).default([]),
    writing_style: z.string().default(''),
    vocabulary_level: z.enum(['simple', 'moderate', 'advanced']).default('moderate'),
    person: z.enum(['first_person', 'second_person', 'third_person']).default('second_person'),
    avoid_phrases: z.array(z.string()).default([]),
    signature_phrases: z.array(z.string()).default([]),
    example_intro: z.string().optional(),
    niche: z.string().optional(),
    target_audience: z.string().optional(),
    content_goals: z.array(z.string()).default([]),
});

const ExtractSchema = z.object({
    action: z.literal('extract'),
    sample_content: z.string().min(200),
    name: z.string().min(1),
    site_id: z.string().uuid().optional(),
});

const ApplySchema = z.object({
    action: z.literal('apply'),
    voice_id: z.string().uuid(),
    content: z.string().min(100),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('brand_voices').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    return NextResponse.json({ voices: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'save') {
        const parsed = SaveVoiceSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: existing } = await supabase.from('brand_voices').select('id').eq('user_id', user.id).eq('name', d.name).single();

        if (existing) {
            await supabase.from('brand_voices').update({ ...d, updated_at: new Date().toISOString() }).eq('id', existing.id);
            return NextResponse.json({ saved: true, id: existing.id });
        } else {
            const { data } = await supabase.from('brand_voices').insert({ user_id: user.id, ...d }).select().single();
            return NextResponse.json({ saved: true, voice: data });
        }
    }

    if (body.action === 'extract') {
        const parsed = ExtractSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `Analyze this blog content and extract the brand voice/writing style profile.

Sample content:
${d.sample_content.substring(0, 3000)}

Analyze: tone, vocabulary level, sentence structure, POV, signature phrases, things to avoid, overall style.

Return JSON:
{
  "tone": ["conversational", "authoritative", "friendly", etc. - list 3-5 descriptors],
  "writing_style": "2-3 sentence description of the writing style",
  "vocabulary_level": "simple"|"moderate"|"advanced",
  "person": "first_person"|"second_person"|"third_person",
  "sentence_structure": "short and punchy"|"medium varied"|"long and detailed",
  "signature_phrases": ["phrases this writer commonly uses"],
  "avoid_phrases": ["phrases/words to avoid to stay on brand"],
  "content_goals": ["inform", "entertain", "convert", etc.],
  "unique_traits": ["what makes this voice unique"]
}`;

        const { text, provider } = await routeAI({ task: 'content_optimization', prompt, json: true });
        let extracted;
        try { extracted = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        // Auto-save the extracted voice
        const { data } = await supabase.from('brand_voices').insert({
            user_id: user.id, site_id: d.site_id || null, name: d.name,
            tone: extracted.tone || [], writing_style: extracted.writing_style || '',
            vocabulary_level: extracted.vocabulary_level || 'moderate',
            person: extracted.person || 'second_person',
            avoid_phrases: extracted.avoid_phrases || [],
            signature_phrases: extracted.signature_phrases || [],
            content_goals: extracted.content_goals || [],
            example_intro: d.sample_content.substring(0, 300),
        }).select().single();

        return NextResponse.json({ extracted, voice: data, provider });
    }

    if (body.action === 'apply') {
        const parsed = ApplySchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        const { data: voice } = await supabase.from('brand_voices').select('*').eq('id', parsed.data.voice_id).single();
        if (!voice) return NextResponse.json({ error: 'Voice not found' }, { status: 404 });

        const prompt = `Rewrite this content to match the following brand voice profile:

Tone: ${voice.tone?.join(', ')}
Writing Style: ${voice.writing_style}
Vocabulary Level: ${voice.vocabulary_level}
POV: ${voice.person}
Signature Phrases to use: ${voice.signature_phrases?.join(', ')}
Phrases to avoid: ${voice.avoid_phrases?.join(', ')}
${voice.example_intro ? `Example of correct style: "${voice.example_intro}"` : ''}

Content to rewrite:
${parsed.data.content}

Return the rewritten content only, maintaining all factual information and structure but in the brand voice.`;

        const { text, provider } = await routeAI({ task: 'content_writing', prompt });
        return NextResponse.json({ rewritten: text, provider });
    }

    if (body.action === 'delete') {
        await supabase.from('brand_voices').delete().eq('id', body.voice_id).eq('user_id', user.id);
        return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
