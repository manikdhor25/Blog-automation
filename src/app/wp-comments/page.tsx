'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface WpComment { id: number; post: number; parent: number; author_name: string; author_email: string; date: string; content: { rendered: string }; status: string; link: string; _embedded?: { up?: Array<{ title: { rendered: string } }> } }

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = { hold: 'warning', approve: 'success', spam: 'danger', trash: 'neutral' };

export default function WpCommentsPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [comments, setComments] = useState<WpComment[]>([]);
    const [status, setStatus] = useState('hold');
    const [loading, setLoading] = useState(false);
    const [replyingTo, setReplyingTo] = useState<number | null>(null);
    const [replyText, setReplyText] = useState('');
    const [generatingReply, setGeneratingReply] = useState(false);
    const [moderating, setModerating] = useState<number | null>(null);

    useEffect(() => { loadSites(); }, []);

    const loadSites = async () => {
        const res = await fetch('/api/sites');
        const data = await res.json();
        setSites(data.sites || []);
    };

    const loadComments = async () => {
        if (!selectedSite) return;
        setLoading(true);
        const res = await fetch('/api/wp-comments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch', site_id: selectedSite, status }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'WP not connected'); setLoading(false); return; }
        setComments(data.comments || []);
        setLoading(false);
    };

    useEffect(() => { if (selectedSite) loadComments(); }, [selectedSite, status]);

    const moderate = async (commentId: number, newStatus: string) => {
        setModerating(commentId);
        const res = await fetch('/api/wp-comments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'moderate', site_id: selectedSite, comment_id: commentId, new_status: newStatus }),
        });
        if (res.ok) {
            toast.success(`Comment ${newStatus === 'approve' ? 'approved' : newStatus}`);
            setComments(prev => prev.filter(c => c.id !== commentId));
        }
        setModerating(null);
    };

    const generateReply = async (comment: WpComment) => {
        const postTitle = comment._embedded?.up?.[0]?.title?.rendered || 'blog post';
        const commentText = comment.content.rendered.replace(/<[^>]+>/g, '').trim();
        setGeneratingReply(true);
        const res = await fetch('/api/wp-comments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate_reply', comment_text: commentText, post_title: postTitle }),
        });
        const data = await res.json();
        if (res.ok) { setReplyText(data.reply); toast.success('Reply generated'); }
        setGeneratingReply(false);
    };

    const sendReply = async (comment: WpComment) => {
        if (!replyText.trim()) { toast.warning('Enter reply text'); return; }
        const res = await fetch('/api/wp-comments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reply', site_id: selectedSite, comment_id: comment.id, post_id: comment.post, reply_content: replyText }),
        });
        if (res.ok) {
            toast.success('Reply sent!');
            setReplyingTo(null); setReplyText('');
            loadComments();
        }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Comment Manager</h1>
                        <p className="page-description">Moderate WordPress comments, generate AI replies, approve/spam/trash from dashboard</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <select className="form-input" value={selectedSite} onChange={e => setSelectedSite(e.target.value)} style={{ flex: 1 }}>
                            <option value="">Select WordPress site...</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {['hold', 'approve', 'all'].map(s => (
                                <button key={s} className={`btn btn-sm ${status === s ? 'btn-primary' : ''}`} onClick={() => setStatus(s)} style={{ textTransform: 'capitalize' }}>{s}</button>
                            ))}
                        </div>
                        <button className="btn btn-sm" onClick={loadComments} disabled={loading || !selectedSite}>{loading ? '...' : '🔄'}</button>
                    </div>
                </div>

                {!selectedSite && <EmptyState icon="💬" title="Select a WordPress site" description="Connect a WP site in Sites page first, then moderate comments here" />}

                {selectedSite && comments.length === 0 && !loading && (
                    <EmptyState icon="💬" title={`No ${status} comments`} description="All caught up!" />
                )}

                {loading && <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>}

                {comments.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {comments.map((comment, i) => {
                            const postTitle = comment._embedded?.up?.[0]?.title?.rendered || `Post #${comment.post}`;
                            const commentText = comment.content.rendered.replace(/<[^>]+>/g, '').trim();
                            return (
                                <div key={i} className="card" style={{ padding: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                        <div>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                                                <span style={{ fontWeight: 700 }}>{comment.author_name}</span>
                                                <span className="text-sm text-muted">{comment.author_email}</span>
                                                <Badge variant={STATUS_VARIANT[comment.status]}>{comment.status}</Badge>
                                            </div>
                                            <div className="text-sm text-muted">On: <strong>{postTitle}</strong> · {new Date(comment.date).toLocaleDateString()}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {comment.status !== 'approve' && <button className="btn btn-sm" style={{ color: '#16a34a' }} onClick={() => moderate(comment.id, 'approve')} disabled={moderating === comment.id}>✅</button>}
                                            {comment.status !== 'spam' && <button className="btn btn-sm" style={{ color: '#d97706' }} onClick={() => moderate(comment.id, 'spam')} disabled={moderating === comment.id}>🚫</button>}
                                            <button className="btn btn-sm" style={{ color: '#dc2626' }} onClick={() => moderate(comment.id, 'trash')} disabled={moderating === comment.id}>🗑</button>
                                        </div>
                                    </div>

                                    <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 8 }}>
                                        <div className="text-sm">{commentText.substring(0, 300)}{commentText.length > 300 ? '...' : ''}</div>
                                    </div>

                                    {replyingTo === comment.id ? (
                                        <div>
                                            <textarea className="form-input" rows={3} value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Write your reply..." style={{ marginBottom: 8 }} />
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn-sm btn-primary" onClick={() => sendReply(comment)}>Send Reply</button>
                                                <button className="btn btn-sm" onClick={() => generateReply(comment)} disabled={generatingReply}>{generatingReply ? 'Generating...' : '🤖 AI Reply'}</button>
                                                <button className="btn btn-sm" onClick={() => { setReplyingTo(null); setReplyText(''); }}>Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button className="btn btn-sm" onClick={() => setReplyingTo(comment.id)}>💬 Reply</button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
