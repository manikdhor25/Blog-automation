'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, StatCard } from '@/components/ui';

interface CostData {
    entries: { id: string; provider: string; model: string; task: string; tokens_in: number; tokens_out: number; estimated_cost: string; created_at: string }[];
    summary: { totalCost: number; totalCalls: number; totalTokensIn: number; totalTokensOut: number };
    byProvider: Record<string, { cost: number; calls: number; tokens: number }>;
}

const PROVIDER_COSTS: Record<string, { input: number; output: number }> = {
    gemini: { input: 0.075, output: 0.30 }, openai: { input: 2.50, output: 10.00 },
    anthropic: { input: 3.00, output: 15.00 }, groq: { input: 0.05, output: 0.08 },
    mistral: { input: 0.25, output: 0.25 }, deepseek: { input: 0.14, output: 0.28 },
    cohere: { input: 0.30, output: 0.60 },
};

export default function CostTrackingPage() {
    const [data, setData] = useState<CostData | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d'>('7d');

    useEffect(() => {
        setLoading(true);
        fetch(`/api/costs?range=${timeRange}`).then(r => r.json()).then(setData).catch(() => { }).finally(() => setLoading(false));
    }, [timeRange]);

    const providerEntries = data?.byProvider ? Object.entries(data.byProvider).sort((a, b) => b[1].cost - a[1].cost) : [];
    const maxCost = Math.max(...providerEntries.map(([, v]) => v.cost), 0.01);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">API Cost Tracker</h1>
                        <p className="page-description">Monitor AI provider usage and estimated costs</p>
                    </div>
                    <div className="flex gap-2">
                        {(['today', '7d', '30d'] as const).map(r => (
                            <button key={r} className={`btn ${timeRange === r ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                onClick={() => setTimeRange(r)}>
                                {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="stat-grid" style={{ marginBottom: 24 }}>
                    <StatCard label="Total Cost" value={`$${(data?.summary?.totalCost || 0).toFixed(4)}`} icon="💰" />
                    <StatCard label="API Calls" value={data?.summary?.totalCalls || 0} icon="📡" />
                    <StatCard label="Tokens In" value={(data?.summary?.totalTokensIn || 0).toLocaleString()} icon="📥" />
                    <StatCard label="Tokens Out" value={(data?.summary?.totalTokensOut || 0).toLocaleString()} icon="📤" />
                </div>

                <div className="grid-2" style={{ gap: 24, marginBottom: 24 }}>
                    <div className="card">
                        <div className="card-header"><h2 className="card-title">💰 Cost by Provider</h2></div>
                        {providerEntries.length === 0 ? (
                            <div className="text-sm text-muted" style={{ padding: 20, textAlign: 'center' }}>
                                No API usage recorded yet. Costs are tracked automatically when you generate or optimize content.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {providerEntries.map(([provider, pData]) => (
                                    <div key={provider}>
                                        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                                            <span className="text-sm" style={{ fontWeight: 600, textTransform: 'capitalize' }}>{provider}</span>
                                            <span className="text-sm">${pData.cost.toFixed(4)} ({pData.calls} calls)</span>
                                        </div>
                                        <div style={{ height: 8, background: 'var(--bg-glass)', borderRadius: 4, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', borderRadius: 4, width: `${(pData.cost / maxCost) * 100}%`, background: 'var(--gradient-primary)', transition: 'width 0.5s ease' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="card">
                        <div className="card-header"><h2 className="card-title">📋 Provider Pricing (per 1M tokens)</h2></div>
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead><tr><th>Provider</th><th>Input</th><th>Output</th></tr></thead>
                                <tbody>
                                    {Object.entries(PROVIDER_COSTS).map(([provider, costs]) => (
                                        <tr key={provider}>
                                            <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{provider}</td>
                                            <td>${costs.input.toFixed(3)}</td>
                                            <td>${costs.output.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header"><h2 className="card-title">📡 Usage Log ({data?.entries?.length || 0})</h2></div>
                    {!data?.entries?.length ? (
                        <div style={{ padding: 40, textAlign: 'center' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📡</div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>No API usage yet</div>
                            <div className="text-sm text-muted">API calls are automatically logged when you use content generation, optimization, or keyword research features.</div>
                        </div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead><tr><th>Time</th><th>Provider</th><th>Model</th><th>Task</th><th>Tokens</th><th>Cost</th></tr></thead>
                                <tbody>
                                    {data.entries.slice(0, 50).map(entry => (
                                        <tr key={entry.id}>
                                            <td className="text-sm text-muted">{new Date(entry.created_at).toLocaleString()}</td>
                                            <td><Badge variant="info">{entry.provider}</Badge></td>
                                            <td className="text-sm">{entry.model}</td>
                                            <td className="text-sm">{entry.task}</td>
                                            <td className="text-sm">{((entry.tokens_in || 0) + (entry.tokens_out || 0)).toLocaleString()}</td>
                                            <td style={{ fontWeight: 600 }}>${parseFloat(entry.estimated_cost || '0').toFixed(4)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
