'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface KeywordHistory { keyword: string; positions: Array<{ date: string; position: number }> }
interface Mover { keyword: string; change: number; current: number; previous: number; direction: string; }

export default function RankHistoryPage() {
    const toast = useToast();
    const [history, setHistory] = useState<Record<string, Array<{ date: string; position: number }>>>({});
    const [movers, setMovers] = useState<Mover[]>([]);
    const [siteId, setSiteId] = useState('');
    const [search, setSearch] = useState('');
    const [days, setDays] = useState('90');
    const [loading, setLoading] = useState(false);
    const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);

    const load = async () => {
        if (!siteId && !search) return;
        setLoading(true);
        const params = new URLSearchParams({ days, limit: '20' });
        if (siteId) params.set('site_id', siteId);
        if (search) params.set('keyword', search);
        const res = await fetch(`/api/rank-history?${params}`);
        const data = await res.json();
        setHistory(data.history || {});
        setMovers(data.movers || []);
        setLoading(false);
    };

    useEffect(() => { if (siteId) load(); }, [siteId, days]);

    const renderSparkline = (positions: Array<{ date: string; position: number }>, width = 120, height = 32) => {
        if (positions.length < 2) return null;
        const maxPos = Math.max(...positions.map(p => p.position), 100);
        const minPos = Math.min(...positions.map(p => p.position), 1);
        const range = maxPos - minPos || 1;
        const points = positions.map((p, i) => {
            const x = (i / (positions.length - 1)) * width;
            const y = height - ((p.position - minPos) / range) * height;
            return `${x},${y}`;
        }).join(' ');
        const first = positions[0].position;
        const last = positions[positions.length - 1].position;
        const improved = last < first;
        return (
            <svg width={width} height={height} style={{ overflow: 'visible' }}>
                <polyline points={points} fill="none" stroke={improved ? '#16a34a' : '#dc2626'} strokeWidth="2" />
                <circle cx={(positions.length - 1) / (positions.length - 1) * width} cy={height - ((last - minPos) / range) * height} r="3" fill={improved ? '#16a34a' : '#dc2626'} />
            </svg>
        );
    };

    const changeColor = (change: number) => change > 0 ? '#16a34a' : change < 0 ? '#dc2626' : '#6b7280';
    const posColor = (pos: number) => pos <= 3 ? '#16a34a' : pos <= 10 ? '#d97706' : pos <= 30 ? '#6b7280' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Rank History Charts</h1>
                        <p className="page-description">Visual keyword position trends — movers, top gainers, position over time</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="Site ID" style={{ flex: 1, minWidth: 180 }} onBlur={load} />
                        <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter keyword..." style={{ flex: 1, minWidth: 140 }} onKeyDown={e => e.key === 'Enter' && load()} />
                        <select className="form-input" value={days} onChange={e => { setDays(e.target.value); }} style={{ width: 'auto' }}>
                            <option value="30">30 days</option>
                            <option value="90">90 days</option>
                            <option value="180">6 months</option>
                            <option value="365">1 year</option>
                        </select>
                        <button className="btn btn-primary" onClick={load} disabled={loading}>{loading ? '...' : '📈 Load'}</button>
                    </div>
                </div>

                {movers.length > 0 && (
                    <>
                        <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 10, color: '#16a34a' }}>📈 Top Movers (Gained)</h3>
                                {movers.filter(m => m.change > 0).slice(0, 5).map((m, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => setSelectedKeyword(m.keyword === selectedKeyword ? null : m.keyword)}>
                                        <span className="text-sm">{m.keyword}</span>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <span style={{ fontWeight: 700, color: '#16a34a' }}>+{m.change} ↑</span>
                                            <span style={{ color: posColor(m.current), fontWeight: 700 }}>#{m.current}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 10, color: '#dc2626' }}>📉 Top Losers (Dropped)</h3>
                                {movers.filter(m => m.change < 0).slice(0, 5).map((m, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => setSelectedKeyword(m.keyword === selectedKeyword ? null : m.keyword)}>
                                        <span className="text-sm">{m.keyword}</span>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <span style={{ fontWeight: 700, color: '#dc2626' }}>{m.change} ↓</span>
                                            <span style={{ color: posColor(m.current), fontWeight: 700 }}>#{m.current}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="card">
                            <h3 className="card-title" style={{ marginBottom: 12 }}>All Keywords — {days} Day History</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {Object.entries(history).map(([kw, positions], i) => {
                                    const current = positions[positions.length - 1]?.position;
                                    const first = positions[0]?.position;
                                    const change = first - current;
                                    const isSelected = selectedKeyword === kw;

                                    return (
                                        <div key={i} style={{ padding: '8px 12px', background: isSelected ? 'var(--bg-card)' : 'var(--bg-secondary)', borderRadius: 6, cursor: 'pointer', border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent' }}
                                            onClick={() => setSelectedKeyword(isSelected ? null : kw)}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 600 }}>{kw}</span>
                                                    <span style={{ fontWeight: 700, color: posColor(current), fontSize: '1rem' }}>#{current}</span>
                                                    {change !== 0 && <span style={{ fontWeight: 700, color: changeColor(change), fontSize: '0.8rem' }}>{change > 0 ? '+' : ''}{change}</span>}
                                                </div>
                                                {renderSparkline(positions)}
                                            </div>

                                            {isSelected && positions.length > 0 && (
                                                <div style={{ marginTop: 12 }}>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        {positions.map((p, pi) => (
                                                            <div key={pi} style={{ textAlign: 'center', minWidth: 40 }}>
                                                                <div style={{ fontWeight: 700, color: posColor(p.position), fontSize: '0.85rem' }}>#{p.position}</div>
                                                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{p.date.substring(5)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                {!Object.keys(history).length && !loading && <EmptyState icon="📈" title="Enter site ID to load rank history" description="Shows keyword position trends, movers, and sparkline charts over time" />}
            </main>
        </div>
    );
}
