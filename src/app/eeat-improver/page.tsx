'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Check { signal: string; category: string; present: boolean; impact: string; fix: string; }
interface AuditResult { score: number; passing: number; total: number; grade: string; checks: Check[]; critical_fixes: string[]; high_priority_fixes: string[]; by_category: Record<string, { passing: number; total: number }>; }

const CAT_ICONS: Record<string, string> = { experience: '🔬', expertise: '🎓', authoritativeness: '🏛️', trustworthiness: '🛡️' };
const IMPACT_COLORS: Record<string, string> = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#6b7280' };

export default function EEATPage() {
    const toast = useToast();
    const [posts, setPosts] = useState<Array<{ id: string; title: string }>>([]);
    const [postId, setPostId] = useState('');
    const [result, setResult] = useState<AuditResult | null>(null);
    const [bio, setBio] = useState<Record<string, string> | null>(null);
    const [auditing, setAuditing] = useState(false);
    const [generatingBio, setGeneratingBio] = useState(false);
    const [authorName, setAuthorName] = useState('');
    const [authorCreds, setAuthorCreds] = useState('');
    const [niche, setNiche] = useState('');
    const [activeTab, setActiveTab] = useState<'audit' | 'bio'>('audit');

    useEffect(() => { fetch('/api/posts?status=published&limit=50').then(r => r.json()).then(d => setPosts(d.posts || [])).catch(() => {}); }, []);

    const audit = async () => {
        if (!postId) { toast.warning('Select a post'); return; }
        setAuditing(true); setResult(null);
        const res = await fetch('/api/eeat-improver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'audit', post_id: postId }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setAuditing(false); return; }
        setResult(data);
        toast.success(`E-E-A-T Score: ${data.score}/100 (Grade ${data.grade})`);
        setAuditing(false);
    };

    const generateBio = async () => {
        if (!authorName) { toast.warning('Author name required'); return; }
        setGeneratingBio(true);
        const res = await fetch('/api/eeat-improver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_bio', author_name: authorName, author_credentials: authorCreds, niche }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setGeneratingBio(false); return; }
        setBio(data.bio);
        toast.success(`Bio generated via ${data.provider}`);
        setGeneratingBio(false);
    };

    const gradeColor = (g: string) => ({ A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626' }[g] || '#6b7280');

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">E-E-A-T Improver</h1>
                        <p className="page-description">Actionable checklist to improve Experience, Expertise, Authoritativeness, Trustworthiness signals</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>Post Audit</button>
                    <button className={`tab ${activeTab === 'bio' ? 'active' : ''}`} onClick={() => setActiveTab('bio')}>Author Bio Generator</button>
                </div>

                {activeTab === 'bio' ? (
                    <div className="grid-2" style={{ gap: 16 }}>
                        <div className="card">
                            <h3 className="card-title" style={{ marginBottom: 16 }}>Generate E-E-A-T Author Bio</h3>
                            <div className="form-group"><label className="form-label">Author Name *</label><input className="form-input" value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="Dr. Jane Smith" /></div>
                            <div className="form-group"><label className="form-label">Credentials / Experience</label><input className="form-input" value={authorCreds} onChange={e => setAuthorCreds(e.target.value)} placeholder="PhD Nutrition, 10 years dietitian practice" /></div>
                            <div className="form-group"><label className="form-label">Niche</label><input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="health & fitness" /></div>
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={generateBio} disabled={generatingBio}>{generatingBio ? 'Generating...' : 'Generate Author Bio'}</button>
                        </div>
                        <div>
                            {bio ? (
                                <div className="card animate-in">
                                    <div style={{ marginBottom: 14 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Short Bio (for post byline)</div>
                                        <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: 6 }}>{bio.short_bio}</div>
                                        <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => { navigator.clipboard.writeText(bio.short_bio); toast.success('Copied'); }}>Copy</button>
                                    </div>
                                    <div style={{ marginBottom: 14 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Long Bio (for author page)</div>
                                        <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: 6 }}>{bio.long_bio}</div>
                                        <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => { navigator.clipboard.writeText(bio.long_bio); toast.success('Copied'); }}>Copy</button>
                                    </div>
                                    {bio.linkedin_headline && <div><div style={{ fontWeight: 700, marginBottom: 4 }}>LinkedIn Headline</div><div className="text-sm" style={{ background: 'var(--bg-secondary)', padding: '8px 10px', borderRadius: 4 }}>{bio.linkedin_headline}</div></div>}
                                </div>
                            ) : <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: '3rem', marginBottom: 16 }}>🎓</div><div style={{ fontWeight: 600 }}>Author bio appears here</div></div>}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                                <div className="form-group" style={{ margin: 0, flex: 1 }}>
                                    <label className="form-label">Select Post to Audit</label>
                                    <select className="form-select" value={postId} onChange={e => setPostId(e.target.value)}>
                                        <option value="">Select post...</option>
                                        {posts.map(p => <option key={p.id} value={p.id}>{p.title.substring(0, 70)}</option>)}
                                    </select>
                                </div>
                                <button className="btn btn-primary" onClick={audit} disabled={!postId || auditing}>{auditing ? 'Auditing...' : 'Run E-E-A-T Audit'}</button>
                            </div>
                        </div>

                        {result && (
                            <>
                                <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '24px' }}>
                                    <div style={{ fontSize: '4rem', fontWeight: 900, color: gradeColor(result.grade) }}>{result.grade}</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: gradeColor(result.grade) }}>{result.score}/100</div>
                                    <div className="text-sm text-muted" style={{ marginTop: 4 }}>{result.passing}/{result.total} E-E-A-T signals present</div>
                                </div>

                                <div className="grid-4" style={{ gap: 10, marginBottom: 16 }}>
                                    {Object.entries(result.by_category).map(([cat, d]) => (
                                        <div key={cat} className="card" style={{ padding: 12, textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>{CAT_ICONS[cat]}</div>
                                            <div style={{ fontWeight: 700 }}>{d.passing}/{d.total}</div>
                                            <div className="text-sm text-muted" style={{ textTransform: 'capitalize' }}>{cat}</div>
                                            <div style={{ height: 4, background: 'var(--bg-secondary)', borderRadius: 2, marginTop: 6 }}>
                                                <div style={{ height: '100%', width: `${(d.passing / d.total) * 100}%`, background: d.passing / d.total >= 0.75 ? '#16a34a' : d.passing / d.total >= 0.5 ? '#d97706' : '#dc2626', borderRadius: 2 }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {result.critical_fixes.length > 0 && (
                                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                                        <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>🚨 Critical Fixes Required</div>
                                        {result.critical_fixes.map((f, i) => <div key={i} className="text-sm" style={{ color: '#7f1d1d', marginBottom: 4 }}>→ {f}</div>)}
                                    </div>
                                )}

                                <div className="card">
                                    <h3 className="card-title" style={{ marginBottom: 12 }}>All Checks</h3>
                                    {result.checks.map((c, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                                            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{c.present ? '✅' : '❌'}</span>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: c.present ? 400 : 600 }}>{c.signal}</div>
                                                {!c.present && <div className="text-sm" style={{ color: '#2563eb', marginTop: 2 }}>Fix: {c.fix}</div>}
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: IMPACT_COLORS[c.impact], textTransform: 'uppercase' }}>{c.impact}</span>
                                                <Badge variant="neutral">{c.category.substring(0, 3)}</Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                        {!result && !auditing && <div className="card"><EmptyState icon="⭐" title="Select Post & Audit" description="Choose a published post to run a full E-E-A-T signal audit" /></div>}
                    </>
                )}
            </main>
        </div>
    );
}
