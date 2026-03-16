'use client';

import React, { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase';

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);
        try {
            const supabase = createSupabaseBrowserClient();
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/`,
                },
            });

            if (error) {
                setError(error.message);
                setLoading(false);
                return;
            }

            setSuccess(true);
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
                background: 'radial-gradient(circle, rgba(34,197,94,0.12) 0%, transparent 70%)',
                top: '10%', right: '15%', animation: 'float 8s ease-in-out infinite',
            }} />
            <div style={{
                position: 'absolute', width: 300, height: 300, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)',
                bottom: '15%', left: '20%', animation: 'float 10s ease-in-out infinite reverse',
            }} />

            <div style={{ width: 420, maxWidth: '90vw', zIndex: 1 }}>
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

                {/* Signup Card */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.9), rgba(15, 15, 25, 0.95))',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 16, padding: 32,
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                }}>
                    {success ? (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{ fontSize: '3rem', marginBottom: 16 }}>📧</div>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
                                Check Your Email
                            </h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 20, lineHeight: 1.6 }}>
                                We&apos;ve sent a confirmation link to <strong style={{ color: 'var(--accent-primary-light)' }}>{email}</strong>. Click the link to activate your account.
                            </p>
                            <a href="/login" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                                ← Back to Login
                            </a>
                        </div>
                    ) : (
                        <>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>
                                Create Account
                            </h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 24 }}>
                                Start automating your SEO workflow
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

                            <form onSubmit={handleSignup}>
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
                                        placeholder="Min 6 characters"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                        minLength={6}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Confirm Password</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder="Repeat password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
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
                                            Creating Account...
                                        </>
                                    ) : (
                                        '🚀 Sign Up'
                                    )}
                                </button>
                            </form>
                        </>
                    )}
                </div>

                {/* Footer */}
                <p style={{
                    textAlign: 'center', color: 'var(--text-muted)',
                    fontSize: '0.8rem', marginTop: 24,
                }}>
                    Already have an account?{' '}
                    <a href="/login" style={{ color: 'var(--accent-primary-light)', textDecoration: 'none', fontWeight: 600 }}>
                        Sign In →
                    </a>
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
