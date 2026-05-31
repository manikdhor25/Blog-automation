'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/components/Toast';

const TIMEZONES = [
    'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Shanghai', 'Asia/Tokyo',
    'Asia/Seoul', 'Asia/Singapore', 'Australia/Sydney', 'Pacific/Auckland',
];

const DATE_FORMATS = [
    { label: 'Jan 15, 2025', value: 'MMM dd, yyyy' },
    { label: '15 Jan 2025', value: 'dd MMM yyyy' },
    { label: '2025-01-15', value: 'yyyy-MM-dd' },
    { label: '01/15/2025', value: 'MM/dd/yyyy' },
    { label: '15/01/2025', value: 'dd/MM/yyyy' },
];

type TabId = 'profile' | 'security' | 'preferences';

function getPasswordStrength(password: string): number {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    return score;
}

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

export default function AccountPage() {
    const { profile, isLoading, updateProfile, uploadAvatar, changePassword } = useProfile();
    const toast = useToast();

    const [activeTab, setActiveTab] = useState<TabId>('profile');

    // Profile form state
    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [timezone, setTimezone] = useState('UTC');
    const [dateFormat, setDateFormat] = useState('MMM dd, yyyy');
    const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
    const [saving, setSaving] = useState(false);

    // Password form state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);

    // Avatar state
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync profile data to form state
    useEffect(() => {
        if (profile) {
            setDisplayName(profile.display_name || '');
            setBio(profile.bio || '');
            setTimezone(profile.timezone || 'UTC');
            setDateFormat(profile.date_format || 'MMM dd, yyyy');
            setTheme(profile.theme || 'dark');
            setAvatarPreview(profile.avatar_url || null);
        }
    }, [profile]);

    // --- Avatar Handlers ---
    const handleAvatarFile = useCallback(async (file: File) => {
        // Validate client-side
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            toast.error('Invalid file type. Use JPG, PNG, or WebP.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error('File too large. Max 2MB.');
            return;
        }

        // Show preview immediately
        const previewUrl = URL.createObjectURL(file);
        setAvatarPreview(previewUrl);
        setUploadingAvatar(true);

        const result = await uploadAvatar(file);
        setUploadingAvatar(false);

        if (result.success && result.avatar_url) {
            setAvatarPreview(result.avatar_url);
            toast.success('Avatar updated!');
        } else {
            // Revert preview on failure
            setAvatarPreview(profile?.avatar_url || null);
            toast.error(result.error || 'Upload failed');
        }

        URL.revokeObjectURL(previewUrl);
    }, [uploadAvatar, toast, profile?.avatar_url]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleAvatarFile(file);
    }, [handleAvatarFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragging(false);
    }, []);

    // --- Save Profile ---
    const handleSaveProfile = async () => {
        setSaving(true);
        const result = await updateProfile({
            display_name: displayName || null,
            bio: bio || null,
            timezone,
            date_format: dateFormat,
        });
        setSaving(false);

        if (result.success) {
            toast.success('Profile saved!');
        } else {
            toast.error(result.error || 'Save failed');
        }
    };

    // --- Save Preferences ---
    const handleSavePreferences = async () => {
        setSaving(true);
        const result = await updateProfile({ theme });
        setSaving(false);

        if (result.success) {
            toast.success('Preferences saved!');
        } else {
            toast.error(result.error || 'Save failed');
        }
    };

    // --- Change Password ---
    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            toast.error('Password must be at least 8 characters');
            return;
        }

        if (!currentPassword) {
            toast.error('Enter your current password');
            return;
        }

        setChangingPassword(true);
        const result = await changePassword(currentPassword, newPassword);
        setChangingPassword(false);

        if (result.success) {
            toast.success('Password updated successfully!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } else {
            toast.error(result.error || 'Failed to change password');
        }
    };

    const passwordStrength = getPasswordStrength(newPassword);
    const passwordReqs = [
        { label: 'Min 8 characters', met: newPassword.length >= 8 },
        { label: 'Contains letter', met: /[a-zA-Z]/.test(newPassword) },
        { label: 'Contains number', met: /[0-9]/.test(newPassword) },
        { label: 'Special character', met: /[^a-zA-Z0-9]/.test(newPassword) },
    ];

    if (isLoading) {
        return (
            <div className="page-header">
                <h1>Account Settings</h1>
                <p className="text-secondary">Loading your profile...</p>
            </div>
        );
    }

    const initial = profile?.display_name?.[0]?.toUpperCase()
        || profile?.email?.[0]?.toUpperCase()
        || '?';

    return (
        <>
            <div className="page-header">
                <h1>Account Settings</h1>
                <p className="text-secondary">Manage your profile, security, and preferences</p>
            </div>

            <div className="account-page">
                {/* Header Card with Avatar */}
                <div className="account-header">
                    <div
                        className={`avatar-upload ${dragging ? 'dragging' : ''}`}
                        onClick={() => fileInputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                    >
                        {avatarPreview ? (
                            <img src={avatarPreview} alt="Avatar" className="avatar-display" />
                        ) : (
                            <div className="avatar-placeholder">{initial}</div>
                        )}
                        <div className="avatar-overlay">
                            {uploadingAvatar ? (
                                <div className="account-spinner" />
                            ) : (
                                <>📷<br />Change</>
                            )}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="avatar-input"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleAvatarFile(file);
                                e.target.value = '';
                            }}
                        />
                    </div>

                    <div className="account-info">
                        <div className="account-name">
                            {profile?.display_name || profile?.email?.split('@')[0] || 'User'}
                        </div>
                        <div className="account-email">{profile?.email}</div>
                        <div className="account-meta">
                            <span className="account-meta-item">
                                🕐 {profile?.timezone || 'UTC'}
                            </span>
                            <span className="account-meta-item">
                                📅 Joined {profile?.created_at
                                    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                                    : '—'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="account-tabs">
                    {([
                        { id: 'profile' as TabId, label: 'Profile', icon: '👤' },
                        { id: 'security' as TabId, label: 'Security', icon: '🔒' },
                        { id: 'preferences' as TabId, label: 'Preferences', icon: '⚙️' },
                    ]).map(tab => (
                        <button
                            key={tab.id}
                            className={`account-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <span>{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Profile Tab */}
                {activeTab === 'profile' && (
                    <>
                        <div className="account-section">
                            <div className="account-section-title">Personal Information</div>
                            <div className="account-section-desc">
                                Update your display name and bio. This information may be visible to team members.
                            </div>

                            <div className="form-group">
                                <label className="form-label">Display Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="How should we call you?"
                                    value={displayName}
                                    onChange={e => setDisplayName(e.target.value)}
                                    maxLength={100}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Email</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    value={profile?.email || ''}
                                    disabled
                                    style={{ opacity: 0.5, cursor: 'not-allowed' }}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Bio</label>
                                <textarea
                                    className="form-textarea"
                                    placeholder="Tell us a bit about yourself..."
                                    value={bio}
                                    onChange={e => setBio(e.target.value)}
                                    maxLength={500}
                                    rows={3}
                                />
                                <div style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                    {bio.length}/500
                                </div>
                            </div>
                        </div>

                        <div className="account-section">
                            <div className="account-section-title">Regional Settings</div>
                            <div className="account-section-desc">
                                Configure your timezone and date display preferences.
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Timezone</label>
                                    <select
                                        className="form-select"
                                        value={timezone}
                                        onChange={e => setTimezone(e.target.value)}
                                    >
                                        {TIMEZONES.map(tz => (
                                            <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Date Format</label>
                                    <select
                                        className="form-select"
                                        value={dateFormat}
                                        onChange={e => setDateFormat(e.target.value)}
                                    >
                                        {DATE_FORMATS.map(df => (
                                            <option key={df.value} value={df.value}>{df.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="account-actions">
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveProfile}
                                disabled={saving}
                            >
                                {saving ? (
                                    <><span className="account-spinner" /> Saving...</>
                                ) : (
                                    '💾 Save Profile'
                                )}
                            </button>
                        </div>
                    </>
                )}

                {/* Security Tab */}
                {activeTab === 'security' && (
                    <>
                        <div className="account-section">
                            <div className="account-section-title">Account Information</div>
                            <div className="account-section-desc">
                                Details about your account and authentication.
                            </div>

                            <div className="info-row">
                                <span className="info-row-label">Email Address</span>
                                <span className="info-row-value">{profile?.email}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-row-label">Account Created</span>
                                <span className="info-row-value">
                                    {profile?.created_at
                                        ? new Date(profile.created_at).toLocaleDateString('en-US', {
                                            year: 'numeric', month: 'long', day: 'numeric'
                                        })
                                        : '—'}
                                </span>
                            </div>
                            <div className="info-row">
                                <span className="info-row-label">User ID</span>
                                <span className="info-row-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                                    {profile?.id?.slice(0, 8)}...{profile?.id?.slice(-4)}
                                </span>
                            </div>
                        </div>

                        <div className="account-section">
                            <div className="account-section-title">Change Password</div>
                            <div className="account-section-desc">
                                Update your password. Use a strong, unique password that you don&apos;t use elsewhere.
                            </div>

                            <form onSubmit={handleChangePassword}>
                                <div className="form-group">
                                    <label className="form-label">Current Password</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder="Enter current password"
                                        value={currentPassword}
                                        onChange={e => setCurrentPassword(e.target.value)}
                                        autoComplete="current-password"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">New Password</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder="Enter new password"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        minLength={8}
                                        autoComplete="new-password"
                                        required
                                    />
                                    {newPassword && (
                                        <div className="password-strength">
                                            <div className="password-strength-bar">
                                                <div className={`password-strength-fill strength-${passwordStrength}`} />
                                            </div>
                                            <span className={`password-strength-label strength-${passwordStrength}`}>
                                                {STRENGTH_LABELS[passwordStrength]}
                                            </span>
                                        </div>
                                    )}
                                    <ul className="password-reqs">
                                        {passwordReqs.map(req => (
                                            <li key={req.label} className={`password-req ${req.met ? 'met' : ''}`}>
                                                <span>{req.met ? '✓' : '○'}</span>
                                                {req.label}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Confirm New Password</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder="Confirm new password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        required
                                    />
                                    {confirmPassword && newPassword !== confirmPassword && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--accent-danger)', marginTop: 6 }}>
                                            Passwords do not match
                                        </div>
                                    )}
                                </div>

                                <div className="account-actions">
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={changingPassword || !newPassword || newPassword !== confirmPassword || passwordStrength < 2}
                                    >
                                        {changingPassword ? (
                                            <><span className="account-spinner" /> Updating...</>
                                        ) : (
                                            '🔐 Update Password'
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </>
                )}

                {/* Preferences Tab */}
                {activeTab === 'preferences' && (
                    <>
                        <div className="account-section">
                            <div className="account-section-title">Appearance</div>
                            <div className="account-section-desc">
                                Customize how RankMaster Pro looks for you.
                            </div>

                            <div className="form-group">
                                <label className="form-label">Theme</label>
                                <div className="pref-option-group">
                                    {(['dark', 'light', 'system'] as const).map(t => (
                                        <button
                                            key={t}
                                            className={`pref-option ${theme === t ? 'selected' : ''}`}
                                            onClick={() => setTheme(t)}
                                        >
                                            {t === 'dark' && '🌙 '}
                                            {t === 'light' && '☀️ '}
                                            {t === 'system' && '💻 '}
                                            {t.charAt(0).toUpperCase() + t.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="account-actions">
                            <button
                                className="btn btn-primary"
                                onClick={handleSavePreferences}
                                disabled={saving}
                            >
                                {saving ? (
                                    <><span className="account-spinner" /> Saving...</>
                                ) : (
                                    '💾 Save Preferences'
                                )}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
