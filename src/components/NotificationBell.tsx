'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useFetch from '@/hooks/useFetch';

interface Notification { id: string; type: string; title: string; message: string; link?: string; priority: string; is_read: boolean; created_at: string; }

const TYPE_ICONS: Record<string, string> = {
    rank_change: '📈', decay_alert: '⏰', commission: '💰', broken_link: '🔗',
    milestone: '🎯', system: '⚙️', competitor: '🏢', keyword_alert: '🔔'
};
const PRIORITY_COLOR: Record<string, string> = { high: '#dc2626', medium: '#d97706', low: '#6b7280' };

export default function NotificationBell() {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // SWR-powered polling: auto-revalidation every 60s, deduplication built-in
    const { data, mutate } = useFetch<{ notifications: Notification[]; unread_count: number }>(
        '/api/notifications?unread=0',
        { refreshInterval: 60000, revalidateOnFocus: false }
    );

    const notifications = data?.notifications || [];
    const unreadCount = data?.unread_count || 0;

    useEffect(() => {
        const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const markRead = useCallback(async (id?: string) => {
        try {
            await fetch('/api/notifications', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(id ? { action: 'mark_read', notification_id: id } : { action: 'mark_read', all: true }),
            });
            mutate();
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    }, [mutate]);

    const del = useCallback(async (id: string) => {
        try {
            await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', notification_id: id }) });
            mutate();
        } catch (err) {
            console.error('Failed to delete notification:', err);
        }
    }, [mutate]);

    const timeAgo = (date: string) => {
        const diff = Date.now() - new Date(date).getTime();
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    };

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                onClick={() => setOpen(!open)}
                aria-label="Notifications"
                aria-haspopup="true"
                aria-expanded={open}
                style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--text-muted)', fontSize: '1.1rem', display: 'flex', alignItems: 'center' }}
                title="Notifications"
            >
                🔔
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute', top: 0, right: 0, background: '#dc2626', color: '#fff',
                        borderRadius: '50%', width: 16, height: 16, fontSize: '0.6rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
            </button>

            {open && (
                <div style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: 8, width: 360, maxHeight: 480,
                    background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 1000, display: 'flex', flexDirection: 'column',
                    animation: 'fadeIn 0.2s ease forwards',
                }}>
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700 }}>Notifications {unreadCount > 0 && <span style={{ color: '#dc2626', fontSize: '0.8rem' }}>({unreadCount})</span>}</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {unreadCount > 0 && <button className="btn btn-sm" style={{ fontSize: '0.75rem' }} onClick={() => markRead()}>Mark all read</button>}
                            <Link href="/notifications" className="btn btn-sm" style={{ fontSize: '0.75rem' }} onClick={() => setOpen(false)}>View all</Link>
                        </div>
                    </div>

                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {notifications.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔔</div>
                                <div className="text-sm">No notifications</div>
                            </div>
                        ) : (
                            notifications.slice(0, 20).map((n) => (
                                <div key={n.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', background: n.is_read ? 'transparent' : 'rgba(var(--accent-primary-rgb, 99,102,241), 0.04)', cursor: 'pointer' }}
                                    onClick={() => { if (!n.is_read) markRead(n.id); if (n.link) { router.push(n.link); setOpen(false); } }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                        <span style={{ fontSize: '1rem', flexShrink: 0 }}>{TYPE_ICONS[n.type] || '📢'}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                                <span style={{ fontWeight: n.is_read ? 400 : 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>{timeAgo(n.created_at)}</span>
                                            </div>
                                            <div className="text-sm text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                            {!n.is_read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[n.priority] || '#6b7280', marginTop: 4 }} />}
                                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem', padding: 2 }} onClick={e => { e.stopPropagation(); del(n.id); }}>✕</button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
