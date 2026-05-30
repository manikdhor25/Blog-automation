'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Campaign { id: string; name: string; target_links: number; links_acquired: number; link_type: string; niche?: string; status: string; created_at: string; }
interface Prospect { id: string; domain: string; url?: string; contact_name?: string; contact_email?: string; da_estimate?: number; link_type: string; status: string; notes: string; link_url?: string; created_at: string; }

const STATUS_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
    identified: 'neutral', researching: 'info', outreach_sent: 'warning', followed_up: 'warning', link_live: 'success', rejected: 'danger', no_response: 'neutral'
};

export default function BacklinkCrmPage() {
    const toast = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [prospects, setProspects] = useState<Prospect[]>([]);
    const [stats, setStats] = useState({ total: 0, live: 0, outreach_sent: 0, conversion_rate: '0' });
    const [tab, setTab] = useState<'overview' | 'prospects' | 'new_campaign' | 'add_prospect' | 'email'>('overview');
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    // Campaign form
    const [campName, setCampName] = useState('');
    const [campTarget, setCampTarget] = useState('20');
    const [campLinkType, setCampLinkType] = useState('mixed');
    const [campNiche, setCampNiche] = useState('');
    // Prospect form
    const [domain, setDomain] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [daEst, setDaEst] = useState('');
    const [linkType, setLinkType] = useState('guest_post');
    // Email gen
    const [emailDomain, setEmailDomain] = useState('');
    const [emailLinkType, setEmailLinkType] = useState('guest_post');
    const [yourSite, setYourSite] = useState('');
    const [yourName, setYourName] = useState('');
    const [generatedEmail, setGeneratedEmail] = useState<Record<string, string> | null>(null);
    const [saving, setSaving] = useState(false);
    const [findingProspects, setFindingProspects] = useState(false);
    const [foundProspects, setFoundProspects] = useState<Array<{ domain: string; da_estimate: number; reason: string; contact_tip: string }>>([]);

    useEffect(() => { load(); }, [selectedCampaign, statusFilter]);

    const load = async () => {
        const params = new URLSearchParams();
        if (selectedCampaign) params.set('campaign_id', selectedCampaign);
        if (statusFilter !== 'all') params.set('status', statusFilter);
        const res = await fetch(`/api/backlink-crm?${params}`);
        const data = await res.json();
        setCampaigns(data.campaigns || []);
        setProspects(data.prospects || []);
        setStats(data.stats || {});
    };

    const createCampaign = async () => {
        if (!campName) { toast.warning('Campaign name required'); return; }
        setSaving(true);
        const res = await fetch('/api/backlink-crm', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create_campaign', name: campName, target_links: parseInt(campTarget), link_type: campLinkType, niche: campNiche || undefined }),
        });
        if (res.ok) { toast.success('Campaign created'); setCampName(''); load(); setTab('overview'); }
        setSaving(false);
    };

    const addProspect = async () => {
        if (!domain) { toast.warning('Domain required'); return; }
        setSaving(true);
        const res = await fetch('/api/backlink-crm', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add_prospect', domain, contact_email: contactEmail || undefined, da_estimate: daEst ? parseInt(daEst) : undefined, link_type: linkType, campaign_id: selectedCampaign || undefined }),
        });
        if (res.ok) { toast.success('Prospect added'); setDomain(''); setContactEmail(''); load(); setTab('prospects'); }
        setSaving(false);
    };

    const updateStatus = async (id: string, status: string) => {
        await fetch('/api/backlink-crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_status', prospect_id: id, status, campaign_id: selectedCampaign }) });
        if (status === 'link_live') toast.success('🎉 Link acquired!');
        load();
    };

    const genEmail = async () => {
        if (!emailDomain) { toast.warning('Enter domain'); return; }
        setSaving(true);
        const res = await fetch('/api/backlink-crm', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate_email', domain: emailDomain, link_type: emailLinkType, your_site: yourSite || undefined, your_name: yourName || undefined }),
        });
        const data = await res.json();
        if (res.ok) { setGeneratedEmail(data.email); toast.success('Email generated'); }
        setSaving(false);
    };

    const findProspects = async () => {
        setFindingProspects(true);
        const res = await fetch('/api/backlink-crm', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'find_prospects', niche: campNiche, link_type: campLinkType, count: 10 }),
        });
        const data = await res.json();
        if (res.ok) { setFoundProspects(data.prospects || []); toast.success(`Found ${data.prospects?.length} prospects`); }
        setFindingProspects(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Backlink Acquisition CRM</h1>
                        <p className="page-description">Manage link building campaigns — identify → outreach → follow-up → link live</p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {(['overview', 'prospects', 'new_campaign', 'add_prospect', 'email'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize', fontSize: '0.75rem' }}>
                                {t.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                    {[
                        { label: 'Total Prospects', value: stats.total, icon: '🎯' },
                        { label: 'Links Live', value: stats.live, icon: '🔗', color: '#16a34a' },
                        { label: 'In Outreach', value: stats.outreach_sent, icon: '📧' },
                        { label: 'Conversion', value: `${stats.conversion_rate}%`, icon: '📊', color: parseFloat(stats.conversion_rate) >= 10 ? '#16a34a' : '#d97706' },
                    ].map((s, i) => (
                        <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: (s as { color?: string }).color }}>{s.value}</div>
                            <div className="text-sm text-muted">{s.label}</div>
                        </div>
                    ))}
                </div>

                {tab === 'new_campaign' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>New Campaign</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Campaign Name *</label><input className="form-input" value={campName} onChange={e => setCampName(e.target.value)} placeholder="Q1 2025 Link Building" /></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Niche</label><input className="form-input" value={campNiche} onChange={e => setCampNiche(e.target.value)} placeholder="personal finance" /></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Link Type</label><select className="form-input" value={campLinkType} onChange={e => setCampLinkType(e.target.value)}><option value="mixed">Mixed</option><option value="guest_post">Guest Posts</option><option value="resource_page">Resource Pages</option><option value="broken_link">Broken Link</option><option value="skyscraper">Skyscraper</option></select></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Target Links</label><input className="form-input" type="number" value={campTarget} onChange={e => setCampTarget(e.target.value)} placeholder="20" /></div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary" onClick={createCampaign} disabled={saving}>{saving ? 'Creating...' : '🎯 Create Campaign'}</button>
                            <button className="btn btn-sm" onClick={findProspects} disabled={findingProspects}>{findingProspects ? 'Finding...' : '🔍 AI Find Prospects'}</button>
                        </div>
                        {foundProspects.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                                <div className="form-label" style={{ marginBottom: 8 }}>AI-Found Prospects</div>
                                {foundProspects.map((p, i) => (
                                    <div key={i} style={{ padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                                        <div><span style={{ fontWeight: 600 }}>{p.domain}</span><span className="text-sm text-muted" style={{ marginLeft: 8 }}>DA ~{p.da_estimate}</span><div className="text-sm text-muted">{p.reason}</div></div>
                                        <button className="btn btn-sm" onClick={async () => { await fetch('/api/backlink-crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_prospect', domain: p.domain, da_estimate: p.da_estimate, link_type: campLinkType }) }); toast.success('Added'); load(); }}>Add</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {tab === 'email' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Generate Outreach Email</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Target Domain *</label><input className="form-input" value={emailDomain} onChange={e => setEmailDomain(e.target.value)} placeholder="target-blog.com" /></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Link Type</label><select className="form-input" value={emailLinkType} onChange={e => setEmailLinkType(e.target.value)}><option value="guest_post">Guest Post</option><option value="resource_page">Resource Page</option><option value="broken_link">Broken Link</option><option value="mention">Unlinked Mention</option></select></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Your Site</label><input className="form-input" value={yourSite} onChange={e => setYourSite(e.target.value)} placeholder="yoursite.com" /></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Your Name</label><input className="form-input" value={yourName} onChange={e => setYourName(e.target.value)} placeholder="John Smith" /></div>
                        </div>
                        <button className="btn btn-primary" onClick={genEmail} disabled={saving}>{saving ? 'Generating...' : '✉️ Generate Email'}</button>
                        {generatedEmail && (
                            <div style={{ marginTop: 12 }}>
                                <div className="form-label">Subject: {generatedEmail.subject}</div>
                                <textarea className="form-input" rows={6} value={generatedEmail.body} readOnly style={{ marginTop: 6 }} />
                                <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => { navigator.clipboard.writeText(`Subject: ${generatedEmail.subject}\n\n${generatedEmail.body}`); toast.success('Copied'); }}>📋 Copy</button>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'overview' && (
                    campaigns.length === 0 ? <EmptyState icon="🎯" title="No campaigns" description="Create a link building campaign to start tracking backlink acquisition" /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {campaigns.map((c, i) => (
                                <div key={i} className="card" style={{ padding: '14px', cursor: 'pointer' }} onClick={() => { setSelectedCampaign(c.id); setTab('prospects'); }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, marginBottom: 4 }}>{c.name}</div>
                                            <div style={{ display: 'flex', gap: 12 }}>
                                                <span style={{ fontWeight: 700, color: '#16a34a' }}>{c.links_acquired}/{c.target_links} links</span>
                                                <Badge variant="neutral">{c.link_type}</Badge>
                                                {c.niche && <span className="text-sm text-muted">{c.niche}</span>}
                                            </div>
                                        </div>
                                        <Badge variant={c.status === 'active' ? 'success' : 'neutral'}>{c.status}</Badge>
                                    </div>
                                    <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2, marginTop: 10 }}>
                                        <div style={{ height: '100%', background: '#16a34a', width: `${Math.min((c.links_acquired / c.target_links) * 100, 100)}%`, borderRadius: 2 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}

                {tab === 'prospects' && (
                    <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <select className="form-input" value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} style={{ width: 'auto' }}>
                                <option value="">All campaigns</option>
                                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            {['all', 'identified', 'outreach_sent', 'link_live', 'rejected'].map(s => (
                                <button key={s} className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : ''}`} onClick={() => setStatusFilter(s)} style={{ textTransform: 'capitalize', fontSize: '0.75rem' }}>{s.replace('_', ' ')}</button>
                            ))}
                        </div>
                        {prospects.length === 0 ? <EmptyState icon="🔍" title="No prospects" description="Add prospects manually or use AI to find opportunities" /> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {prospects.map((p, i) => (
                                    <div key={i} style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <span style={{ fontWeight: 700 }}>{p.domain}</span>
                                                {p.da_estimate && <span className="text-sm text-muted">DA ~{p.da_estimate}</span>}
                                                <Badge variant="neutral">{p.link_type.replace('_', ' ')}</Badge>
                                            </div>
                                            {p.contact_email && <div className="text-sm text-muted">{p.contact_email}</div>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <Badge variant={STATUS_VARIANT[p.status]}>{p.status.replace('_', ' ')}</Badge>
                                            <select className="form-input" value={p.status} onChange={e => updateStatus(p.id, e.target.value)} style={{ width: 'auto', fontSize: '0.75rem' }}>
                                                {['identified', 'researching', 'outreach_sent', 'followed_up', 'link_live', 'rejected', 'no_response'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {tab === 'add_prospect' && (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Add Prospect</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Domain *</label><input className="form-input" value={domain} onChange={e => setDomain(e.target.value)} placeholder="target-blog.com" /></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Contact Email</label><input className="form-input" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="editor@blog.com" /></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">DA Estimate</label><input className="form-input" type="number" value={daEst} onChange={e => setDaEst(e.target.value)} placeholder="35" /></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Link Type</label><select className="form-input" value={linkType} onChange={e => setLinkType(e.target.value)}><option value="guest_post">Guest Post</option><option value="resource_page">Resource Page</option><option value="broken_link">Broken Link</option><option value="skyscraper">Skyscraper</option><option value="mention">Mention</option><option value="niche_edit">Niche Edit</option></select></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Campaign</label><select className="form-input" value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)}><option value="">No campaign</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                        </div>
                        <button className="btn btn-primary" onClick={addProspect} disabled={saving}>{saving ? 'Adding...' : '+ Add Prospect'}</button>
                    </div>
                )}
            </main>
        </div>
    );
}
