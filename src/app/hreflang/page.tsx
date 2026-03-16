'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site { id: string; name: string; url?: string; }
interface LangMapping { lang: string; url: string; }
interface SupportedLang { code: string; name: string; flag: string; }
interface HreflangConfig {
    id: string; site_id: string; page_path: string;
    default_language: string; language_mappings: LangMapping[];
    created_at: string;
}

export default function HreflangPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [configs, setConfigs] = useState<HreflangConfig[]>([]);
    const [languages, setLanguages] = useState<SupportedLang[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);

    // Form state
    const [pagePath, setPagePath] = useState('/');
    const [defaultLang, setDefaultLang] = useState('en');
    const [mappings, setMappings] = useState<LangMapping[]>([{ lang: 'en', url: '' }]);
    const [saving, setSaving] = useState(false);
    const [generatedTags, setGeneratedTags] = useState('');

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
        fetch('/api/hreflang').then(r => r.json()).then(d => {
            setConfigs(d.configs || []);
            setLanguages(d.supported_languages || []);
        }).catch(() => { });
        setLoading(false);
    }, []);

    const fetchConfigs = async () => {
        const url = selectedSite ? `/api/hreflang?site_id=${selectedSite}` : '/api/hreflang';
        const res = await fetch(url);
        const data = await res.json();
        setConfigs(data.configs || []);
    };

    useEffect(() => { fetchConfigs(); }, [selectedSite]);

    const addMapping = () => setMappings([...mappings, { lang: '', url: '' }]);
    const removeMapping = (idx: number) => setMappings(mappings.filter((_, i) => i !== idx));
    const updateMapping = (idx: number, field: 'lang' | 'url', value: string) => {
        const updated = [...mappings];
        updated[idx] = { ...updated[idx], [field]: value };
        setMappings(updated);
    };

    const handleSave = async () => {
        if (!selectedSite) { toast.warning('Select a site'); return; }
        if (!pagePath.trim()) { toast.warning('Enter a page path'); return; }
        const validMappings = mappings.filter(m => m.lang && m.url);
        if (validMappings.length < 2) { toast.warning('Add at least 2 language URLs'); return; }
        setSaving(true);
        try {
            const res = await fetch('/api/hreflang', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    site_id: selectedSite,
                    page_path: pagePath,
                    default_language: defaultLang,
                    language_mappings: validMappings,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success('Hreflang config saved!');
            setShowForm(false);
            setPagePath('/'); setMappings([{ lang: 'en', url: '' }]);
            fetchConfigs();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleGenerateTags = async () => {
        const validMappings = mappings.filter(m => m.lang && m.url);
        if (validMappings.length < 2) { toast.warning('Add at least 2 language URLs'); return; }
        try {
            const res = await fetch('/api/hreflang', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generate_tags',
                    language_mappings: validMappings,
                    default_language: defaultLang,
                }),
            });
            const data = await res.json();
            setGeneratedTags(data.html || '');
            toast.success('Tags generated!');
        } catch {
            toast.error('Tag generation failed');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/hreflang?id=${id}`, { method: 'DELETE' });
            toast.success('Config deleted');
            fetchConfigs();
        } catch { toast.error('Delete failed'); }
    };

    const copyTags = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Tags copied to clipboard!');
    };

    const getLangInfo = (code: string) => languages.find(l => l.code === code);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Multi-Language & Hreflang</h1>
                        <p className="page-description">Manage hreflang tags for international SEO and multilingual content</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                        {showForm ? '✕ Cancel' : '+ New Config'}
                    </button>
                </div>

                {/* Stats */}
                <div className="grid-3" style={{ marginBottom: 24 }}>
                    <StatCard label="Hreflang Configs" value={configs.length} icon="🌐" />
                    <StatCard label="Languages" value={new Set(configs.flatMap(c => c.language_mappings?.map(m => m.lang) || [])).size} icon="🗣️" />
                    <StatCard label="Pages Covered" value={new Set(configs.map(c => c.page_path)).size} icon="📄" />
                </div>

                {/* Site Filter */}
                <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Filter by Site:</label>
                        <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)} style={{ maxWidth: 300 }}>
                            <option value="">All Sites</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>

                {/* Create Form */}
                {showForm && (
                    <div className="card" style={{ marginBottom: 24 }}>
                        <h3 style={{ margin: '0 0 16px' }}>🌐 Configure Hreflang</h3>

                        <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Site</label>
                                <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                    <option value="">Select site...</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Page Path</label>
                                <input className="form-input" placeholder="/about, /blog/seo-guide" value={pagePath} onChange={e => setPagePath(e.target.value)} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Default Language</label>
                                <select className="form-select" value={defaultLang} onChange={e => setDefaultLang(e.target.value)}>
                                    {languages.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Language URL Mappings */}
                        <div style={{ marginBottom: 16 }}>
                            <label className="form-label">Language URL Mappings</label>
                            {mappings.map((m, i) => (
                                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                                    <select className="form-select" style={{ width: 180 }} value={m.lang} onChange={e => updateMapping(i, 'lang', e.target.value)}>
                                        <option value="">Language...</option>
                                        {languages.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name} ({l.code})</option>)}
                                    </select>
                                    <input className="form-input" style={{ flex: 1 }} placeholder="https://example.com/fr/page" value={m.url} onChange={e => updateMapping(i, 'url', e.target.value)} />
                                    {mappings.length > 1 && (
                                        <button className="btn btn-secondary btn-sm" onClick={() => removeMapping(i)} style={{ color: 'var(--accent-danger)' }}>✕</button>
                                    )}
                                </div>
                            ))}
                            <button className="btn btn-secondary btn-sm" onClick={addMapping}>+ Add Language</button>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Saving...</> : '💾 Save Config'}
                            </button>
                            <button className="btn btn-secondary" onClick={handleGenerateTags}>📋 Generate Tags</button>
                        </div>

                        {generatedTags && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <label className="form-label" style={{ margin: 0 }}>Generated Hreflang Tags</label>
                                    <button className="btn btn-secondary btn-sm" onClick={() => copyTags(generatedTags)}>📋 Copy</button>
                                </div>
                                <pre style={{
                                    padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.3)',
                                    fontSize: '0.78rem', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                                    color: 'var(--accent-success)',
                                }}>
                                    {generatedTags}
                                </pre>
                            </div>
                        )}
                    </div>
                )}

                {/* Config List */}
                <div className="card">
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /> Loading...</div>
                    ) : configs.length === 0 ? (
                        <EmptyState icon="🌐" title="No Hreflang Configs" description="Create hreflang configs to manage multilingual SEO across your pages." />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {configs.map(cfg => (
                                <div key={cfg.id} style={{
                                    padding: '12px 16px', borderRadius: 10,
                                    border: '1px solid var(--border-subtle)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '1.2rem' }}>🌐</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600 }}>{cfg.page_path}</div>
                                            <div className="text-sm text-muted">
                                                Default: {getLangInfo(cfg.default_language)?.flag} {cfg.default_language}
                                            </div>
                                        </div>
                                        <Badge variant="info">{cfg.language_mappings?.length || 0} langs</Badge>
                                        <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(cfg.id)} style={{ color: 'var(--accent-danger)' }}>🗑️</button>
                                    </div>
                                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {(cfg.language_mappings || []).map((m, i) => (
                                            <Badge key={i} variant="neutral">
                                                {getLangInfo(m.lang)?.flag || '🏳️'} {m.lang}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
