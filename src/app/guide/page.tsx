'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge } from '@/components/ui';

interface Setting {
    key: string;
    has_value: boolean;
}

interface GuideSection {
    id: string;
    title: string;
    icon: string;
    priority: 'required' | 'recommended' | 'optional';
    settingKeys: string[];
    freeTier: string;
    bestFor: string;
    cost: string;
    docsUrl: string;
    steps: string[];
    tip?: string;
    warning?: string;
}

const AI_GUIDES: GuideSection[] = [
    {
        id: 'gemini',
        title: 'Google Gemini',
        icon: '🔷',
        priority: 'required',
        settingKeys: ['gemini_api_key'],
        freeTier: '✅ Free — 60 requests/min',
        bestFor: 'Keyword research, scoring, bulk analysis',
        cost: 'Free',
        docsUrl: 'https://aistudio.google.com/apikey',
        steps: [
            'Go to Google AI Studio (link below)',
            'Sign in with your Google account',
            'Click "Create API Key"',
            'Select or create a Google Cloud project (free)',
            'Copy the key → paste into Settings → Google Gemini',
        ],
        tip: 'Gemini has a generous free tier. Set this as your Default Provider for cost-free keyword research and analysis.',
    },
    {
        id: 'openai',
        title: 'OpenAI (GPT-4o)',
        icon: '🟢',
        priority: 'recommended',
        settingKeys: ['openai_api_key'],
        freeTier: '❌ Paid only',
        bestFor: 'Premium article writing, content optimization',
        cost: '~$2.50/1M input tokens, ~$10/1M output',
        docsUrl: 'https://platform.openai.com/api-keys',
        steps: [
            'Go to OpenAI Platform (link below)',
            'Sign up or sign in',
            'Click "+ Create new secret key" and name it',
            'Copy the key immediately (won\'t be shown again!)',
            'Add billing at Settings → Billing ($5–10 to start)',
            'Paste key into Settings → OpenAI',
        ],
        warning: 'Paid account required. Add $5–10 billing credit to start.',
    },
    {
        id: 'anthropic',
        title: 'Anthropic (Claude)',
        icon: '🟠',
        priority: 'optional',
        settingKeys: ['anthropic_api_key'],
        freeTier: '❌ Paid only',
        bestFor: 'Long-form content, nuanced writing',
        cost: '~$3/1M input, ~$15/1M output tokens',
        docsUrl: 'https://console.anthropic.com/',
        steps: [
            'Go to Anthropic Console (link below)',
            'Sign up or sign in',
            'Navigate to Settings → API Keys',
            'Click "Create Key" and name it',
            'Add billing credits ($5 to start)',
            'Copy key → paste into Settings → Anthropic',
        ],
    },
    {
        id: 'groq',
        title: 'Groq',
        icon: '⚡',
        priority: 'optional',
        settingKeys: ['groq_api_key'],
        freeTier: '✅ Free (rate-limited)',
        bestFor: 'Fastest inference, high-volume bulk tasks',
        cost: 'Free tier available',
        docsUrl: 'https://console.groq.com/keys',
        steps: [
            'Go to Groq Console (link below)',
            'Sign up for free or sign in',
            'Click "Create API Key"',
            'Copy key → paste into Settings → Groq',
        ],
        tip: 'Groq is the fastest AI provider. Great alternative to Gemini for bulk tasks.',
    },
    {
        id: 'mistral',
        title: 'Mistral AI',
        icon: '🔵',
        priority: 'optional',
        settingKeys: ['mistral_api_key'],
        freeTier: '✅ Free (rate-limited)',
        bestFor: 'Balanced speed & quality',
        cost: 'From €0.1/1M tokens',
        docsUrl: 'https://console.mistral.ai/',
        steps: [
            'Go to Mistral Console (link below)',
            'Sign up or sign in',
            'Go to API Keys section',
            'Click "Create new key"',
            'Copy key → paste into Settings → Mistral AI',
        ],
    },
    {
        id: 'deepseek',
        title: 'DeepSeek',
        icon: '🟣',
        priority: 'optional',
        settingKeys: ['deepseek_api_key'],
        freeTier: '✅ Very cheap',
        bestFor: 'Budget-friendly operations',
        cost: '~$0.14/1M input, ~$0.28/1M output',
        docsUrl: 'https://platform.deepseek.com/',
        steps: [
            'Go to DeepSeek Platform (link below)',
            'Sign up or sign in',
            'Navigate to API Keys',
            'Click "Create new API key"',
            'Copy key → paste into Settings → DeepSeek',
        ],
        tip: 'Cheapest paid provider. Great for keeping costs ultra-low on bulk tasks.',
    },
    {
        id: 'cohere',
        title: 'Cohere',
        icon: '🔴',
        priority: 'optional',
        settingKeys: ['cohere_api_key'],
        freeTier: '✅ Trial key available',
        bestFor: 'Enterprise content generation',
        cost: 'Free trial, paid plans available',
        docsUrl: 'https://dashboard.cohere.com/',
        steps: [
            'Go to Cohere Dashboard (link below)',
            'Sign up or sign in',
            'Navigate to API Keys',
            'Copy your Trial key or create a Production key',
            'Paste into Settings → Cohere',
        ],
    },
];

const SERP_GUIDES: GuideSection[] = [
    {
        id: 'dataforseo',
        title: 'DataForSEO',
        icon: '📊',
        priority: 'recommended',
        settingKeys: ['dataforseo_login', 'dataforseo_password'],
        freeTier: '✅ $1 free credit',
        bestFor: 'Real search volume, keyword difficulty, CPC, rank tracking',
        cost: '~$0.05/keyword, ~$0.02/rank check',
        docsUrl: 'https://app.dataforseo.com/register',
        steps: [
            'Go to DataForSEO Registration (link below)',
            'Create an account (comes with $1 free credit)',
            'After login, go to Dashboard → API Access',
            'Your Login = your registration email',
            'Your Password = shown on dashboard (NOT your account password)',
            'Enter both in Settings → SERP → DataForSEO',
        ],
        warning: 'The API password is different from your account login password. Find it on the Dashboard.',
        tip: 'This is the most important SERP tool. Powers real keyword data & rank tracking.',
    },
    {
        id: 'google-cse',
        title: 'Google Custom Search API',
        icon: '🔍',
        priority: 'optional',
        settingKeys: ['google_cse_api_key', 'google_cse_id'],
        freeTier: '✅ 100 queries/day',
        bestFor: 'Competitor analysis (fallback)',
        cost: 'Free (100/day)',
        docsUrl: 'https://developers.google.com/custom-search/v1/introduction',
        steps: [
            'Go to Google Cloud Console → create or select a project',
            'Go to APIs & Services → Library → search "Custom Search API" → Enable',
            'Go to APIs & Services → Credentials → Create Credentials → API Key',
            'Copy the API Key',
            'Go to Programmable Search Engine (cse.google.com)',
            'Click "Add" → enter *.com → toggle "Search the entire web" ON → Create',
            'Copy the Search Engine ID (cx value)',
            'Enter both into Settings → SERP → Google Custom Search',
        ],
    },
    {
        id: 'moz',
        title: 'Moz API',
        icon: '🔗',
        priority: 'optional',
        settingKeys: ['moz_access_id', 'moz_secret_key'],
        freeTier: '✅ 100 queries/month',
        bestFor: 'Domain Authority, backlink discovery, competitor gaps',
        cost: 'Free community tier',
        docsUrl: 'https://moz.com/products/api',
        steps: [
            'Go to Moz API page (link below)',
            'Sign up for a free community account',
            'After login, go to Account → API → Manage Keys',
            'Your Access ID format: mozscape-XXXXXXXXXX',
            'Your Secret Key is shown alongside it',
            'Enter both in Settings → SERP → Moz',
        ],
    },
    {
        id: 'gsc',
        title: 'Google Search Console',
        icon: '📈',
        priority: 'optional',
        settingKeys: ['gsc_client_id', 'gsc_client_secret', 'gsc_refresh_token'],
        freeTier: '✅ Free (OAuth required)',
        bestFor: 'Real impressions, clicks, CTR, average position',
        cost: 'Free',
        docsUrl: 'https://console.cloud.google.com/apis/credentials',
        steps: [
            'Go to Google Cloud Console → Credentials',
            'Enable the "Search Console API" for your project',
            'Click "+ Create Credentials" → OAuth Client ID',
            'Application type: Web Application',
            'Add redirect URI: your-domain/api/auth/callback/google',
            'Copy Client ID and Client Secret',
            'Go to OAuth 2.0 Playground (developers.google.com/oauthplayground)',
            'Click ⚙️ → check "Use your own OAuth credentials" → enter your ID & Secret',
            'In Step 1, select Search Console API v3 scope → Authorize',
            'In Step 2, click "Exchange authorization code for tokens"',
            'Copy the Refresh Token',
            'Enter all three values in Settings → SERP → Google Search Console',
        ],
        warning: 'Keep your refresh token secure — it grants ongoing access to Search Console data.',
    },
];

function GuideCard({ guide, configuredKeys }: { guide: GuideSection; configuredKeys: Set<string> }) {
    const [expanded, setExpanded] = useState(false);
    const isConfigured = guide.settingKeys.every(k => configuredKeys.has(k));
    const isPartial = !isConfigured && guide.settingKeys.some(k => configuredKeys.has(k));

    const priorityColors = {
        required: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', text: '#f87171', label: 'Required' },
        recommended: { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.3)', text: '#818cf8', label: 'Recommended' },
        optional: { bg: 'rgba(255,255,255,0.03)', border: 'var(--border-subtle)', text: 'var(--text-muted)', label: 'Optional' },
    };
    const p = priorityColors[guide.priority];

    return (
        <div className="card" style={{
            borderColor: isConfigured ? 'rgba(34,197,94,0.25)' : isPartial ? 'rgba(245,158,11,0.25)' : 'var(--border-subtle)',
            transition: 'all 0.3s ease',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: expanded ? 16 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '1.6rem' }}>{guide.icon}</span>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{guide.title}</div>
                        <div className="text-sm text-muted">{guide.bestFor}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge variant={isConfigured ? 'success' : isPartial ? 'warning' : 'neutral'}>
                        {isConfigured ? '✅ Configured' : isPartial ? '⚠️ Partial' : 'Not Set'}
                    </Badge>
                    <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: '0.65rem', fontWeight: 700,
                        background: p.bg, border: `1px solid ${p.border}`, color: p.text,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                        {p.label}
                    </span>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    >
                        {expanded ? '▲ Hide' : '▼ Setup Guide'}
                    </button>
                </div>
            </div>

            {/* Expanded Guide */}
            {expanded && (
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    {/* Quick info */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16,
                        padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                    }}>
                        <div>
                            <div className="text-sm text-muted" style={{ marginBottom: 2 }}>Free Tier</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{guide.freeTier}</div>
                        </div>
                        <div>
                            <div className="text-sm text-muted" style={{ marginBottom: 2 }}>Cost</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{guide.cost}</div>
                        </div>
                        <div>
                            <div className="text-sm text-muted" style={{ marginBottom: 2 }}>Keys Needed</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{guide.settingKeys.length}</div>
                        </div>
                    </div>

                    {/* Steps */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 10, color: 'var(--text-accent)' }}>
                            📋 Step-by-Step Instructions
                        </div>
                        <ol style={{
                            listStyle: 'none', padding: 0, margin: 0,
                            display: 'flex', flexDirection: 'column', gap: 8,
                        }}>
                            {guide.steps.map((step, i) => (
                                <li key={i} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 10,
                                    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid rgba(255,255,255,0.04)',
                                    fontSize: '0.85rem', lineHeight: 1.5,
                                }}>
                                    <span style={{
                                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                        background: 'var(--gradient-primary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.7rem', fontWeight: 700, color: '#fff',
                                    }}>
                                        {i + 1}
                                    </span>
                                    <span style={{ color: 'var(--text-secondary)' }}>{step}</span>
                                </li>
                            ))}
                        </ol>
                    </div>

                    {/* Tip / Warning */}
                    {guide.tip && (
                        <div style={{
                            padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                            background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
                            fontSize: '0.8rem', color: '#a5b4fc', marginBottom: guide.warning ? 8 : 0,
                        }}>
                            💡 <strong>Tip:</strong> {guide.tip}
                        </div>
                    )}
                    {guide.warning && (
                        <div style={{
                            padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                            background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
                            fontSize: '0.8rem', color: '#fbbf24',
                        }}>
                            ⚠️ <strong>Note:</strong> {guide.warning}
                        </div>
                    )}

                    {/* Action button */}
                    <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                        <a href={guide.docsUrl} target="_blank" rel="noopener noreferrer"
                            className="btn btn-primary btn-sm">
                            🔗 Get API Key →
                        </a>
                        <a href="/settings" className="btn btn-secondary btn-sm">
                            ⚙️ Go to Settings
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function GuidePage() {
    const [settings, setSettings] = useState<Setting[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandAll, setExpandAll] = useState(false);

    useEffect(() => {
        fetch('/api/settings')
            .then(r => r.json())
            .then(data => setSettings(data.settings || []))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const configuredKeys = new Set(
        settings.filter(s => s.has_value).map(s => s.key),
    );

    const totalRequired = AI_GUIDES.filter(g => g.priority === 'required').length +
        SERP_GUIDES.filter(g => g.priority === 'required').length;
    const configuredRequired = AI_GUIDES.filter(g => g.priority === 'required' && g.settingKeys.every(k => configuredKeys.has(k))).length +
        SERP_GUIDES.filter(g => g.priority === 'required' && g.settingKeys.every(k => configuredKeys.has(k))).length;

    const totalRecommended = AI_GUIDES.filter(g => g.priority === 'recommended').length +
        SERP_GUIDES.filter(g => g.priority === 'recommended').length;
    const configuredRecommended = AI_GUIDES.filter(g => g.priority === 'recommended' && g.settingKeys.every(k => configuredKeys.has(k))).length +
        SERP_GUIDES.filter(g => g.priority === 'recommended' && g.settingKeys.every(k => configuredKeys.has(k))).length;

    const totalAll = AI_GUIDES.length + SERP_GUIDES.length;
    const configuredAll = AI_GUIDES.filter(g => g.settingKeys.every(k => configuredKeys.has(k))).length +
        SERP_GUIDES.filter(g => g.settingKeys.every(k => configuredKeys.has(k))).length;

    const progressPct = totalAll > 0 ? Math.round((configuredAll / totalAll) * 100) : 0;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">📖 Setup Guide</h1>
                        <p className="page-description">Step-by-step instructions to configure all API keys and unlock full platform capabilities</p>
                    </div>
                    <button className="btn btn-secondary" onClick={() => setExpandAll(!expandAll)}>
                        {expandAll ? '📕 Collapse All' : '📖 Expand All'}
                    </button>
                </div>

                {loading ? (
                    <div className="card"><div className="loading-skeleton" style={{ height: 300 }} /></div>
                ) : (
                    <>
                        {/* Progress Overview */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <div>
                                    <h2 className="card-title" style={{ marginBottom: 4 }}>🚀 Setup Progress</h2>
                                    <p className="text-sm text-muted">
                                        {configuredAll === totalAll
                                            ? 'All services configured! You\'re ready to go.'
                                            : `${configuredAll} of ${totalAll} services configured. Complete the recommended ones to unlock full power.`}
                                    </p>
                                </div>
                                <div style={{
                                    fontSize: '2rem', fontWeight: 800,
                                    background: 'var(--gradient-primary)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                                }}>
                                    {progressPct}%
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div style={{
                                height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.05)',
                                overflow: 'hidden', marginBottom: 16,
                            }}>
                                <div style={{
                                    height: '100%', borderRadius: 5,
                                    background: progressPct === 100 ? 'linear-gradient(90deg, #22c55e, #4ade80)' : 'var(--gradient-primary)',
                                    width: `${progressPct}%`, transition: 'width 1s ease',
                                }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                <div style={{
                                    padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)',
                                }}>
                                    <div className="text-sm" style={{ color: '#f87171', fontWeight: 600 }}>Required</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{configuredRequired}/{totalRequired}</div>
                                </div>
                                <div style={{
                                    padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)',
                                }}>
                                    <div className="text-sm" style={{ color: '#818cf8', fontWeight: 600 }}>Recommended</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{configuredRecommended}/{totalRecommended}</div>
                                </div>
                                <div style={{
                                    padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)',
                                }}>
                                    <div className="text-sm text-muted" style={{ fontWeight: 600 }}>Total</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{configuredAll}/{totalAll}</div>
                                </div>
                            </div>
                        </div>

                        {/* Quick Start Recommendation */}
                        <div style={{
                            padding: '14px 18px', borderRadius: 'var(--radius-sm)',
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))',
                            border: '1px solid rgba(99,102,241,0.2)',
                            marginBottom: 24, fontSize: '0.85rem', color: 'var(--text-secondary)',
                        }}>
                            💡 <strong style={{ color: 'var(--text-accent)' }}>Quick Start:</strong> Set up <strong>Google Gemini</strong> (free, default bulk provider) + <strong>OpenAI</strong> (premium article writing) + <strong>DataForSEO</strong> ($1 free credit for real keyword data). This gives you full coverage for ~$5–10 initial investment.
                        </div>

                        {/* AI Providers */}
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>🤖</span> AI Providers
                            <span className="text-sm text-muted" style={{ fontWeight: 400 }}>— Powers content generation, keyword analysis, scoring</span>
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
                            {AI_GUIDES.map(guide => (
                                <GuideCard key={guide.id} guide={{ ...guide, ...(expandAll ? {} : {}) }} configuredKeys={configuredKeys} />
                            ))}
                        </div>

                        {/* SERP & Data Providers */}
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>🔍</span> SERP & Data Providers
                            <span className="text-sm text-muted" style={{ fontWeight: 400 }}>— Powers keyword data, rank tracking, backlinks</span>
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
                            {SERP_GUIDES.map(guide => (
                                <GuideCard key={guide.id} guide={guide} configuredKeys={configuredKeys} />
                            ))}
                        </div>

                        {/* Quick Reference Table */}
                        <div className="card">
                            <div className="card-header">
                                <h2 className="card-title">📋 Quick Reference</h2>
                            </div>
                            <div className="table-wrapper">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Provider</th>
                                            <th>Free Tier</th>
                                            <th>Best For</th>
                                            <th>Priority</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...AI_GUIDES, ...SERP_GUIDES].map(g => {
                                            const done = g.settingKeys.every(k => configuredKeys.has(k));
                                            return (
                                                <tr key={g.id}>
                                                    <td style={{ fontWeight: 600 }}>{g.icon} {g.title}</td>
                                                    <td>{g.freeTier.replace('✅ ', '').replace('❌ ', '')}</td>
                                                    <td className="text-sm">{g.bestFor}</td>
                                                    <td>
                                                        <Badge variant={g.priority === 'required' ? 'danger' : g.priority === 'recommended' ? 'info' : 'neutral'}>
                                                            {g.priority}
                                                        </Badge>
                                                    </td>
                                                    <td>
                                                        <Badge variant={done ? 'success' : 'neutral'}>
                                                            {done ? '✅ Done' : '—'}
                                                        </Badge>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
