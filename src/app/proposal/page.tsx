'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Proposal { executive_summary: string; audit_findings: string[]; proposed_services: Array<{ service: string; description: string; monthly_deliverables: string[]; expected_impact: string }>; pricing_tiers: Array<{ tier: string; price_monthly: number; includes: string[]; best_for: string }>; '90_day_roadmap': Array<{ week: string; focus: string; deliverables: string[] }>; expected_results: Record<string, string>; next_steps: string[]; }
interface SavedProposal { id: string; client_name: string; client_website: string; monthly_budget: number; created_at: string; }

export default function ProposalPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [saved, setSaved] = useState<SavedProposal[]>([]);
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<Proposal | null>(null);
    const [activeTab, setActiveTab] = useState<'generate' | 'saved'>('generate');
    const [form, setForm] = useState({ client_name: '', client_website: '', client_niche: '', site_id: '', monthly_budget: '', agency_name: '', your_name: '', service_types: ['content', 'technical_seo', 'link_building'] });

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []));
        if (activeTab === 'saved') fetch('/api/proposal').then(r => r.json()).then(d => setSaved(d.proposals || []));
    }, [activeTab]);

    const generate = async () => {
        if (!form.client_name) { toast.warning('Client name required'); return; }
        setGenerating(true); setResult(null);
        const res = await fetch('/api/proposal', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate', ...form, monthly_budget: parseFloat(form.monthly_budget) || 0 }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setGenerating(false); return; }
        setResult(data.proposal);
        toast.success(`Proposal generated via ${data.provider}`);
        setGenerating(false);
    };

    const copyProposal = () => {
        if (!result) return;
        const text = [
            `# SEO Proposal for ${form.client_name}`,
            `Prepared by: ${form.agency_name || 'Your Agency'}`,
            `\n## Executive Summary\n${result.executive_summary}`,
            `\n## Audit Findings\n${result.audit_findings.map(f => `- ${f}`).join('\n')}`,
            `\n## Pricing\n${result.pricing_tiers.map(t => `### ${t.tier} — $${t.price_monthly}/mo\n${t.includes.map(i => `- ${i}`).join('\n')}`).join('\n\n')}`,
            `\n## Next Steps\n${result.next_steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
        ].join('\n');
        navigator.clipboard.writeText(text);
        toast.success('Proposal copied as Markdown');
    };

    const toggleService = (s: string) => setForm(f => ({ ...f, service_types: f.service_types.includes(s) ? f.service_types.filter(x => x !== s) : [...f.service_types, s] }));

    const SERVICE_OPTIONS = ['content', 'technical_seo', 'link_building', 'local_seo', 'ecommerce_seo', 'full_service'];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">SEO Proposal Generator</h1>
                        <p className="page-description">AI-generate client proposals from audit data — pricing tiers, 90-day roadmap, expected results</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'generate' ? 'active' : ''}`} onClick={() => setActiveTab('generate')}>Generate</button>
                    <button className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>Saved ({saved.length})</button>
                </div>

                {activeTab === 'saved' ? (
                    <div className="card">
                        {saved.length === 0 ? <EmptyState icon="📋" title="No Proposals" description="Generate your first SEO proposal" />
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {saved.map(p => (
                                    <div key={p.id} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div><div style={{ fontWeight: 700 }}>{p.client_name}</div><div className="text-sm text-muted">{p.client_website} · {new Date(p.created_at).toLocaleDateString()}</div></div>
                                        <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: p.id }) }); setSaved(prev => prev.filter(x => x.id !== p.id)); }}>Del</button>
                                    </div>
                                ))}
                            </div>
                        }
                    </div>
                ) : (
                    <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                        <div className="card">
                            <h3 className="card-title" style={{ marginBottom: 16 }}>Proposal Settings</h3>
                            <div className="grid-2" style={{ gap: 12 }}>
                                {[['Client Name *', 'client_name', 'Acme Corp'], ['Client Website', 'client_website', 'acmecorp.com'], ['Client Niche', 'client_niche', 'home improvement'], ['Monthly Budget ($)', 'monthly_budget', '3000'], ['Your Agency Name', 'agency_name', 'SEO Pros Agency'], ['Your Name', 'your_name', 'John Smith']].map(([label, key, ph]) => (
                                    <div key={key} className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">{label}</label>
                                        <input className="form-input" placeholder={ph} value={(form as unknown as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                                    </div>
                                ))}
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Pull Audit Data From Site</label>
                                    <select className="form-select" value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}>
                                        <option value="">Manual entry</option>
                                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-group" style={{ marginTop: 12 }}>
                                <label className="form-label">Services to Propose</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {SERVICE_OPTIONS.map(s => <button key={s} className={`btn btn-sm ${form.service_types.includes(s) ? 'btn-primary' : ''}`} onClick={() => toggleService(s)}>{s.replace('_', ' ')}</button>)}
                                </div>
                            </div>
                            <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={generate} disabled={generating}>
                                {generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating proposal...</> : '📋 Generate SEO Proposal'}
                            </button>
                        </div>

                        <div>
                            {generating && <div className="card" style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }} /><div style={{ fontWeight: 600 }}>Writing proposal...</div></div>}
                            {result && !generating && (
                                <div className="card animate-in">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                        <h3 className="card-title" style={{ margin: 0 }}>SEO Proposal — {form.client_name}</h3>
                                        <button className="btn btn-sm" onClick={copyProposal}>Copy Markdown</button>
                                    </div>

                                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Executive Summary</div>
                                        <p style={{ fontSize: '0.9rem' }}>{result.executive_summary}</p>
                                    </div>

                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Audit Findings</div>
                                        {result.audit_findings?.map((f, i) => <div key={i} className="text-sm" style={{ marginBottom: 4 }}>⚠️ {f}</div>)}
                                    </div>

                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Pricing Tiers</div>
                                        <div className="grid-3" style={{ gap: 8 }}>
                                            {result.pricing_tiers?.map((t, i) => (
                                                <div key={i} style={{ padding: '12px', background: i === 1 ? '#f0fdf4' : 'var(--bg-secondary)', borderRadius: 8, border: i === 1 ? '2px solid #86efac' : undefined }}>
                                                    {i === 1 && <div style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700, marginBottom: 4 }}>RECOMMENDED</div>}
                                                    <div style={{ fontWeight: 700 }}>{t.tier}</div>
                                                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#16a34a', margin: '4px 0' }}>${t.price_monthly}/mo</div>
                                                    <div className="text-sm text-muted">{t.best_for}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Expected Results</div>
                                        {Object.entries(result.expected_results || {}).map(([period, outcome]) => (
                                            <div key={period} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                                                <span className="text-sm" style={{ fontWeight: 600, minWidth: 80 }}>{period}:</span>
                                                <span className="text-sm text-muted">{outcome}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div>
                                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Next Steps</div>
                                        {result.next_steps?.map((s, i) => <div key={i} className="text-sm" style={{ marginBottom: 4 }}>{i + 1}. {s}</div>)}
                                    </div>
                                </div>
                            )}
                            {!result && !generating && <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: '3rem', marginBottom: 16 }}>📋</div><div style={{ fontWeight: 600 }}>Proposal appears here</div></div>}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
