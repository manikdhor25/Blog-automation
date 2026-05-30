'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { ToastProvider } from '@/components/Toast';
import { ThemeProvider } from '@/components/ThemeProvider';
import { KeyboardShortcutsProvider } from '@/components/KeyboardShortcuts';

const CommandPalette = dynamic(() => import('@/components/CommandPalette'), { ssr: false });

export default function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <ToastProvider>
                <KeyboardShortcutsProvider>
                    {children}
                    <CommandPalette />
                </KeyboardShortcutsProvider>
            </ToastProvider>
        </ThemeProvider>
    );
}
