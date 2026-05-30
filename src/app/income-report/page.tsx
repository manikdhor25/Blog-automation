'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';

interface ReportData { month: string; total_revenue: number; affiliate_revenue: number; click_revenue: number; prev_month_revenue: number; revenue_change_pct: string | null; total_clicks: number; total_conversions: number; conversion_rate: string; by_program: Record<string, number>; new_posts: number; top_program: string; goals: Array<{ name: string; target: number; current: number; progress_pct: string }>; }

export default function IncomeReportPage() {
    const toast = useToast();
    const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
    const [siteId, setSiteId] = useState('');
    const [report, setReport] = useState<ReportData | null>(null);
    const [html, setHtml] = useState('');
    const [generating, setGenerating] = useState(false);

    const generate = async () => {
        setGenerating(true);
        const res = await fetch('/api/income-report', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate', month, site_id: siteId || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setGenerating(false); return; }
        setReport(data.report);
        setHtml(data.html);
        toast.success('Report generated');
        setGenerating(false);
    };

    const downloadHtml = () => {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `income-report-${month}.html`; a.click();
        URL.revokeObjectURL(url);
        toast.success('Report downloaded');
    };

    const previewReport = () => {
        const w = window.open(); w?.document.write(html);
    };

    const topPrograms = report ? Object.entries(report.by_program).sort((a, b) => b[1] - a[1]) : [];
    const maxProgramRev = topPrograms[0]?.[1] || 1;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Monthly Income Report</h1>
                        <p className="page-description">Generate professional income reports — revenue breakdown, top programs, goals, trends</p>
                    </div>
                    {report && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-sm" onClick={previewReport}>👁 Preview</button>
                            <button className="btn btn-sm btn-primary" onClick={downloadHtml}>📥 Download HTML</button>
                        </div>
                    )}
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Month</label>
                            <input className="form-input" type="month" value={month} onChange={e => setMonth(e.target.value)} />
                        </div>
                        <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
                            <label className="form-label">Site ID <span className="text-muted text-sm">(optional — all sites if blank)</span></label>
                            <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="UUID from Sites" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={generate} disabled={generating}>{generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating...</> : '📊 Generate Report'}</button>
                        </div>
                    </div>
                </div>

                {report && (
                    <>
                        {/* Header */}
                        <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '28px', background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', color: '#fff' }}>
                            <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: 4 }}>Income Report</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>
                                {new Date(report.month + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                            </div>
                            <div style={{ fontSize: '3rem', fontWeight: 900 }}>${report.total_revenue.toFixed(2)}</div>
                            {report.revenue_change_pct && (
                                <div style={{ marginTop: 4, opacity: 0.9 }}>
                                    {parseFloat(report.revenue_change_pct) >= 0 ? '▲' : '▼'} {Math.abs(parseFloat(report.revenue_change_pct))}% vs last month
                                </div>
                            )}
                        </div>

                        <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                            {[
                                { label: 'Affiliate Rev', value: `$${report.affiliate_revenue.toFixed(2)}`, icon: '🤝' },
                                { label: 'Click Rev', value: `$${report.click_revenue.toFixed(2)}`, icon: '👆' },
                                { label: 'Total Clicks', value: report.total_clicks.toLocaleString(), icon: '🔗' },
                                { label: 'New Posts', value: report.new_posts, icon: '📝' },
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                    <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{s.value}</div>
                                    <div className="text-sm text-muted">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 12 }}>Revenue by Program</h3>
                                {topPrograms.length === 0 ? (
                                    <div className="text-sm text-muted">No affiliate earnings logged for this month</div>
                                ) : (
                                    topPrograms.map(([prog, rev], i) => (
                                        <div key={i} style={{ marginBottom: 10 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontWeight: 600 }}>{prog}</span>
                                                <span style={{ fontWeight: 700, color: '#16a34a' }}>${rev.toFixed(2)}</span>
                                            </div>
                                            <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 3 }}>
                                                <div style={{ height: '100%', background: `hsl(${210 + i * 25}, 70%, 55%)`, width: `${(rev / maxProgramRev) * 100}%`, borderRadius: 3 }} />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {report.goals.length > 0 && (
                                <div className="card">
                                    <h3 className="card-title" style={{ marginBottom: 12 }}>Goal Progress</h3>
                                    {report.goals.map((g, i) => (
                                        <div key={i} style={{ marginBottom: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontWeight: 600 }}>{g.name}</span>
                                                <span className="text-sm text-muted">${g.current.toFixed(0)} / ${g.target.toFixed(0)}</span>
                                            </div>
                                            <div style={{ height: 8, background: 'var(--border-subtle)', borderRadius: 4 }}>
                                                <div style={{ height: '100%', background: parseInt(g.progress_pct) >= 100 ? '#16a34a' : 'var(--accent-primary)', width: `${Math.min(parseInt(g.progress_pct), 100)}%`, borderRadius: 4, transition: 'width 0.5s' }} />
                                            </div>
                                            <div className="text-sm text-muted" style={{ marginTop: 2 }}>{g.progress_pct}% of goal</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button className="btn btn-primary" onClick={previewReport}>👁 Preview Full Report</button>
                            <button className="btn btn-sm" onClick={downloadHtml}>📥 Download HTML</button>
                        </div>
                    </>
                )}

                {!report && !generating && (
                    <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 12 }}>📊</div>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Select a month and generate your income report</div>
                        <div className="text-sm text-muted">Pulls data from affiliate earnings, click tracker, goals, and new posts</div>
                    </div>
                )}
            </main>
        </div>
    );
}
