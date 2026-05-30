'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';

export default function WpPluginPage() {
    const toast = useToast();
    const [plugin, setPlugin] = useState('');
    const [siteId, setSiteId] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState<'code' | 'instructions'>('instructions');

    const generate = async () => {
        setLoading(true);
        const params = siteId ? `?site_id=${siteId}` : '';
        const res = await fetch(`/api/wp-plugin${params}`);
        const data = await res.json();
        setPlugin(data.plugin || '');
        setApiKey(data.api_key || '');
        setLoading(false);
    };

    useEffect(() => { generate(); }, []);

    const download = () => {
        const blob = new Blob([plugin], { type: 'text/php' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'rankmaster-integration.php'; a.click();
        URL.revokeObjectURL(url);
        toast.success('Plugin downloaded');
    };

    const INSTRUCTIONS = [
        { step: 1, title: 'Generate Plugin File', desc: 'Click "Download Plugin" below to get the PHP file' },
        { step: 2, title: 'Upload to WordPress', desc: 'Go to WP Admin → Plugins → Add New → Upload Plugin → Choose File → Install Now' },
        { step: 3, title: 'Activate Plugin', desc: 'After install, click "Activate Plugin"' },
        { step: 4, title: 'Features Active', desc: '404s auto-log, click tracking via ?rmid=, publish notifications fire automatically' },
    ];

    const FEATURES = [
        { icon: '🔴', title: '404 Auto-Logging', desc: 'Every 404 on your site automatically logged to RankMaster 404 Monitor' },
        { icon: '👆', title: 'Click Tracking', desc: 'Use ?rmid=TRACKID on any link for tracked redirects. E.g. /go/?rmid=ABC123' },
        { icon: '📢', title: 'Publish Notifications', desc: 'When you publish a post on WP, notification fires in RankMaster' },
        { icon: '🔗', title: 'Outbound Tracking', desc: 'Amazon affiliate links auto-tracked via inline JS click events' },
        { icon: '🎯', title: '[rm_button] Shortcode', desc: 'Add tracked CTA buttons anywhere: [rm_button url="..." text="Check Price" id="TRACKID"]' },
    ];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">WordPress Plugin</h1>
                        <p className="page-description">Install on WordPress for auto 404 logging, click tracking, publish notifications</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['instructions', 'code'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                        ))}
                        <button className="btn btn-primary btn-sm" onClick={download} disabled={!plugin || loading}>📥 Download Plugin</button>
                    </div>
                </div>

                {tab === 'instructions' && (
                    <>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 20 }}>
                            {FEATURES.map((f, i) => (
                                <div key={i} style={{ padding: '14px', background: 'var(--bg-secondary)', borderRadius: 8, display: 'flex', gap: 12 }}>
                                    <span style={{ fontSize: '1.5rem' }}>{f.icon}</span>
                                    <div><div style={{ fontWeight: 700, marginBottom: 2 }}>{f.title}</div><div className="text-sm text-muted">{f.desc}</div></div>
                                </div>
                            ))}
                        </div>

                        <div className="card">
                            <h3 className="card-title" style={{ marginBottom: 16 }}>Installation Steps</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {INSTRUCTIONS.map((inst, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{inst.step}</div>
                                        <div><div style={{ fontWeight: 700 }}>{inst.title}</div><div className="text-sm text-muted">{inst.desc}</div></div>
                                    </div>
                                ))}
                            </div>

                            {apiKey && (
                                <div style={{ marginTop: 16, padding: '12px 14px', background: '#eff6ff', borderRadius: 8 }}>
                                    <div style={{ fontWeight: 700, marginBottom: 4 }}>🔑 Your API Key (embedded in plugin)</div>
                                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#2563eb' }}>{apiKey}</code>
                                </div>
                            )}

                            <div style={{ marginTop: 16, padding: '12px 14px', background: '#f0fdf4', borderRadius: 8 }}>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>💡 Shortcode Usage</div>
                                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', display: 'block' }}>{'[rm_button url="https://affiliate.link" text="Check Price" id="YOUR_TRACKING_ID" color="#16a34a"]'}</code>
                            </div>
                        </div>
                    </>
                )}

                {tab === 'code' && (
                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span className="text-sm text-muted">rankmaster-integration.php</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(plugin); toast.success('Copied'); }}>📋 Copy</button>
                                <button className="btn btn-sm btn-primary" onClick={download}>📥 Download</button>
                            </div>
                        </div>
                        {loading ? <div className="text-sm text-muted">Generating...</div> : (
                            <textarea className="form-input" rows={30} value={plugin} readOnly style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }} />
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
