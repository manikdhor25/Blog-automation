'use client';

import React, { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const supabase = createSupabaseBrowserClient();
            const { error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) {
                setError(error.message);
                setLoading(false);
                return;
            }

            // Redirect to dashboard
            window.location.href = '/';
        } catch {
            setError('An unexpected error occurred');
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-primary)',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Animated background orbs */}
            <div style={{
                position: 'absolute', width: 400, height: 400, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
                top: '10%', left: '15%', animation: 'float 8s ease-in-out infinite',
            }} />
            <div style={{
                position: 'absolute', width: 300, height: 300, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
                bottom: '15%', right: '20%', animation: 'float 10s ease-in-out infinite reverse',
            }} />
            <div style={{
                position: 'absolute', width: 200, height: 200, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)',
                top: '50%', right: '10%', animation: 'float 6s ease-in-out infinite',
            }} />

            <div style={{
                width: 420, maxWidth: '90vw', zIndex: 1,
            }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <h1 style={{
                        fontSize: '2rem', fontWeight: 800,
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text', letterSpacing: '-0.02em',
                    }}>
                        RankMaster Pro
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        SEO • AEO • GEO Automation
                    </p>
                </div>

                {/* Login Card */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.9), rgba(15, 15, 25, 0.95))',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 16, padding: 32,
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>
                        Welcome Back
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 24 }}>
                        Sign in to your account
                    </p>

                    {error && (
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 8, padding: '10px 14px',
                            color: '#f87171', fontSize: '0.85rem',
                            marginBottom: 16,
                        }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label className="form-label">Email</label>
                            <input
                                type="email"
                                className="form-input"
                                placeholder="you@example.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <input
                                type="password"
                                className="form-input"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg"
                            disabled={loading}
                            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner" style={{ width: 16, height: 16 }} />
                                    Signing in...
                                </>
                            ) : (
                                '🚀 Sign In'
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p style={{
                    textAlign: 'center', color: 'var(--text-muted)',
                    fontSize: '0.8rem', marginTop: 24,
                }}>
                    Don&apos;t have an account?{' '}
                    <a href="/signup" style={{ color: 'var(--accent-primary-light)', textDecoration: 'none', fontWeight: 600 }}>
                        Sign Up →
                    </a>
                </p>
                <p style={{
                    textAlign: 'center', color: 'var(--text-muted)',
                    fontSize: '0.75rem', marginTop: 8,
                }}>
                    Protected by Supabase Authentication
                </p>
            </div>

            <style>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0) scale(1); }
                    50% { transform: translateY(-20px) scale(1.05); }
                }
            `}</style>
        </div>
    );
}
