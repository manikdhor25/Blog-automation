'use client';

import React, { useState, useMemo } from 'react';

interface Column<T> {
    key: string;
    label: string;
    render?: (row: T) => React.ReactNode;
    sortable?: boolean;
    width?: string;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    pageSize?: number;
    searchable?: boolean;
    searchKeys?: string[];
    emptyIcon?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    onRowClick?: (row: T) => void;
}

export default function DataTable<T extends Record<string, unknown>>({
    columns,
    data,
    pageSize = 10,
    searchable = true,
    searchKeys = [],
    emptyIcon = '📋',
    emptyTitle = 'No Data',
    emptyDescription = 'No items to display.',
    onRowClick,
}: DataTableProps<T>) {
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    // Filter
    const filtered = useMemo(() => {
        if (!search.trim()) return data;
        const q = search.toLowerCase();
        const keys = searchKeys.length > 0 ? searchKeys : columns.map(c => c.key);
        return data.filter(row =>
            keys.some(k => {
                const val = row[k];
                return val !== null && val !== undefined && String(val).toLowerCase().includes(q);
            })
        );
    }, [data, search, searchKeys, columns]);

    // Sort
    const sorted = useMemo(() => {
        if (!sortKey) return filtered;
        return [...filtered].sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
            }
            const cmp = String(aVal).localeCompare(String(bVal));
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [filtered, sortKey, sortDir]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const pageData = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
        setCurrentPage(1);
    };

    // Reset page on search
    const handleSearch = (v: string) => {
        setSearch(v);
        setCurrentPage(1);
    };

    if (data.length === 0 && !search) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">{emptyIcon}</div>
                <div className="empty-state-title">{emptyTitle}</div>
                <div className="empty-state-text">{emptyDescription}</div>
            </div>
        );
    }

    return (
        <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                {searchable && (
                    <div style={{ position: 'relative', minWidth: 240, flex: '0 1 320px' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', opacity: 0.5 }}>🔍</span>
                        <input
                            className="form-input"
                            placeholder="Search..."
                            value={search}
                            onChange={e => handleSearch(e.target.value)}
                            style={{ paddingLeft: 34, fontSize: '0.85rem' }}
                        />
                    </div>
                )}
                <div className="text-sm text-muted">
                    {sorted.length} item{sorted.length !== 1 ? 's' : ''}
                    {search && ` (filtered from ${data.length})`}
                </div>
            </div>

            {/* Table */}
            <div className="table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            {columns.map(col => (
                                <th
                                    key={col.key}
                                    style={{
                                        cursor: col.sortable !== false ? 'pointer' : 'default',
                                        width: col.width,
                                        userSelect: 'none',
                                    }}
                                    onClick={() => col.sortable !== false && handleSort(col.key)}
                                >
                                    {col.label}
                                    {sortKey === col.key && (
                                        <span style={{ marginLeft: 4, fontSize: '0.65rem' }}>
                                            {sortDir === 'asc' ? '▲' : '▼'}
                                        </span>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {pageData.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                    No matching results for &ldquo;{search}&rdquo;
                                </td>
                            </tr>
                        ) : (
                            pageData.map((row, i) => (
                                <tr
                                    key={i}
                                    onClick={() => onRowClick?.(row)}
                                    style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                                >
                                    {columns.map(col => (
                                        <td key={col.key}>
                                            {col.render
                                                ? col.render(row)
                                                : row[col.key] != null ? String(row[col.key]) : '—'}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: 16, padding: '8px 0',
                }}>
                    <div className="text-sm text-muted">
                        Page {safePage} of {totalPages}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            disabled={safePage <= 1}
                            onClick={() => setCurrentPage(1)}
                        >
                            «
                        </button>
                        <button
                            className="btn btn-secondary btn-sm"
                            disabled={safePage <= 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        >
                            ‹ Prev
                        </button>

                        {/* Page numbers */}
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let page: number;
                            if (totalPages <= 5) {
                                page = i + 1;
                            } else if (safePage <= 3) {
                                page = i + 1;
                            } else if (safePage >= totalPages - 2) {
                                page = totalPages - 4 + i;
                            } else {
                                page = safePage - 2 + i;
                            }
                            return (
                                <button
                                    key={page}
                                    className={`btn ${page === safePage ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                    onClick={() => setCurrentPage(page)}
                                    style={{ minWidth: 36, justifyContent: 'center' }}
                                >
                                    {page}
                                </button>
                            );
                        })}

                        <button
                            className="btn btn-secondary btn-sm"
                            disabled={safePage >= totalPages}
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        >
                            Next ›
                        </button>
                        <button
                            className="btn btn-secondary btn-sm"
                            disabled={safePage >= totalPages}
                            onClick={() => setCurrentPage(totalPages)}
                        >
                            »
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
