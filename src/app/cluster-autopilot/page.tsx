'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface ClusterMap {
    pillar_topic: string;
    pillar_post: { title: string; slug: string; word_count: number; search_volume: number };
    clusters: Array<{
        theme: string;
        posts: Array<{
            title: string;
            slug: string;
            keyword: string;
            search_volume: number;
            difficulty: number;
            intent: string;
            word_count: number;
            priority: 'high' | 'medium' | 'low';
            internal_links_to: string[];
        }>;
    }>;
    total_posts: number;
    estimated_traffic: number;
    tasks_created: number;
    provider: string;
}

interface SavedCluster { id: string; pillar_topic: string; total_posts: number; created_at: string; }

const PRIORITY_COLOR: Record<string, string> = { high: '#16a34a', medium: '#d97706', low: '#6b7280' };

export default function ClusterAutopilotPage() {
    const toast = useToast();
    const [niche, setNiche] = useState('');
    const [pillarTopic, setPillarTopic] = useState('');
    const [depth, setDepth] = useState('medium');
    const [siteId, setSiteId] = useState('');
    const [clusterMap, setClusterMap] = useState<ClusterMap | null>(null);
    const [saved, setSaved] = useState<SavedCluster[]>([]);
    const [generating, setGenerating] = useState(false);
    const [expandedCluster, setExpandedCluster] = useState<string | null>(null);

    useEffect(() => { loadSaved(); }, []);

    const loadSaved = async () => {
        const res = await fetch('/api/cluster-autopilot');
        const data = await res.json();
        setSaved(data.clusters || []);
    };

    const generate = async () => {
        if (!niche || !pillarTopic) { toast.warning('Enter niche and pillar topic'); return; }
        setGenerating(true);
        const res = await fetch('/api/cluster-autopilot', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ niche, pillar_topic: pillarTopic, depth, site_id: siteId || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setGenerating(false); return; }
        setClusterMap(data.cluster_map);
        toast.success(`Cluster map: ${data.cluster_map.total_posts} posts, ${data.cluster_map.tasks_created} tasks created`);
        loadSaved();
        setGenerating(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Cluster Auto-Pilot</h1>
                        <p className="page-description">Generate full pillar+cluster content maps, auto-assign tasks to team, build internal link structure</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Your Niche *</label>
                            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="e.g. personal finance, fitness" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Pillar Topic *</label>
                            <input className="form-input" value={pillarTopic} onChange={e => setPillarTopic(e.target.value)} placeholder="e.g. how to save money" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Depth</label>
                            <select className="form-input" value={depth} onChange={e => setDepth(e.target.value)}>
                                <option value="shallow">Shallow (5-8 posts)</option>
                                <option value="medium">Medium (10-15 posts)</option>
                                <option value="deep">Deep (20-30 posts)</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Site ID <span className="text-muted text-sm">(optional)</span></label>
                            <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="UUID from Sites page" />
                        </div>
                    </div>
                    <button className="btn btn-primary" onClick={generate} disabled={generating}>
                        {generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Mapping cluster...</> : '🏗️ Generate Cluster Map'}
                    </button>
                </div>

                {clusterMap && (
                    <>
                        <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                            {[
                                { label: 'Total Posts', value: clusterMap.total_posts, icon: '📄' },
                                { label: 'Clusters', value: clusterMap.clusters.length, icon: '🏗️' },
                                { label: 'Est. Traffic', value: clusterMap.estimated_traffic.toLocaleString() + '/mo', icon: '📈' },
                                { label: 'Tasks Created', value: clusterMap.tasks_created, icon: '✅' },
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                    <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{s.value}</div>
                                    <div className="text-sm text-muted">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Pillar post */}
                        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--accent-primary)' }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>🏛️ Pillar Post</div>
                            <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{clusterMap.pillar_post.title}</div>
                            <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                                /{clusterMap.pillar_post.slug} · {clusterMap.pillar_post.word_count.toLocaleString()} words · {clusterMap.pillar_post.search_volume.toLocaleString()} searches/mo
                            </div>
                        </div>

                        {/* Clusters */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {clusterMap.clusters.map((cluster, ci) => (
                                <div key={ci} className="card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                        onClick={() => setExpandedCluster(expandedCluster === cluster.theme ? null : cluster.theme)}>
                                        <div>
                                            <span style={{ fontWeight: 700 }}>📂 {cluster.theme}</span>
                                            <span className="text-sm text-muted" style={{ marginLeft: 8 }}>{cluster.posts.length} posts</span>
                                        </div>
                                        <span>{expandedCluster === cluster.theme ? '▲' : '▼'}</span>
                                    </div>

                                    {expandedCluster === cluster.theme && (
                                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {cluster.posts.map((post, pi) => (
                                                <div key={pi} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, borderLeft: `2px solid ${PRIORITY_COLOR[post.priority]}` }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 600 }}>{post.title}</div>
                                                            <div className="text-sm text-muted">/{post.slug}</div>
                                                            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                                                <Badge variant="neutral">{post.intent}</Badge>
                                                                <span className="text-sm text-muted">{post.search_volume.toLocaleString()}/mo</span>
                                                                <span className="text-sm text-muted">KD: {post.difficulty}</span>
                                                                <span className="text-sm text-muted">{post.word_count.toLocaleString()}w</span>
                                                            </div>
                                                        </div>
                                                        <Badge variant={post.priority === 'high' ? 'success' : post.priority === 'medium' ? 'warning' : 'neutral'}>{post.priority}</Badge>
                                                    </div>
                                                    {post.internal_links_to.length > 0 && (
                                                        <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                                                            Links to: {post.internal_links_to.join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {saved.length > 0 && !clusterMap && (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Previous Cluster Maps</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {saved.map((c, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{c.pillar_topic}</div>
                                        <div className="text-sm text-muted">{c.total_posts} posts · {new Date(c.created_at).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!clusterMap && saved.length === 0 && !generating && (
                    <EmptyState icon="🏗️" title="No cluster maps yet" description="Enter your niche and pillar topic to auto-generate a full content cluster with team tasks" />
                )}
            </main>
        </div>
    );
}
