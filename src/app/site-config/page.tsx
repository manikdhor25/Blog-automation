'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';

export default function SiteConfigPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Array<{ id: string; name: string; url: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [activeTab, setActiveTab] = useState<'robots' | 'sitemap'>('robots');
    const [robotsTxt, setRobotsTxt] = useState('');
    const [sitemapXml, setSitemapXml] = useState('');
    const [urlCount, setUrlCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => { fetch('/api/site-config').then(r => r.json()).then(d => setSites(d.sites || [])); }, []);

    useEffect(() => {
        if (!siteId) return;
        fetch(`/api/site-config?site_id=${siteId}`).then(r => r.json()).then(d => {
            setRobotsTxt(d.config?.robots_txt || '');
            setSitemapXml(d.config?.sitemap_xml || '');
        });
    }, [siteId]);

    const loadRobots = async () => {
        if (!siteId) return;
        setLoading(true);
        const res = await fetch('/api/site-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_robots', site_id: siteId }) });
        const data = await res.json();
        setRobotsTxt(data.robots_txt || '');
        setLoading(false);
    };

    const saveRobots = async () => {
        if (!siteId || !robotsTxt) return;
        setSaving(true);
        await fetch('/api/site-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save_robots', site_id: siteId, robots_txt: robotsTxt }) });
        toast.success('robots.txt saved');
        setSaving(false);
    };

    const generateSitemap = async () => {
        if (!siteId) return;
        setLoading(true);
        const res = await fetch('/api/site-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_sitemap', site_id: siteId }) });
        const data = await res.json();
        setSitemapXml(data.sitemap || '');
        setUrlCount(data.url_count || 0);
        toast.success(`Sitemap generated — ${data.url_count} URLs`);
        setLoading(false);
    };

    const copySitemap = () => { navigator.clipboard.writeText(sitemapXml); toast.success('Sitemap XML copied'); };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Site Config</h1>
                        <p className="page-description">robots.txt editor + XML sitemap generator</p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                    <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)} style={{ maxWidth: 300 }}>
                        <option value="">Select site...</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'robots' ? 'active' : ''}`} onClick={() => setActiveTab('robots')}>robots.txt</button>
                    <button className={`tab ${activeTab === 'sitemap' ? 'active' : ''}`} onClick={() => setActiveTab('sitemap')}>XML Sitemap</button>
                </div>

                {activeTab === 'robots' ? (
                    <div className="card">
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            <button className="btn btn-sm" onClick={loadRobots} disabled={!siteId || loading}>Load / Generate Default</button>
                            <button className="btn btn-primary btn-sm" onClick={saveRobots} disabled={!siteId || saving}>{saving ? 'Saving...' : 'Save robots.txt'}</button>
                            <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(robotsTxt); toast.success('Copied'); }} disabled={!robotsTxt}>Copy</button>
                        </div>
                        {!siteId ? (
                            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Select a site to load its robots.txt</div>
                        ) : (
                            <>
                                <textarea className="form-input" rows={20} value={robotsTxt} onChange={e => setRobotsTxt(e.target.value)} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} placeholder="Select a site and click Load to get started..." />
                                <div className="text-sm text-muted" style={{ marginTop: 8 }}>Edit above and click Save. Then upload to your server root as /robots.txt</div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="card">
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            <button className="btn btn-primary btn-sm" onClick={generateSitemap} disabled={!siteId || loading}>{loading ? 'Generating...' : 'Generate Sitemap'}</button>
                            {sitemapXml && <button className="btn btn-sm" onClick={copySitemap}>Copy XML</button>}
                        </div>
                        {urlCount > 0 && <div className="text-sm text-muted" style={{ marginBottom: 10 }}>{urlCount} URLs in sitemap</div>}
                        {!siteId ? (
                            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Select a site to generate its sitemap</div>
                        ) : sitemapXml ? (
                            <>
                                <textarea className="form-input" rows={20} readOnly value={sitemapXml} style={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />
                                <div className="text-sm text-muted" style={{ marginTop: 8 }}>Upload this as /sitemap.xml on your server, then submit the URL to Google Search Console</div>
                            </>
                        ) : (
                            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Click Generate Sitemap to create XML from your published posts</div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
