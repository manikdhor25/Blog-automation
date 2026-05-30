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

// Keyword Cluster types (from /keyword-cluster)
interface KwCluster { cluster_name: string; intent: string; content_type: string; keywords: string[]; primary_keyword: string; suggested_title: string; monthly_volume_estimate: number; priority: string; }
interface KwClusterResult { clusters: KwCluster[]; unclustered: string[]; total_clusters: number; pillar_count: number; strategy_summary: string; }

const INTENT_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = { informational: 'info', commercial: 'warning', transactional: 'success', navigational: 'neutral' };
const TYPE_COLOR: Record<string, string> = { pillar: '#7c3aed', supporting: '#2563eb', landing_page: '#16a34a' };

export default function ClustersPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('main');

    // Topic Clusters state
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [niche, setNiche] = useState('');
    const [clusters, setClusters] = useState<Cluster[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedCluster, setExpandedCluster] = useState<number | null>(null);

    // Keyword Clustering state
    const [kwKeywords, setKwKeywords] = useState('');
    const [kwNiche, setKwNiche] = useState('');
    const [kwMethod, setKwMethod] = useState<'semantic' | 'intent' | 'both'>('both');
    const [kwResult, setKwResult] = useState<KwClusterResult | null>(null);
    const [kwClustering, setKwClustering] = useState(false);
    const [kwExpandedCluster, setKwExpandedCluster] = useState<string | null>(null);
    const [kwFilterType, setKwFilterType] = useState('all');

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

    // Keyword Clustering functions
    const handleKwCluster = async () => {
        const kwList = kwKeywords.split('\n').map(k => k.trim()).filter(Boolean);
        if (kwList.length < 5) { toast.warning('Enter at least 5 keywords'); return; }
        setKwClustering(true);
        const res = await fetch('/api/keyword-cluster', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cluster', keywords: kwList, niche: kwNiche || undefined, method: kwMethod }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setKwClustering(false); return; }
        setKwResult(data.result);
        toast.success(`Clustered into ${data.result.total_clusters} groups`);
        setKwClustering(false);
    };

    const kwFiltered = kwResult?.clusters.filter(c => kwFilterType === 'all' || c.content_type === kwFilterType || c.priority === kwFilterType) || [];

    const kwExportCsv = () => {
        if (!kwResult) return;
        const rows = [['Cluster', 'Primary Keyword', 'Intent', 'Type', 'Keywords', 'Title', 'Volume', 'Priority']];
        kwResult.clusters.forEach(c => rows.push([c.cluster_name, c.primary_keyword, c.intent, c.content_type, c.keywords.join('; '), c.suggested_title, c.monthly_volume_estimate.toString(), c.priority]));
        const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'keyword-clusters.csv'; a.click(); URL.revokeObjectURL(url);
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

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'main' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('main')}>🏗️ Topic Clusters</button>
                    <button className={`btn ${activeTab === 'keyword-cluster' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('keyword-cluster')}>🗂️ Keyword Clustering</button>
                </div>

                {activeTab === 'main' && (
                    <>
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
                    </>
                )}

                {activeTab === 'keyword-cluster' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Niche <span className="text-muted text-sm">(optional)</span></label>
                                    <input className="form-input" value={kwNiche} onChange={e => setKwNiche(e.target.value)} placeholder="personal finance" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Clustering Method</label>
                                    <select className="form-input" value={kwMethod} onChange={e => setKwMethod(e.target.value as typeof kwMethod)}>
                                        <option value="both">Semantic + Intent</option>
                                        <option value="semantic">Semantic Only</option>
                                        <option value="intent">Intent Only</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Keywords * <span className="text-muted text-sm">(one per line, 5-200)</span></label>
                                <textarea className="form-input" rows={10} value={kwKeywords} onChange={e => setKwKeywords(e.target.value)} placeholder={"best savings account\nhigh yield savings\nsavings account interest rate\nhow to save money fast\nbest bank for savings\n..."} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                                <div className="text-sm text-muted" style={{ marginTop: 4 }}>{kwKeywords.split('\n').filter(k => k.trim()).length} keywords</div>
                            </div>
                            <button className="btn btn-primary" onClick={handleKwCluster} disabled={kwClustering}>{kwClustering ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Clustering...</> : '🗂️ Cluster Keywords'}</button>
                        </div>

                        {kwResult && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <Badge variant="info">{kwResult.total_clusters} clusters</Badge>
                                        <Badge variant="warning">{kwResult.pillar_count} pillar posts</Badge>
                                        {kwResult.unclustered.length > 0 && <Badge variant="neutral">{kwResult.unclustered.length} unclustered</Badge>}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <select className="form-input" value={kwFilterType} onChange={e => setKwFilterType(e.target.value)} style={{ width: 'auto', fontSize: '0.85rem' }}>
                                            <option value="all">All types</option>
                                            <option value="pillar">Pillar only</option>
                                            <option value="supporting">Supporting only</option>
                                            <option value="high">High priority</option>
                                        </select>
                                        <button className="btn btn-sm" onClick={kwExportCsv}>📥 Export CSV</button>
                                    </div>
                                </div>

                                <div className="card" style={{ marginBottom: 16, padding: '12px 14px' }}>
                                    <div className="text-sm" style={{ fontStyle: 'italic' }}>💡 {kwResult.strategy_summary}</div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {kwFiltered.sort((a, b) => b.monthly_volume_estimate - a.monthly_volume_estimate).map((c, i) => (
                                        <div key={i} className="card" style={{ padding: '10px 14px', borderLeft: `3px solid ${TYPE_COLOR[c.content_type] || '#6b7280'}` }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => setKwExpandedCluster(kwExpandedCluster === c.cluster_name ? null : c.cluster_name)}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                                                        <span style={{ fontWeight: 700 }}>{c.cluster_name}</span>
                                                        <Badge variant={INTENT_VARIANT[c.intent]}>{c.intent}</Badge>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: TYPE_COLOR[c.content_type] }}>{c.content_type}</span>
                                                        <Badge variant={c.priority === 'high' ? 'success' : c.priority === 'medium' ? 'warning' : 'neutral'}>{c.priority}</Badge>
                                                    </div>
                                                    <div className="text-sm text-muted">{c.keywords.length} keywords · {c.monthly_volume_estimate.toLocaleString()}/mo est. volume</div>
                                                </div>
                                                <span>{kwExpandedCluster === c.cluster_name ? '▲' : '▼'}</span>
                                            </div>

                                            {kwExpandedCluster === c.cluster_name && (
                                                <div style={{ marginTop: 10 }}>
                                                    <div style={{ fontWeight: 600, marginBottom: 6 }}>→ {c.suggested_title}</div>
                                                    <div className="form-label">Primary Keyword: <strong>{c.primary_keyword}</strong></div>
                                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                                                        {c.keywords.map((kw, ki) => (
                                                            <span key={ki} style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem' }}>{kw}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {kwResult.unclustered.length > 0 && (
                                    <div className="card" style={{ marginTop: 12 }}>
                                        <div className="form-label">Unclustered Keywords</div>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {kwResult.unclustered.map((k, i) => <span key={i} style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{k}</span>)}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {!kwResult && !kwClustering && <EmptyState icon="🗂️" title="Paste keywords to cluster" description="Groups 5-200 keywords into content clusters by semantic similarity and search intent" />}
                    </>
                )}
            </main>
        </div>
    );
}
