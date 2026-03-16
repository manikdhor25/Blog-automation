'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface TeamMember {
    id: string; email: string; role: string; status: string; created_at: string;
}

const ROLES = [
    { value: 'admin', label: 'Admin', desc: 'Full access to all features', icon: '👑' },
    { value: 'editor', label: 'Editor', desc: 'Create, edit, and publish content', icon: '✏️' },
    { value: 'writer', label: 'Writer', desc: 'Create and edit drafts only', icon: '📝' },
    { value: 'viewer', label: 'Viewer', desc: 'Read-only access to all data', icon: '👁️' },
];

export default function TeamPage() {
    const toast = useToast();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('writer');
    const [saving, setSaving] = useState(false);

    const fetchMembers = async () => {
        try {
            const res = await fetch('/api/team');
            const data = await res.json();
            setMembers(data.members || []);
        } catch { /* silent */ }
        setLoading(false);
    };

    useEffect(() => { fetchMembers(); }, []);

    const handleInvite = async () => {
        if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
            toast.warning('Enter a valid email'); return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/team', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'invite', email: inviteEmail, role: inviteRole }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success(`Invited ${inviteEmail} as ${inviteRole}`);
            setInviteEmail('');
            setShowInvite(false);
            fetchMembers();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Invite failed');
        } finally {
            setSaving(false);
        }
    };

    const handleRoleChange = async (memberId: string, newRole: string) => {
        try {
            const res = await fetch('/api/team', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update_role', member_id: memberId, role: newRole }),
            });
            if (!res.ok) throw new Error('Update failed');
            toast.success('Role updated');
            fetchMembers();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Update failed');
        }
    };

    const handleRemove = async (id: string, email: string) => {
        if (!confirm(`Remove ${email} from the team?`)) return;
        try {
            await fetch(`/api/team?id=${id}`, { method: 'DELETE' });
            toast.success('Member removed');
            fetchMembers();
        } catch {
            toast.error('Remove failed');
        }
    };

    const roleBadge = (role: string) => {
        const variants: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
            owner: 'success', admin: 'info', editor: 'warning', writer: 'neutral', viewer: 'neutral',
        };
        return variants[role] || 'neutral';
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Team & Collaboration</h1>
                        <p className="page-description">Manage team members, roles, and permissions</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowInvite(!showInvite)}>
                        {showInvite ? '✕ Cancel' : '+ Invite Member'}
                    </button>
                </div>

                {showInvite && (
                    <div className="card" style={{ marginBottom: 24 }}>
                        <h3 style={{ margin: '0 0 16px' }}>📨 Invite Team Member</h3>
                        <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Email</label>
                                <input className="form-input" type="email" placeholder="colleague@company.com"
                                    value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Role</label>
                                <select className="form-select" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                                <button className="btn btn-primary" onClick={handleInvite} disabled={saving} style={{ width: '100%' }}>
                                    {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Sending...</> : '📨 Send Invite'}
                                </button>
                            </div>
                        </div>
                        <div className="grid-4" style={{ gap: 8 }}>
                            {ROLES.map(r => (
                                <div key={r.value} style={{
                                    padding: '8px 12px', borderRadius: 8,
                                    border: inviteRole === r.value ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                                    cursor: 'pointer', background: inviteRole === r.value ? 'rgba(99,102,241,0.08)' : 'transparent',
                                }} onClick={() => setInviteRole(r.value)}>
                                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.icon} {r.label}</div>
                                    <div className="text-sm text-muted">{r.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="card">
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /> Loading...</div>
                    ) : members.length === 0 ? (
                        <EmptyState icon="👥" title="No Team Members" description="Invite colleagues to collaborate on content." />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {members.map(m => (
                                <div key={m.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                                    borderRadius: 10, border: '1px solid var(--border-subtle)',
                                }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%',
                                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary, #7c3aed))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', fontWeight: 700, fontSize: '1rem',
                                    }}>
                                        {m.email?.[0]?.toUpperCase() || '?'}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600 }}>{m.email}</div>
                                        <div className="text-sm text-muted">
                                            Joined {new Date(m.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <Badge variant={m.status === 'active' ? 'success' : 'warning'}>
                                        {m.status?.toUpperCase()}
                                    </Badge>
                                    {m.role === 'owner' ? (
                                        <Badge variant="success">👑 OWNER</Badge>
                                    ) : (
                                        <select className="form-select" style={{ width: 120 }} value={m.role}
                                            onChange={e => handleRoleChange(m.id, e.target.value)}>
                                            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                        </select>
                                    )}
                                    {m.role !== 'owner' && (
                                        <button className="btn btn-secondary btn-sm"
                                            onClick={() => handleRemove(m.id, m.email)}
                                            style={{ color: 'var(--accent-danger)' }}>🗑️</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
