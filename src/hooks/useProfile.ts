'use client';

import useSWR from 'swr';
import { UserProfile } from '@/lib/types';

const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to fetch');
    }
    return res.json();
};

/**
 * SWR-powered hook for the current user's profile.
 * 
 * Usage:
 *   const { profile, isLoading, updateProfile, uploadAvatar } = useProfile();
 */
export function useProfile() {
    const { data, error, isLoading, mutate } = useSWR<{ profile: UserProfile }>(
        '/api/user/profile',
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 10000,
            errorRetryCount: 2,
        }
    );

    const profile = data?.profile || null;

    /**
     * Update profile fields (display_name, bio, timezone, etc.)
     */
    const updateProfile = async (updates: Partial<UserProfile>): Promise<{ success: boolean; error?: string }> => {
        try {
            const res = await fetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });

            const body = await res.json();

            if (!res.ok) {
                return { success: false, error: body.error || 'Update failed' };
            }

            // Optimistically update the cache
            await mutate({ profile: body.profile }, false);
            return { success: true };
        } catch {
            return { success: false, error: 'Network error' };
        }
    };

    /**
     * Upload avatar image file
     */
    const uploadAvatar = async (file: File): Promise<{ success: boolean; avatar_url?: string; error?: string }> => {
        try {
            const formData = new FormData();
            formData.append('avatar', file);

            const res = await fetch('/api/user/avatar', {
                method: 'POST',
                body: formData,
            });

            const body = await res.json();

            if (!res.ok) {
                return { success: false, error: body.error || 'Upload failed' };
            }

            // Update the cached profile with new avatar URL
            if (profile) {
                await mutate({ profile: { ...profile, avatar_url: body.avatar_url } }, false);
            }

            return { success: true, avatar_url: body.avatar_url };
        } catch {
            return { success: false, error: 'Network error' };
        }
    };

    /**
     * Change password
     */
    const changePassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const res = await fetch('/api/user/password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
            });

            const body = await res.json();

            if (!res.ok) {
                return { success: false, error: body.error || 'Password change failed' };
            }

            return { success: true };
        } catch {
            return { success: false, error: 'Network error' };
        }
    };

    return {
        profile,
        isLoading,
        error,
        updateProfile,
        uploadAvatar,
        changePassword,
        mutate,
    };
}

export default useProfile;
