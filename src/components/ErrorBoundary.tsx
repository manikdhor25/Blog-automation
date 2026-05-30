'use client';
import React from 'react';
import Link from 'next/link';

interface Props { children: React.ReactNode; fallback?: React.ReactNode; }
interface State { hasError: boolean; error?: Error; errorInfo?: React.ErrorInfo; }

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) { super(props); this.state = { hasError: false }; }
    static getDerivedStateFromError(error: Error): Partial<State> { return { hasError: true, error }; }
    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
        this.setState({ errorInfo });
    }
    
    copyError = () => {
        const text = `Error: ${this.state.error?.message}\n\nStack:\n${this.state.error?.stack}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack}`;
        navigator.clipboard.writeText(text).catch(() => {});
    };
    
    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            const isDev = process.env.NODE_ENV === 'development';
            return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
                    <div className="card" style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
                        <div style={{ fontSize: '3.5rem', marginBottom: 16, filter: 'grayscale(0.3)' }}>⚠️</div>
                        <h2 style={{ fontWeight: 700, marginBottom: 8, fontSize: '1.25rem' }}>Something went wrong</h2>
                        <p className="text-muted" style={{ marginBottom: 20, fontSize: '0.875rem', lineHeight: 1.6 }}>
                            {isDev ? this.state.error?.message : 'An unexpected error occurred. Please try again or return to the dashboard.'}
                        </p>
                        {isDev && this.state.error?.stack && (
                            <pre style={{
                                textAlign: 'left', fontSize: '0.7rem', padding: 12,
                                background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)',
                                overflow: 'auto', maxHeight: 200, marginBottom: 16,
                                fontFamily: 'var(--font-mono)', color: 'var(--accent-danger)',
                                border: '1px solid var(--border-subtle)',
                            }}>
                                {this.state.error.stack}
                            </pre>
                        )}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button className="btn btn-primary btn-sm" onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}>Try Again</button>
                            <Link href="/" className="btn btn-secondary btn-sm">← Dashboard</Link>
                            {isDev && <button className="btn btn-secondary btn-sm" onClick={this.copyError}>📋 Copy Error</button>}
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
export default ErrorBoundary;
