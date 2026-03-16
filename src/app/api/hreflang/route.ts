import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

// GET /api/hreflang — List hreflang configurations
export async function GET(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const siteId = req.nextUrl.searchParams.get('site_id');

        let query = auth.supabase
            .from('hreflang_configs')
            .select('*')
            .order('created_at', { ascending: false });

        if (siteId) query = query.eq('site_id', siteId);

        const { data, error } = await query;

        if (error) {
            // Table may not exist — return empty with supported languages
            return NextResponse.json({
                configs: [],
                supported_languages: SUPPORTED_LANGUAGES,
                needs_setup: true,
            });
        }

        return NextResponse.json({
            configs: data || [],
            supported_languages: SUPPORTED_LANGUAGES,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch hreflang configs' },
            { status: 500 }
        );
    }
}

// POST /api/hreflang — Create/update hreflang mapping
export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const body = await req.json();
        const { action, site_id, page_path, language_mappings, default_language } = body;

        // Generate hreflang tags for a page
        if (action === 'generate_tags') {
            if (!language_mappings || !Array.isArray(language_mappings)) {
                return NextResponse.json({ error: 'language_mappings required' }, { status: 400 });
            }

            const tags = language_mappings.map((m: { lang: string; url: string }) =>
                `<link rel="alternate" hreflang="${m.lang}" href="${m.url}" />`
            );

            if (default_language) {
                const defaultUrl = language_mappings.find((m: { lang: string }) => m.lang === default_language)?.url;
                if (defaultUrl) {
                    tags.push(`<link rel="alternate" hreflang="x-default" href="${defaultUrl}" />`);
                }
            }

            return NextResponse.json({ tags, html: tags.join('\n') });
        }

        // Save hreflang config
        if (!site_id || !page_path || !language_mappings) {
            return NextResponse.json({ error: 'site_id, page_path, and language_mappings required' }, { status: 400 });
        }

        const { data, error } = await auth.supabase
            .from('hreflang_configs')
            .upsert({
                site_id,
                page_path,
                default_language: default_language || 'en',
                language_mappings,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'site_id,page_path' })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ config: data });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to save hreflang config' },
            { status: 500 }
        );
    }
}

// DELETE /api/hreflang — Remove hreflang config
export async function DELETE(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const id = req.nextUrl.searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { error } = await auth.supabase.from('hreflang_configs').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete config' },
            { status: 500 }
        );
    }
}

const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
    { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
    { code: 'bn', name: 'Bengali', flag: '🇧🇩' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺' },
    { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
    { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
    { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
    { code: 'th', name: 'Thai', flag: '🇹🇭' },
    { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
    { code: 'pl', name: 'Polish', flag: '🇵🇱' },
    { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
];
