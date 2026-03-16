'use client';

import React from 'react';

interface ScoreBarProps {
    label: string;
    score: number;
    maxScore?: number;
}

export function ScoreBar({ label, score, maxScore = 100 }: ScoreBarProps) {
    const percentage = (score / maxScore) * 100;
    const level = percentage >= 80 ? 'excellent' : percentage >= 60 ? 'good' : percentage >= 40 ? 'average' : 'poor';

    return (
        <div className="score-bar-item">
            <span className="score-bar-label">{label}</span>
            <div className="score-bar-track">
                <div className={`score-bar-fill ${level}`} style={{ width: `${percentage}%` }} />
            </div>
            <span className="score-bar-value">{score}</span>
        </div>
    );
}

interface ScoreRingProps {
    score: number;
    size?: number;
}

export function ScoreRing({ score, size = 80 }: ScoreRingProps) {
    const level = score >= 80 ? 'score-excellent' : score >= 60 ? 'score-good' : score >= 40 ? 'score-average' : 'score-poor';

    return (
        <div
            className={`score-ring ${level}`}
            style={{
                width: size,
                height: size,
                '--score-pct': `${score}%`,
            } as React.CSSProperties}
        >
            {score}
        </div>
    );
}

interface StatCardProps {
    label: string;
    value: string | number;
    change?: string;
    positive?: boolean;
    icon?: string;
    delay?: number;
}

export function StatCard({ label, value, change, positive, icon, delay = 0 }: StatCardProps) {
    return (
        <div className={`stat-card animate-in`} style={{ animationDelay: `${delay * 0.1}s` }}>
            <div className="flex items-center justify-between">
                <span className="stat-label">{label}</span>
                {icon && <span style={{ fontSize: '1.4rem', opacity: 0.6 }}>{icon}</span>}
            </div>
            <div className="stat-value">{value}</div>
            {change && (
                <span className={`stat-change ${positive ? 'positive' : 'negative'}`}>
                    {positive ? '↑' : '↓'} {change}
                </span>
            )}
        </div>
    );
}

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function Badge({ children, variant = 'neutral' }: BadgeProps) {
    return <span className={`badge badge-${variant}`}>{children}</span>;
}

interface EmptyStateProps {
    icon: string;
    title: string;
    description: string;
    action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="empty-state">
            <div className="empty-state-icon">{icon}</div>
            <div className="empty-state-title">{title}</div>
            <div className="empty-state-text">{description}</div>
            {action}
        </div>
    );
}
