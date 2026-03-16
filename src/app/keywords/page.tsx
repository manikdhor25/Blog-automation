'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface Site {
    id: string;
    name: string;
    niche: string;
}

interface KeywordSuggestion {
    keyword: string;
    search_volume: number;
    difficulty: number;
    cpc: number;
    intent_type: string;
    serp_features: string[];
    source?: string;
    data_source?: string;
}

export default function KeywordsPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [niche, setNiche] = useState('');
    const [suggestions, setSuggestions] = useState<KeywordSuggestion[]>([]);
    const [savedKeywords, setSavedKeywords] = useState<KeywordSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [enriching, setEnriching] = useState(false);
    const [activeTab, setActiveTab] = useState<'discover' | 'saved'>('discover');
    const [dataSource, setDataSource] = useState<string>('');

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => {
            setSites(d.sites || []);
        });
        fetchSavedKeywords();
    }, []);

    const fetchSavedKeywords = async () => {
        try {
            const res = await fetch('/api/keywords');
            const data = await res.json();
            setSavedKeywords(data.keywords || []);
        } catch { /* ignore */ }
    };

    const handleDiscover = async () => {
        const targetNiche = niche || sites.find(s => s.id === selectedSite)?.niche || '';
        if (!targetNiche) {
            toast.warning('Please enter a niche or select a site with a niche defined');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ai_suggest', niche: targetNiche }),
            });
            const data = await res.json();
            setSuggestions(data.suggestions || []);
            setDataSource(data.source || 'ai_estimated');
            if (data.source === 'dataforseo') {
                toast.success('Keywords loaded with real DataForSEO data!');
            }
        } catch {
            toast.error('Failed to generate keyword suggestions');
        } finally {
            setLoading(false);
        }
    };

    const handleEnrichKeywords = async () => {
        if (!savedKeywords.length) {
            toast.warning('No saved keywords to enrich');
            return;
        }

        setEnriching(true);
        try {
            const ids = (savedKeywords as unknown as { id?: string }[]).map(k => k.id || '').filter(Boolean);
            if (!ids.length) {
                toast.warning('No keyword IDs found');
                return;
            }

            const res = await fetch('/api/keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'enrich', keyword_ids: ids }),
            });
            const data = await res.json();
            if (data.enriched > 0) {
                toast.success(`${data.enriched} keywords enriched with ${data.source === 'dataforseo' ? 'real' : 'AI-estimated'} data!`);
                fetchSavedKeywords();
            } else {
                toast.info('No keywords were updated');
            }
        } catch {
            toast.error('Failed to enrich keywords');
        } finally {
            setEnriching(false);
        }
    };

    const handleSaveKeywords = async (keywords: KeywordSuggestion[]) => {
        if (!selectedSite) {
            toast.warning('Please select a site first');
            return;
        }

        try {
            const res = await fetch('/api/keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    site_id: selectedSite,
                    keywords: keywords.map(k => ({ ...k, data_source: dataSource || 'ai_estimated' })),
                }),
            });
            if (res.ok) {
                toast.success(`${keywords.length} keywords saved!`);
                fetchSavedKeywords();
            }
        } catch {
            toast.error('Failed to save keywords');
        }
    };

    const getIntentBadge = (intent: string) => {
        const map: Record<string, 'info' | 'success' | 'warning' | 'danger'> = {
            informational: 'info',
            commercial: 'warning',
            transactional: 'success',
            navigational: 'neutral' as 'info',
        };
        return map[intent] || 'info';
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Keyword Intelligence</h1>
                        <p className="page-description">AI-powered keyword discovery & real data enrichment</p>
                    </div>
                    {dataSource && (
                        <Badge variant={dataSource === 'dataforseo' ? 'success' : 'warning'}>
                            {dataSource === 'dataforseo' ? '🟢 Real Data' : '🤖 AI Estimated'}
                        </Badge>
                    )}
                </div>

                {/* Controls */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche / Topic</label>
                            <input className="form-input" placeholder="e.g., tech gadgets, health supplements"
                                value={niche} onChange={e => setNiche(e.target.value)} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Target Site</label>
                            <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                <option value="">Select a site...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={handleDiscover} disabled={loading}
                                style={{ width: '100%' }}>
                                {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Researching...</> : '🤖 AI Keyword Discovery'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="tabs">
                    <button className={`tab ${activeTab === 'discover' ? 'active' : ''}`} onClick={() => setActiveTab('discover')}>
                        🔍 Discover ({suggestions.length})
                    </button>
                    <button className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>
                        💾 Saved Keywords ({savedKeywords.length})
                    </button>
                </div>

                {/* Keyword Table */}
                <div className="card">
                    {activeTab === 'discover' && suggestions.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: dataSource === 'ai_estimated' ? 12 : 0 }}>
                                <div className="flex gap-2">
                                    {dataSource && (
                                        <Badge variant={dataSource === 'dataforseo' ? 'success' : 'warning'}>
                                            {dataSource === 'dataforseo' ? '📊 Verified Google Data' : '⚠️ AI Estimated — Not Real Data'}
                                        </Badge>
                                    )}
                                </div>
                                <button className="btn btn-success btn-sm" onClick={() => handleSaveKeywords(suggestions)}>
                                    Save All {suggestions.length} Keywords
                                </button>
                            </div>
                            {dataSource === 'ai_estimated' && (
                                <div style={{ padding: '8px 12px', background: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.3)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--accent-warning)' }}>
                                    ⚠️ <strong>Volume, difficulty, and CPC values are AI-estimated and may not reflect real search data.</strong> Configure DataForSEO in Settings → API Keys for verified Google metrics. Do not rely on these numbers for investment decisions.
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'saved' && savedKeywords.length > 0 && (
                        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary btn-sm" onClick={handleEnrichKeywords} disabled={enriching}>
                                {enriching ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Enriching...</> : '📊 Enrich with Real Data'}
                            </button>
                        </div>
                    )}

                    {((activeTab === 'discover' && suggestions.length === 0) || (activeTab === 'saved' && savedKeywords.length === 0)) ? (
                        <EmptyState
                            icon={activeTab === 'discover' ? '🔍' : '💾'}
                            title={activeTab === 'discover' ? 'No Keywords Discovered Yet' : 'No Saved Keywords'}
                            description={activeTab === 'discover'
                                ? 'Enter a niche and click AI Keyword Discovery to find opportunities'
                                : 'Discover keywords and save them to track'}
                        />
                    ) : (
                        <DataTable
                            data={(activeTab === 'discover' ? suggestions : savedKeywords) as unknown as Record<string, unknown>[]}
                            searchKeys={['keyword', 'intent_type']}
                            pageSize={12}
                            columns={[
                                {
                                    key: 'keyword', label: 'Keyword', render: (row) => (
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{String(row.keyword)}</span>
                                    )
                                },
                                {
                                    key: 'search_volume', label: 'Volume', render: (row) => (
                                        <span className="font-mono">{(Number(row.search_volume) || 0).toLocaleString()}</span>
                                    )
                                },
                                {
                                    key: 'difficulty', label: 'Difficulty', render: (row) => {
                                        const d = Number(row.difficulty);
                                        return <Badge variant={d <= 30 ? 'success' : d <= 60 ? 'warning' : 'danger'}>{d}/100</Badge>;
                                    }
                                },
                                {
                                    key: 'cpc', label: 'CPC', render: (row) => (
                                        <span className="font-mono">${(Number(row.cpc) || 0).toFixed(2)}</span>
                                    )
                                },
                                {
                                    key: 'intent_type', label: 'Intent', render: (row) => (
                                        <Badge variant={getIntentBadge(String(row.intent_type))}>{String(row.intent_type)}</Badge>
                                    )
                                },
                                {
                                    key: 'serp_features', label: 'SERP Features', sortable: false, render: (row) => (
                                        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                                            {(Array.isArray(row.serp_features) ? row.serp_features : []).slice(0, 2).map((f: unknown, j: number) => (
                                                <Badge key={j} variant="neutral">{String(f).replace('_', ' ')}</Badge>
                                            ))}
                                        </div>
                                    )
                                },
                                {
                                    key: 'source', label: 'Data Source', sortable: false, render: (row) => {
                                        const src = String(row.data_source || row.source || dataSource || 'ai_estimated');
                                        return (
                                            <Badge variant={src === 'dataforseo' ? 'success' : 'warning'}>
                                                {src === 'dataforseo' ? '✓ Verified' : '⚠️ Estimated'}
                                            </Badge>
                                        );
                                    }
                                },
                                {
                                    key: 'action', label: 'Action', sortable: false, render: (row) => (
                                        <a href={`/create?keyword=${encodeURIComponent(String(row.keyword))}`} className="btn btn-primary btn-sm">
                                            Write →
                                        </a>
                                    )
                                },
                            ]}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}
