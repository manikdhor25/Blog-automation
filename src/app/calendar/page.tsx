'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site { id: string; name: string; niche: string; }

interface CalendarItem {
    date: string;
    keyword: string;
    title: string;
    type: 'pillar' | 'supporting' | 'update';
    priority: 'high' | 'medium' | 'low';
    status: 'planned' | 'in-progress' | 'done';
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [niche, setNiche] = useState('');
    const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [view, setView] = useState<'calendar' | 'list'>('calendar');

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []));
    }, []);

    const handleGenerate = async () => {
        const targetNiche = niche || sites.find(s => s.id === selectedSite)?.niche || '';
        if (!targetNiche) { toast.warning('Enter a niche first'); return; }

        setLoading(true);
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

            // Generate calendar items spread across the current month
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
            setLoading(false);
        }
    };

    // Calendar grid
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
                        <h1 className="page-title">Content Calendar</h1>
                        <p className="page-description">AI-generated publishing schedule</p>
                    </div>
                    <div className="flex gap-2">
                        <button className={`btn ${view === 'calendar' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setView('calendar')}>📅 Calendar</button>
                        <button className={`btn ${view === 'list' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setView('list')}>📋 List</button>
                    </div>
                </div>

                {/* Controls */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche</label>
                            <input className="form-input" placeholder="e.g., digital marketing" value={niche} onChange={e => setNiche(e.target.value)} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Site</label>
                            <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                <option value="">Select...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%' }}>
                                {loading ? '⏳ Generating...' : '📅 Generate Calendar'}
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Badge variant="info">🔵 Pillar</Badge>
                        <Badge variant="success">🟢 Supporting</Badge>
                        <Badge variant="warning">🟡 Update</Badge>
                    </div>
                </div>

                {calendarItems.length === 0 ? (
                    <div className="card">
                        <EmptyState icon="📅" title="No Calendar Yet" description="Enter a niche and click 'Generate Calendar' to create an AI-powered content publishing schedule." />
                    </div>
                ) : view === 'calendar' ? (
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
            </main>
        </div>
    );
}
