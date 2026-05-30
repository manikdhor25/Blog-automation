'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, StatCard, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Setting {
    id: string;
    key: string;
    value: string;
    category: string;
    label: string;
    description: string;
    is_secret: boolean;
    has_value: boolean;
}

// === Email Provider types ===
interface EmailProvider { id: string; name: string; provider: string; subscriber_count: number; is_active: boolean; last_synced: string; }

const ESP_PROVIDER_INFO: Record<string, { icon: string; color: string; docs_url: string }> = {
    convertkit: { icon: '📧', color: '#fb6970', docs_url: 'https://app.convertkit.com/account_settings/advanced_settings' },
    mailchimp: { icon: '🐒', color: '#ffe01b', docs_url: 'https://admin.mailchimp.com/account/api/' },
    beehiiv: { icon: '🐝', color: '#fbbf24', docs_url: 'https://app.beehiiv.com/settings/api' },
    activecampaign: { icon: '⚡', color: '#356ae6', docs_url: 'https://youracccount.api-us1.com/developer' },
    aweber: { icon: '📬', color: '#2196f3', docs_url: 'https://app.aweber.com/api-keys' },
};


const AI_PROVIDERS = [
    { key: 'gemini_api_key', label: 'Google Gemini', icon: '🔷', desc: 'Free tier available — great for bulk tasks', docsUrl: 'https://aistudio.google.com/apikey' },
    { key: 'openai_api_key', label: 'OpenAI (GPT-4o)', icon: '🟢', desc: 'Premium quality content writing', docsUrl: 'https://platform.openai.com/api-keys' },
    { key: 'anthropic_api_key', label: 'Anthropic (Claude)', icon: '🟠', desc: 'Excellent for long-form content', docsUrl: 'https://console.anthropic.com/' },
    { key: 'groq_api_key', label: 'Groq', icon: '⚡', desc: 'Fastest inference — good for bulk tasks', docsUrl: 'https://console.groq.com/keys' },
    { key: 'mistral_api_key', label: 'Mistral AI', icon: '🔵', desc: 'European AI — good balance of speed & quality', docsUrl: 'https://console.mistral.ai/' },
    { key: 'deepseek_api_key', label: 'DeepSeek', icon: '🟣', desc: 'Most cost-effective option', docsUrl: 'https://platform.deepseek.com/' },
    { key: 'cohere_api_key', label: 'Cohere', icon: '🔴', desc: 'Enterprise AI for content', docsUrl: 'https://dashboard.cohere.com/' },
    { key: 'openrouter_api_key', label: 'OpenRouter', icon: '🌐', desc: '300+ models via one API key — pay-as-you-go', docsUrl: 'https://openrouter.ai/keys' },
];

const PROVIDER_IDS = ['gemini', 'openai', 'anthropic', 'groq', 'mistral', 'deepseek', 'cohere', 'openrouter'];

// Models per provider for the task-routing UI
const PROVIDER_MODELS: Record<string, { id: string; name: string }[]> = {
    gemini:      [{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }, { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }],
    openai:      [{ id: 'gpt-4o', name: 'GPT-4o' }, { id: 'gpt-4o-mini', name: 'GPT-4o Mini' }, { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }],
    anthropic:   [{ id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' }, { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }],
    groq:        [{ id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' }, { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' }],
    mistral:     [{ id: 'mistral-large-latest', name: 'Mistral Large' }, { id: 'mistral-small-latest', name: 'Mistral Small' }],
    deepseek:    [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }, { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }],
    cohere:      [{ id: 'command-r-plus', name: 'Command R+' }, { id: 'command-r', name: 'Command R' }],
    openrouter:  [
        { id: 'openai/gpt-4o', name: 'GPT-4o (OR)' },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (OR)' },
        { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5 (OR)' },
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (OR)' },
        { id: 'mistralai/mistral-large', name: 'Mistral Large (OR)' },
        { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat (OR)' },
        { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B (OR)' },
    ],
};

const TASK_TYPES: { key: string; label: string; desc: string; group: string }[] = [
    { key: 'content_writing',     label: 'Content Writing',      desc: 'Full article & blog post generation',    group: 'Content' },
    { key: 'section_writing',     label: 'Section Writing',      desc: 'Individual section / paragraph writing',  group: 'Content' },
    { key: 'content_optimization',label: 'Content Optimization', desc: 'Rewrite & improve existing content',      group: 'Content' },
    { key: 'outline_generation',  label: 'Outline Generation',   desc: 'Article structure & H2/H3 outlines',     group: 'Structure' },
    { key: 'blueprint_analysis',  label: 'Blueprint Analysis',   desc: 'SERP blueprint & competitor summary',    group: 'Structure' },
    { key: 'meta_generation',     label: 'Meta Generation',      desc: 'Title tags & meta descriptions',         group: 'SEO' },
    { key: 'schema_generation',   label: 'Schema Generation',    desc: 'JSON-LD structured data',                group: 'SEO' },
    { key: 'keyword_suggestion',  label: 'Keyword Suggestion',   desc: 'Related & LSI keyword discovery',        group: 'Research' },
    { key: 'topic_research',      label: 'Topic Research',       desc: 'Topic clusters & content ideas',         group: 'Research' },
    { key: 'competitor_analysis', label: 'Competitor Analysis',  desc: 'Gap & opportunity analysis',             group: 'Research' },
    { key: 'content_scoring',     label: 'Content Scoring',      desc: 'SEO quality & readability scoring',      group: 'Analysis' },
    { key: 'serp_analysis',       label: 'SERP Analysis',        desc: 'Search result intent & features',        group: 'Analysis' },
    { key: 'internal_linking',    label: 'Internal Linking',     desc: 'Anchor text & link placement',           group: 'Analysis' },
    { key: 'image_analysis',      label: 'Image Analysis',       desc: 'Alt text & visual SEO analysis',         group: 'Media' },
];

export default function SettingsPage() {
    const toast = useToast();
    const [settings, setSettings] = useState<Setting[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editValues, setEditValues] = useState<Record<string, string>>({});
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState({ type: '', text: '' });
    const [activeTab, setActiveTab] = useState<'ai' | 'routing' | 'serp' | 'content' | 'media' | 'email'>('ai');
    // === Email Provider state ===
    const [espProviders, setEspProviders] = useState<EmailProvider[]>([]);
    const [espTab, setEspTab] = useState<'connected' | 'connect'>('connected');
    const [espSelectedProvider, setEspSelectedProvider] = useState('convertkit');
    const [espApiKey, setEspApiKey] = useState('');
    const [espApiSecret, setEspApiSecret] = useState('');
    const [espAccountId, setEspAccountId] = useState('');
    const [espServerPrefix, setEspServerPrefix] = useState('');
    const [espName, setEspName] = useState('');
    const [espConnecting, setEspConnecting] = useState(false);
    const [espSyncing, setEspSyncing] = useState<string | null>(null);

    // Per-task model routing: { content_writing: { provider: 'openrouter', model: 'openai/gpt-4o' } }
    const [taskRoutes, setTaskRoutes] = useState<Record<string, { provider: string; model: string }>>({});
    // Dynamically fetched models cache: { openrouter: [{id: '...', name: '...'}], ... }
    const [fetchedModels, setFetchedModels] = useState<Record<string, { id: string; name: string }[]>>({});

    useEffect(() => {
        fetchSettings();
    }, []);

    useEffect(() => {
        if (activeTab === 'email') loadEspProviders();
    }, [activeTab]);

    const loadEspProviders = async () => {
        const res = await fetch('/api/email-provider');
        const data = await res.json();
        setEspProviders(data.providers || []);
    };

    const connectEsp = async () => {
        if (!espApiKey) { toast.warning('API key required'); return; }
        setEspConnecting(true);
        const res = await fetch('/api/email-provider', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'connect', provider: espSelectedProvider, api_key: espApiKey, api_secret: espApiSecret || undefined, account_id: espAccountId || undefined, server_prefix: espServerPrefix || undefined, name: espName || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Connection failed'); } else {
            toast.success(`Connected to ${espSelectedProvider}! ${data.provider.subscriber_count.toLocaleString()} subscribers`);
            setEspApiKey(''); setEspApiSecret(''); setEspAccountId(''); setEspName('');
            loadEspProviders(); setEspTab('connected');
        }
        setEspConnecting(false);
    };

    const syncEsp = async (id: string) => {
        setEspSyncing(id);
        const res = await fetch('/api/email-provider', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'sync', provider_id: id }),
        });
        const data = await res.json();
        if (res.ok) { toast.success(`Synced: ${data.subscriber_count.toLocaleString()} subscribers`); loadEspProviders(); }
        setEspSyncing(null);
    };

    const disconnectEsp = async (id: string) => {
        await fetch('/api/email-provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disconnect', provider_id: id }) });
        toast.success('Disconnected');
        loadEspProviders();
    };

    const espInfo = ESP_PROVIDER_INFO[espSelectedProvider] || { icon: '📧', color: '#6366f1', docs_url: '#' };


    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            setSettings(data.settings || []);

            const values: Record<string, string> = {};
            const routes: Record<string, { provider: string; model: string }> = {};

            for (const s of data.settings || []) {
                if (s.key.startsWith('task_route_')) {
                    const taskKey = s.key.replace('task_route_', '');
                    const [provider, ...modelParts] = (s.value || '').split(':');
                    if (provider) routes[taskKey] = { provider, model: modelParts.join(':') };
                } else {
                    values[s.key] = s.value || '';
                }
            }
            setEditValues(values);
            setTaskRoutes(routes);

            // Fetch live models for configured providers
            const configuredPids = PROVIDER_IDS.filter(pid => values[`${pid}_api_key`]);
            configuredPids.forEach(pid => {
                fetch(`/api/ai/models?provider=${pid}`)
                    .then(res => res.json())
                    .then(d => {
                        if (d.models && d.models.length > 0) {
                            setFetchedModels(prev => ({ ...prev, [pid]: d.models }));
                        }
                    })
                    .catch(e => console.error('Model fetch failed', e));
            });
        } catch {
            console.error('Failed to fetch settings');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage({ type: '', text: '' });

        try {
            // Regular settings updates
            const updates = Object.entries(editValues)
                .filter(([key, value]) => {
                    const setting = settings.find(s => s.key === key);
                    return setting && value !== setting.value;
                })
                .map(([key, value]) => ({ key, value }));

            // Task routing updates — stored as task_route_{taskType} = "provider:model"
            const routingUpdates = Object.entries(taskRoutes).map(([taskKey, { provider, model }]) => ({
                key: `task_route_${taskKey}`,
                value: provider && model ? `${provider}:${model}` : '',
                category: 'ai_task_routing',
                label: `Task route: ${taskKey}`,
                is_secret: false,
            }));

            const allUpdates = [...updates, ...routingUpdates];

            if (allUpdates.length === 0) {
                setMessage({ type: 'info', text: 'No changes to save' });
                toast.info('No changes to save');
                setSaving(false);
                return;
            }

            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates: allUpdates }),
            });

            if (res.status === 403) {
                const msg = 'Admin access required — settings (including shared API keys) can only be changed by an admin account.';
                setMessage({ type: 'error', text: msg });
                toast.error('Admin access required');
                return;
            }
            if (!res.ok) throw new Error('Failed to save');

            setMessage({ type: 'success', text: `✅ ${allUpdates.length} setting(s) saved! AI Router will reload on next request.` });
            toast.success(`${allUpdates.length} setting(s) saved!`);
            fetchSettings();
        } catch {
            setMessage({ type: 'error', text: 'Failed to save settings' });
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    // Helper: set a task route field
    const setTaskRoute = (taskKey: string, field: 'provider' | 'model', value: string) => {
        setTaskRoutes(prev => {
            const nextRoute = {
                provider: field === 'provider' ? value : (prev[taskKey]?.provider || ''),
                model: field === 'model' ? value : (prev[taskKey]?.model || ''),
            };

            // When provider changes, automatically select the first available model
            if (field === 'provider' && value) {
                const models = fetchedModels[value] && fetchedModels[value].length > 0 
                    ? fetchedModels[value] 
                    : (PROVIDER_MODELS[value] || []);
                
                if (models.length > 0) {
                    nextRoute.model = models[0].id;
                }

                // If we don't have fetched models for this provider yet, fetch them now
                if (!fetchedModels[value] || fetchedModels[value].length === 0) {
                    fetch(`/api/ai/models?provider=${value}`)
                        .then(res => res.json())
                        .then(d => {
                            if (d.models && d.models.length > 0) {
                                setFetchedModels(curr => ({ ...curr, [value]: d.models }));
                                // Also update this specific route to use the first dynamically fetched model
                                setTaskRoutes(currRoutes => ({
                                    ...currRoutes,
                                    [taskKey]: { ...currRoutes[taskKey], model: d.models[0].id }
                                }));
                            }
                        })
                        .catch(e => console.error('Dynamic model fetch failed', e));
                }
            }

            return { ...prev, [taskKey]: nextRoute };
        });
    };

    const getSetting = (key: string) => settings.find(s => s.key === key);
    const configuredCount = AI_PROVIDERS.filter(p => getSetting(p.key)?.has_value).length;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">⚙️ Settings</h1>
                        <p className="page-description">Configure API keys, AI models, and system preferences</p>
                    </div>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Saving...</> : '💾 Save All Changes'}
                    </button>
                </div>

                {message.text && (
                    <div style={{
                        padding: '12px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 16,
                        background: message.type === 'error' ? 'rgba(239,68,68,0.1)' : message.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.1)',
                        border: `1px solid ${message.type === 'error' ? 'rgba(239,68,68,0.3)' : message.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(99,102,241,0.3)'}`,
                        color: message.type === 'error' ? '#f87171' : message.type === 'success' ? '#4ade80' : '#818cf8',
                        fontSize: '0.875rem',
                    }}>
                        {message.text}
                    </div>
                )}

                <div className="stat-grid" style={{ marginBottom: 24 }}>
                    <StatCard label="AI Providers Configured" value={configuredCount} icon="🤖" delay={1} />
                    <StatCard label="Available Models" value={`${configuredCount * 2}+`} icon="🧠" delay={2} />
                    <StatCard label="SERP API" value={getSetting('google_cse_api_key')?.has_value ? 'Active' : 'Not Set'} icon="🔍" delay={3} />
                    <StatCard label="Media APIs" value={[getSetting('pexels_api_key')?.has_value, getSetting('unsplash_access_key')?.has_value, getSetting('youtube_api_key')?.has_value].filter(Boolean).length + ' Active'} icon="🖼️" delay={4} />
                </div>

                {/* Tabs */}
                <div className="tabs">
                    <button className={`tab ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
                        🤖 AI Providers ({configuredCount}/{AI_PROVIDERS.length})
                    </button>
                    <button className={`tab ${activeTab === 'routing' ? 'active' : ''}`} onClick={() => setActiveTab('routing')}>
                        🎛️ Model Routing
                    </button>
                    <button className={`tab ${activeTab === 'serp' ? 'active' : ''}`} onClick={() => setActiveTab('serp')}>
                        🔍 SERP & Search
                    </button>
                    <button className={`tab ${activeTab === 'content' ? 'active' : ''}`} onClick={() => setActiveTab('content')}>
                        📝 Content Settings
                    </button>
                    <button className={`tab ${activeTab === 'media' ? 'active' : ''}`} onClick={() => setActiveTab('media')}>
                        🖼️ Media
                    </button>
                    <button className={`tab ${activeTab === 'email' ? 'active' : ''}`} onClick={() => setActiveTab('email')}>
                        📧 Email Providers ({espProviders.length})
                    </button>
                </div>


                {loading ? (
                    <div className="card"><div className="loading-skeleton" style={{ height: 300 }} /></div>
                ) : (
                    <>
                        {/* AI Providers Tab */}
                        {activeTab === 'ai' && (
                            <>
                                {/* Default/Premium Provider Selection */}
                                <div className="card" style={{ marginBottom: 24 }}>
                                    <div className="card-header">
                                        <h2 className="card-title">🎯 Smart AI Routing</h2>
                                        <Badge variant="info">Auto-selects best model per task</Badge>
                                    </div>
                                    <div className="grid-2" style={{ gap: 16 }}>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">Default Provider (Bulk Tasks — Keywords, Scoring, Analysis)</label>
                                            <select className="form-select" value={editValues['default_ai_provider'] || 'gemini'}
                                                onChange={e => setEditValues(p => ({ ...p, default_ai_provider: e.target.value }))}>
                                                {PROVIDER_IDS.map(id => (
                                                    <option key={id} value={id}>{AI_PROVIDERS.find(p => p.key === `${id}_api_key`)?.label || id} {getSetting(`${id}_api_key`)?.has_value ? '✅' : '❌'}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">Premium Provider (Content Writing — Best Quality)</label>
                                            <select className="form-select" value={editValues['premium_ai_provider'] || 'openai'}
                                                onChange={e => setEditValues(p => ({ ...p, premium_ai_provider: e.target.value }))}>
                                                {PROVIDER_IDS.map(id => (
                                                    <option key={id} value={id}>{AI_PROVIDERS.find(p => p.key === `${id}_api_key`)?.label || id} {getSetting(`${id}_api_key`)?.has_value ? '✅' : '❌'}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="text-sm text-muted" style={{ marginTop: 12 }}>
                                        💡 Default provider handles keyword research, content scoring, meta generation. Premium provider is used for article writing and optimization for best quality.
                                    </div>
                                </div>

                                {/* API Key Cards */}
                                <div className="grid-2" style={{ gap: 16 }}>
                                    {AI_PROVIDERS.map((provider) => {
                                        const setting = getSetting(provider.key);
                                        const isConfigured = setting?.has_value;
                                        const isEditing = showKeys[provider.key];

                                        return (
                                            <div key={provider.key} className="card" style={{
                                                borderColor: isConfigured ? 'rgba(34, 197, 94, 0.2)' : 'var(--border-subtle)',
                                            }}>
                                                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                                                    <div className="flex items-center gap-2">
                                                        <span style={{ fontSize: '1.5rem' }}>{provider.icon}</span>
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{provider.label}</div>
                                                            <div className="text-sm text-muted">{provider.desc}</div>
                                                        </div>
                                                    </div>
                                                    <Badge variant={isConfigured ? 'success' : 'neutral'}>
                                                        {isConfigured ? '✅ Active' : 'Not Set'}
                                                    </Badge>
                                                </div>

                                                <div className="flex gap-2">
                                                    <input
                                                        className="form-input"
                                                        type={isEditing ? 'text' : 'password'}
                                                        placeholder="Paste your API key here..."
                                                        value={editValues[provider.key] || ''}
                                                        onChange={e => setEditValues(p => ({ ...p, [provider.key]: e.target.value }))}
                                                        style={{ flex: 1, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
                                                    />
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => setShowKeys(p => ({ ...p, [provider.key]: !p[provider.key] }))}
                                                        title={isEditing ? 'Hide' : 'Show'}
                                                    >
                                                        {isEditing ? '🙈' : '👁️'}
                                                    </button>
                                                </div>

                                                <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
                                                    <a href={provider.docsUrl} target="_blank" rel="noopener" className="text-sm" style={{ color: 'var(--accent-primary-light)', textDecoration: 'none' }}>
                                                        🔗 Get API Key →
                                                    </a>
                                                    {editValues[provider.key] && !editValues[provider.key].startsWith('••') && (
                                                        <button className="btn btn-danger btn-sm" onClick={() => setEditValues(p => ({ ...p, [provider.key]: '' }))}>
                                                            Clear
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* Task Model Routing Tab */}
                        {activeTab === 'routing' && (() => {
                            const groups = Array.from(new Set(TASK_TYPES.map(t => t.group)));
                            return (
                                <div className="card">
                                    <div className="card-header">
                                        <h2 className="card-title">🎛️ Per-Task Model Assignment</h2>
                                        <Badge variant="info">Overrides smart routing for each task</Badge>
                                    </div>
                                    <div className="text-sm text-muted" style={{ marginBottom: 20 }}>
                                        Assign a specific provider + model to each AI task. Leave a task on <strong>Auto</strong> to use the smart routing defaults.
                                        Set <strong>OpenRouter</strong> as provider to access 300+ models with one API key.
                                    </div>

                                    {groups.map(group => (
                                        <div key={group} style={{ marginBottom: 24 }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>
                                                {group}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                {TASK_TYPES.filter(t => t.group === group).map(task => {
                                                    const route = taskRoutes[task.key];
                                                    const selectedProvider = route?.provider || '';
                                                    const selectedModel = route?.model || '';
                                                    
                                                    // Use fetched models if available, fallback to static defaults
                                                    const models = selectedProvider 
                                                        ? (fetchedModels[selectedProvider]?.length ? fetchedModels[selectedProvider] : (PROVIDER_MODELS[selectedProvider] || [])) 
                                                        : [];

                                                    return (
                                                        <div key={task.key} style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: '1fr 160px 1fr auto',
                                                            gap: 10,
                                                            alignItems: 'center',
                                                            padding: '10px 14px',
                                                            background: selectedProvider ? 'rgba(99,102,241,0.04)' : 'var(--surface-secondary)',
                                                            border: `1px solid ${selectedProvider ? 'rgba(99,102,241,0.2)' : 'var(--border-subtle)'}`,
                                                            borderRadius: 'var(--radius-sm)',
                                                        }}>
                                                            <div>
                                                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{task.label}</div>
                                                                <div className="text-sm text-muted">{task.desc}</div>
                                                            </div>

                                                            {/* Provider selector */}
                                                            <select
                                                                className="form-select"
                                                                style={{ fontSize: '0.8rem' }}
                                                                value={selectedProvider}
                                                                onChange={e => setTaskRoute(task.key, 'provider', e.target.value)}
                                                            >
                                                                <option value="">Auto</option>
                                                                {PROVIDER_IDS.map(pid => {
                                                                    const configured = getSetting(`${pid}_api_key`)?.has_value;
                                                                    return (
                                                                        <option key={pid} value={pid} disabled={!configured}>
                                                                            {AI_PROVIDERS.find(p => p.key === `${pid}_api_key`)?.label || pid}
                                                                            {configured ? ' ✅' : ' ❌'}
                                                                        </option>
                                                                    );
                                                                })}
                                                            </select>

                                                            {/* Model selector */}
                                                            <select
                                                                className="form-select"
                                                                style={{ fontSize: '0.8rem' }}
                                                                value={selectedModel}
                                                                onChange={e => setTaskRoute(task.key, 'model', e.target.value)}
                                                                disabled={!selectedProvider}
                                                            >
                                                                {!selectedProvider && <option value="">— select provider first —</option>}
                                                                {models.map(m => (
                                                                    <option key={m.id} value={m.id}>{m.name}</option>
                                                                ))}
                                                            </select>

                                                            {/* Clear button */}
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                style={{ whiteSpace: 'nowrap' }}
                                                                title="Reset to auto"
                                                                onClick={() => setTaskRoutes(prev => {
                                                                    const next = { ...prev };
                                                                    delete next[task.key];
                                                                    return next;
                                                                })}
                                                                disabled={!selectedProvider}
                                                            >
                                                                Reset
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}

                                    <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        💡 <strong>Tip:</strong> The model list is fetched live from the provider API. 
                                        Auto tasks fall back to the Smart Routing defaults based on your AI provider preferences.
                                    </div>
                                </div>
                            );
                        })()}

                        {/* SERP Tab */}
                        {activeTab === 'serp' && (
                            <>
                                {/* DataForSEO */}
                                <div className="card" style={{ marginBottom: 24 }}>
                                    <div className="card-header">
                                        <h2 className="card-title">📊 DataForSEO (Real Keyword Data + Rank Tracking)</h2>
                                        <Badge variant={getSetting('dataforseo_login')?.has_value ? 'success' : 'warning'}>
                                            {getSetting('dataforseo_login')?.has_value ? 'Configured' : 'Not Set'}
                                        </Badge>
                                    </div>
                                    <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
                                        Powers real search volume, keyword difficulty, CPC data, and accurate SERP rank tracking. Start with $1 free credit.
                                    </div>

                                    <div className="grid-2" style={{ gap: 16 }}>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">Login (Email)</label>
                                            <input className="form-input" type="text" placeholder="your@email.com"
                                                value={editValues['dataforseo_login'] || ''}
                                                onChange={e => setEditValues(p => ({ ...p, dataforseo_login: e.target.value }))}
                                                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">API Password</label>
                                            <input className="form-input" type="password" placeholder="Your DataForSEO API password"
                                                value={editValues['dataforseo_password'] || ''}
                                                onChange={e => setEditValues(p => ({ ...p, dataforseo_password: e.target.value }))}
                                                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                                        </div>
                                    </div>
                                    <a href="https://app.dataforseo.com/register" target="_blank" rel="noopener" className="text-sm" style={{ color: 'var(--accent-primary-light)', textDecoration: 'none', display: 'inline-block', marginTop: 8 }}>
                                        🔗 Create DataForSEO Account ($1 free credit) →
                                    </a>

                                    <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        💡 <strong>What it enables:</strong> Real search volumes, keyword difficulty, CPC data, related keywords, accurate rank positions, AI Overview detection, and SERP feature tracking.
                                    </div>
                                </div>

                                {/* Google CSE (Fallback) */}
                                <div className="card">
                                    <div className="card-header">
                                        <h2 className="card-title">🔍 Google Custom Search API (Fallback)</h2>
                                        <Badge variant={getSetting('google_cse_api_key')?.has_value ? 'success' : 'neutral'}>
                                            {getSetting('google_cse_api_key')?.has_value ? 'Configured' : 'Optional'}
                                        </Badge>
                                    </div>
                                    <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
                                        Used as a fallback for competitor analysis when DataForSEO is not configured. Free tier: 100 queries/day.
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">API Key</label>
                                        <input className="form-input" type="password" placeholder="Your Google Custom Search API key"
                                            value={editValues['google_cse_api_key'] || ''}
                                            onChange={e => setEditValues(p => ({ ...p, google_cse_api_key: e.target.value }))}
                                            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                                        <a href="https://developers.google.com/custom-search/v1/introduction" target="_blank" rel="noopener" className="text-sm" style={{ color: 'var(--accent-primary-light)', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}>
                                            🔗 Get API Key →
                                        </a>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Search Engine ID (CX)</label>
                                        <input className="form-input" placeholder="Your Custom Search Engine ID"
                                            value={editValues['google_cse_id'] || ''}
                                            onChange={e => setEditValues(p => ({ ...p, google_cse_id: e.target.value }))}
                                            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                                        <a href="https://programmablesearchengine.google.com/" target="_blank" rel="noopener" className="text-sm" style={{ color: 'var(--accent-primary-light)', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}>
                                            🔗 Create Search Engine →
                                        </a>
                                    </div>
                                </div>

                                {/* Moz API */}
                                <div className="card" style={{ marginTop: 24 }}>
                                    <div className="card-header">
                                        <h2 className="card-title">🔗 Moz API (Backlink Intelligence)</h2>
                                        <Badge variant={getSetting('moz_access_id')?.has_value ? 'success' : 'neutral'}>
                                            {getSetting('moz_access_id')?.has_value ? 'Configured' : 'Optional'}
                                        </Badge>
                                    </div>
                                    <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
                                        Enables real backlink discovery, Domain Authority, and competitor gap analysis. Free tier: 10 rows/query.
                                    </div>
                                    <div className="grid-2" style={{ gap: 16 }}>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">Access ID</label>
                                            <input className="form-input" type="text" placeholder="mozscape-XXXXXXXXXX"
                                                value={editValues['moz_access_id'] || ''}
                                                onChange={e => setEditValues(p => ({ ...p, moz_access_id: e.target.value }))}
                                                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">Secret Key</label>
                                            <input className="form-input" type="password" placeholder="Your Moz secret key"
                                                value={editValues['moz_secret_key'] || ''}
                                                onChange={e => setEditValues(p => ({ ...p, moz_secret_key: e.target.value }))}
                                                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                                        </div>
                                    </div>
                                    <a href="https://moz.com/products/api" target="_blank" rel="noopener" className="text-sm" style={{ color: 'var(--accent-primary-light)', textDecoration: 'none', display: 'inline-block', marginTop: 8 }}>
                                        🔗 Get Moz API Access →
                                    </a>
                                </div>

                                {/* Google Search Console */}
                                <div className="card" style={{ marginTop: 24 }}>
                                    <div className="card-header">
                                        <h2 className="card-title">📈 Google Search Console (OAuth)</h2>
                                        <Badge variant={getSetting('gsc_client_id')?.has_value ? 'success' : 'neutral'}>
                                            {getSetting('gsc_client_id')?.has_value ? 'Configured' : 'Optional'}
                                        </Badge>
                                    </div>
                                    <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
                                        Real impressions, clicks, CTR, and average position from Google Search Console.
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">OAuth Client ID</label>
                                        <input className="form-input" type="text" placeholder="xxxx.apps.googleusercontent.com"
                                            value={editValues['gsc_client_id'] || ''}
                                            onChange={e => setEditValues(p => ({ ...p, gsc_client_id: e.target.value }))}
                                            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">OAuth Client Secret</label>
                                        <input className="form-input" type="password" placeholder="GOCSPX-xxxx"
                                            value={editValues['gsc_client_secret'] || ''}
                                            onChange={e => setEditValues(p => ({ ...p, gsc_client_secret: e.target.value }))}
                                            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">OAuth Refresh Token</label>
                                        <input className="form-input" type="password" placeholder="1//0xxxx"
                                            value={editValues['gsc_refresh_token'] || ''}
                                            onChange={e => setEditValues(p => ({ ...p, gsc_refresh_token: e.target.value }))}
                                            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                                    </div>
                                    <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" className="text-sm" style={{ color: 'var(--accent-primary-light)', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}>
                                        🔗 Create OAuth Credentials →
                                    </a>
                                </div>
                            </>
                        )}

                        {/* Content Settings Tab */}
                        {activeTab === 'content' && (
                            <div className="card">
                                <div className="card-header">
                                    <h2 className="card-title">📝 Content Generation Settings</h2>
                                </div>

                                <div className="grid-2" style={{ gap: 16 }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Default Publish Status</label>
                                        <select className="form-select" value={editValues['auto_publish_default'] || 'draft'}
                                            onChange={e => setEditValues(p => ({ ...p, auto_publish_default: e.target.value }))}>
                                            <option value="draft">Draft (Review First)</option>
                                            <option value="publish">Publish Immediately</option>
                                        </select>
                                    </div>

                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Word Count Multiplier (vs competitors)</label>
                                        <input className="form-input" type="number" step="0.1" min="1" max="3"
                                            value={editValues['target_word_count_multiplier'] || '1.3'}
                                            onChange={e => setEditValues(p => ({ ...p, target_word_count_multiplier: e.target.value }))} />
                                        <div className="text-sm text-muted" style={{ marginTop: 4 }}>1.3 = 30% longer than competitor average</div>
                                    </div>

                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Max Keywords per AI Discovery</label>
                                        <input className="form-input" type="number" min="5" max="50"
                                            value={editValues['max_keywords_per_discovery'] || '20'}
                                            onChange={e => setEditValues(p => ({ ...p, max_keywords_per_discovery: e.target.value }))} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Media Tab */}
                        {activeTab === 'media' && (
                            <>
                                {/* Image Provider Selection */}
                                <div className="card" style={{ marginBottom: 24 }}>
                                    <div className="card-header">
                                        <h2 className="card-title">🖼️ Stock Image Provider</h2>
                                        <Badge variant={getSetting('pexels_api_key')?.has_value || getSetting('unsplash_access_key')?.has_value ? 'success' : 'warning'}>
                                            {getSetting('pexels_api_key')?.has_value || getSetting('unsplash_access_key')?.has_value ? 'Configured' : 'Not Set'}
                                        </Badge>
                                    </div>
                                    <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
                                        Replaces image placeholders in generated articles with real stock photos. Configure at least one provider.
                                    </div>

                                    <div className="form-group" style={{ marginBottom: 20 }}>
                                        <label className="form-label">Active Image Provider</label>
                                        <select className="form-select" value={editValues['image_provider'] || 'pexels'}
                                            onChange={e => setEditValues(p => ({ ...p, image_provider: e.target.value }))}>
                                            <option value="pexels">📸 Pexels (Free — 200 req/hr)</option>
                                            <option value="unsplash">📷 Unsplash (Free — 50 req/hr)</option>
                                            <option value="shutterstock">🏢 Shutterstock (Paid — Unlimited)</option>
                                            <option value="adobe_stock">🎨 Adobe Stock (Paid — Unlimited)</option>
                                        </select>
                                        <div className="text-sm text-muted" style={{ marginTop: 4 }}>If the selected provider fails, others with configured keys will be tried as fallback.</div>
                                    </div>

                                    <div className="grid-2" style={{ gap: 16 }}>
                                        {[
                                            { key: 'pexels_api_key', label: 'Pexels API Key', icon: '📸', desc: 'Free — 200 requests/hour', docsUrl: 'https://www.pexels.com/api/', type: 'free' },
                                            { key: 'unsplash_access_key', label: 'Unsplash Access Key', icon: '📷', desc: 'Free — 50 requests/hour', docsUrl: 'https://unsplash.com/developers', type: 'free' },
                                            { key: 'shutterstock_api_token', label: 'Shutterstock API Token', icon: '🏢', desc: 'Paid — watermark-free licensed images', docsUrl: 'https://www.shutterstock.com/developers', type: 'paid' },
                                            { key: 'adobe_stock_api_key', label: 'Adobe Stock API Key', icon: '🎨', desc: 'Paid — premium stock photos', docsUrl: 'https://developer.adobe.com/stock/', type: 'paid' },
                                        ].map(provider => {
                                            const isConfigured = getSetting(provider.key)?.has_value;
                                            return (
                                                <div key={provider.key} className="card" style={{
                                                    borderColor: isConfigured ? 'rgba(34, 197, 94, 0.2)' : 'var(--border-subtle)',
                                                }}>
                                                    <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                                                        <div className="flex items-center gap-2">
                                                            <span style={{ fontSize: '1.3rem' }}>{provider.icon}</span>
                                                            <div>
                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{provider.label}</div>
                                                                <div className="text-sm text-muted">{provider.desc}</div>
                                                            </div>
                                                        </div>
                                                        <Badge variant={isConfigured ? 'success' : 'neutral'}>
                                                            {isConfigured ? '✅' : provider.type === 'free' ? 'Free' : 'Paid'}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <input
                                                            className="form-input"
                                                            type={showKeys[provider.key] ? 'text' : 'password'}
                                                            placeholder="Paste API key..."
                                                            value={editValues[provider.key] || ''}
                                                            onChange={e => setEditValues(p => ({ ...p, [provider.key]: e.target.value }))}
                                                            style={{ flex: 1, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
                                                        />
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => setShowKeys(p => ({ ...p, [provider.key]: !p[provider.key] }))}
                                                        >
                                                            {showKeys[provider.key] ? '🙈' : '👁️'}
                                                        </button>
                                                    </div>
                                                    <a href={provider.docsUrl} target="_blank" rel="noopener" className="text-sm" style={{ color: 'var(--accent-primary-light)', textDecoration: 'none', display: 'inline-block', marginTop: 6 }}>
                                                        🔗 Get API Key →
                                                    </a>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* YouTube API */}
                                <div className="card">
                                    <div className="card-header">
                                        <h2 className="card-title">▶️ YouTube Video Embeds</h2>
                                        <Badge variant={getSetting('youtube_api_key')?.has_value ? 'success' : 'neutral'}>
                                            {getSetting('youtube_api_key')?.has_value ? 'Configured' : 'Optional'}
                                        </Badge>
                                    </div>
                                    <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
                                        Automatically embeds 1-2 relevant YouTube videos in each article. AI selects the best videos by relevance, quality, and authority. Adds VideoObject schema for SEO.
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">YouTube Data API v3 Key</label>
                                        <div className="flex gap-2">
                                            <input className="form-input"
                                                type={showKeys['youtube_api_key'] ? 'text' : 'password'}
                                                placeholder="AIzaSy..."
                                                value={editValues['youtube_api_key'] || ''}
                                                onChange={e => setEditValues(p => ({ ...p, youtube_api_key: e.target.value }))}
                                                style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => setShowKeys(p => ({ ...p, youtube_api_key: !p.youtube_api_key }))}
                                            >
                                                {showKeys['youtube_api_key'] ? '🙈' : '👁️'}
                                            </button>
                                        </div>
                                        <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener" className="text-sm" style={{ color: 'var(--accent-primary-light)', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}>
                                            🔗 Enable YouTube Data API & Get Key →
                                        </a>
                                    </div>

                                    <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        💡 <strong>Free tier:</strong> 10,000 units/day (~100 articles). Videos use lazy-loading iframes — zero performance impact until user clicks play.
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Email Providers Tab */}
                        {activeTab === 'email' && (
                            <>
                                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                                    {(['connected', 'connect'] as const).map(t => (
                                        <button key={t} className={`btn btn-sm ${espTab === t ? 'btn-primary' : ''}`} onClick={() => setEspTab(t)} style={{ textTransform: 'capitalize' }}>
                                            {t === 'connected' ? `Connected (${espProviders.length})` : '+ Connect'}
                                        </button>
                                    ))}
                                </div>

                                {espTab === 'connect' && (
                                    <div className="card" style={{ marginBottom: 16 }}>
                                        <h3 className="card-title" style={{ marginBottom: 16 }}>Connect Email Provider</h3>
                                        <div className="form-group">
                                            <label className="form-label">Provider</label>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                                                {Object.entries(ESP_PROVIDER_INFO).map(([key, p]) => (
                                                    <button key={key} className={`btn btn-sm ${espSelectedProvider === key ? 'btn-primary' : ''}`} onClick={() => setEspSelectedProvider(key)} style={{ textTransform: 'capitalize' }}>
                                                        {p.icon} {key}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                            <div className="form-group" style={{ margin: 0 }}>
                                                <label className="form-label">Connection Name <span className="text-muted text-sm">(optional)</span></label>
                                                <input className="form-input" value={espName} onChange={e => setEspName(e.target.value)} placeholder="My Blog List" />
                                            </div>
                                            <div className="form-group" style={{ margin: 0 }}>
                                                <label className="form-label">API Key / Secret * <a href={espInfo.docs_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', marginLeft: 4 }}>Get key →</a></label>
                                                <input className="form-input" value={espApiKey} onChange={e => setEspApiKey(e.target.value)} placeholder={espSelectedProvider === 'convertkit' ? 'API Secret key' : 'API Key'} type="password" />
                                            </div>
                                            {espSelectedProvider === 'mailchimp' && (
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label className="form-label">Server Prefix <span className="text-muted text-sm">(from API key, e.g. us1)</span></label>
                                                    <input className="form-input" value={espServerPrefix} onChange={e => setEspServerPrefix(e.target.value)} placeholder="us1" />
                                                </div>
                                            )}
                                            {espSelectedProvider === 'beehiiv' && (
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label className="form-label">Publication ID</label>
                                                    <input className="form-input" value={espAccountId} onChange={e => setEspAccountId(e.target.value)} placeholder="pub_..." />
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 12 }}>
                                            <div className="text-sm text-muted">🔒 API keys encrypted at rest. Never shared. Used only for subscriber sync + sending.</div>
                                        </div>

                                        <button className="btn btn-primary" onClick={connectEsp} disabled={espConnecting}>{espConnecting ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Connecting...</> : `Connect ${espSelectedProvider}`}</button>
                                    </div>
                                )}

                                {espTab === 'connected' && (
                                    espProviders.length === 0 ? (
                                        <EmptyState icon="📧" title="No email providers connected" description="Connect ConvertKit, Mailchimp, or Beehiiv to sync subscribers and send emails" />
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {espProviders.map((p, i) => {
                                                const pInfo = ESP_PROVIDER_INFO[p.provider] || { icon: '📧', color: '#6366f1' };
                                                return (
                                                    <div key={i} className="card" style={{ padding: '16px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                                <div style={{ width: 44, height: 44, borderRadius: 10, background: pInfo.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>{pInfo.icon}</div>
                                                                <div>
                                                                    <div style={{ fontWeight: 700 }}>{p.name}</div>
                                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                                        <Badge variant="success">{p.provider}</Badge>
                                                                        <span style={{ fontWeight: 700, color: '#16a34a', fontSize: '1.1rem' }}>{p.subscriber_count.toLocaleString()}</span>
                                                                        <span className="text-sm text-muted">subscribers</span>
                                                                    </div>
                                                                    <div className="text-sm text-muted">Last synced: {new Date(p.last_synced).toLocaleDateString()}</div>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 6 }}>
                                                                <button className="btn btn-sm" onClick={() => syncEsp(p.id)} disabled={espSyncing === p.id}>{espSyncing === p.id ? '...' : '🔄 Sync'}</button>
                                                                <button className="btn btn-sm" onClick={() => disconnectEsp(p.id)} style={{ color: '#dc2626' }}>Disconnect</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )
                                )}
                            </>
                        )}
                    </>

                )}
            </main>
        </div>
    );
}
