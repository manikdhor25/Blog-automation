import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const STEPS = [
    { id: 'add_site', label: 'Add Your Site', description: 'Connect your blog (URL, WordPress credentials)', route: '/sites', icon: 'ðŸŒ', required: true },
    { id: 'ai_provider', label: 'Configure AI Provider', description: 'Add API key for Claude, GPT-4, or Gemini', route: '/settings', icon: 'ðŸ¤–', required: true },
    { id: 'add_keywords', label: 'Add Target Keywords', description: 'Import your keyword list for rank tracking', route: '/keywords', icon: 'ðŸ”', required: true },
    { id: 'run_audit', label: 'Run SEO Audit', description: 'Get a baseline health score for your site', route: '/audit', icon: 'ðŸ©º', required: false },
    { id: 'first_post', label: 'Create First Post', description: 'Write and publish your first AI-assisted post', route: '/create', icon: 'ðŸ“', required: true },
    { id: 'setup_affiliate', label: 'Add Affiliate Program', description: 'Connect your first affiliate program', route: '/affiliates', icon: 'ðŸ’°', required: false },
    { id: 'install_tracker', label: 'Install Click Tracker', description: 'Set up affiliate link click tracking', route: '/click-tracker', icon: 'ðŸ‘†', required: false },
    { id: 'topical_authority', label: 'Check Topical Authority', description: 'Identify content gaps vs competitors', route: '/topical-authority', icon: 'ðŸ”¬', required: false },
    { id: 'setup_alerts', label: 'Set Rank Alerts', description: 'Get notified when keywords move', route: '/keyword-alerts', icon: 'ðŸ””', required: false },
    { id: 'connect_gsc', label: 'Connect Search Console', description: 'Pull GSC data for CTR optimization', route: '/gsc', icon: 'ðŸ“ˆ', required: false },
];

const CompleteStepSchema = z.object({
    action: z.literal('complete_step'),
    step_id: z.string().min(1),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data: progress } = await supabase.from('onboarding_progress')
        .select('*').eq('user_id', user.id).single();

    const completed: string[] = progress?.completed_steps || [];
    const stepsWithStatus = STEPS.map(s => ({ ...s, completed: completed.includes(s.id) }));
    const requiredSteps = STEPS.filter(s => s.required);
    const completedRequired = requiredSteps.filter(s => completed.includes(s.id));
    const pct = Math.round((completedRequired.length / requiredSteps.length) * 100);

    return NextResponse.json({
        steps: stepsWithStatus,
        completed_count: completed.length,
        total_steps: STEPS.length,
        setup_complete_pct: pct,
        is_complete: pct === 100,
        next_step: stepsWithStatus.find(s => !s.completed),
    });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'complete_step') {
        const parsed = CompleteStepSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        const { data: existing } = await supabase.from('onboarding_progress')
            .select('completed_steps').eq('user_id', user.id).single();

        const completed: string[] = existing?.completed_steps || [];
        if (!completed.includes(parsed.data.step_id)) completed.push(parsed.data.step_id);

        await supabase.from('onboarding_progress').upsert({
            user_id: user.id, completed_steps: completed,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        return NextResponse.json({ completed: true, total_completed: completed.length });
    }

    if (body.action === 'reset') {
        await supabase.from('onboarding_progress').upsert({ user_id: user.id, completed_steps: [], updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        return NextResponse.json({ reset: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
