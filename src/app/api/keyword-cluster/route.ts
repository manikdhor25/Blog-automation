import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const ClusterSchema = z.object({
    action: z.literal('cluster'),
    keywords: z.array(z.string()).min(5).max(200),
    niche: z.string().optional(),
    method: z.enum(['semantic', 'intent', 'both']).default('both'),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('keyword_cluster_results')
        .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    return NextResponse.json({ results: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'cluster') {
        const parsed = ClusterSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `Cluster these ${d.keywords.length} keywords into semantic groups for a ${d.niche || 'blog'} content strategy.

Keywords:
${d.keywords.join('\n')}

Clustering method: ${d.method}

Rules:
- Group by semantic similarity AND search intent
- Each cluster = one post or page
- Name each cluster with the best head term
- Identify pillar vs supporting content

Return JSON:
{
  "clusters": [
    {
      "cluster_name": "head term keyword",
      "intent": "informational"|"commercial"|"transactional"|"navigational",
      "content_type": "pillar"|"supporting"|"landing_page",
      "keywords": ["kw1", "kw2"],
      "primary_keyword": "best keyword for this post",
      "suggested_title": "post title",
      "monthly_volume_estimate": number,
      "priority": "high"|"medium"|"low"
    }
  ],
  "unclustered": ["kw1", "kw2"],
  "total_clusters": number,
  "pillar_count": number,
  "strategy_summary": "brief content strategy recommendation"
}`;

        const { text, provider } = await routeAI({ task: 'seo_analysis', prompt, json: true });
        let result;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        await supabase.from('keyword_cluster_results').insert({
            user_id: user.id, input_count: d.keywords.length,
            cluster_count: result.total_clusters || 0, niche: d.niche || null, result_data: result,
        });

        return NextResponse.json({ result, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
