'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site { id: string; name: string; url: string; }
interface ReportMeta { id: string; site_id: string; report_type: string; client_name: string; date_from: string; date_to: string; created_at: string; }

interface ReportData {
    generated_at: string;
    period: { from: string; to: string };
    site: { name: string; url: string; niche: string };
    branding: { agency_name?: string; client_name?: string; agency_color?: string };
    executive_summary: string;
    metrics: {
        content: { total_posts: number; published: number; avg_seo_score: number; avg_overall_score: number; top_posts: Array<{ title: string; seo_score: number }> };
        keywords: { total: number; ranking: number; avg_volume: number };
        backlinks: { total: number; avg_da: number; dofollow: number };
        affiliate: { total_clicks: number; total_conversions: number; conversion_rate: string; active_links: number };
    };
}

export default function ReportsPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [reports, setReports] = useState<ReportMeta[]>([]);
    const [viewReport, setViewReport] = useState<ReportData | null>(null);
    const [generating, setGenerating] = useState(false);
    const [activeTab, setActiveTab] = useState<'generate' | 'saved'>('generate');
    const [config, setConfig] = useState({ agency_name: '', client_name: '', agency_color: '#2563eb', include_rankmaster_branding: false });
    const [form, setForm] = useState({ site_id: '', report_type: 'full_report', date_from: '', date_to: '' });
    const [generatedReport, setGeneratedReport] = useState<ReportData | null>(null);

    useEffect(() => { fetchSites(); fetchReports(); loadConfig(); }, []);

    const fetchSites = async () => {
        const res = await fetch('/api/sites');
        const data = await res.json();
        setSites(data.sites || []);
    };

    const fetchReports = async () => {
        const res = await fetch('/api/reports');
        const data = await res.json();
        setReports(data.reports || []);
    };

    const loadConfig = async () => {
        const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_config' }) });
        const data = await res.json();
        if (data.config?.agency_name) setConfig(c => ({ ...c, ...data.config }));
    };

    const saveConfig = async () => {
        await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save_config', branding: config }) });
        toast.success('Branding saved');
    };

    const generate = async () => {
        if (!form.site_id) { toast.warning('Select a site'); return; }
        setGenerating(true);
        try {
            const res = await fetch('/api/reports', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'generate', ...form, branding: config }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'Failed'); return; }
            setGeneratedReport(data.report);
            toast.success('Report generated');
            fetchReports();
        } catch { toast.error('Generation failed'); }
        finally { setGenerating(false); }
    };

    const printReport = () => window.print();

    const display = viewReport || generatedReport;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Client Reports</h1>
                        <p className="page-description">White-label performance reports for clients — SEO, content, affiliate, backlinks</p>
                    </div>
                    {display && <button className="btn btn-primary" onClick={printReport}>🖨️ Print / PDF</button>}
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'generate' ? 'active' : ''}`} onClick={() => setActiveTab('generate')}>Generate Report</button>
                    <button className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>Saved Reports ({reports.length})</button>
                </div>

                {activeTab === 'saved' ? (
                    <div className="card">
                        {reports.length === 0 ? (
                            <EmptyState icon="📋" title="No Reports" description="Generate your first client report to see it here" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {reports.map(r => (
                                    <div key={r.id} className="card" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 700 }}>{r.client_name}</div>
                                            <div className="text-sm text-muted">
                                                {r.report_type.replace('_', ' ')} · {new Date(r.date_from).toLocaleDateString()} – {new Date(r.date_to).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-sm" onClick={async () => {
                                                const res = await fetch(`/api/reports?id=${r.id}`);
                                                const data = await res.json();
                                                setViewReport(data.report);
                                                setActiveTab('generate');
                                            }}>View</button>
                                            <button className="btn btn-sm btn-danger" onClick={async () => {
                                                await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: r.id }) });
                                                fetchReports();
                                            }}>Del</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Config */}
                        <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 12 }}>White-Label Branding</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {[
                                        { label: 'Agency/Your Name', field: 'agency_name', placeholder: 'Your Agency' },
                                        { label: 'Client Name', field: 'client_name', placeholder: 'Client Company' },
                                    ].map(f => (
                                        <div key={f.field} className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">{f.label}</label>
                                            <input className="form-input" placeholder={f.placeholder}
                                                value={(config as unknown as Record<string, string>)[f.field]}
                                                onChange={e => setConfig(c => ({ ...c, [f.field]: e.target.value }))} />
                                        </div>
                                    ))}
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Brand Color</label>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <input type="color" value={config.agency_color} onChange={e => setConfig(c => ({ ...c, agency_color: e.target.value }))} style={{ width: 48, height: 38, padding: 4, borderRadius: 4 }} />
                                            <input className="form-input" value={config.agency_color} onChange={e => setConfig(c => ({ ...c, agency_color: e.target.value }))} />
                                        </div>
                                    </div>
                                    <button className="btn btn-sm btn-primary" onClick={saveConfig}>Save Branding</button>
                                </div>
                            </div>

                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 12 }}>Generate New Report</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Site *</label>
                                        <select className="form-select" value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}>
                                            <option value="">Select site...</option>
                                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Report Type</label>
                                        <select className="form-select" value={form.report_type} onChange={e => setForm(f => ({ ...f, report_type: e.target.value }))}>
                                            <option value="full_report">Full Report</option>
                                            <option value="seo_performance">SEO Performance</option>
                                            <option value="affiliate_revenue">Affiliate Revenue</option>
                                            <option value="content_audit">Content Audit</option>
                                        </select>
                                    </div>
                                    <div className="grid-2" style={{ gap: 8 }}>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">From</label>
                                            <input type="date" className="form-input" value={form.date_from} onChange={e => setForm(f => ({ ...f, date_from: e.target.value }))} />
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">To</label>
                                            <input type="date" className="form-input" value={form.date_to} onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))} />
                                        </div>
                                    </div>
                                    <button className="btn btn-primary" onClick={generate} disabled={generating}>
                                        {generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating...</> : 'Generate Report'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Report Preview */}
                        {display && (
                            <div className="card animate-in" id="report-content">
                                {/* Header */}
                                <div style={{ borderBottom: `3px solid ${config.agency_color}`, paddingBottom: 20, marginBottom: 24 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            {config.agency_name && <div style={{ fontWeight: 700, fontSize: '1.2rem', color: config.agency_color }}>{config.agency_name}</div>}
                                            <div style={{ fontWeight: 700, fontSize: '1.5rem', marginTop: 4 }}>Performance Report</div>
                                            {display.branding?.client_name && <div className="text-muted">Prepared for: {display.branding.client_name}</div>}
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 600 }}>{display.site?.name}</div>
                                            <div className="text-sm text-muted">{display.site?.url}</div>
                                            <div className="text-sm text-muted">{new Date(display.period.from).toLocaleDateString()} — {new Date(display.period.to).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Executive Summary */}
                                <div style={{ background: `${config.agency_color}15`, borderLeft: `4px solid ${config.agency_color}`, padding: '14px 18px', borderRadius: '0 8px 8px 0', marginBottom: 24 }}>
                                    <div style={{ fontWeight: 700, marginBottom: 6, color: config.agency_color }}>Executive Summary</div>
                                    <p>{display.executive_summary}</p>
                                </div>

                                {/* Metrics Grid */}
                                <div className="grid-4" style={{ gap: 12, marginBottom: 24 }}>
                                    {[
                                        { label: 'Published Posts', value: display.metrics.content.published, icon: '📝' },
                                        { label: 'Avg SEO Score', value: `${display.metrics.content.avg_seo_score}/100`, icon: '📊' },
                                        { label: 'Keywords Ranking', value: display.metrics.keywords.ranking, icon: '🔑' },
                                        { label: 'Total Backlinks', value: display.metrics.backlinks.total, icon: '🔗' },
                                        { label: 'Affiliate Clicks', value: display.metrics.affiliate.total_clicks.toLocaleString(), icon: '👆' },
                                        { label: 'Conversions', value: display.metrics.affiliate.total_conversions, icon: '✅' },
                                        { label: 'Conv. Rate', value: `${display.metrics.affiliate.conversion_rate}%`, icon: '📈' },
                                        { label: 'Avg Link DA', value: display.metrics.backlinks.avg_da, icon: '💪' },
                                    ].map((s, i) => (
                                        <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: config.agency_color }}>{s.value}</div>
                                            <div className="text-sm text-muted">{s.label}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Top Posts */}
                                <div>
                                    <h4 style={{ fontWeight: 700, marginBottom: 12 }}>Top Content</h4>
                                    {display.metrics.content.top_posts?.map((p, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                                            <span className="text-sm">{p.title.substring(0, 70)}</span>
                                            <Badge variant={p.seo_score >= 80 ? 'success' : p.seo_score >= 60 ? 'warning' : 'danger'}>{p.seo_score}/100</Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
