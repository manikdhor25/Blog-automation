'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface LeadMagnet {
    title: string;
    subtitle: string;
    description: string;
    opt_in_headline: string;
    opt_in_subtext: string;
    button_text: string;
    content_sections: Array<{ title: string; items: string[] }>;
    html_preview: string;
    target_audience: string;
    format: string;
}

interface EmailForm {
    id: string;
    title: string;
    description: string;
    button_text: string;
    style: string;
    subscribers: number;
    is_active: boolean;
    embed_code: string;
    created_at: string;
}

export default function EmailCapturePage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<'magnet' | 'forms' | 'providers'>('magnet');
    const [keyword, setKeyword] = useState('');
    const [niche, setNiche] = useState('');
    const [magnetType, setMagnetType] = useState<'checklist' | 'cheatsheet' | 'guide' | 'template' | 'swipe_file' | 'resource_list'>('checklist');
    const [generating, setGenerating] = useState(false);
    const [magnet, setMagnet] = useState<LeadMagnet | null>(null);
    const [forms, setForms] = useState<EmailForm[]>([]);
    const [showFormBuilder, setShowFormBuilder] = useState(false);
    const [formConfig, setFormConfig] = useState({ title: '', description: '', button_text: 'Get Free Access', style: 'inline', magnet_title: '' });
    const [copiedEmbed, setCopiedEmbed] = useState<string | null>(null);

    useEffect(() => { fetchForms(); }, []);

    const fetchForms = async () => {
        const res = await fetch('/api/email-capture?view=forms');
        const data = await res.json();
        setForms(data.forms || []);
    };

    const generateMagnet = async () => {
        if (!keyword) { toast.warning('Keyword required'); return; }
        setGenerating(true); setMagnet(null);
        try {
            const res = await fetch('/api/email-capture', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'generate_magnet', keyword, niche, magnet_type: magnetType }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'Failed'); return; }
            setMagnet(data.magnet);
            toast.success(`Lead magnet generated via ${data.provider}`);
        } catch { toast.error('Generation failed'); }
        finally { setGenerating(false); }
    };

    const createForm = async () => {
        if (!formConfig.title) { toast.warning('Form title required'); return; }
        const res = await fetch('/api/email-capture', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create_form', form_config: formConfig }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Opt-in form created');
        setShowFormBuilder(false);
        fetchForms();
    };

    const copyEmbed = (code: string, id: string) => {
        navigator.clipboard.writeText(code);
        setCopiedEmbed(id);
        toast.success('Embed code copied');
        setTimeout(() => setCopiedEmbed(null), 2000);
    };

    const deleteForm = async (id: string) => {
        await fetch('/api/email-capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_form', form_id: id }) });
        toast.success('Form deleted');
        fetchForms();
    };

    const providers = [
        { id: 'convertkit', name: 'ConvertKit', icon: '📧', desc: 'Creator-focused email platform' },
        { id: 'mailchimp', name: 'Mailchimp', icon: '🐒', desc: 'Most popular email service' },
        { id: 'beehiiv', name: 'Beehiiv', icon: '🐝', desc: 'Newsletter & monetization platform' },
        { id: 'aweber', name: 'AWeber', icon: '📬', desc: 'Small business email marketing' },
        { id: 'activecampaign', name: 'ActiveCampaign', icon: '⚡', desc: 'CRM + automation platform' },
    ];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Email Capture</h1>
                        <p className="page-description">Build your list with AI lead magnets, opt-in forms, and provider integrations</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'magnet' ? 'active' : ''}`} onClick={() => setActiveTab('magnet')}>Lead Magnet Generator</button>
                    <button className={`tab ${activeTab === 'forms' ? 'active' : ''}`} onClick={() => setActiveTab('forms')}>Opt-in Forms ({forms.length})</button>
                    <button className={`tab ${activeTab === 'providers' ? 'active' : ''}`} onClick={() => setActiveTab('providers')}>Integrations</button>
                </div>

                {activeTab === 'magnet' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <h3 className="card-title" style={{ marginBottom: 16 }}>Generate Lead Magnet</h3>
                            <div className="grid-2" style={{ gap: 16 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Target Keyword / Topic *</label>
                                    <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="keto diet for beginners" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Niche</label>
                                    <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="health & fitness" />
                                </div>
                                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                    <label className="form-label">Magnet Type</label>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {['checklist', 'cheatsheet', 'guide', 'template', 'swipe_file', 'resource_list'].map(t => (
                                            <button key={t} className={`btn btn-sm ${magnetType === t ? 'btn-primary' : ''}`}
                                                onClick={() => setMagnetType(t as typeof magnetType)}>
                                                {t.replace('_', ' ')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={generateMagnet} disabled={generating}>
                                {generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating...</> : 'Generate Lead Magnet'}
                            </button>
                        </div>

                        {magnet && (
                            <div className="card animate-in">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <div>
                                        <h3 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>{magnet.title}</h3>
                                        <p className="text-sm text-muted">{magnet.subtitle}</p>
                                    </div>
                                    <Badge variant="info">{magnet.format}</Badge>
                                </div>

                                <div className="grid-2" style={{ gap: 16, marginBottom: 20 }}>
                                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 16 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 8 }}>Opt-in Headline</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)' }}>{magnet.opt_in_headline}</div>
                                        <div className="text-sm text-muted" style={{ marginTop: 8 }}>{magnet.opt_in_subtext}</div>
                                        <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }}>{magnet.button_text}</button>
                                    </div>
                                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 16 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 8 }}>Target Audience</div>
                                        <p className="text-sm">{magnet.target_audience}</p>
                                        <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 8 }}>Description</div>
                                        <p className="text-sm">{magnet.description}</p>
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: 12 }}>Content Sections</div>
                                    <div className="grid-2" style={{ gap: 12 }}>
                                        {magnet.content_sections?.map((s, i) => (
                                            <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 14 }}>
                                                <div style={{ fontWeight: 600, marginBottom: 8 }}>{s.title}</div>
                                                {s.items?.map((item, j) => <div key={j} className="text-sm" style={{ marginBottom: 4 }}>✓ {item}</div>)}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <button className="btn btn-success" style={{ marginTop: 16 }}
                                    onClick={() => { setFormConfig(f => ({ ...f, title: magnet.opt_in_headline, button_text: magnet.button_text, magnet_title: magnet.title })); setShowFormBuilder(true); setActiveTab('forms'); }}>
                                    Create Opt-in Form for This Magnet →
                                </button>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'forms' && (
                    <>
                        {showFormBuilder && (
                            <div className="card animate-in" style={{ marginBottom: 16 }}>
                                <div className="card-header">
                                    <h3 className="card-title">Create Opt-in Form</h3>
                                    <button className="btn btn-sm" onClick={() => setShowFormBuilder(false)}>✕</button>
                                </div>
                                <div className="grid-2" style={{ gap: 16 }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Form Headline *</label>
                                        <input className="form-input" value={formConfig.title} onChange={e => setFormConfig(f => ({ ...f, title: e.target.value }))} placeholder="Get Your Free Checklist" />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Button Text</label>
                                        <input className="form-input" value={formConfig.button_text} onChange={e => setFormConfig(f => ({ ...f, button_text: e.target.value }))} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Style</label>
                                        <select className="form-select" value={formConfig.style} onChange={e => setFormConfig(f => ({ ...f, style: e.target.value }))}>
                                            <option value="inline">Inline</option>
                                            <option value="popup">Popup</option>
                                            <option value="sticky_bar">Sticky Bar</option>
                                            <option value="slide_in">Slide-in</option>
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Lead Magnet Title</label>
                                        <input className="form-input" value={formConfig.magnet_title} onChange={e => setFormConfig(f => ({ ...f, magnet_title: e.target.value }))} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                        <label className="form-label">Description</label>
                                        <input className="form-input" value={formConfig.description} onChange={e => setFormConfig(f => ({ ...f, description: e.target.value }))} />
                                    </div>
                                </div>
                                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={createForm}>Create Form</button>
                            </div>
                        )}

                        <div className="card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h3 className="card-title" style={{ margin: 0 }}>Opt-in Forms</h3>
                                <button className="btn btn-primary btn-sm" onClick={() => setShowFormBuilder(true)}>+ New Form</button>
                            </div>
                            {forms.length === 0 ? (
                                <EmptyState icon="📝" title="No Forms Yet" description="Create your first opt-in form to start building your email list" />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {forms.map(form => (
                                        <div key={form.id} className="card" style={{ padding: 16 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <div style={{ fontWeight: 700 }}>{form.title}</div>
                                                    <div className="text-sm text-muted">{form.description}</div>
                                                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                                        <Badge variant={form.is_active ? 'success' : 'warning'}>{form.is_active ? 'Active' : 'Paused'}</Badge>
                                                        <Badge variant="info">{form.style}</Badge>
                                                        <span className="text-sm text-muted">{form.subscribers} subscribers</span>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="btn btn-sm" onClick={() => copyEmbed(form.embed_code, form.id)}>
                                                        {copiedEmbed === form.id ? 'Copied!' : 'Copy Embed'}
                                                    </button>
                                                    <button className="btn btn-sm btn-danger" onClick={() => deleteForm(form.id)}>Delete</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {activeTab === 'providers' && (
                    <div className="grid-2" style={{ gap: 16 }}>
                        {providers.map(p => (
                            <div key={p.id} className="card" style={{ padding: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                    <span style={{ fontSize: '1.8rem' }}>{p.icon}</span>
                                    <div>
                                        <div style={{ fontWeight: 700 }}>{p.name}</div>
                                        <div className="text-sm text-muted">{p.desc}</div>
                                    </div>
                                </div>
                                <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
                                    Add <code>{p.id}_api_key</code> in Settings to connect.
                                </p>
                                <a href="/settings" className="btn btn-sm">Configure in Settings →</a>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
