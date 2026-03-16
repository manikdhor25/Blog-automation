'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Issue { severity: 'critical' | 'warning' | 'info'; category: string; message: string; }
interface ScanResult {
    url: string; score: number;
    issues: Issue[];
    summary: { critical: number; warnings: number; info: number };
    seo_elements: {
        title: string | null; meta_description: string | null; canonical: string | null;
        h1_count: number; h2_count: number; images: { total: number; missing_alt: number };
        mobile_friendly: boolean; has_schema: boolean; has_og: boolean; has_twitter: boolean;
        has_analytics: boolean; scripts: number; stylesheets: number;
    };
}

export default function ThemeScannerPage() {
    const toast = useToast();
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ScanResult | null>(null);

    const handleScan = async () => {
        let scanUrl = url.trim();
        if (!scanUrl) { toast.warning('Enter a site URL'); return; }
        if (!scanUrl.startsWith('http')) scanUrl = 'https://' + scanUrl;
        setLoading(true);
        setResult(null);
        try {
            const res = await fetch('/api/theme-scanner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ site_url: scanUrl }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setResult(data);
            toast.success(`Scan complete — score: ${data.score}/100`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Scan failed');
        } finally {
            setLoading(false);
        }
    };

    const severityConfig = {
        critical: { color: 'var(--accent-danger)', icon: '🔴', badge: 'danger' as const },
        warning: { color: 'var(--accent-warning)', icon: '🟡', badge: 'warning' as const },
        info: { color: 'var(--accent-info, #60a5fa)', icon: '🔵', badge: 'info' as const },
    };

    const scoreColor = (s: number) => s >= 80 ? 'var(--accent-success)' : s >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">WordPress Theme SEO Scanner</h1>
                        <p className="page-description">Analyze any site for SEO issues, missing meta tags, and performance problems</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <input className="form-input" style={{ flex: 1 }} placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleScan()} />
                        <button className="btn btn-primary" onClick={handleScan} disabled={loading}>
                            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Scanning...</> : '🔍 Scan Site'}
                        </button>
                    </div>
                </div>

                {result && (
                    <>
                        {/* Score */}
                        <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
                            <div style={{
                                width: 110, height: 110, borderRadius: '50%', margin: '0 auto 10px',
                                border: `6px solid ${scoreColor(result.score)}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '2rem', fontWeight: 800,
                            }}>
                                {result.score}
                            </div>
                            <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{result.url}</div>
                            <Badge variant={result.score >= 80 ? 'success' : result.score >= 50 ? 'warning' : 'danger'}>
                                {result.score >= 80 ? 'GOOD' : result.score >= 50 ? 'NEEDS WORK' : 'POOR'}
                            </Badge>
                        </div>

                        <div className="grid-4" style={{ marginBottom: 16 }}>
                            <StatCard label="Critical" value={result.summary.critical} icon="🔴" />
                            <StatCard label="Warnings" value={result.summary.warnings} icon="🟡" />
                            <StatCard label="Info" value={result.summary.info} icon="🔵" />
                            <StatCard label="Images" value={result.seo_elements.images.total} icon="🖼️" />
                        </div>

                        {/* SEO Elements */}
                        <div className="card" style={{ marginBottom: 16 }}>
                            <h3 style={{ margin: '0 0 12px' }}>📋 SEO Elements</h3>
                            <div className="grid-2" style={{ gap: 12 }}>
                                <div className="text-sm"><strong>Title:</strong> {result.seo_elements.title || <span style={{ color: 'var(--accent-danger)' }}>Missing!</span>}</div>
                                <div className="text-sm"><strong>Canonical:</strong> {result.seo_elements.canonical || 'Not set'}</div>
                                <div className="text-sm"><strong>Meta Description:</strong> {result.seo_elements.meta_description?.slice(0, 80) || <span style={{ color: 'var(--accent-danger)' }}>Missing!</span>}</div>
                                <div className="text-sm"><strong>H1 Tags:</strong> {result.seo_elements.h1_count} | <strong>H2 Tags:</strong> {result.seo_elements.h2_count}</div>
                            </div>
                            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <Badge variant={result.seo_elements.mobile_friendly ? 'success' : 'danger'}>
                                    {result.seo_elements.mobile_friendly ? '✅' : '❌'} Mobile
                                </Badge>
                                <Badge variant={result.seo_elements.has_schema ? 'success' : 'warning'}>
                                    {result.seo_elements.has_schema ? '✅' : '❌'} Schema
                                </Badge>
                                <Badge variant={result.seo_elements.has_og ? 'success' : 'warning'}>
                                    {result.seo_elements.has_og ? '✅' : '❌'} OG Tags
                                </Badge>
                                <Badge variant={result.seo_elements.has_twitter ? 'success' : 'neutral'}>
                                    {result.seo_elements.has_twitter ? '✅' : '❌'} Twitter
                                </Badge>
                                <Badge variant={result.seo_elements.has_analytics ? 'success' : 'neutral'}>
                                    {result.seo_elements.has_analytics ? '✅' : '❌'} Analytics
                                </Badge>
                                <Badge variant="neutral">📜 {result.seo_elements.scripts} scripts</Badge>
                                <Badge variant="neutral">🎨 {result.seo_elements.stylesheets} CSS</Badge>
                            </div>
                        </div>

                        {/* Issues */}
                        <div className="card">
                            <h3 style={{ margin: '0 0 12px' }}>⚠️ Issues ({result.issues.length})</h3>
                            {result.issues.length === 0 ? (
                                <div className="text-sm" style={{ color: 'var(--accent-success)' }}>✅ No issues found!</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {result.issues.map((issue, i) => {
                                        const cfg = severityConfig[issue.severity];
                                        return (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                                borderRadius: 8, borderLeft: `3px solid ${cfg.color}`,
                                                background: 'rgba(0,0,0,0.15)',
                                            }}>
                                                <span>{cfg.icon}</span>
                                                <Badge variant={cfg.badge}>{issue.category}</Badge>
                                                <span className="text-sm" style={{ flex: 1 }}>{issue.message}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {!result && (
                    <div className="card">
                        <EmptyState icon="🔍" title="No Scan Results" description="Enter a URL above to scan any WordPress site for SEO issues." />
                    </div>
                )}
            </main>
        </div>
    );
}
