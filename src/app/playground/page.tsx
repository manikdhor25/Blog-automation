'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface ProviderResult { provider: string; success: boolean; content: string; error: string | null; duration_ms: number; model: string; }

const ALL_PROVIDERS = ['openai', 'gemini', 'anthropic', 'groq', 'mistral', 'deepseek', 'cohere', 'openrouter'];
const TASKS = ['content_writing', 'outline_generation', 'meta_generation', 'keyword_suggestion', 'competitor_analysis', 'content_optimization'];

export default function PlaygroundPage() {
    const toast = useToast();
    const [prompt, setPrompt] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set(['openai', 'gemini']));
    const [task, setTask] = useState('content_writing');
    const [maxTokens, setMaxTokens] = useState(500);
    const [jsonMode, setJsonMode] = useState(false);
    const [results, setResults] = useState<ProviderResult[]>([]);
    const [running, setRunning] = useState(false);

    const run = async () => {
        if (!prompt) { toast.warning('Prompt required'); return; }
        if (selectedProviders.size === 0) { toast.warning('Select at least one provider'); return; }
        setRunning(true); setResults([]);
        const res = await fetch('/api/playground', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, providers: [...selectedProviders], task, max_tokens: maxTokens, system_prompt: systemPrompt || undefined, json_mode: jsonMode }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setRunning(false); return; }
        setResults(data.responses);
        const succeeded = data.responses.filter((r: ProviderResult) => r.success).length;
        toast.success(`${succeeded}/${data.responses.length} providers responded`);
        setRunning(false);
    };

    const toggleProvider = (p: string) => setSelectedProviders(prev => {
        const n = new Set(prev);
        n.has(p) ? n.delete(p) : n.add(p);
        return n;
    });

    const fastest = results.filter(r => r.success).sort((a, b) => a.duration_ms - b.duration_ms)[0];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">AI Playground</h1>
                        <p className="page-description">Test prompts against all 8 AI providers side-by-side — compare quality, speed, cost</p>
                    </div>
                </div>

                <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                    {/* Config */}
                    <div className="card">
                        <div className="form-group">
                            <label className="form-label">System Prompt <span className="text-muted text-sm">(optional)</span></label>
                            <input className="form-input" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} placeholder="You are an expert SEO writer..." />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Prompt *</label>
                            <textarea className="form-input" rows={8} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Write a meta description for an article about the best standing desks..." style={{ fontFamily: 'inherit' }} />
                        </div>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Task Type</label>
                                <select className="form-select" value={task} onChange={e => setTask(e.target.value)}>
                                    {TASKS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Max Tokens</label>
                                <input type="number" className="form-input" value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value) || 500)} />
                            </div>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                <input type="checkbox" checked={jsonMode} onChange={e => setJsonMode(e.target.checked)} />
                                <span className="text-sm">JSON mode</span>
                            </label>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Providers ({selectedProviders.size} selected)</label>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {ALL_PROVIDERS.map(p => (
                                    <button key={p} className={`btn btn-sm ${selectedProviders.has(p) ? 'btn-primary' : ''}`} onClick={() => toggleProvider(p)}>{p}</button>
                                ))}
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={run} disabled={running}>
                            {running ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Running {selectedProviders.size} providers...</> : `▶ Run Against ${selectedProviders.size} Providers`}
                        </button>
                    </div>

                    {/* Results */}
                    <div>
                        {results.length === 0 && !running ? (
                            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: 16 }}>🤖</div>
                                <div style={{ fontWeight: 600 }}>Results appear here</div>
                                <div className="text-sm" style={{ marginTop: 8 }}>Select providers and run to compare</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {results.map((r, i) => (
                                    <div key={i} className="card animate-in" style={{ padding: 14, borderLeft: `3px solid ${r.success ? '#16a34a' : '#dc2626'}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <span style={{ fontWeight: 700 }}>{r.provider}</span>
                                                <span className="text-sm text-muted">{r.model}</span>
                                                {fastest?.provider === r.provider && r.success && <Badge variant="success">Fastest</Badge>}
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <span className="text-sm text-muted">{r.duration_ms}ms</span>
                                                <Badge variant={r.success ? 'success' : 'danger'}>{r.success ? 'OK' : 'Error'}</Badge>
                                            </div>
                                        </div>
                                        {r.success ? (
                                            <>
                                                <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '10px 12px', fontSize: '0.88rem', maxHeight: 200, overflowY: 'auto', fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{r.content}</div>
                                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                                    <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(r.content); toast.success('Copied'); }}>Copy</button>
                                                    <span className="text-sm text-muted" style={{ alignSelf: 'center' }}>{r.content.split(/\s+/).length} words</span>
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ color: '#dc2626', fontSize: '0.88rem' }}>{r.error}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
