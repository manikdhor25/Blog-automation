'use client';

import React, { useState } from 'react';

export default function TestStreamPage() {
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
    const [result, setResult] = useState<string>('');

    const addLog = (msg: string) => {
        const ts = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, `[${ts}] ${msg}`]);
    };

    const runTest = async () => {
        setLogs([]);
        setStatus('running');
        setResult('');
        addLog('Starting SSE stream test...');

        try {
            const res = await fetch('/api/test-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword: 'test seo article' }),
            });

            addLog(`Response status: ${res.status} ${res.statusText}`);
            addLog(`Content-Type: ${res.headers.get('content-type')}`);

            if (!res.ok || !res.body) {
                addLog(`❌ Response not OK or no body`);
                setStatus('error');
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let eventCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    addLog(`Stream ended (reader.done = true)`);
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                addLog(`Received chunk: ${chunk.length} bytes`);
                buffer += chunk;

                // Split on \n\n (SSE event boundary)
                const events = buffer.split('\n\n');
                buffer = events.pop() || '';

                for (const eventBlock of events) {
                    const trimmed = eventBlock.trim();
                    if (!trimmed) continue;

                    eventCount++;
                    let eventType = '(none)';
                    let dataStr = '';

                    for (const line of trimmed.split('\n')) {
                        if (line.startsWith('event: ')) eventType = line.slice(7).trim();
                        else if (line.startsWith('data: ')) dataStr += line.slice(6);
                    }

                    addLog(`Event #${eventCount}: type="${eventType}", data length=${dataStr.length}`);

                    try {
                        const data = JSON.parse(dataStr);

                        if (eventType === 'complete') {
                            addLog(`✅ COMPLETE event received!`);
                            addLog(`  - content.title: ${data.content?.title}`);
                            addLog(`  - content.content length: ${data.content?.content?.length}`);
                            addLog(`  - score.overall: ${data.score?.overall}`);
                            setResult(JSON.stringify(data, null, 2).substring(0, 2000));
                            setStatus('done');
                            return;
                        } else if (eventType === 'error') {
                            addLog(`❌ ERROR event: ${data.message}`);
                            setStatus('error');
                            return;
                        } else if (eventType === 'stage') {
                            addLog(`  Stage: ${data.stage} - ${data.message}`);
                        } else if (eventType === 'content_raw') {
                            addLog(`  Content preview: ${data.content?.substring(0, 100)}...`);
                        }
                    } catch (e) {
                        addLog(`  ⚠️ JSON parse failed: ${e}`);
                    }
                }
            }

            // Process remaining buffer
            if (buffer.trim()) {
                addLog(`Processing remaining buffer: ${buffer.length} bytes`);
                // same logic...
            }

            if (status !== 'done') {
                addLog(`⚠️ Stream ended without complete event`);
                setStatus('error');
            }
        } catch (error) {
            addLog(`❌ Fetch error: ${error instanceof Error ? error.message : error}`);
            setStatus('error');
        }
    };

    const runRealTest = async () => {
        setLogs([]);
        setStatus('running');
        setResult('');
        addLog('Starting REAL content stream test (same as Create page)...');

        try {
            const res = await fetch('/api/content/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword: 'best wireless headphones' }),
            });

            addLog(`Response status: ${res.status} ${res.statusText}`);

            if (!res.ok || !res.body) {
                const text = await res.text();
                addLog(`❌ Response not OK: ${text.substring(0, 500)}`);
                setStatus('error');
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let eventCount = 0;
            const startTime = Date.now();

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    addLog(`Stream ended after ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                addLog(`[${elapsed}s] Chunk: ${chunk.length} bytes`);
                buffer += chunk;

                const events = buffer.split('\n\n');
                buffer = events.pop() || '';

                for (const eventBlock of events) {
                    const trimmed = eventBlock.trim();
                    if (!trimmed) continue;

                    eventCount++;
                    let eventType = '(none)';
                    let dataStr = '';

                    for (const line of trimmed.split('\n')) {
                        if (line.startsWith('event: ')) eventType = line.slice(7).trim();
                        else if (line.startsWith('data: ')) dataStr += line.slice(6);
                    }

                    const elapsedNow = ((Date.now() - startTime) / 1000).toFixed(1);

                    if (eventType === 'complete') {
                        addLog(`[${elapsedNow}s] ✅ COMPLETE #${eventCount} (${dataStr.length} bytes)`);
                        try {
                            const data = JSON.parse(dataStr);
                            addLog(`  Title: ${data.content?.title}`);
                            addLog(`  Content length: ${data.content?.content?.length || 0}`);
                            addLog(`  Score: ${data.score?.overall}`);
                            setResult(`Title: ${data.content?.title}\nContent: ${data.content?.content?.substring(0, 500)}...`);
                        } catch { addLog('  ⚠️ Failed to parse complete data'); }
                        setStatus('done');
                        return;
                    } else if (eventType === 'error') {
                        try {
                            const data = JSON.parse(dataStr);
                            addLog(`[${elapsedNow}s] ❌ ERROR #${eventCount}: ${data.message}`);
                        } catch { addLog(`[${elapsedNow}s] ❌ ERROR: ${dataStr.substring(0, 200)}`); }
                        setStatus('error');
                        return;
                    } else if (eventType === 'stage') {
                        try {
                            const data = JSON.parse(dataStr);
                            addLog(`[${elapsedNow}s] 📋 Stage: ${data.stage} - ${data.message}`);
                        } catch { addLog(`[${elapsedNow}s] 📋 Stage event (parse failed)`); }
                    } else {
                        addLog(`[${elapsedNow}s] 📦 Event #${eventCount}: ${eventType} (${dataStr.length} bytes)`);
                    }
                }
            }

            if (status !== 'done') {
                addLog(`⚠️ Stream ended after ${eventCount} events without 'complete'`);
                setStatus('error');
            }
        } catch (error) {
            addLog(`❌ Error: ${error instanceof Error ? error.message : error}`);
            setStatus('error');
        }
    };

    return (
        <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', fontFamily: 'monospace' }}>
            <h1>🔧 SSE Stream Diagnostic</h1>
            <p>This page tests the SSE streaming pipeline independently from the Create page.</p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <button onClick={runTest} disabled={status === 'running'}
                    style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                    🧪 Quick Test (1 AI call)
                </button>
                <button onClick={runRealTest} disabled={status === 'running'}
                    style={{ padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                    🚀 Real Test (full pipeline)
                </button>
            </div>

            <div style={{ marginBottom: 16 }}>
                Status: <strong style={{ color: status === 'done' ? '#22c55e' : status === 'error' ? '#ef4444' : status === 'running' ? '#eab308' : '#888' }}>
                    {status.toUpperCase()}
                </strong>
            </div>

            <div style={{
                background: '#111', color: '#0f0', padding: 16, borderRadius: 8,
                maxHeight: 500, overflow: 'auto', fontSize: 13, lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
                {logs.length === 0 ? 'Click a button to start...' : logs.map((log, i) => (
                    <div key={i} style={{ color: log.includes('❌') ? '#ef4444' : log.includes('✅') ? '#22c55e' : log.includes('⚠️') ? '#eab308' : '#0f0' }}>
                        {log}
                    </div>
                ))}
            </div>

            {result && (
                <div style={{ marginTop: 16 }}>
                    <h3>Result:</h3>
                    <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: 16, borderRadius: 8, overflow: 'auto', maxHeight: 300, fontSize: 12 }}>
                        {result}
                    </pre>
                </div>
            )}
        </div>
    );
}
