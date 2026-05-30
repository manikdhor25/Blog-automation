'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

// === Drip Builder types ===
interface DripEmail { day: number; subject: string; preview_text: string; body: string; cta_text: string; type: string; }
interface Sequence { sequence_name: string; emails: DripEmail[]; }
interface SavedSeq { id: string; sequence_name: string; niche: string; email_count: number; goal: string; created_at: string; }

// === Email Rules types ===
interface EmailRule {
    id: string;
    name: string;
    trigger: { type: string; value?: string | number };
    conditions: Array<{ field: string; operator: string; value: string }>;
    actions: Array<{ type: string; template_id?: string; delay_hours?: number; tag?: string }>;
    is_active: boolean;
    stats: { triggered: number; emails_sent: number; conversions: number };
    created_at: string;
}
interface Template { id: string; name: string; subject: string; }

// === Constants ===
const TYPE_COLORS: Record<string, string> = { value: '#2563eb', story: '#7c3aed', sale: '#16a34a', urgency: '#dc2626', objection: '#d97706', case_study: '#0891b2' };
const TRIGGER_ICONS: Record<string, string> = {
    subscriber_joins: '👤', tag_added: '🏷️', post_published: '📄', purchase: '💰', link_clicked: '🔗', date_based: '📅', score_threshold: '📊'
};

export default function DripBuilderPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('generate');

    // === Drip Builder state ===
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<Sequence | null>(null);
    const [saved, setSaved] = useState<SavedSeq[]>([]);
    const [selectedEmail, setSelectedEmail] = useState(0);
    const [form, setForm] = useState({ sequence_name: '', niche: '', lead_magnet_topic: '', affiliate_product: '', affiliate_url: '', email_count: '5', goal: 'affiliate_sale', sender_name: '' });

    // === Email Rules state ===
    const [rules, setRules] = useState<EmailRule[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [rulesSubTab, setRulesSubTab] = useState<'rules' | 'create'>('rules');
    const [ruleName, setRuleName] = useState('');
    const [triggerType, setTriggerType] = useState('subscriber_joins');
    const [triggerValue, setTriggerValue] = useState('');
    const [ruleActions, setRuleActions] = useState<Array<{ type: string; template_id: string; delay_hours: number; tag: string }>>([{ type: 'send_email', template_id: '', delay_hours: 0, tag: '' }]);
    const [ruleSaving, setRuleSaving] = useState(false);

    // === Drip Builder fetch ===
    useEffect(() => { if (activeTab === 'saved') fetch('/api/drip-builder').then(r => r.json()).then(d => setSaved(d.sequences || [])); }, [activeTab]);

    const generate = async () => {
        if (!form.niche) { toast.warning('Niche required'); return; }
        setGenerating(true); setResult(null);
        const res = await fetch('/api/drip-builder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', ...form, email_count: parseInt(form.email_count), affiliate_url: form.affiliate_url || undefined }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setGenerating(false); return; }
        setResult(data.sequence);
        setSelectedEmail(0);
        toast.success(`${data.sequence.emails?.length} emails generated via ${data.provider}`);
        setGenerating(false);
    };

    const exportSeq = async (id: string) => {
        const res = await fetch('/api/drip-builder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'export', id }) });
        const data = await res.json();
        navigator.clipboard.writeText(data.exported);
        toast.success('Exported to clipboard');
    };

    // === Email Rules fetch ===
    useEffect(() => {
        if (activeTab === 'automation') { loadRules(); loadTemplates(); }
    }, [activeTab]);

    const loadRules = async () => {
        const res = await fetch('/api/email-rules');
        const data = await res.json();
        setRules(data.rules || []);
    };

    const loadTemplates = async () => {
        const res = await fetch('/api/email-rules?templates=1');
        const data = await res.json();
        setTemplates(data.templates || []);
    };

    const createRule = async () => {
        if (!ruleName || !triggerType) { toast.warning('Name and trigger required'); return; }
        setRuleSaving(true);
        const res = await fetch('/api/email-rules', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create_rule', name: ruleName, trigger: { type: triggerType, value: triggerValue || undefined },
                conditions: [], actions: ruleActions,
            }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setRuleSaving(false); return; }
        toast.success('Rule created');
        setRuleName(''); setTriggerValue(''); setRuleActions([{ type: 'send_email', template_id: '', delay_hours: 0, tag: '' }]);
        loadRules(); setRulesSubTab('rules');
        setRuleSaving(false);
    };

    const toggleRule = async (id: string, active: boolean) => {
        await fetch('/api/email-rules', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'toggle', rule_id: id, active }),
        });
        toast.success(active ? 'Rule enabled' : 'Rule paused');
        loadRules();
    };

    const addAction = () => setRuleActions(prev => [...prev, { type: 'send_email', template_id: '', delay_hours: 0, tag: '' }]);
    const removeAction = (i: number) => setRuleActions(prev => prev.filter((_, idx) => idx !== i));

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Drip Sequence Builder</h1>
                        <p className="page-description">AI-generate email nurture sequences and automation rules for affiliate promotion</p>
                    </div>
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'generate' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('generate')}>📧 Generate</button>
                    <button className={`btn ${activeTab === 'saved' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('saved')}>💾 Saved ({saved.length})</button>
                    <button className={`btn ${activeTab === 'automation' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('automation')}>⚡ Automation Rules</button>
                </div>

                {/* ===================== GENERATE TAB ===================== */}
                {activeTab === 'generate' && (
                    <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                        <div className="card">
                            <h3 className="card-title" style={{ marginBottom: 16 }}>Sequence Settings</h3>
                            <div className="grid-2" style={{ gap: 10 }}>
                                {[['Niche *', 'niche', 'keto diet'], ['Lead Magnet Topic', 'lead_magnet_topic', '5-day keto meal plan'], ['Affiliate Product', 'affiliate_product', 'Perfect Keto supplements'], ['Sender Name', 'sender_name', 'Sarah'], ['Sequence Name', 'sequence_name', 'Keto Starter Sequence']].map(([l, k, ph]) => (
                                    <div key={k} className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">{l}</label>
                                        <input className="form-input" placeholder={ph} value={(form as Record<string, string>)[k]} onChange={e => setForm(prev => ({ ...prev, [k]: e.target.value }))} />
                                    </div>
                                ))}
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Affiliate URL</label>
                                    <input className="form-input" value={form.affiliate_url} onChange={e => setForm(f => ({ ...f, affiliate_url: e.target.value }))} placeholder="https://..." />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Number of Emails</label>
                                    <select className="form-select" value={form.email_count} onChange={e => setForm(f => ({ ...f, email_count: e.target.value }))}>
                                        {[3, 4, 5, 6, 7, 8, 10].map(n => <option key={n} value={n}>{n} emails</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Goal</label>
                                    <select className="form-select" value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}>
                                        {['affiliate_sale', 'product_launch', 'course_promo', 'service_upsell', 'nurture'].map(g => <option key={g} value={g}>{g.replace('_', ' ')}</option>)}
                                    </select>
                                </div>
                            </div>
                            <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={generate} disabled={generating}>{generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating sequence...</> : '📧 Generate Email Sequence'}</button>
                        </div>

                        <div>
                            {result ? (
                                <div className="card animate-in">
                                    <div style={{ fontWeight: 700, marginBottom: 12 }}>{result.sequence_name} — {result.emails?.length} emails</div>
                                    <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                                        {result.emails?.map((e, i) => (
                                            <button key={i} className={`btn btn-sm ${selectedEmail === i ? 'btn-primary' : ''}`} style={{ borderLeft: `3px solid ${TYPE_COLORS[e.type] || '#6b7280'}` }} onClick={() => setSelectedEmail(i)}>
                                                Day {e.day}
                                            </button>
                                        ))}
                                    </div>
                                    {result.emails?.[selectedEmail] && (() => {
                                        const email = result.emails[selectedEmail];
                                        return (
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                                    <Badge variant="neutral">{email.type}</Badge>
                                                    <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`); toast.success('Copied'); }}>Copy Email</button>
                                                </div>
                                                <div style={{ marginBottom: 8 }}><div className="form-label">Subject Line</div><div style={{ fontWeight: 700, background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 6 }}>{email.subject}</div></div>
                                                <div style={{ marginBottom: 8 }}><div className="form-label">Preview Text</div><div className="text-sm text-muted">{email.preview_text}</div></div>
                                                <div style={{ marginBottom: 8 }}><div className="form-label">Body</div><textarea className="form-input" rows={10} readOnly value={email.body} style={{ fontFamily: 'inherit', fontSize: '0.88rem' }} /></div>
                                                <div style={{ background: '#f0fdf4', padding: '8px 12px', borderRadius: 6 }}><div className="text-sm text-muted">CTA: <strong>{email.cta_text}</strong></div></div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : generating ? (
                                <div className="card" style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }} /><div style={{ fontWeight: 600 }}>Writing {form.email_count} emails...</div></div>
                            ) : (
                                <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: '3rem', marginBottom: 16 }}>📧</div><div style={{ fontWeight: 600 }}>Email sequence appears here</div></div>
                            )}
                        </div>
                    </div>
                )}

                {/* ===================== SAVED TAB ===================== */}
                {activeTab === 'saved' && (
                    <div className="card">
                        {saved.length === 0 ? <EmptyState icon="📧" title="No Sequences" description="Generate your first drip sequence" />
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {saved.map(s => (
                                    <div key={s.id} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div><div style={{ fontWeight: 700 }}>{s.sequence_name}</div><div className="text-sm text-muted">{s.niche} · {s.email_count} emails · {s.goal.replace('_', ' ')} · {new Date(s.created_at).toLocaleDateString()}</div></div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-sm" onClick={() => exportSeq(s.id)}>Export</button>
                                            <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/drip-builder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: s.id }) }); setSaved(prev => prev.filter(x => x.id !== s.id)); }}>Del</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        }
                    </div>
                )}

                {/* ===================== AUTOMATION RULES TAB ===================== */}
                {activeTab === 'automation' && (
                    <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            {(['rules', 'create'] as const).map(t => (
                                <button key={t} className={`btn btn-sm ${rulesSubTab === t ? 'btn-primary' : ''}`} onClick={() => setRulesSubTab(t)}>
                                    {t === 'create' ? '+ New Rule' : 'Rules'}
                                </button>
                            ))}
                        </div>

                        {rulesSubTab === 'create' && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 16 }}>New Automation Rule</h3>

                                <div className="form-group">
                                    <label className="form-label">Rule Name *</label>
                                    <input className="form-input" value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="Welcome sequence for new subscribers" />
                                </div>

                                {/* Trigger */}
                                <div style={{ padding: '14px', background: '#eff6ff', borderRadius: 8, marginBottom: 16 }}>
                                    <div style={{ fontWeight: 700, marginBottom: 10, color: '#1e40af' }}>⚡ Trigger</div>
                                    <div className="grid-2" style={{ gap: 10 }}>
                                        <div>
                                            <label className="form-label">When...</label>
                                            <select className="form-input" value={triggerType} onChange={e => setTriggerType(e.target.value)}>
                                                {Object.entries(TRIGGER_ICONS).map(([k, icon]) => (
                                                    <option key={k} value={k}>{icon} {k.replace(/_/g, ' ')}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {['tag_added', 'link_clicked', 'score_threshold'].includes(triggerType) && (
                                            <div>
                                                <label className="form-label">{triggerType === 'score_threshold' ? 'Threshold value' : 'Value'}</label>
                                                <input className="form-input" value={triggerValue} onChange={e => setTriggerValue(e.target.value)} placeholder={triggerType === 'tag_added' ? 'e.g. buyer' : triggerType === 'score_threshold' ? '80' : 'URL contains...'} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div style={{ padding: '14px', background: '#f0fdf4', borderRadius: 8, marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <div style={{ fontWeight: 700, color: '#166534' }}>🎯 Actions</div>
                                        <button className="btn btn-sm" onClick={addAction}>+ Add Action</button>
                                    </div>
                                    {ruleActions.map((action, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                            <select className="form-input" value={action.type} onChange={e => setRuleActions(prev => prev.map((a, idx) => idx === i ? { ...a, type: e.target.value } : a))} style={{ flex: '0 0 140px' }}>
                                                <option value="send_email">📧 Send Email</option>
                                                <option value="add_tag">🏷️ Add Tag</option>
                                                <option value="remove_tag">❌ Remove Tag</option>
                                                <option value="wait">⏱️ Wait</option>
                                                <option value="notify_me">🔔 Notify Me</option>
                                            </select>
                                            {action.type === 'send_email' && (
                                                <select className="form-input" value={action.template_id} onChange={e => setRuleActions(prev => prev.map((a, idx) => idx === i ? { ...a, template_id: e.target.value } : a))} style={{ flex: 1 }}>
                                                    <option value="">Select template...</option>
                                                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                </select>
                                            )}
                                            {['add_tag', 'remove_tag'].includes(action.type) && (
                                                <input className="form-input" value={action.tag} onChange={e => setRuleActions(prev => prev.map((a, idx) => idx === i ? { ...a, tag: e.target.value } : a))} placeholder="Tag name" style={{ flex: 1 }} />
                                            )}
                                            {action.type === 'wait' && (
                                                <input className="form-input" type="number" value={action.delay_hours} onChange={e => setRuleActions(prev => prev.map((a, idx) => idx === i ? { ...a, delay_hours: parseInt(e.target.value) } : a))} placeholder="Hours to wait" style={{ flex: 1 }} />
                                            )}
                                            {ruleActions.length > 1 && <button className="btn btn-sm" onClick={() => removeAction(i)} style={{ color: '#dc2626' }}>✕</button>}
                                        </div>
                                    ))}
                                </div>

                                <button className="btn btn-primary" onClick={createRule} disabled={ruleSaving}>
                                    {ruleSaving ? 'Saving...' : '💾 Save Rule'}
                                </button>
                            </div>
                        )}

                        {rulesSubTab === 'rules' && (
                            <>
                                {rules.length === 0 ? (
                                    <EmptyState icon="📧" title="No automation rules" description="Create rules to auto-send emails based on triggers like new subscribers, tags, or purchases" />
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {rules.map((rule, i) => (
                                            <div key={i} className="card" style={{ padding: '14px', opacity: rule.is_active ? 1 : 0.6 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                                            <span style={{ fontWeight: 700 }}>{rule.name}</span>
                                                            <Badge variant={rule.is_active ? 'success' : 'neutral'}>{rule.is_active ? 'Active' : 'Paused'}</Badge>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                                                            <span style={{ fontSize: '1rem' }}>{TRIGGER_ICONS[rule.trigger.type] || '⚡'}</span>
                                                            <span className="text-sm text-muted">{rule.trigger.type.replace(/_/g, ' ')}</span>
                                                            {rule.trigger.value && <span className="text-sm text-muted">: {rule.trigger.value}</span>}
                                                            <span className="text-sm text-muted">→</span>
                                                            <span className="text-sm text-muted">{rule.actions.length} action{rule.actions.length !== 1 ? 's' : ''}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 16 }}>
                                                            <span className="text-sm text-muted">Triggered: <strong>{rule.stats.triggered}</strong></span>
                                                            <span className="text-sm text-muted">Sent: <strong>{rule.stats.emails_sent}</strong></span>
                                                            <span className="text-sm text-muted">Conversions: <strong>{rule.stats.conversions}</strong></span>
                                                        </div>
                                                    </div>
                                                    <button className="btn btn-sm" onClick={() => toggleRule(rule.id, !rule.is_active)}>
                                                        {rule.is_active ? '⏸ Pause' : '▶ Enable'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
