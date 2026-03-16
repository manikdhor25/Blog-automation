'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

// --- Types ---
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration: number;
}

interface ToastContextType {
    toast: (message: string, type?: ToastType, duration?: number) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    warning: (message: string) => void;
}

// --- Context ---
const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        // Fallback for components outside provider
        return {
            toast: (msg) => console.log('[toast]', msg),
            success: (msg) => console.log('[toast:success]', msg),
            error: (msg) => console.error('[toast:error]', msg),
            info: (msg) => console.log('[toast:info]', msg),
            warning: (msg) => console.warn('[toast:warning]', msg),
        };
    }
    return ctx;
}

// --- Provider ---
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const idCounter = useRef(0);

    const addToast = useCallback((message: string, type: ToastType = 'info', duration: number = 4000) => {
        const id = `toast-${++idCounter.current}`;
        setToasts(prev => [...prev, { id, message, type, duration }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const api: ToastContextType = {
        toast: addToast,
        success: (msg) => addToast(msg, 'success', 3500),
        error: (msg) => addToast(msg, 'error', 5000),
        info: (msg) => addToast(msg, 'info', 4000),
        warning: (msg) => addToast(msg, 'warning', 4500),
    };

    return (
        <ToastContext.Provider value={api}>
            {children}
            {/* Toast Container */}
            <div style={{
                position: 'fixed',
                bottom: 24,
                right: 24,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                pointerEvents: 'none',
                maxWidth: 420,
            }}>
                {toasts.map(t => (
                    <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

// --- Toast Item ---
const toastStyles: Record<ToastType, { bg: string; border: string; color: string; icon: string }> = {
    success: { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.3)', color: '#4ade80', icon: '✅' },
    error: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', color: '#f87171', icon: '❌' },
    warning: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24', icon: '⚠️' },
    info: { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.3)', color: '#818cf8', icon: 'ℹ️' },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
    const [exiting, setExiting] = useState(false);
    const style = toastStyles[toast.type];

    useEffect(() => {
        const timer = setTimeout(() => setExiting(true), toast.duration - 300);
        const removeTimer = setTimeout(() => onDismiss(toast.id), toast.duration);
        return () => { clearTimeout(timer); clearTimeout(removeTimer); };
    }, [toast, onDismiss]);

    return (
        <div
            role="alert"
            onClick={() => onDismiss(toast.id)}
            style={{
                background: style.bg,
                backdropFilter: 'blur(16px)',
                border: `1px solid ${style.border}`,
                borderRadius: 12,
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                pointerEvents: 'auto',
                cursor: 'pointer',
                animation: exiting ? 'toastOut 0.3s ease forwards' : 'toastIn 0.3s ease forwards',
                minWidth: 280,
            }}
        >
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{style.icon}</span>
            <span style={{ color: style.color, fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.4 }}>
                {toast.message}
            </span>
            <span style={{
                marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)',
                opacity: 0.6, flexShrink: 0,
            }}>✕</span>
        </div>
    );
}
