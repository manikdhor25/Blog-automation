'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface PrResult { headline: string; subheadline: string; body: string; word_count: number; distribution_sites: string[]; target_journalists: string[]; link_building_potential: string; estimated_pickups: number; outreach_email_template: string; }

export default function PressReleasePage() {
    const toast = useToast();
    const [headline, setHeadline] = useState('');
    const [company, setCompany] = useState('');
    const [website, setWebsite] = useState('');
    const [newsAngle, setNewsAngle] = useState('');
    const [niche, setNiche] = useState('');
    const [contactName, setContactName] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [result, setResult] = useState<PrResult | null>(null);
    const [releases, setReleases] = useState<Array<{ id: string; headline: string; company_name: string; status: string; word_count: number; created_at: string }>>([]);
    const [generating, setGenerating] = useState(false);
    const [tab, setTab] = useState<'create' | 'saved' | 'outreach'>('create');

    useEffect(() => { loadReleases(); }, []);

    const loadReleases = async () => {
        const res = await fetch('/api/press-release');
        const data = await res.json();
        setReleases(data.releases || []);
    };

    const generate = async () => {
        if (!headline || !company || !newsAngle) { toast.warning('Headline, company, and news angle required'); return; }
        setGenerating(true);
        const res = await fetch('/api/press-release', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate', headline, company_name: company, website: website || undefined, news_angle: newsAngle, niche: niche || undefined, contact_name: contactName || undefined, contact_email: contactEmail || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setGenerating(false); return; }
        setResult(data.result);
        toast.success('Press release generated!');
        loadReleases();
        setGenerating(false);
    };

    const POTENTIAL_COLOR: Record<string, string> = { high: '#16a34a', medium: '#d97706', low: '#6b7280' };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Press Release Generator</h1>
                        <p className="page-description">Write AP-style press releases for link building — journalist templates included</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['create', 'saved', 'outreach'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t === 'saved' ? `Saved (${releases.length})` : t}</button>
                        ))}
                    </div>
                </div>

                {tab === 'create' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Headline *</label>
                                <input className="form-input" value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Company Launches Revolutionary Tool for..." />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Company Name *</label>
                                <input className="form-input" value={company} onChange={e => setCompany(e.target.value)} placeholder="Your Company" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Website</label>
                                <input className="form-input" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yoursite.com" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Niche</label>
                                <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Contact Name</label>
                                <input className="form-input" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="John Smith" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Contact Email</label>
                                <input className="form-input" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="pr@yoursite.com" />
                            </div>
                            <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                <label className="form-label">News Angle * <span className="text-muted text-sm">(what makes this newsworthy)</span></label>
                                <textarea className="form-input" rows={2} value={newsAngle} onChange={e => setNewsAngle(e.target.value)} placeholder="We analyzed 10,000 blogs and found that 87% are leaving money on the table..." />
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={generate} disabled={generating}>{generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Writing...</> : '📰 Generate Press Release'}</button>
                    </div>
                )}

                {result && tab === 'create' && (
                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                            <div>
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>{result.headline}</div>
                                <div className="text-sm text-muted" style={{ fontStyle: 'italic' }}>{result.subheadline}</div>
                                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                                    <span className="text-sm text-muted">{result.word_count} words</span>
                                    <span style={{ fontWeight: 700, color: POTENTIAL_COLOR[result.link_building_potential] }}>{result.link_building_potential} link potential</span>
                                    <span className="text-sm text-muted">~{result.estimated_pickups} pickups</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(result.body); toast.success('Copied'); }}>📋 Copy</button>
                                <button className="btn btn-sm" onClick={() => setTab('outreach')}>📧 Outreach</button>
                            </div>
                        </div>
                        <textarea className="form-input" rows={14} value={result.body} readOnly style={{ fontFamily: 'inherit', fontSize: '0.9rem' }} />
                        <div style={{ marginTop: 12 }}>
                            <div className="form-label">Distribution Sites</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {result.distribution_sites.map((s, i) => <Badge key={i} variant="info">{s}</Badge>)}
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'outreach' && result && (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>📧 Journalist Outreach Template</h3>
                        <textarea className="form-input" rows={12} value={result.outreach_email_template} readOnly style={{ fontFamily: 'inherit' }} />
                        <div style={{ marginTop: 12 }}>
                            <div className="form-label">Target Journalists</div>
                            {result.target_journalists.map((j, i) => <div key={i} className="text-sm" style={{ marginBottom: 3 }}>• {j}</div>)}
                        </div>
                    </div>
                )}

                {tab === 'saved' && (
                    releases.length === 0 ? <EmptyState icon="📰" title="No press releases yet" description="Generate a press release for link building via PR distribution" /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {releases.map((r, i) => (
                                <div key={i} style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{r.headline}</div>
                                        <div className="text-sm text-muted">{r.company_name} · {r.word_count}w · {new Date(r.created_at).toLocaleDateString()}</div>
                                    </div>
                                    <Badge variant={r.status === 'published' ? 'success' : 'neutral'}>{r.status}</Badge>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </main>
        </div>
    );
}
