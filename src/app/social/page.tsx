'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface GeneratedContent {
    pinterest?: { title: string; description: string; hashtags: string[] };
    twitter?: { text: string; hashtags: string[] };
    linkedin?: { text: string; hashtags: string[] };
}

interface SocialPostRecord {
    id: string;
    platform: string;
    content: string;
    status: string;
    published_at: string | null;
    scheduled_at: string | null;
    platform_post_url: string | null;
    error: string | null;
}

interface Summary {
    total: number;
    published: number;
    scheduled: number;
    failed: number;
    by_platform: Record<string, number>;
}

// From social-scheduler
interface ScheduledPost { id: string; platform: string; content: string; image_url?: string; link_url?: string; scheduled_at: string; status: string; }

const PLATFORM_ICONS: Record<string, string> = { twitter: '𝕏', linkedin: 'in', pinterest: 'P', facebook: 'f', instagram: '📷' };
const PLATFORM_COLORS: Record<string, string> = { twitter: '#000', linkedin: '#0077b5', pinterest: '#e60023', facebook: '#1877f2', instagram: '#e1306c' };
const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'neutral' | 'danger'> = { scheduled: 'warning', published: 'success', failed: 'danger', draft: 'neutral' };

export default function SocialPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('publish');
    const [blogTitle, setBlogTitle] = useState('');
    const [blogUrl, setBlogUrl] = useState('');
    const [blogExcerpt, setBlogExcerpt] = useState('');
    const [niche, setNiche] = useState('');
    const [keyword, setKeyword] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [generating, setGenerating] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
    const [editedContent, setEditedContent] = useState<Record<string, string>>({});
    const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set(['pinterest', 'twitter', 'linkedin']));
    const [posts, setPosts] = useState<SocialPostRecord[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(false);

    // Scheduler state
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
    const [schedTab, setSchedTab] = useState<'calendar' | 'create' | 'generate'>('calendar');
    const [dateRange, setDateRange] = useState({ from: new Date().toISOString().substring(0, 10), to: new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10) });
    const [schedPlatform, setSchedPlatform] = useState('twitter');
    const [schedContent, setSchedContent] = useState('');
    const [schedLinkUrl, setSchedLinkUrl] = useState('');
    const [scheduledAt, setScheduledAt] = useState(new Date(Date.now() + 86400000).toISOString().substring(0, 16));
    const [saving, setSaving] = useState(false);
    const [postTitle, setPostTitle] = useState('');
    const [postUrl, setPostUrl] = useState('');
    const [postExcerpt, setPostExcerpt] = useState('');
    const [genNiche, setGenNiche] = useState('');
    const [genPlatforms, setGenPlatforms] = useState<string[]>(['twitter', 'linkedin']);
    const [generated, setGenerated] = useState<Record<string, { content: string; hashtags: string[] }>>({});
    const [schedGenerating, setSchedGenerating] = useState(false);
    const [startDate, setStartDate] = useState(new Date().toISOString().substring(0, 10));

    useEffect(() => { fetchHistory(); }, []);
    useEffect(() => { if (activeTab === 'scheduler') loadScheduled(); }, [activeTab, dateRange]);

    const fetchHistory = async () => {
        setLoading(true);
        const res = await fetch('/api/social');
        const data = await res.json();
        setPosts(data.posts || []);
        setSummary(data.summary || null);
        setLoading(false);
    };

    // Scheduler API calls
    const loadScheduled = async () => {
        const res = await fetch(`/api/social-scheduler?from=${dateRange.from}&to=${dateRange.to}`);
        const data = await res.json();
        setScheduledPosts(data.posts || []);
    };

    const createScheduledPost = async () => {
        if (!schedContent || !scheduledAt) { toast.warning('Content and scheduled time required'); return; }
        setSaving(true);
        const res = await fetch('/api/social-scheduler', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', platform: schedPlatform, content: schedContent, link_url: schedLinkUrl || undefined, scheduled_at: new Date(scheduledAt).toISOString() }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success('Post scheduled!'); setSchedContent(''); setSchedLinkUrl(''); loadScheduled(); setSchedTab('calendar');
        }
        setSaving(false);
    };

    const generateScheduledPosts = async () => {
        if (!postTitle) { toast.warning('Enter post title'); return; }
        setSchedGenerating(true);
        const res = await fetch('/api/social-scheduler', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate', post_title: postTitle, post_url: postUrl || undefined, post_excerpt: postExcerpt || undefined, niche: genNiche || undefined, platforms: genPlatforms }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            setGenerated(data.posts || {});
            toast.success(`Generated posts via ${data.provider}`);
        }
        setSchedGenerating(false);
    };

    const bulkSchedule = async () => {
        if (!postTitle || genPlatforms.length === 0) { toast.warning('Title and platforms required'); return; }
        setSaving(true);
        const res = await fetch('/api/social-scheduler', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'bulk_schedule', post_id: '00000000-0000-0000-0000-000000000000', post_title: postTitle, post_url: postUrl || undefined, post_excerpt: postExcerpt || undefined, niche: genNiche || undefined, platforms: genPlatforms, start_date: startDate, spacing_days: 3 }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success(`Scheduled ${data.count} posts across platforms!`); loadScheduled(); setSchedTab('calendar');
        }
        setSaving(false);
    };

    const deleteScheduledPost = async (id: string) => {
        await fetch('/api/social-scheduler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', post_id: id }) });
        loadScheduled();
    };

    const toggleSchedPlatform = (p: string) => setGenPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
    const CHAR_LIMITS: Record<string, number> = { twitter: 280, linkedin: 3000, pinterest: 500, facebook: 63206, instagram: 2200 };
    const schedRemaining = CHAR_LIMITS[schedPlatform] - schedContent.length;

    // Group scheduled posts by date
    const byDate: Record<string, ScheduledPost[]> = {};
    for (const post of scheduledPosts) {
        const date = post.scheduled_at.substring(0, 10);
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(post);
    }

    const generate = async () => {
        if (!blogTitle) { toast.warning('Blog title required'); return; }
        setGenerating(true);
        setGeneratedContent(null);
        try {
            const res = await fetch('/api/social', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'generate_content', blog_title: blogTitle, blog_excerpt: blogExcerpt, blog_url: blogUrl, blog_keyword: keyword, niche }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'Failed'); return; }
            setGeneratedContent(data.content);
            setEditedContent({
                pinterest: data.content.pinterest?.description || '',
                twitter: data.content.twitter?.text || '',
                linkedin: data.content.linkedin?.text || '',
            });
            toast.success(`Generated via ${data.provider}`);
        } catch { toast.error('Generation failed'); }
        finally { setGenerating(false); }
    };

    const publish = async () => {
        if (!generatedContent) { toast.warning('Generate content first'); return; }
        if (selectedPlatforms.size === 0) { toast.warning('Select at least one platform'); return; }

        setPublishing(true);
        const platforms = [...selectedPlatforms];
        const results = [];

        for (const platform of platforms) {
            const content = editedContent[platform] || '';
            if (!content) continue;

            const res = await fetch('/api/social', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'publish', platform, content, image_url: imageUrl || undefined, blog_url: blogUrl || undefined }),
            });
            const data = await res.json();
            results.push(...(data.results || []));
        }

        const succeeded = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        if (succeeded > 0) toast.success(`Published to ${succeeded} platform${succeeded > 1 ? 's' : ''}`);
        if (failed > 0) toast.error(`Failed on ${failed} platform${failed > 1 ? 's' : ''}`);

        setPublishing(false);
        fetchHistory();
    };

    const togglePlatform = (p: string) => {
        setSelectedPlatforms(prev => {
            const n = new Set(prev);
            n.has(p) ? n.delete(p) : n.add(p);
            return n;
        });
    };

    const platformIcon = (p: string) => ({ pinterest: '📌', twitter: '🐦', linkedin: '💼' }[p] || '📱');
    const statusVariant = (s: string): 'success' | 'info' | 'warning' | 'danger' => ({ published: 'success', scheduled: 'info', failed: 'danger' }[s] as 'success' | 'info' | 'danger') || 'warning';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Social Publisher</h1>
                        <p className="page-description">Auto-generate & publish to Pinterest, Twitter, LinkedIn</p>
                    </div>
                </div>

                {/* Summary */}
                {summary && (
                    <div className="grid-4" style={{ gap: 16, marginBottom: 24 }}>
                        {[
                            { label: 'Total Posts', value: summary.total, icon: '📱' },
                            { label: 'Published', value: summary.published, icon: '✅' },
                            { label: 'Scheduled', value: summary.scheduled, icon: '🗓️' },
                            { label: 'Failed', value: summary.failed, icon: '❌' },
                        ].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'publish' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('publish')}>📤 Publish Post</button>
                    <button className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('history')}>📋 History ({posts.length})</button>
                    <button className={`btn ${activeTab === 'scheduler' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('scheduler')}>📅 Scheduler</button>
                </div>

                {activeTab === 'history' && (
                    <div className="card">
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: 40 }}>
                                <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
                            </div>
                        ) : posts.length === 0 ? (
                            <EmptyState icon="📱" title="No Posts Yet" description="Publish your first social post to see history here" />
                        ) : (
                            <DataTable
                                data={posts as unknown as Record<string, unknown>[]}
                                searchKeys={['content', 'platform']}
                                pageSize={20}
                                columns={[
                                    { key: 'platform', label: 'Platform', render: (r) => <span>{platformIcon(String(r.platform))} {String(r.platform)}</span> },
                                    { key: 'content', label: 'Content', render: (r) => <span className="text-sm">{String(r.content).substring(0, 80)}...</span> },
                                    { key: 'status', label: 'Status', render: (r) => <Badge variant={statusVariant(String(r.status))}>{String(r.status)}</Badge> },
                                    { key: 'published_at', label: 'Published', render: (r) => r.published_at ? <span className="text-sm text-muted">{new Date(String(r.published_at)).toLocaleDateString()}</span> : <span className="text-muted">—</span> },
                                    {
                                        key: 'platform_post_url', label: 'Link', render: (r) => r.platform_post_url
                                            ? <a href={String(r.platform_post_url)} target="_blank" rel="noopener noreferrer" className="btn btn-sm">View</a>
                                            : r.error ? <span className="text-sm" style={{ color: '#dc2626' }}>{String(r.error).substring(0, 40)}</span>
                                                : <span className="text-muted">—</span>
                                    },
                                ]}
                            />
                        )}
                    </div>
                )}

                {activeTab === 'publish' && (
                    <>
                        {/* Blog Details */}
                        <div className="card" style={{ marginBottom: 16 }}>
                            <h3 className="card-title" style={{ marginBottom: 16 }}>Blog Post Details</h3>
                            <div className="grid-2" style={{ gap: 16 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Blog Title *</label>
                                    <input className="form-input" value={blogTitle} onChange={e => setBlogTitle(e.target.value)} placeholder="Best Standing Desks for 2025" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Target Keyword</label>
                                    <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best standing desks" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Blog Post URL</label>
                                    <input className="form-input" value={blogUrl} onChange={e => setBlogUrl(e.target.value)} placeholder="https://yoursite.com/best-standing-desks" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Niche</label>
                                    <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="home office, productivity" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Featured Image URL <span className="text-muted text-sm">(for Pinterest)</span></label>
                                    <input className="form-input" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://yoursite.com/image.jpg" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Excerpt / Hook</label>
                                    <input className="form-input" value={blogExcerpt} onChange={e => setBlogExcerpt(e.target.value)} placeholder="Key insight or hook from the post..." />
                                </div>
                            </div>
                            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={generate} disabled={generating}>
                                {generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating content...</> : 'Generate Social Content'}
                            </button>
                        </div>

                        {/* Generated Content */}
                        {generatedContent && (
                            <div className="card animate-in" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 16 }}>Generated Content — Edit & Publish</h3>

                                {/* Platform toggles */}
                                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                                    {(['pinterest', 'twitter', 'linkedin'] as const).map(p => (
                                        <button key={p}
                                            className={`btn ${selectedPlatforms.has(p) ? 'btn-primary' : 'btn-sm'}`}
                                            style={{ minWidth: 110 }}
                                            onClick={() => togglePlatform(p)}>
                                            {platformIcon(p)} {p.charAt(0).toUpperCase() + p.slice(1)} {selectedPlatforms.has(p) ? '✓' : ''}
                                        </button>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {(['pinterest', 'twitter', 'linkedin'] as const).map(p => {
                                        if (!generatedContent[p]) return null;
                                        const data = generatedContent[p]!;
                                        const isSelected = selectedPlatforms.has(p);
                                        return (
                                            <div key={p} style={{ opacity: isSelected ? 1 : 0.5, transition: 'opacity 0.2s' }}>
                                                <label className="form-label">{platformIcon(p)} {p.charAt(0).toUpperCase() + p.slice(1)}</label>
                                                {p === 'pinterest' && 'title' in data && (
                                                    <div className="text-sm text-muted" style={{ marginBottom: 6 }}>
                                                        Title: <strong>{(data as { title: string }).title}</strong>
                                                    </div>
                                                )}
                                                <textarea
                                                    className="form-input"
                                                    rows={3}
                                                    style={{ fontFamily: 'inherit', resize: 'vertical' }}
                                                    value={editedContent[p] || ''}
                                                    onChange={e => setEditedContent(prev => ({ ...prev, [p]: e.target.value }))}
                                                />
                                                <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                                                    {editedContent[p]?.length || 0} chars
                                                    {data.hashtags?.length ? ` · Tags: ${data.hashtags.slice(0, 5).map((h: string) => `#${h}`).join(' ')}` : ''}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <button className="btn btn-success" style={{ marginTop: 20 }} onClick={publish} disabled={publishing}>
                                    {publishing ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Publishing...</> : `Publish to ${selectedPlatforms.size} Platform${selectedPlatforms.size !== 1 ? 's' : ''}`}
                                </button>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'scheduler' && (
                    <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                            {(['calendar', 'create', 'generate'] as const).map(t => (
                                <button key={t} className={`btn btn-sm ${schedTab === t ? 'btn-primary' : ''}`} onClick={() => setSchedTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                            ))}
                        </div>

                        {schedTab === 'create' && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 12 }}>Schedule Post</h3>
                                <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Platform</label>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {['twitter', 'linkedin', 'pinterest', 'facebook'].map(p => (
                                                <button key={p} onClick={() => setSchedPlatform(p)} style={{ padding: '6px 10px', borderRadius: 6, border: `2px solid ${schedPlatform === p ? PLATFORM_COLORS[p] : 'var(--border-subtle)'}`, background: schedPlatform === p ? PLATFORM_COLORS[p] + '20' : 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                                                    {PLATFORM_ICONS[p]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Scheduled At</label>
                                        <input className="form-input" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Link URL <span className="text-muted text-sm">(optional)</span></label>
                                        <input className="form-input" value={schedLinkUrl} onChange={e => setSchedLinkUrl(e.target.value)} placeholder="https://yourblog.com/post" />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Content * <span style={{ color: schedRemaining < 20 ? '#dc2626' : 'var(--text-muted)', fontSize: '0.75rem' }}>{schedRemaining} chars remaining</span></label>
                                    <textarea className="form-input" rows={4} value={schedContent} onChange={e => setSchedContent(e.target.value)} placeholder={`Write your ${schedPlatform} post...`} style={{ fontFamily: 'inherit' }} />
                                </div>
                                <button className="btn btn-primary" onClick={createScheduledPost} disabled={saving || schedRemaining < 0}>{saving ? 'Scheduling...' : '📅 Schedule Post'}</button>
                            </div>
                        )}

                        {schedTab === 'generate' && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 12 }}>AI Generate + Bulk Schedule</h3>
                                <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Blog Post Title *</label>
                                        <input className="form-input" value={postTitle} onChange={e => setPostTitle(e.target.value)} placeholder="10 Best Standing Desks for 2025" />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Post URL</label>
                                        <input className="form-input" value={postUrl} onChange={e => setPostUrl(e.target.value)} placeholder="https://yourblog.com/best-standing-desks" />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Niche</label>
                                        <input className="form-input" value={genNiche} onChange={e => setGenNiche(e.target.value)} placeholder="home office" />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Start Scheduling From</label>
                                        <input className="form-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                    </div>
                                </div>
                                <div style={{ marginBottom: 12 }}>
                                    <div className="form-label">Platforms</div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {['twitter', 'linkedin', 'pinterest', 'facebook'].map(p => (
                                            <button key={p} onClick={() => toggleSchedPlatform(p)} style={{ padding: '6px 12px', borderRadius: 6, border: `2px solid ${genPlatforms.includes(p) ? PLATFORM_COLORS[p] : 'var(--border-subtle)'}`, background: genPlatforms.includes(p) ? PLATFORM_COLORS[p] + '20' : 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                                                {PLATFORM_ICONS[p]} {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Post Excerpt <span className="text-muted text-sm">(helps AI write better)</span></label>
                                    <textarea className="form-input" rows={2} value={postExcerpt} onChange={e => setPostExcerpt(e.target.value)} placeholder="Brief summary of the post..." />
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-sm" onClick={generateScheduledPosts} disabled={schedGenerating}>{schedGenerating ? 'Generating...' : '🤖 Preview Posts'}</button>
                                    <button className="btn btn-primary" onClick={bulkSchedule} disabled={saving}>{saving ? 'Scheduling...' : `📅 Schedule ${genPlatforms.length} Posts (3 days apart)`}</button>
                                </div>
                                {Object.keys(generated).length > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                        {Object.entries(generated).map(([plat, post]) => (
                                            <div key={plat} style={{ marginBottom: 10, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, borderLeft: `3px solid ${PLATFORM_COLORS[plat]}` }}>
                                                <div style={{ fontWeight: 700, marginBottom: 4 }}>{PLATFORM_ICONS[plat]} {plat}</div>
                                                <div className="text-sm">{post.content}</div>
                                                {post.hashtags?.length > 0 && <div className="text-sm text-muted" style={{ marginTop: 4 }}>{post.hashtags.map(h => '#' + h).join(' ')}</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {schedTab === 'calendar' && (
                            <>
                                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                                    <input className="form-input" type="date" value={dateRange.from} onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))} />
                                    <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>to</span>
                                    <input className="form-input" type="date" value={dateRange.to} onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))} />
                                </div>

                                {Object.keys(byDate).length === 0 ? (
                                    <EmptyState icon="📅" title="No posts scheduled" description="Create a post or use AI generate to fill your social calendar" />
                                ) : (
                                    Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, datePosts]) => (
                                        <div key={date} style={{ marginBottom: 12 }}>
                                            <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {datePosts.map((p, i) => (
                                                    <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, borderLeft: `3px solid ${PLATFORM_COLORS[p.platform] || '#6b7280'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                                                                <span style={{ fontWeight: 700, color: PLATFORM_COLORS[p.platform] }}>{PLATFORM_ICONS[p.platform]}</span>
                                                                <span className="text-sm text-muted">{new Date(p.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                                                <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                                                            </div>
                                                            <div className="text-sm">{p.content.substring(0, 120)}{p.content.length > 120 ? '...' : ''}</div>
                                                        </div>
                                                        <button className="btn btn-sm" onClick={() => deleteScheduledPost(p.id)} style={{ color: '#dc2626', flexShrink: 0 }}>🗑</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
