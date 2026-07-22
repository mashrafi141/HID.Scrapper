/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Lock, FolderClosed, RefreshCcw, Trash2, Shield, Info, ArrowLeft, 
  Check, Eye, EyeOff, AlertCircle, Database 
} from 'lucide-react';
import { formatBytes } from './FolderCard';

interface SettingsScreenProps {
  rootFolderName?: string;
  onBack: () => void;
  onReconnect: () => Promise<boolean>;
  onChangeFolder: () => Promise<boolean>;
  onClearCache: () => Promise<void>;
  onLockApp: () => void;
}

export default function SettingsScreen({
  rootFolderName,
  onBack,
  onReconnect,
  onChangeFolder,
  onClearCache,
  onLockApp,
}: SettingsScreenProps) {
  // Password Change State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState(false);

  // Status message states
  const [cacheCleared, setCacheCleared] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const hashPassword = (pwd: string) => {
    let hash = 0;
    for (let i = 0; i < pwd.length; i++) {
      const char = pwd.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return 'h_' + hash.toString(36);
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess(false);

    const storedHash = localStorage.getItem('myvault_pwd_hash');
    if (!storedHash) {
      setPwdError('System error: Password hash missing');
      return;
    }

    if (hashPassword(oldPassword) !== storedHash) {
      setPwdError('Incorrect current password');
      return;
    }

    if (newPassword.length < 4) {
      setPwdError('New password must be at least 4 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match');
      return;
    }

    localStorage.setItem('myvault_pwd_hash', hashPassword(newPassword));
    setPwdSuccess(true);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const triggerClearCache = async () => {
    if (window.confirm('Are you sure you want to clear HID.Scrapper metadata cache? This resets folder statistics and folder handle permissions, but your files on device will remain completely untouched.')) {
      setIsClearing(true);
      await onClearCache();
      setIsClearing(false);
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000);
    }
  };

  return (
    <div id="settings-screen" className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none pb-12">
      {/* Settings Header */}
      <div className="sticky top-0 z-20 flex items-center gap-4 bg-slate-950/85 backdrop-blur-md border-b border-slate-900 px-6 py-4">
        <button
          id="btn-settings-back"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Settings</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Vault Administration</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto w-full px-6 py-6 space-y-8">
        {/* Connected Folder Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-900">
            <FolderClosed className="h-4.5 w-4.5 text-indigo-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Folder Connections</h2>
          </div>

          <div className="rounded-2xl border border-slate-800/40 bg-slate-950/40 p-5 backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-xs text-slate-500 font-mono block">CONNECTED VAULT ROOT</span>
                <span className="text-base font-bold text-white truncate max-w-xs block mt-0.5">
                  {rootFolderName || 'None Connected'}
                </span>
              </div>
              <button
                id="btn-settings-lock"
                onClick={onLockApp}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400 cursor-pointer transition-colors"
              >
                Lock Vault
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                id="btn-reconnect-folder"
                onClick={onReconnect}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800 hover:border-indigo-500/30 bg-slate-900 hover:bg-slate-900/60 text-slate-200 hover:text-indigo-400 text-xs font-semibold transition-all cursor-pointer"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                <span>Reconnect Permission</span>
              </button>
              <button
                id="btn-change-folder"
                onClick={onChangeFolder}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-500/20 hover:border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/25 text-indigo-400 text-xs font-semibold transition-all cursor-pointer"
              >
                <FolderClosed className="h-3.5 w-3.5" />
                <span>Change Root Folder</span>
              </button>
            </div>
          </div>
        </section>

        {/* Change Password Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-900">
            <Lock className="h-4.5 w-4.5 text-indigo-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Vault Access Key</h2>
          </div>

          <form onSubmit={handlePasswordChange} className="rounded-2xl border border-slate-800/40 bg-slate-950/40 p-5 backdrop-blur-md space-y-4">
            <div className="space-y-3.5">
              {/* Old password */}
              <div className="relative">
                <input
                  id="old-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Current Password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full pl-4 pr-10 py-2.5 bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none text-sm text-white rounded-xl placeholder-slate-600 font-mono transition-colors"
                  required
                />
              </div>

              {/* New Password & Confirm Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="New Password (min 4 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none text-sm text-white rounded-xl placeholder-slate-600 font-mono transition-colors"
                  required
                />
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none text-sm text-white rounded-xl placeholder-slate-600 font-mono transition-colors"
                  required
                />
              </div>
            </div>

            {/* Error or Success feedback */}
            {pwdError && (
              <div className="flex items-center gap-2 text-xs text-rose-500">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{pwdError}</span>
              </div>
            )}
            {pwdSuccess && (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Check className="h-4 w-4 shrink-0" />
                <span>Password changed successfully!</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                id="btn-settings-toggle-password"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span>{showPassword ? 'Hide plain keys' : 'Reveal password'}</span>
              </button>
              <button
                id="btn-change-pwd-submit"
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-white rounded-xl cursor-pointer transition-colors"
              >
                Update Access Key
              </button>
            </div>
          </form>
        </section>

        {/* Caches & Operations */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-900">
            <Database className="h-4.5 w-4.5 text-indigo-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">System Caching</h2>
          </div>

          <div className="rounded-2xl border border-slate-800/40 bg-slate-950/40 p-5 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-white">Reset Local Database Cache</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Deletes cached background folder statistics and temporary directory handle linkages from browser storage. Your primary files are 100% untouched.
              </p>
            </div>
            <button
              id="btn-clear-cache"
              onClick={triggerClearCache}
              disabled={isClearing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-950 bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isClearing ? 'Clearing...' : cacheCleared ? 'Cleared!' : 'Clear Cache'}</span>
            </button>
          </div>
        </section>

        {/* Security & Architecture Overview */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-900">
            <Shield className="h-4.5 w-4.5 text-indigo-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Security & Privacy</h2>
          </div>

          <div className="rounded-2xl border border-slate-800/40 bg-slate-950/40 p-5 backdrop-blur-md space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-slate-200">Zero Cloud Footprint</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  HID.Scrapper doesn't upload your private documents, photographs, or videos to any external cloud servers. Your files reside exclusively on your physical hardware.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-slate-200">Local Sandbox Security</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Directory permissions granted to HID.Scrapper are confined to the browser's active sandbox. Closing the vault or resetting browser cache destroys authorization, keeping folder access tightly locked down.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
