'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';

interface Step { id: string; label: string; description: string; route: string; icon: string; required: boolean; completed: boolean; }

export default function OnboardingPage() {
    const toast = useToast();
    const [steps, setSteps] = useState<Step[]>([]);
    const [setupPct, setSetupPct] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [nextStep, setNextStep] = useState<Step | null>(null);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await fetch('/api/onboarding');
        const data = await res.json();
        setSteps(data.steps || []);
        setSetupPct(data.setup_complete_pct || 0);
        setIsComplete(data.is_complete || false);
        setNextStep(data.next_step || null);
    };

    const complete = async (stepId: string) => {
        await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete_step', step_id: stepId }) });
        toast.success('Step marked complete!');
        load();
    };

    const required = steps.filter(s => s.required);
    const optional = steps.filter(s => !s.required);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Setup Guide</h1>
                        <p className="page-description">Get RankMaster Pro configured and ready to earn</p>
                    </div>
                    {isComplete && <div style={{ padding: '6px 16px', background: '#f0fdf4', color: '#16a34a', borderRadius: 20, fontWeight: 700 }}>🎉 Setup Complete!</div>}
                </div>

                {/* Progress */}
                <div className="card" style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontWeight: 700 }}>Setup Progress</span>
                        <span style={{ fontWeight: 700, color: setupPct === 100 ? '#16a34a' : 'var(--accent-primary)' }}>{setupPct}%</span>
                    </div>
                    <div style={{ height: 10, background: 'var(--border-subtle)', borderRadius: 5 }}>
                        <div style={{ height: '100%', background: setupPct === 100 ? '#16a34a' : 'var(--accent-primary)', width: `${setupPct}%`, borderRadius: 5, transition: 'width 0.5s' }} />
                    </div>
                    {nextStep && !isComplete && (
                        <div style={{ marginTop: 10, padding: '8px 12px', background: '#eff6ff', borderRadius: 6 }}>
                            <span className="text-sm text-muted">Next: </span>
                            <Link href={nextStep.route} className="text-sm" style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{nextStep.icon} {nextStep.label}</Link>
                        </div>
                    )}
                </div>

                {/* Required steps */}
                <div style={{ marginBottom: 20 }}>
                    <h2 style={{ fontWeight: 700, marginBottom: 12 }}>Required Steps</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {required.map((step, i) => (
                            <div key={i} style={{ padding: '14px 16px', background: 'var(--bg-card)', border: `1px solid ${step.completed ? '#16a34a' : 'var(--border-subtle)'}`, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: step.completed ? '#f0fdf4' : 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                                        {step.completed ? '✅' : step.icon}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, color: step.completed ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: step.completed ? 'line-through' : 'none' }}>{step.label}</div>
                                        <div className="text-sm text-muted">{step.description}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                    {!step.completed && (
                                        <>
                                            <Link href={step.route} className="btn btn-sm btn-primary">Go →</Link>
                                            <button className="btn btn-sm" onClick={() => complete(step.id)}>✓ Done</button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Optional steps */}
                <div>
                    <h2 style={{ fontWeight: 700, marginBottom: 12 }}>Recommended (Optional)</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                        {optional.map((step, i) => (
                            <div key={i} style={{ padding: '12px 14px', background: step.completed ? 'var(--bg-secondary)' : 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, opacity: step.completed ? 0.6 : 1 }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                                    <span style={{ fontSize: '1.3rem' }}>{step.completed ? '✅' : step.icon}</span>
                                    <div>
                                        <div style={{ fontWeight: 600, textDecoration: step.completed ? 'line-through' : 'none' }}>{step.label}</div>
                                        <div className="text-sm text-muted">{step.description}</div>
                                    </div>
                                </div>
                                {!step.completed && (
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <Link href={step.route} className="btn btn-sm btn-primary" style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center' }}>Set up</Link>
                                        <button className="btn btn-sm" onClick={() => complete(step.id)}>✓</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
