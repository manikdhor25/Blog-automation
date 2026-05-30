'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface Writer { id: string; name: string; email: string; rate_per_word: number; rate_per_post: number; posts_completed: number; is_active: boolean; specialties: string[]; }
interface Task { id: string; writer_id: string | null; task_type: string; title: string; keyword: string; deadline: string | null; word_count_target: number; priority: string; status: string; writers?: { name: string; email: string }; created_at: string; }
interface Summary { total: number; assigned: number; in_progress: number; review: number; published: number; overdue: number; }

const TASK_STATUSES = ['assigned', 'in_progress', 'review', 'approved', 'published', 'rejected'];
const STATUS_COLORS: Record<string, 'danger' | 'warning' | 'info' | 'success' | 'neutral'> = { assigned: 'neutral', in_progress: 'info', review: 'warning', approved: 'warning', published: 'success', rejected: 'danger' };
const PRIORITY_COLORS: Record<string, string> = { urgent: '#dc2626', high: '#ea580c', normal: '#2563eb', low: '#6b7280' };

export default function TeamManagerPage() {
    const toast = useToast();
    const [writers, setWriters] = useState<Writer[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [activeTab, setActiveTab] = useState<'tasks' | 'writers'>('tasks');
    const [showAddWriter, setShowAddWriter] = useState(false);
    const [showAddTask, setShowAddTask] = useState(false);
    const [filterStatus, setFilterStatus] = useState('all');
    const [writerForm, setWriterForm] = useState({ name: '', email: '', rate_per_word: '', rate_per_post: '' });
    const [taskForm, setTaskForm] = useState({ writer_id: '', task_type: 'write', title: '', keyword: '', deadline: '', word_count_target: '', priority: 'normal' });

    useEffect(() => { fetchAll(); }, [filterStatus]);

    const fetchAll = async () => {
        const [wRes, tRes] = await Promise.all([
            fetch('/api/team-manager', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list_writers' }) }),
            fetch(`/api/team-manager${filterStatus !== 'all' ? `?status=${filterStatus}` : ''}`),
        ]);
        const [wData, tData] = await Promise.all([wRes.json(), tRes.json()]);
        setWriters(wData.writers || []);
        setTasks(tData.tasks || []);
        setSummary(tData.summary || null);
    };

    const addWriter = async () => {
        if (!writerForm.name || !writerForm.email) { toast.warning('Name and email required'); return; }
        const res = await fetch('/api/team-manager', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_writer', ...writerForm, rate_per_word: parseFloat(writerForm.rate_per_word) || 0, rate_per_post: parseFloat(writerForm.rate_per_post) || 0 }) });
        if (res.ok) { toast.success('Writer added'); setShowAddWriter(false); fetchAll(); }
    };

    const addTask = async () => {
        if (!taskForm.title) { toast.warning('Title required'); return; }
        const res = await fetch('/api/team-manager', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_task', ...taskForm, word_count_target: parseInt(taskForm.word_count_target) || 0, writer_id: taskForm.writer_id || undefined }) });
        if (res.ok) { toast.success('Task created'); setShowAddTask(false); fetchAll(); }
    };

    const updateStatus = async (id: string, status: string) => {
        await fetch('/api/team-manager', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_task', id, status }) });
        fetchAll();
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Team Manager</h1>
                        <p className="page-description">Assign content tasks to writers, track deadlines, measure output quality</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" onClick={() => setShowAddWriter(true)}>+ Writer</button>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAddTask(true)}>+ Task</button>
                    </div>
                </div>

                {summary && (
                    <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                        {[{ label: 'Total Tasks', value: summary.total, icon: '📋' }, { label: 'In Progress', value: summary.in_progress, icon: '✏️' }, { label: 'For Review', value: summary.review, icon: '👀' }, { label: 'Overdue', value: summary.overdue, icon: summary.overdue > 0 ? '🚨' : '✅' }].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '16px' }}>
                                <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {(showAddWriter || showAddTask) && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        {showAddWriter ? (
                            <>
                                <div className="card-header"><h3 className="card-title">Add Writer</h3><button className="btn btn-sm" onClick={() => setShowAddWriter(false)}>✕</button></div>
                                <div className="grid-2" style={{ gap: 12 }}>
                                    {[['Name *', 'name', 'Jane Smith'], ['Email *', 'email', 'jane@email.com'], ['Rate/Word ($)', 'rate_per_word', '0.05'], ['Rate/Post ($)', 'rate_per_post', '50']].map(([label, key, ph]) => (
                                        <div key={key} className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">{label}</label>
                                            <input className="form-input" placeholder={ph} value={(writerForm as Record<string, string>)[key]} onChange={e => setWriterForm(f => ({ ...f, [key]: e.target.value }))} />
                                        </div>
                                    ))}
                                </div>
                                <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={addWriter}>Add Writer</button>
                            </>
                        ) : (
                            <>
                                <div className="card-header"><h3 className="card-title">Create Task</h3><button className="btn btn-sm" onClick={() => setShowAddTask(false)}>✕</button></div>
                                <div className="grid-3" style={{ gap: 12 }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Assign To</label>
                                        <select className="form-select" value={taskForm.writer_id} onChange={e => setTaskForm(f => ({ ...f, writer_id: e.target.value }))}>
                                            <option value="">Unassigned</option>
                                            {writers.filter(w => w.is_active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Task Type</label>
                                        <select className="form-select" value={taskForm.task_type} onChange={e => setTaskForm(f => ({ ...f, task_type: e.target.value }))}>
                                            {['write', 'edit', 'optimize', 'research', 'publish'].map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Priority</label>
                                        <select className="form-select" value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))}>
                                            {['urgent', 'high', 'normal', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                        <label className="form-label">Title *</label>
                                        <input className="form-input" value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} placeholder="Write 2000-word review of..." />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Target Keyword</label>
                                        <input className="form-input" value={taskForm.keyword} onChange={e => setTaskForm(f => ({ ...f, keyword: e.target.value }))} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Deadline</label>
                                        <input type="date" className="form-input" value={taskForm.deadline} onChange={e => setTaskForm(f => ({ ...f, deadline: e.target.value }))} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Word Count Target</label>
                                        <input type="number" className="form-input" value={taskForm.word_count_target} onChange={e => setTaskForm(f => ({ ...f, word_count_target: e.target.value }))} />
                                    </div>
                                </div>
                                <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={addTask}>Create Task</button>
                            </>
                        )}
                    </div>
                )}

                <div className="tabs" style={{ marginBottom: 12 }}>
                    <button className={`tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>Tasks ({tasks.length})</button>
                    <button className={`tab ${activeTab === 'writers' ? 'active' : ''}`} onClick={() => setActiveTab('writers')}>Writers ({writers.length})</button>
                </div>

                {activeTab === 'tasks' && (
                    <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                            {['all', ...TASK_STATUSES].map(s => <button key={s} className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : ''}`} onClick={() => setFilterStatus(s)}>{s}</button>)}
                        </div>
                        <div className="card">
                            {tasks.length === 0 ? <EmptyState icon="📋" title="No Tasks" description="Create your first task to assign content work" />
                                : <DataTable data={tasks as unknown as Record<string, unknown>[]} searchKeys={['title', 'keyword']} pageSize={25} columns={[
                                    { key: 'title', label: 'Task', render: (r) => <div><div style={{ fontWeight: 700, borderLeft: `3px solid ${PRIORITY_COLORS[String(r.priority)]}`, paddingLeft: 8 }}>{String(r.title).substring(0, 60)}</div><div className="text-sm text-muted">{String(r.keyword || '')}</div></div> },
                                    { key: 'writer', label: 'Assigned', render: (r) => { const w = r.writers as { name: string } | undefined; return w ? <span className="text-sm">{w.name}</span> : <span className="text-muted text-sm">Unassigned</span>; } },
                                    { key: 'task_type', label: 'Type', render: (r) => <Badge variant="neutral">{String(r.task_type)}</Badge> },
                                    { key: 'deadline', label: 'Due', render: (r) => { if (!r.deadline) return <span className="text-muted">—</span>; const days = Math.ceil((new Date(String(r.deadline)).getTime() - Date.now()) / (1000 * 60 * 60 * 24)); return <span style={{ color: days < 0 ? '#dc2626' : days <= 2 ? '#d97706' : undefined, fontWeight: days < 0 ? 700 : 400 }}>{days < 0 ? `${-days}d overdue` : `${days}d left`}</span>; } },
                                    { key: 'status', label: 'Status', render: (r) => <select className="form-select" style={{ padding: '3px 6px', fontSize: '0.8rem', minWidth: 110 }} value={String(r.status)} onChange={e => updateStatus(String(r.id), e.target.value)}>{TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select> },
                                    { key: 'actions', label: '', render: (r) => <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/team-manager', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_task', id: r.id }) }); fetchAll(); }}>Del</button> },
                                ]} />
                            }
                        </div>
                    </>
                )}

                {activeTab === 'writers' && (
                    <div className="grid-3" style={{ gap: 12 }}>
                        {writers.length === 0 ? <div className="card" style={{ gridColumn: '1/-1' }}><EmptyState icon="👤" title="No Writers" description="Add your first writer to start delegating content tasks" /></div>
                            : writers.map(w => (
                                <div key={w.id} className="card" style={{ padding: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <div><div style={{ fontWeight: 700 }}>{w.name}</div><div className="text-sm text-muted">{w.email}</div></div>
                                        <Badge variant={w.is_active ? 'success' : 'neutral'}>{w.is_active ? 'Active' : 'Inactive'}</Badge>
                                    </div>
                                    <div className="grid-2" style={{ gap: 8 }}>
                                        <div><div className="text-sm text-muted">Posts Done</div><div style={{ fontWeight: 700 }}>{w.posts_completed}</div></div>
                                        <div><div className="text-sm text-muted">Rate/Word</div><div style={{ fontWeight: 700 }}>${w.rate_per_word}</div></div>
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                )}
            </main>
        </div>
    );
}
