'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Schedule { id: string; niche: string; frequency: string; post_type: string; word_count: number; is_active: boolean; posts_generated: number; last_run?: string; next_run: string; auto_publish: boolean; publish_status: string; }
interface Run { id: string; keyword: string; title: string; word_count: number; status: string; provider: string; created_at: string; }

const FREQ_LABELS: Record<string, string> = { daily: 'Daily', every_2_days: 'Every 2 days', twice_weekly: 'Twice/week', weekly: 'Weekly' };

export default function AutoBloggerPage() {
    const toast = useToast();
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [runs, setRuns] = useState<Run[]>([]);
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [tab, setTab] = useState<'schedules' | 'create' | 'runs'>('schedules');
    const [siteId, setSiteId] = useState('');
    const [niche, setNiche] = useState('');
    const [frequency, setFrequency] = useState('weekly');
    const [postType, setPostType] = useState('mixed');
    const [wordCount, setWordCount] = useState('1500');
    const [autoPublish, setAutoPublish] = useState(false);
    const [publishStatus, setPublishStatus] = useState('draft');
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [quickNiche, setQuickNiche] = useState('');
    const [quickKeyword, setQuickKeyword] = useState('');
    const [quickSiteId, setQuickSiteId] = useState('');

    useEffect(() => { load(); loadSites(); }, []);

    const load = async () => {
        const res = await fetch('/api/auto-blogger');
        const data = await res.json();
        setSchedules(data.schedules || []);
        setRuns(data.recent_runs || []);
    };

    const loadSites = async () => {
        const res = await fetch('/api/sites');
        const data = await res.json();
        setSites(data.sites || []);
    };

    const createSchedule = async () => {
        if (!siteId || !niche) { toast.warning('Select site and enter niche'); return; }
        setSaving(true);
        const res = await fetch('/api/auto-blogger', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create_schedule', site_id: siteId, niche, frequency, post_type: postType, word_count: parseInt(wordCount), auto_publish: autoPublish, publish_status: publishStatus }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setSaving(false); return; }
        toast.success('Schedule created!');
        setNiche(''); setSiteId('');
        load(); setTab('schedules');
        setSaving(false);
    };

    const generateNow = async () => {
        if (!quickNiche || !quickSiteId) { toast.warning('Enter niche and select site'); return; }
        setGenerating(true);
        const res = await fetch('/api/auto-blogger', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate_now', site_id: quickSiteId, niche: quickNiche, post_type: 'mixed', word_count: 1500, keyword: quickKeyword || undefined, auto_publish: false }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success(`Post generated: "${data.post?.title}" via ${data.provider}`);
            load();
        }
        setGenerating(false);
    };

    const toggle = async (id: string, active: boolean) => {
        await fetch('/api/auto-blogger', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'toggle', schedule_id: id, active }),
        });
        toast.success(active ? 'Schedule enabled' : 'Schedule paused');
        load();
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">AI Auto-Blogger</h1>
                        <p className="page-description">Schedule automated content generation — AI writes + publishes to WordPress on autopilot</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['schedules', 'create', 'runs'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
                                {t === 'create' ? '+ Schedule' : t === 'runs' ? `Runs (${runs.length})` : 'Schedules'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Quick generate */}
                <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--accent-primary)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>⚡ Quick Generate (one-off)</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <select className="form-input" value={quickSiteId} onChange={e => setQuickSiteId(e.target.value)} style={{ flex: '0 0 160px' }}>
                            <option value="">Select site...</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <input className="form-input" value={quickNiche} onChange={e => setQuickNiche(e.target.value)} placeholder="Niche (e.g. personal finance)" style={{ flex: 1, minWidth: 150 }} />
                        <input className="form-input" value={quickKeyword} onChange={e => setQuickKeyword(e.target.value)} placeholder="Keyword (optional, AI picks if empty)" style={{ flex: 1, minWidth: 150 }} />
                        <button className="btn btn-primary" onClick={generateNow} disabled={generating}>{generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Writing...</> : '✍️ Generate Now'}</button>
                    </div>
                </div>

                {tab === 'create' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 16 }}>New Auto-Blog Schedule</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Site *</label>
                                <select className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)}>
                                    <option value="">Select site...</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Niche *</label>
                                <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance, fitness, crypto..." />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Frequency</label>
                                <select className="form-input" value={frequency} onChange={e => setFrequency(e.target.value)}>
                                    {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Post Type</label>
                                <select className="form-input" value={postType} onChange={e => setPostType(e.target.value)}>
                                    <option value="mixed">Mixed (varied)</option>
                                    <option value="how_to">How-To Guides</option>
                                    <option value="listicle">Listicles</option>
                                    <option value="review">Reviews</option>
                                    <option value="comparison">Comparisons</option>
                                    <option value="news">News/Updates</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Word Count Target</label>
                                <select className="form-input" value={wordCount} onChange={e => setWordCount(e.target.value)}>
                                    {['750', '1000', '1500', '2000', '2500', '3000'].map(n => <option key={n} value={n}>{parseInt(n).toLocaleString()} words</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Publish Status</label>
                                <select className="form-input" value={publishStatus} onChange={e => setPublishStatus(e.target.value)}>
                                    <option value="draft">Save as Draft</option>
                                    <option value="publish">Publish Live</option>
                                </select>
                            </div>
                        </div>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, cursor: 'pointer' }}>
                            <input type="checkbox" checked={autoPublish} onChange={e => setAutoPublish(e.target.checked)} />
                            <span className="text-sm">Auto-publish to WordPress when generated</span>
                        </label>
                        <button className="btn btn-primary" onClick={createSchedule} disabled={saving}>{saving ? 'Creating...' : '🤖 Create Schedule'}</button>
                    </div>
                )}

                {tab === 'schedules' && (
                    schedules.length === 0 ? <EmptyState icon="🤖" title="No schedules" description="Create a schedule to auto-generate and publish content on autopilot" /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {schedules.map((s, i) => (
                                <div key={i} className="card" style={{ padding: '14px', opacity: s.is_active ? 1 : 0.6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                                <span style={{ fontWeight: 700 }}>{s.niche}</span>
                                                <Badge variant={s.is_active ? 'success' : 'neutral'}>{s.is_active ? 'Active' : 'Paused'}</Badge>
                                                <Badge variant="info">{FREQ_LABELS[s.frequency]}</Badge>
                                                <Badge variant="neutral">{s.post_type}</Badge>
                                            </div>
                                            <div style={{ display: 'flex', gap: 16 }}>
                                                <span className="text-sm text-muted">Posts generated: <strong>{s.posts_generated}</strong></span>
                                                <span className="text-sm text-muted">Next run: <strong>{new Date(s.next_run).toLocaleDateString()}</strong></span>
                                                <span className="text-sm text-muted">{s.word_count.toLocaleString()}w · {s.publish_status}</span>
                                            </div>
                                        </div>
                                        <button className="btn btn-sm" onClick={() => toggle(s.id, !s.is_active)}>{s.is_active ? '⏸ Pause' : '▶ Enable'}</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}

                {tab === 'runs' && (
                    runs.length === 0 ? <EmptyState icon="📄" title="No runs yet" description="Generate a post or create a schedule to see runs here" /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {runs.map((r, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{r.title || r.keyword}</div>
                                        <div className="text-sm text-muted">{r.word_count?.toLocaleString()}w · via {r.provider} · {new Date(r.created_at).toLocaleDateString()}</div>
                                    </div>
                                    <Badge variant={r.status === 'published' ? 'success' : r.status === 'generated' ? 'warning' : 'info'}>{r.status}</Badge>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </main>
        </div>
    );
}
