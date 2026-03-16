'use client';

import dynamic from 'next/dynamic';
import { ToastProvider } from '@/components/Toast';

const CommandPalette = dynamic(() => import('@/components/CommandPalette'), { ssr: false });

export default function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <ToastProvider>
            {children}
            <CommandPalette />
        </ToastProvider>
    );
}
