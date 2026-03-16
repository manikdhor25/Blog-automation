'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState, StatCard } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site { id: string; name: string; niche: string; }

interface Cluster {
    pillarTopic: string;
    description: string;
    pillarArticle: { title: string; keyword: string; outline: string[] };
    supportingArticles: { title: string; keyword: string; type: string }[];
    estimatedAuthority: number;
}

export default function ClustersPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [niche, setNiche] = useState('');
    const [clusters, setClusters] = useState<Cluster[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedCluster, setExpandedCluster] = useState<number | null>(null);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []));
    }, []);

    useEffect(() => {
        const site = sites.find(s => s.id === selectedSite);
        if (site?.niche && !niche) setNiche(site.niche);
    }, [selectedSite, sites, niche]);

    const handleAnalyze = async () => {
        const targetNiche = niche || sites.find(s => s.id === selectedSite)?.niche || '';
        if (!targetNiche) { toast.warning('Please enter a niche'); return; }

        setLoading(true);
        try {
            // Use the keyword API to generate cluster-oriented suggestions
            const res = await fetch('/api/keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'ai_suggest',
                    niche: `Generate comprehensive topic cluster strategy for: ${targetNiche}. Create diverse clusters including beginner guides, advanced topics, comparisons, tutorials, and FAQs.`,
                }),
            });
            const data = await res.json();
            const suggestions = data.suggestions || [];

            // Group suggestions into multiple clusters
            const clusterSize = Math.max(4, Math.ceil(suggestions.length / 3));
            const generatedClusters: Cluster[] = [];

            const clusterThemes = [
                { prefix: 'Comprehensive', type: 'pillar', suffix: 'Guide' },
                { prefix: 'Advanced', type: 'strategy', suffix: 'Strategies' },
                { prefix: 'Practical', type: 'tutorial', suffix: 'Tutorials' },
            ];

            for (let c = 0; c < Math.min(3, Math.ceil(suggestions.length / clusterSize)); c++) {
                const chunk = suggestions.slice(c * clusterSize, (c + 1) * clusterSize);
                if (chunk.length === 0) break;

                const theme = clusterThemes[c] || clusterThemes[0];
                generatedClusters.push({
                    pillarTopic: `${theme.prefix} ${targetNiche} ${theme.suffix}`,
                    description: `${theme.prefix} content cluster covering ${chunk.length + 1} topics for building topical authority in ${targetNiche}`,
                    pillarArticle: {
                        title: `The Ultimate ${targetNiche} ${theme.suffix} (${new Date().getFullYear()})`,
                        keyword: targetNiche,
                        outline: ['Introduction & Overview', 'Core Concepts', 'Step-by-Step Guide', 'Tools & Resources', 'Common Mistakes', 'Expert Tips', 'FAQ'],
                    },
                    supportingArticles: chunk.map((s: { keyword: string; intent?: string }) => ({
                        title: s.keyword.charAt(0).toUpperCase() + s.keyword.slice(1),
                        keyword: s.keyword,
                        type: s.intent || 'guide',
                    })),
                    estimatedAuthority: Math.min(0.95, 0.2 + chunk.length * 0.08),
                });
            }

            setClusters(generatedClusters.length > 0 ? generatedClusters : [{
                pillarTopic: `${targetNiche} Complete Guide`,
                description: `Comprehensive pillar content for ${targetNiche}`,
                pillarArticle: { title: `The Ultimate ${targetNiche} Guide`, keyword: targetNiche, outline: ['Introduction', 'Key Concepts', 'Best Practices', 'FAQ'] },
                supportingArticles: [],
                estimatedAuthority: 0.2,
            }]);
        } catch {
            toast.error('Failed to analyze niche');
        } finally {
            setLoading(false);
        }
    };

    const totalArticles = clusters.reduce((sum, c) => sum + 1 + c.supportingArticles.length, 0);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Topic Clusters</h1>
                        <p className="page-description">Build topical authority with AI-generated content clusters</p>
                    </div>
                </div>

                {/* Input */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche / Topic Area</label>
                            <input className="form-input" placeholder="e.g., home automation, personal finance" value={niche} onChange={e => setNiche(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Site (auto-fills niche)</label>
                            <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                <option value="">Select...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={handleAnalyze} disabled={loading} style={{ width: '100%' }}>
                                {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Analyzing...</> : '🏗️ Build Clusters'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Stats */}
                {clusters.length > 0 && (
                    <div className="stat-grid" style={{ marginBottom: 24 }}>
                        <StatCard label="Clusters" value={clusters.length} icon="🏗️" />
                        <StatCard label="Total Articles" value={totalArticles} icon="📝" />
                        <StatCard label="Avg Authority" value={`${Math.round(clusters.reduce((s, c) => s + c.estimatedAuthority, 0) / clusters.length * 100)}%`} icon="📈" />
                    </div>
                )}

                {/* Clusters */}
                {clusters.length === 0 ? (
                    <div className="card">
                        <EmptyState icon="🏗️" title="No Topic Clusters" description="Enter a niche to auto-generate content clusters with pillar and supporting articles for building topical authority." />
                    </div>
                ) : (
                    clusters.map((cluster, ci) => (
                        <div key={ci} className="card animate-in" style={{ marginBottom: 24 }}>
                            <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setExpandedCluster(expandedCluster === ci ? null : ci)}>
                                <div>
                                    <h2 className="card-title">🏗️ {cluster.pillarTopic}</h2>
                                    <p className="card-subtitle">{cluster.description}</p>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <Badge variant="success">{1 + cluster.supportingArticles.length} articles</Badge>
                                    <Badge variant="info">Authority: {Math.round(cluster.estimatedAuthority * 100)}%</Badge>
                                    <span style={{ fontSize: '1.2rem', transition: 'transform 0.2s', transform: expandedCluster === ci ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
                                </div>
                            </div>

                            {(expandedCluster === ci || clusters.length === 1) && (
                                <div className="animate-in">
                                    {/* Pillar Article */}
                                    <div style={{ background: 'var(--gradient-glow)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 }}>
                                        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                                            <Badge variant="info">PILLAR</Badge>
                                            <span style={{ fontWeight: 700 }}>{cluster.pillarArticle.title}</span>
                                        </div>
                                        <div className="text-sm text-muted">Keyword: {cluster.pillarArticle.keyword}</div>
                                        <div className="flex gap-2" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                                            {cluster.pillarArticle.outline.map((h, i) => <Badge key={i} variant="neutral">{h}</Badge>)}
                                        </div>
                                        <a href={`/create?keyword=${encodeURIComponent(cluster.pillarArticle.keyword)}`} className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
                                            📝 Write Pillar Article
                                        </a>
                                    </div>

                                    {/* Supporting Articles */}
                                    {cluster.supportingArticles.length > 0 && (
                                        <>
                                            <div className="text-sm text-muted" style={{ marginBottom: 8 }}>Supporting Articles ({cluster.supportingArticles.length})</div>
                                            <div className="grid-2">
                                                {cluster.supportingArticles.map((article, ai) => (
                                                    <div key={ai} style={{ background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', padding: 12, border: '1px solid var(--border-subtle)' }}>
                                                        <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: 4 }}>{article.title}</div>
                                                        <div className="flex items-center justify-between">
                                                            <Badge variant="neutral">{article.type}</Badge>
                                                            <a href={`/create?keyword=${encodeURIComponent(article.keyword)}`} className="btn btn-secondary btn-sm">Write →</a>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </main>
        </div>
    );
}
