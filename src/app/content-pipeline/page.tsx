'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface PipelineRun { id: string; keyword: string; post_type: string; title: string; word_count: number; stages_completed: string[]; status: string; result_data: Record<string, unknown>; created_at: string; }

// From /calendar
interface Site { id: string; name: string; niche: string; }
interface CalendarItem {
    date: string;
    keyword: string;
    title: string;
    type: 'pillar' | 'supporting' | 'update';
    priority: 'high' | 'medium' | 'low';
    status: 'planned' | 'in-progress' | 'done';
}

const STAGES = ['brief', 'outline', 'write', 'optimize', 'meta'] as const;
const STAGE_ICONS: Record<string, string> = { brief: '📋', outline: '🏗️', write: '✍️', optimize: '🔍', meta: '🏷️' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ContentPipelinePage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('pipeline');
    const [runs, setRuns] = useState<PipelineRun[]>([]);
    const [keyword, setKeyword] = useState('');
    const [niche, setNiche] = useState('');
    const [siteId, setSiteId] = useState('');
    const [postType, setPostType] = useState('guide');
    const [wordCount, setWordCount] = useState('1800');
    const [selectedStages, setSelectedStages] = useState<string[]>(['brief', 'outline', 'write', 'optimize', 'meta']);
    const [autoDraft, setAutoDraft] = useState(false);
    const [running, setRunning] = useState(false);
    const [expandedRun, setExpandedRun] = useState<string | null>(null);
    const [currentStage, setCurrentStage] = useState('');

    // Calendar state
    const [calSites, setCalSites] = useState<Site[]>([]);
    const [calSelectedSite, setCalSelectedSite] = useState('');
    const [calNiche, setCalNiche] = useState('');
    const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
    const [calLoading, setCalLoading] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [calView, setCalView] = useState<'calendar' | 'list'>('calendar');

    useEffect(() => { load(); }, []);
    useEffect(() => {
        if (activeTab === 'calendar') {
            fetch('/api/sites').then(r => r.json()).then(d => setCalSites(d.sites || []));
        }
    }, [activeTab]);

    const load = async () => {
        const res = await fetch('/api/content-pipeline');
        const data = await res.json();
        setRuns(data.runs || []);
    };

    const run = async () => {
        if (!keyword) { toast.warning('Enter keyword'); return; }
        setRunning(true);
        for (const stage of selectedStages) setCurrentStage(stage);
        const res = await fetch('/api/content-pipeline', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'run', keyword, niche: niche || undefined, site_id: siteId || undefined, post_type: postType, target_word_count: parseInt(wordCount), auto_publish_draft: autoDraft, stages: selectedStages }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success(`Pipeline complete! ${data.run?.word_count || 0}w post generated`);
            load();
        }
        setCurrentStage('');
        setRunning(false);
    };

    const toggleStage = (s: string) => setSelectedStages(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

    // Calendar functions
    const handleGenerateCalendar = async () => {
        const targetNiche = calNiche || calSites.find(s => s.id === calSelectedSite)?.niche || '';
        if (!targetNiche) { toast.warning('Enter a niche first'); return; }

        setCalLoading(true);
        try {
            const res = await fetch('/api/keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'ai_suggest',
                    niche: `content calendar schedule for 4 weeks for: ${targetNiche}. Mix pillar content, supporting articles, and content updates.`,
                }),
            });
            const data = await res.json();
            const suggestions = data.suggestions || [];

            const today = new Date();
            const items: CalendarItem[] = suggestions.slice(0, 16).map((s: { keyword: string; intent?: string }, i: number) => {
                const day = new Date(currentYear, currentMonth, Math.min(28, today.getDate() + Math.floor(i / 2) * 2 + (i % 2)));
                const types: ('pillar' | 'supporting' | 'update')[] = ['pillar', 'supporting', 'supporting', 'update'];
                const priorities: ('high' | 'medium' | 'low')[] = ['high', 'medium', 'low'];
                return {
                    date: day.toISOString().split('T')[0],
                    keyword: s.keyword,
                    title: s.keyword.charAt(0).toUpperCase() + s.keyword.slice(1),
                    type: types[i % 4],
                    priority: priorities[i % 3],
                    status: 'planned' as const,
                };
            });
            setCalendarItems(items);
        } catch {
            toast.error('Failed to generate calendar');
        } finally {
            setCalLoading(false);
        }
    };

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const calendarDays: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) calendarDays.push(null);
    for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

    const getItemsForDay = (day: number) => {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return calendarItems.filter(item => item.date === dateStr);
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'pillar': return 'var(--accent-primary)';
            case 'supporting': return 'var(--accent-success)';
            case 'update': return 'var(--accent-warning)';
            default: return 'var(--text-muted)';
        }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Pipeline</h1>
                        <p className="page-description">Brief → Outline → Write → Optimize → Meta — one-click full content production</p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'pipeline' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('pipeline')}>🚀 Pipeline</button>
                    <button className={`btn ${activeTab === 'calendar' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('calendar')}>📅 Calendar View</button>
                </div>

                {activeTab === 'pipeline' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Target Keyword *</label>
                                    <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best standing desks 2025" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Niche</label>
                                    <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="home office" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Post Type</label>
                                    <select className="form-input" value={postType} onChange={e => setPostType(e.target.value)}>
                                        <option value="guide">Ultimate Guide</option>
                                        <option value="how_to">How-To</option>
                                        <option value="listicle">Listicle</option>
                                        <option value="review">Review</option>
                                        <option value="comparison">Comparison</option>
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Word Count</label>
                                    <select className="form-input" value={wordCount} onChange={e => setWordCount(e.target.value)}>
                                        {['1000', '1500', '1800', '2500', '3000', '4000'].map(n => <option key={n} value={n}>{parseInt(n).toLocaleString()} words</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Site ID <span className="text-muted text-sm">(for auto-draft)</span></label>
                                    <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="UUID from Sites" />
                                </div>
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <div className="form-label">Pipeline Stages</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {STAGES.map(s => (
                                        <button key={s} className={`btn btn-sm ${selectedStages.includes(s) ? 'btn-primary' : ''}`} onClick={() => toggleStage(s)}>
                                            {STAGE_ICONS[s]} {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <button className="btn btn-primary" onClick={run} disabled={running} style={{ minWidth: 160 }}>
                                    {running ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />{currentStage ? `${STAGE_ICONS[currentStage]} ${currentStage}...` : 'Running...'}</> : '🚀 Run Pipeline'}
                                </button>
                                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={autoDraft} onChange={e => setAutoDraft(e.target.checked)} />
                                    <span className="text-sm">Auto-save as draft post</span>
                                </label>
                            </div>
                        </div>

                        {running && (
                            <div className="card" style={{ marginBottom: 16, padding: '24px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                                    {selectedStages.map((s, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <div style={{ padding: '4px 10px', borderRadius: 20, background: s === currentStage ? 'var(--accent-primary)' : 'var(--border-subtle)', color: s === currentStage ? '#fff' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: s === currentStage ? 700 : 400 }}>
                                                {STAGE_ICONS[s]} {s}
                                            </div>
                                            {i < selectedStages.length - 1 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
                                        </div>
                                    ))}
                                </div>
                                <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 8px' }} />
                                <div style={{ fontWeight: 600 }}>Running {currentStage}...</div>
                            </div>
                        )}

                        {runs.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {runs.map((r, i) => (
                                    <div key={i} className="card">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                            <div>
                                                <div style={{ fontWeight: 700 }}>{r.title || r.keyword}</div>
                                                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                                    <Badge variant="info">{r.post_type}</Badge>
                                                    {r.word_count > 0 && <span className="text-sm text-muted">{r.word_count.toLocaleString()}w</span>}
                                                    <span className="text-sm text-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                    {r.stages_completed.map(s => <span key={s} style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#f0fdf4', color: '#166534', borderRadius: 10 }}>{STAGE_ICONS[s]} {s}</span>)}
                                                </div>
                                            </div>
                                            <button className="btn btn-sm" onClick={() => setExpandedRun(expandedRun === r.id ? null : r.id)}>{expandedRun === r.id ? 'Hide' : 'View'}</button>
                                        </div>

                                        {expandedRun === r.id && r.result_data && (
                                            <div style={{ marginTop: 12 }}>
                                                {Boolean((r.result_data.draft as Record<string, unknown>)?.content) && (
                                                    <div>
                                                        <div className="form-label">Generated Content</div>
                                                        <textarea className="form-input" rows={10} defaultValue={(r.result_data.draft as Record<string, string>).content} style={{ fontFamily: 'inherit', fontSize: '0.9rem' }} />
                                                    </div>
                                                )}
                                                {(r.result_data.meta as Record<string, string>)?.meta_description && (
                                                    <div style={{ marginTop: 8 }}>
                                                        <div className="form-label">Meta Description</div>
                                                        <div style={{ padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 4 }} className="text-sm">{(r.result_data.meta as Record<string, string>).meta_description}</div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            !running && <EmptyState icon="🚀" title="Pipeline ready" description="Enter a keyword and run the pipeline to generate a complete optimized post" />
                        )}
                    </>
                )}

                {activeTab === 'calendar' && (
                    <>
                        {/* Controls */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Niche</label>
                                    <input className="form-input" placeholder="e.g., digital marketing" value={calNiche} onChange={e => setCalNiche(e.target.value)} />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Site</label>
                                    <select className="form-select" value={calSelectedSite} onChange={e => setCalSelectedSite(e.target.value)}>
                                        <option value="">Select...</option>
                                        {calSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                                    <button className="btn btn-primary" onClick={handleGenerateCalendar} disabled={calLoading} style={{ width: '100%' }}>
                                        {calLoading ? '⏳ Generating...' : '📅 Generate Calendar'}
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Badge variant="info">🔵 Pillar</Badge>
                                <Badge variant="success">🟢 Supporting</Badge>
                                <Badge variant="warning">🟡 Update</Badge>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            <button className={`btn ${calView === 'calendar' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setCalView('calendar')}>📅 Calendar</button>
                            <button className={`btn ${calView === 'list' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setCalView('list')}>📋 List</button>
                        </div>

                        {calendarItems.length === 0 ? (
                            <div className="card">
                                <EmptyState icon="📅" title="No Calendar Yet" description="Enter a niche and click 'Generate Calendar' to create an AI-powered content publishing schedule." />
                            </div>
                        ) : calView === 'calendar' ? (
                            <div className="card">
                                {/* Month Navigation */}
                                <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
                                    <button className="btn btn-secondary btn-sm" onClick={() => {
                                        if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
                                        else setCurrentMonth(m => m - 1);
                                    }}>← Prev</button>
                                    <h2 style={{ fontWeight: 700 }}>{MONTHS[currentMonth]} {currentYear}</h2>
                                    <button className="btn btn-secondary btn-sm" onClick={() => {
                                        if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
                                        else setCurrentMonth(m => m + 1);
                                    }}>Next →</button>
                                </div>

                                {/* Calendar Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                                    {DAYS.map(d => (
                                        <div key={d} style={{ textAlign: 'center', padding: 8, fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
                                    ))}
                                    {calendarDays.map((day, i) => {
                                        const items = day ? getItemsForDay(day) : [];
                                        const isToday = day === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();
                                        return (
                                            <div key={i} style={{
                                                minHeight: 80, padding: 6, borderRadius: 'var(--radius-sm)',
                                                background: day ? (isToday ? 'var(--gradient-glow)' : 'var(--bg-glass)') : 'transparent',
                                                border: isToday ? '1px solid var(--border-accent)' : '1px solid transparent',
                                            }}>
                                                {day && (
                                                    <>
                                                        <div style={{ fontSize: '0.75rem', fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--accent-primary-light)' : 'var(--text-muted)', marginBottom: 4 }}>{day}</div>
                                                        {items.map((item, j) => (
                                                            <a key={j} href={`/create?keyword=${encodeURIComponent(item.keyword)}`} style={{
                                                                display: 'block', fontSize: '0.65rem', padding: '2px 4px', borderRadius: 3,
                                                                background: `${getTypeColor(item.type)}20`, borderLeft: `2px solid ${getTypeColor(item.type)}`,
                                                                marginBottom: 2, color: 'var(--text-secondary)', textDecoration: 'none',
                                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                            }}>
                                                                {item.title}
                                                            </a>
                                                        ))}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            /* List View */
                            <div className="card">
                                <div className="card-header">
                                    <h2 className="card-title">📋 Scheduled Content ({calendarItems.length})</h2>
                                </div>
                                <div className="table-wrapper">
                                    <table className="data-table">
                                        <thead>
                                            <tr><th>Date</th><th>Title</th><th>Type</th><th>Priority</th><th>Action</th></tr>
                                        </thead>
                                        <tbody>
                                            {calendarItems.sort((a, b) => a.date.localeCompare(b.date)).map((item, i) => (
                                                <tr key={i}>
                                                    <td className="font-mono text-sm">{item.date}</td>
                                                    <td style={{ fontWeight: 500 }}>{item.title}</td>
                                                    <td><Badge variant={item.type === 'pillar' ? 'info' : item.type === 'supporting' ? 'success' : 'warning'}>{item.type}</Badge></td>
                                                    <td><Badge variant={item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'neutral'}>{item.priority}</Badge></td>
                                                    <td><a href={`/create?keyword=${encodeURIComponent(item.keyword)}`} className="btn btn-primary btn-sm">Write →</a></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
