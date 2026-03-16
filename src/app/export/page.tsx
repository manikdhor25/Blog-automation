'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';

type ExportFormat = 'markdown' | 'html' | 'csv' | 'json' | 'pdf';

interface ExportableItem {
    id: string;
    title: string;
    type: 'keyword' | 'post' | 'site';
    data: Record<string, unknown>;
}

export default function ExportPage() {
    const [keywords, setKeywords] = useState<ExportableItem[]>([]);
    const [queueItems, setQueueItems] = useState<ExportableItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
    const [exportType, setExportType] = useState<'keywords' | 'queue'>('keywords');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [kwRes, queueRes] = await Promise.allSettled([
                    fetch('/api/keywords').then(r => r.json()),
                    fetch('/api/queue').then(r => r.json()),
                ]);

                if (kwRes.status === 'fulfilled') {
                    setKeywords((kwRes.value.keywords || []).map((k: Record<string, unknown>) => ({
                        id: k.id as string,
                        title: k.keyword as string,
                        type: 'keyword' as const,
                        data: k,
                    })));
                }

                if (queueRes.status === 'fulfilled') {
                    setQueueItems((queueRes.value.items || []).map((item: Record<string, unknown>) => ({
                        id: item.id as string,
                        title: item.title as string,
                        type: 'post' as const,
                        data: item,
                    })));
                }
            } catch {
                // ignore
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const exportData = (items: ExportableItem[], format: ExportFormat) => {
        let content = '';
        let filename = '';
        let mimeType = '';

        if (format === 'csv') {
            if (exportType === 'keywords') {
                content = 'Keyword,Search Volume,Difficulty,CPC,Intent,Priority,Status\n';
                items.forEach(item => {
                    const d = item.data;
                    content += `"${d.keyword}",${d.search_volume || 0},${d.difficulty || 0},${d.cpc || 0},"${d.intent_type || ''}",${d.priority_score || 0},"${d.status || ''}"\n`;
                });
            } else {
                content = 'Title,Keyword,Status,Score,Site,Created\n';
                items.forEach(item => {
                    const d = item.data;
                    content += `"${d.title}","${d.keyword}","${d.status}",${d.score || 0},"${d.siteName || ''}","${d.createdAt || ''}"\n`;
                });
            }
            filename = `rankmaster_${exportType}_${new Date().toISOString().split('T')[0]}.csv`;
            mimeType = 'text/csv';
        } else if (format === 'json') {
            content = JSON.stringify(items.map(i => i.data), null, 2);
            filename = `rankmaster_${exportType}_${new Date().toISOString().split('T')[0]}.json`;
            mimeType = 'application/json';
        } else if (format === 'markdown') {
            content = `# RankMaster Pro — ${exportType === 'keywords' ? 'Keywords' : 'Content Queue'} Export\n\n`;
            content += `*Exported: ${new Date().toLocaleString()}*\n\n`;
            if (exportType === 'keywords') {
                content += '| Keyword | Volume | Difficulty | CPC | Intent | Status |\n|---------|--------|------------|-----|--------|--------|\n';
                items.forEach(item => {
                    const d = item.data;
                    content += `| ${d.keyword} | ${d.search_volume || 0} | ${d.difficulty || 0} | $${d.cpc || 0} | ${d.intent_type || '-'} | ${d.status || '-'} |\n`;
                });
            } else {
                content += '| Title | Keyword | Status | Score |\n|-------|---------|--------|-------|\n';
                items.forEach(item => {
                    const d = item.data;
                    content += `| ${d.title} | ${d.keyword} | ${d.status} | ${d.score || 0} |\n`;
                });
            }
            filename = `rankmaster_${exportType}_${new Date().toISOString().split('T')[0]}.md`;
            mimeType = 'text/markdown';
        } else {
            // HTML
            content = `<!DOCTYPE html><html><head><title>RankMaster Export</title><style>body{font-family:system-ui;padding:20px;background:#1a1a2e;color:#eee}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:8px;text-align:left}th{background:#16213e}tr:nth-child(even){background:#0f3460}</style></head><body>`;
            content += `<h1>${exportType === 'keywords' ? 'Keywords' : 'Content Queue'} Export</h1>`;
            if (exportType === 'keywords') {
                content += '<table><tr><th>Keyword</th><th>Volume</th><th>Difficulty</th><th>CPC</th><th>Intent</th><th>Status</th></tr>';
                items.forEach(item => {
                    const d = item.data;
                    content += `<tr><td>${d.keyword}</td><td>${d.search_volume || 0}</td><td>${d.difficulty || 0}</td><td>$${d.cpc || 0}</td><td>${d.intent_type || '-'}</td><td>${d.status || '-'}</td></tr>`;
                });
            } else {
                content += '<table><tr><th>Title</th><th>Keyword</th><th>Status</th><th>Score</th></tr>';
                items.forEach(item => {
                    const d = item.data;
                    content += `<tr><td>${d.title}</td><td>${d.keyword}</td><td>${d.status}</td><td>${d.score || 0}</td></tr>`;
                });
            }
            content += '</table></body></html>';
            filename = `rankmaster_${exportType}_${new Date().toISOString().split('T')[0]}.html`;
            mimeType = 'text/html';
        }

        // Trigger download
        if (format === 'pdf') {
            // Use print-to-PDF via a new window
            const win = window.open('', '_blank');
            if (win) {
                const htmlContent = `<!DOCTYPE html><html><head><title>RankMaster Export</title><style>body{font-family:system-ui;padding:40px;color:#222;max-width:900px;margin:0 auto}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:13px}th{background:#f5f5f5;font-weight:600}tr:nth-child(even){background:#fafafa}h1{font-size:22px;margin-bottom:4px}p{color:#666;font-size:13px}@media print{body{padding:20px}}</style></head><body>`;
                let tableContent = `<h1>RankMaster Pro — ${exportType === 'keywords' ? 'Keywords' : 'Content Queue'} Report</h1>`;
                tableContent += `<p>Generated: ${new Date().toLocaleString()} · ${items.length} items</p>`;
                if (exportType === 'keywords') {
                    tableContent += '<table><tr><th>Keyword</th><th>Volume</th><th>Difficulty</th><th>CPC</th><th>Intent</th><th>Status</th></tr>';
                    items.forEach(item => {
                        const d = item.data;
                        tableContent += `<tr><td>${d.keyword}</td><td>${d.search_volume || 0}</td><td>${d.difficulty || 0}</td><td>$${d.cpc || 0}</td><td>${d.intent_type || '-'}</td><td>${d.status || '-'}</td></tr>`;
                    });
                } else {
                    tableContent += '<table><tr><th>Title</th><th>Keyword</th><th>Status</th><th>Score</th></tr>';
                    items.forEach(item => {
                        const d = item.data;
                        tableContent += `<tr><td>${d.title}</td><td>${d.keyword}</td><td>${d.status}</td><td>${d.score || 0}</td></tr>`;
                    });
                }
                tableContent += '</table>';
                win.document.write(htmlContent + tableContent + '</body></html>');
                win.document.close();
                setTimeout(() => { win.print(); }, 500);
            }
            return;
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const currentItems = exportType === 'keywords' ? keywords : queueItems;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Export Data</h1>
                        <p className="page-description">Export keywords, content, and reports</p>
                    </div>
                </div>

                {/* Export Controls */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Data Type</label>
                            <select className="form-select" value={exportType} onChange={e => setExportType(e.target.value as 'keywords' | 'queue')}>
                                <option value="keywords">Keywords ({keywords.length})</option>
                                <option value="queue">Publish Queue ({queueItems.length})</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Format</label>
                            <select className="form-select" value={exportFormat} onChange={e => setExportFormat(e.target.value as ExportFormat)}>
                                <option value="csv">CSV (Spreadsheet)</option>
                                <option value="json">JSON (Data)</option>
                                <option value="markdown">Markdown (Report)</option>
                                <option value="html">HTML (Styled)</option>
                                <option value="pdf">PDF (Print)</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <button className="btn btn-primary" disabled={currentItems.length === 0} onClick={() => exportData(currentItems, exportFormat)} style={{ width: '100%' }}>
                                📥 Export {currentItems.length} Items
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Badge variant="info">CSV</Badge><span className="text-sm text-muted">Spreadsheets</span>
                        <Badge variant="success">JSON</Badge><span className="text-sm text-muted">Integrations</span>
                        <Badge variant="warning">Markdown</Badge><span className="text-sm text-muted">Reports</span>
                        <Badge variant="neutral">HTML</Badge><span className="text-sm text-muted">Styled pages</span>
                        <Badge variant="danger">PDF</Badge><span className="text-sm text-muted">Print-ready</span>
                    </div>
                </div>

                {/* Preview */}
                <div className="card">
                    <div className="card-header">
                        <h2 className="card-title">📋 Data Preview ({currentItems.length} items)</h2>
                    </div>
                    {loading ? (
                        <div className="loading-skeleton" style={{ height: 200 }} />
                    ) : currentItems.length === 0 ? (
                        <EmptyState icon="📋" title="No Data to Export" description={exportType === 'keywords' ? 'Add keywords in the Keyword Intel page first.' : 'Create content through the Content Writer to populate the queue.'} />
                    ) : (
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        {exportType === 'keywords'
                                            ? <><th>Keyword</th><th>Volume</th><th>Difficulty</th><th>Intent</th><th>Status</th></>
                                            : <><th>Title</th><th>Keyword</th><th>Status</th><th>Score</th></>
                                        }
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentItems.slice(0, 20).map(item => (
                                        <tr key={item.id}>
                                            {exportType === 'keywords' ? (
                                                <>
                                                    <td style={{ fontWeight: 600 }}>{item.data.keyword as string}</td>
                                                    <td>{(item.data.search_volume as number) || 0}</td>
                                                    <td>{(item.data.difficulty as number) || 0}</td>
                                                    <td><Badge variant="info">{(item.data.intent_type as string) || '-'}</Badge></td>
                                                    <td><Badge variant="success">{(item.data.status as string) || '-'}</Badge></td>
                                                </>
                                            ) : (
                                                <>
                                                    <td style={{ fontWeight: 600 }}>{item.data.title as string}</td>
                                                    <td className="text-sm">{item.data.keyword as string}</td>
                                                    <td><Badge variant="info">{item.data.status as string}</Badge></td>
                                                    <td>{(item.data.score as number) || 0}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {currentItems.length > 20 && (
                                <div className="text-sm text-muted" style={{ padding: 12, textAlign: 'center' }}>
                                    Showing 20 of {currentItems.length} items. All items will be included in the export.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
