'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface ScheduledPost { id: string; platform: string; content: string; image_url?: string; link_url?: string; scheduled_at: string; status: string; }

const PLATFORM_ICONS: Record<string, string> = { twitter: '𝕏', linkedin: 'in', pinterest: 'P', facebook: 'f', instagram: '📷' };
const PLATFORM_COLORS: Record<string, string> = { twitter: '#000', linkedin: '#0077b5', pinterest: '#e60023', facebook: '#1877f2', instagram: '#e1306c' };
const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'neutral' | 'danger'> = { scheduled: 'warning', published: 'success', failed: 'danger', draft: 'neutral' };

export default function SocialSchedulerPage() {
    const toast = useToast();
    const [posts, setPosts] = useState<ScheduledPost[]>([]);
    const [tab, setTab] = useState<'calendar' | 'create' | 'generate'>('calendar');
    const [dateRange, setDateRange] = useState({ from: new Date().toISOString().substring(0, 10), to: new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10) });
    // Create form
    const [platform, setPlatform] = useState('twitter');
    const [content, setContent] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [scheduledAt, setScheduledAt] = useState(new Date(Date.now() + 86400000).toISOString().substring(0, 16));
    const [saving, setSaving] = useState(false);
    // Generate form
    const [postTitle, setPostTitle] = useState('');
    const [postUrl, setPostUrl] = useState('');
    const [postExcerpt, setPostExcerpt] = useState('');
    const [genNiche, setGenNiche] = useState('');
    const [genPlatforms, setGenPlatforms] = useState<string[]>(['twitter', 'linkedin']);
    const [generated, setGenerated] = useState<Record<string, { content: string; hashtags: string[] }>>({});
    const [generating, setGenerating] = useState(false);
    const [startDate, setStartDate] = useState(new Date().toISOString().substring(0, 10));

    useEffect(() => { load(); }, [dateRange]);

    const load = async () => {
        const res = await fetch(`/api/social-scheduler?from=${dateRange.from}&to=${dateRange.to}`);
        const data = await res.json();
        setPosts(data.posts || []);
    };

    const createPost = async () => {
        if (!content || !scheduledAt) { toast.warning('Content and scheduled time required'); return; }
        setSaving(true);
        const res = await fetch('/api/social-scheduler', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', platform, content, link_url: linkUrl || undefined, scheduled_at: new Date(scheduledAt).toISOString() }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success('Post scheduled!'); setContent(''); setLinkUrl(''); load(); setTab('calendar');
        }
        setSaving(false);
    };

    const generatePosts = async () => {
        if (!postTitle) { toast.warning('Enter post title'); return; }
        setGenerating(true);
        const res = await fetch('/api/social-scheduler', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate', post_title: postTitle, post_url: postUrl || undefined, post_excerpt: postExcerpt || undefined, niche: genNiche || undefined, platforms: genPlatforms }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            setGenerated(data.posts || {});
            toast.success(`Generated posts via ${data.provider}`);
        }
        setGenerating(false);
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
            toast.success(`Scheduled ${data.count} posts across platforms!`); load(); setTab('calendar');
        }
        setSaving(false);
    };

    const deletePost = async (id: string) => {
        await fetch('/api/social-scheduler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', post_id: id }) });
        load();
    };

    const togglePlatform = (p: string) => setGenPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
    const CHAR_LIMITS: Record<string, number> = { twitter: 280, linkedin: 3000, pinterest: 500, facebook: 63206, instagram: 2200 };
    const remaining = CHAR_LIMITS[platform] - content.length;

    // Group posts by date
    const byDate: Record<string, ScheduledPost[]> = {};
    for (const post of posts) {
        const date = post.scheduled_at.substring(0, 10);
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(post);
    }

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Social Media Scheduler</h1>
                        <p className="page-description">Schedule posts across Twitter, LinkedIn, Pinterest — calendar view, AI generation, bulk scheduling</p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {(['calendar', 'create', 'generate'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                        ))}
                    </div>
                </div>

                {tab === 'create' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Schedule Post</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Platform</label>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {['twitter', 'linkedin', 'pinterest', 'facebook'].map(p => (
                                        <button key={p} onClick={() => setPlatform(p)} style={{ padding: '6px 10px', borderRadius: 6, border: `2px solid ${platform === p ? PLATFORM_COLORS[p] : 'var(--border-subtle)'}`, background: platform === p ? PLATFORM_COLORS[p] + '20' : 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
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
                                <input className="form-input" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://yourblog.com/post" />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Content * <span style={{ color: remaining < 20 ? '#dc2626' : 'var(--text-muted)', fontSize: '0.75rem' }}>{remaining} chars remaining</span></label>
                            <textarea className="form-input" rows={4} value={content} onChange={e => setContent(e.target.value)} placeholder={`Write your ${platform} post...`} style={{ fontFamily: 'inherit' }} />
                        </div>
                        <button className="btn btn-primary" onClick={createPost} disabled={saving || remaining < 0}>{saving ? 'Scheduling...' : '📅 Schedule Post'}</button>
                    </div>
                )}

                {tab === 'generate' && (
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
                                    <button key={p} onClick={() => togglePlatform(p)} style={{ padding: '6px 12px', borderRadius: 6, border: `2px solid ${genPlatforms.includes(p) ? PLATFORM_COLORS[p] : 'var(--border-subtle)'}`, background: genPlatforms.includes(p) ? PLATFORM_COLORS[p] + '20' : 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
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
                            <button className="btn btn-sm" onClick={generatePosts} disabled={generating}>{generating ? 'Generating...' : '🤖 Preview Posts'}</button>
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

                {tab === 'calendar' && (
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
                                                <button className="btn btn-sm" onClick={() => deletePost(p.id)} style={{ color: '#dc2626', flexShrink: 0 }}>🗑</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
