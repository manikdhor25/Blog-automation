'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Query { id: string; category: string; query_text: string; publication: string; deadline_hours: number; relevance_score: number; da_estimate: number; link_potential: string; status: string; generated_pitch?: Record<string, string>; }
interface Stats { new: number; drafted: number; sent: number; placed: number; }

const LINK_COLORS: Record<string, string> = { high: '#16a34a', medium: '#d97706', low: '#6b7280' };

export default function HAROPage() {
    const toast = useToast();
    const [queries, setQueries] = useState<Query[]>([]);
    const [stats, setStats] = useState<Stats>({ new: 0, drafted: 0, sent: 0, placed: 0 });
    const [niche, setNiche] = useState('');
    const [yourName, setYourName] = useState('');
    const [yourCreds, setYourCreds] = useState('');
    const [yourWebsite, setYourWebsite] = useState('');
    const [selectedQuery, setSelectedQuery] = useState<Query | null>(null);
    const [pitch, setPitch] = useState<Record<string, string> | null>(null);
    const [fetching, setFetching] = useState(false);
    const [generatingPitch, setGeneratingPitch] = useState(false);
    const [filter, setFilter] = useState('new');

    useEffect(() => { fetchQueries(); }, [filter]);

    const fetchQueries = async () => {
        const res = await fetch(`/api/haro?status=${filter}`);
        const data = await res.json();
        setQueries(data.queries || []);
        setStats(data.stats || { new: 0, drafted: 0, sent: 0, placed: 0 });
    };

    const fetchNewQueries = async () => {
        if (!niche) { toast.warning('Enter niche first'); return; }
        setFetching(true);
        const res = await fetch('/api/haro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch_queries', niche }) });
        const data = await res.json();
        toast.success(`Found ${data.count} queries via ${data.provider}`);
        fetchQueries();
        setFetching(false);
    };

    const generatePitch = async (query: Query) => {
        setSelectedQuery(query); setPitch(null); setGeneratingPitch(true);
        const res = await fetch('/api/haro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_pitch', query_id: query.id, query_text: query.query_text, query_category: query.category, publication: query.publication, your_name: yourName, your_credentials: yourCreds, your_website: yourWebsite }) });
        const data = await res.json();
        if (res.ok) { setPitch(data.pitch); toast.success(`Pitch generated via ${data.provider}`); }
        setGeneratingPitch(false);
    };

    const markSent = async (id: string) => {
        await fetch('/api/haro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_sent', id }) });
        toast.success('Marked as sent');
        fetchQueries();
    };

    const markPlaced = async (id: string) => {
        await fetch('/api/haro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_placed', id, your_website: yourWebsite }) });
        toast.success('🎉 Marked as placed! Great job!');
        fetchQueries();
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">HARO Automation</h1>
                        <p className="page-description">Journalist queries → AI-matched pitches → free high-DA backlinks from Forbes, Inc., Entrepreneur</p>
                    </div>
                </div>

                <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                    {[{ l: 'New', v: stats.new, icon: '📬' }, { l: 'Drafted', v: stats.drafted, icon: '✏️' }, { l: 'Sent', v: stats.sent, icon: '📤' }, { l: 'Placed 🎉', v: stats.placed, icon: '✅' }].map((s, i) => (
                        <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{s.v}</div>
                            <div className="text-sm text-muted">{s.l}</div>
                        </div>
                    ))}
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                        <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="Your niche (e.g. personal finance, fitness)" style={{ flex: 1, minWidth: 200 }} />
                        <button className="btn btn-primary" onClick={fetchNewQueries} disabled={fetching}>{fetching ? 'Finding...' : '📡 Find Queries'}</button>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {[['yourName', 'Your Name'], ['yourCreds', 'Credentials'], ['yourWebsite', 'Your Website']].map(([key, label]) => (
                            <input key={key} className="form-input" placeholder={label} value={key === 'yourName' ? yourName : key === 'yourCreds' ? yourCreds : yourWebsite} onChange={e => { if (key === 'yourName') setYourName(e.target.value); else if (key === 'yourCreds') setYourCreds(e.target.value); else setYourWebsite(e.target.value); }} style={{ flex: '1 1 150px' }} />
                        ))}
                    </div>
                </div>

                {selectedQuery && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">Pitch for: {selectedQuery.publication}</h3><button className="btn btn-sm" onClick={() => { setSelectedQuery(null); setPitch(null); }}>✕</button></div>
                        <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 12 }}>
                            <div className="text-sm">{selectedQuery.query_text}</div>
                        </div>
                        {generatingPitch ? <div className="text-sm text-muted">Generating pitch...</div>
                            : pitch ? (
                                <>
                                    <div style={{ marginBottom: 10 }}>
                                        <div className="form-label">Subject Line</div>
                                        <div style={{ fontWeight: 700, background: 'var(--bg-secondary)', padding: '8px 10px', borderRadius: 4 }}>{pitch.subject_line}</div>
                                    </div>
                                    <div style={{ marginBottom: 10 }}>
                                        <div className="form-label">Pitch Email</div>
                                        <textarea className="form-input" rows={8} defaultValue={pitch.pitch} style={{ fontFamily: 'inherit' }} />
                                    </div>
                                    <div style={{ padding: '8px 10px', background: '#f0fdf4', borderRadius: 4, marginBottom: 10 }}>
                                        <div className="text-sm text-muted">Key quote: <strong>{pitch.key_quote}</strong></div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(pitch.pitch); toast.success('Copied'); }}>Copy Pitch</button>
                                        <button className="btn btn-sm btn-primary" onClick={() => markSent(selectedQuery.id)}>Mark as Sent</button>
                                        <button className="btn btn-sm btn-success" onClick={() => markPlaced(selectedQuery.id)}>🎉 Placed!</button>
                                    </div>
                                </>
                            ) : null
                        }
                    </div>
                )}

                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {['new', 'drafted', 'sent', 'placed', 'all'].map(s => <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : ''}`} onClick={() => setFilter(s)}>{s}</button>)}
                </div>

                <div className="card">
                    {queries.length === 0 ? <EmptyState icon="📬" title="No Queries" description="Enter your niche and click Find Queries to get journalist opportunities" />
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {queries.map(q => (
                                <div key={q.id} className="card" style={{ padding: 14 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                                <Badge variant="info">{q.publication}</Badge>
                                                <Badge variant="neutral">{q.category}</Badge>
                                                <span style={{ fontSize: '0.75rem', color: LINK_COLORS[q.link_potential || 'medium'], fontWeight: 700 }}>{q.link_potential} link potential</span>
                                                <span className="text-sm text-muted">DA ~{q.da_estimate}</span>
                                                <span className="text-sm text-muted">Due in {q.deadline_hours}h</span>
                                            </div>
                                            <div className="text-sm">{q.query_text.substring(0, 200)}</div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                                            <button className="btn btn-sm btn-primary" onClick={() => generatePitch(q)}>Generate Pitch</button>
                                            {q.status === 'sent' && <button className="btn btn-sm btn-success" onClick={() => markPlaced(q.id)}>Placed!</button>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    }
                </div>
            </main>
        </div>
    );
}
