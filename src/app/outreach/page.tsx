'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface Prospect {
    id: string;
    domain: string;
    contact_name: string | null;
    contact_email: string | null;
    domain_authority: number | null;
    niche: string | null;
    target_keyword: string | null;
    status: string;
    notes: string | null;
    placed_url: string | null;
    placed_at: string | null;
    created_at: string;
}

interface OutreachStats {
    prospect?: number; contacted?: number; replied?: number;
    placed?: number; rejected?: number; ghosted?: number;
    total?: number; reply_rate?: number; placement_rate?: number;
}

const STATUS_OPTIONS = ['prospect', 'contacted', 'replied', 'negotiating', 'placed', 'rejected', 'ghosted'];
const STATUS_COLORS: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
    prospect: 'neutral', contacted: 'info', replied: 'warning', negotiating: 'warning',
    placed: 'success', rejected: 'danger', ghosted: 'neutral',
};

export default function OutreachPage() {
    const toast = useToast();
    const [prospects, setProspects] = useState<Prospect[]>([]);
    const [stats, setStats] = useState<OutreachStats>({});
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all');
    const [showAdd, setShowAdd] = useState(false);
    const [showEmailGen, setShowEmailGen] = useState<Prospect | null>(null);
    const [generatedEmail, setGeneratedEmail] = useState<{ subject: string; body: string; follow_up_subject: string; follow_up_body: string } | null>(null);
    const [generatingEmail, setGeneratingEmail] = useState(false);
    const [yourSite, setYourSite] = useState('');
    const [yourName, setYourName] = useState('');
    const [newProspect, setNewProspect] = useState({ domain: '', contact_name: '', contact_email: '', domain_authority: '', niche: '', target_keyword: '', notes: '' });

    useEffect(() => { fetchAll(); }, [filterStatus]);

    const fetchAll = async () => {
        setLoading(true);
        const [prosRes, statsRes] = await Promise.all([
            fetch(`/api/outreach${filterStatus !== 'all' ? `?status=${filterStatus}` : ''}`),
            fetch('/api/outreach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stats' }) }),
        ]);
        const [prosData, statsData] = await Promise.all([prosRes.json(), statsRes.json()]);
        setProspects(prosData.prospects || []);
        setStats(statsData.stats || {});
        setLoading(false);
    };

    const addProspect = async () => {
        if (!newProspect.domain) { toast.warning('Domain required'); return; }
        const res = await fetch('/api/outreach', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create_prospect', ...newProspect, domain_authority: newProspect.domain_authority ? parseInt(newProspect.domain_authority) : undefined }),
        });
        if (res.ok) { toast.success('Prospect added'); setShowAdd(false); setNewProspect({ domain: '', contact_name: '', contact_email: '', domain_authority: '', niche: '', target_keyword: '', notes: '' }); fetchAll(); }
        else { const d = await res.json(); toast.error(d.error || 'Failed'); }
    };

    const updateStatus = async (id: string, status: string) => {
        await fetch('/api/outreach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_status', id, status }) });
        fetchAll();
    };

    const generateEmail = async (prospect: Prospect) => {
        setGeneratingEmail(true); setGeneratedEmail(null);
        const res = await fetch('/api/outreach', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate_email', domain: prospect.domain, contact_name: prospect.contact_name, niche: prospect.niche, target_keyword: prospect.target_keyword, your_site_url: yourSite, your_name: yourName }),
        });
        const data = await res.json();
        if (res.ok) { setGeneratedEmail(data.email); toast.success(`Email generated via ${data.provider}`); }
        else { toast.error(data.error || 'Failed'); }
        setGeneratingEmail(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Outreach CRM</h1>
                        <p className="page-description">Guest post & link building pipeline — AI-generated pitches, status tracking</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Prospect</button>
                </div>

                {/* Stats */}
                <div className="grid-4" style={{ gap: 16, marginBottom: 24 }}>
                    {[
                        { label: 'Total Prospects', value: stats.total || 0, icon: '🎯' },
                        { label: 'Links Placed', value: stats.placed || 0, icon: '✅' },
                        { label: 'Reply Rate', value: `${stats.reply_rate || 0}%`, icon: '📬' },
                        { label: 'Placement Rate', value: `${stats.placement_rate || 0}%`, icon: '📊' },
                    ].map((s, i) => (
                        <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{s.value}</div>
                            <div className="text-sm text-muted">{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Add Prospect */}
                {showAdd && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header">
                            <h3 className="card-title">Add Prospect</h3>
                            <button className="btn btn-sm" onClick={() => setShowAdd(false)}>✕</button>
                        </div>
                        <div className="grid-2" style={{ gap: 16 }}>
                            {[
                                { label: 'Domain *', field: 'domain', placeholder: 'example.com' },
                                { label: 'Contact Name', field: 'contact_name', placeholder: 'Jane Smith' },
                                { label: 'Contact Email', field: 'contact_email', placeholder: 'editor@example.com' },
                                { label: 'DA', field: 'domain_authority', placeholder: '45' },
                                { label: 'Niche', field: 'niche', placeholder: 'personal finance' },
                                { label: 'Target Keyword', field: 'target_keyword', placeholder: 'best budget apps' },
                            ].map(f => (
                                <div key={f.field} className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">{f.label}</label>
                                    <input className="form-input" placeholder={f.placeholder}
                                        value={(newProspect as Record<string, string>)[f.field]}
                                        onChange={e => setNewProspect(p => ({ ...p, [f.field]: e.target.value }))} />
                                </div>
                            ))}
                        </div>
                        <div className="form-group" style={{ marginTop: 12 }}>
                            <label className="form-label">Notes</label>
                            <textarea className="form-input" rows={2} value={newProspect.notes} onChange={e => setNewProspect(p => ({ ...p, notes: e.target.value }))} />
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={addProspect}>Add Prospect</button>
                    </div>
                )}

                {/* Email Generator Modal */}
                {showEmailGen && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header">
                            <h3 className="card-title">Generate Pitch Email — {showEmailGen.domain}</h3>
                            <button className="btn btn-sm" onClick={() => { setShowEmailGen(null); setGeneratedEmail(null); }}>✕</button>
                        </div>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Your Name</label>
                                <input className="form-input" value={yourName} onChange={e => setYourName(e.target.value)} placeholder="Your full name" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Your Site URL</label>
                                <input className="form-input" value={yourSite} onChange={e => setYourSite(e.target.value)} placeholder="https://yoursite.com" />
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={() => generateEmail(showEmailGen)} disabled={generatingEmail}>
                            {generatingEmail ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating...</> : 'Generate Email'}
                        </button>

                        {generatedEmail && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ marginBottom: 12 }}>
                                    <div className="form-label">Subject</div>
                                    <div style={{ background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 6, fontWeight: 600 }}>{generatedEmail.subject}</div>
                                </div>
                                <div style={{ marginBottom: 12 }}>
                                    <div className="form-label">Email Body</div>
                                    <textarea className="form-input" rows={8} defaultValue={generatedEmail.body} style={{ fontFamily: 'inherit' }} />
                                </div>
                                <div style={{ marginBottom: 12 }}>
                                    <div className="form-label">Follow-up Subject (5 days later)</div>
                                    <div style={{ background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 6 }}>{generatedEmail.follow_up_subject}</div>
                                </div>
                                <textarea className="form-input" rows={3} defaultValue={generatedEmail.follow_up_body} style={{ fontFamily: 'inherit' }} />
                                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                    <button className="btn btn-primary btn-sm" onClick={() => { navigator.clipboard.writeText(generatedEmail.body); toast.success('Copied'); }}>Copy Body</button>
                                    <button className="btn btn-sm btn-success" onClick={() => { updateStatus(showEmailGen.id, 'contacted'); toast.success('Marked as contacted'); }}>Mark as Contacted</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Filter + Table */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {['all', ...STATUS_OPTIONS].map(s => (
                        <button key={s} className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : ''}`}
                            onClick={() => setFilterStatus(s)}>
                            {s} {s !== 'all' && stats[s as keyof OutreachStats] !== undefined ? `(${stats[s as keyof OutreachStats]})` : ''}
                        </button>
                    ))}
                </div>

                <div className="card">
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40 }}>
                            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
                        </div>
                    ) : prospects.length === 0 ? (
                        <EmptyState icon="🎯" title="No Prospects" description="Add your first outreach prospect to start building links" />
                    ) : (
                        <DataTable
                            data={prospects as unknown as Record<string, unknown>[]}
                            searchKeys={['domain', 'contact_name', 'niche', 'target_keyword']}
                            pageSize={25}
                            columns={[
                                { key: 'domain', label: 'Domain', render: (r) => <span style={{ fontWeight: 700 }}>{String(r.domain)}</span> },
                                { key: 'domain_authority', label: 'DA', render: (r) => r.domain_authority ? <span className="font-mono">{Number(r.domain_authority)}</span> : <span className="text-muted">—</span> },
                                { key: 'niche', label: 'Niche', render: (r) => <span className="text-sm">{String(r.niche || '—')}</span> },
                                { key: 'target_keyword', label: 'Keyword', render: (r) => <span className="text-sm">{String(r.target_keyword || '—')}</span> },
                                { key: 'contact_email', label: 'Contact', render: (r) => r.contact_email ? <span className="text-sm">{String(r.contact_name || '')} {String(r.contact_email)}</span> : <span className="text-muted text-sm">No contact</span> },
                                {
                                    key: 'status', label: 'Status', render: (r) => (
                                        <select className="form-select" style={{ padding: '3px 8px', fontSize: '0.8rem', minWidth: 120 }}
                                            value={String(r.status)}
                                            onChange={e => updateStatus(String(r.id), e.target.value)}>
                                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    )
                                },
                                {
                                    key: 'actions', label: '', render: (r) => (
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn btn-sm" onClick={() => setShowEmailGen(r as unknown as Prospect)}>Email</button>
                                            <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/outreach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: r.id }) }); fetchAll(); }}>Del</button>
                                        </div>
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
