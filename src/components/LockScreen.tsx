/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, ShieldCheck, Eye, EyeOff, AlertCircle, Fingerprint, Keyboard, Key, Clock } from 'lucide-react';

interface LockScreenProps {
  onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [hasPassword, setHasPassword] = useState<boolean>(true);
  const [isSetupMode, setIsSetupMode] = useState<boolean>(false);
  const [setupStep, setSetupStep] = useState<'create' | 'confirm'>('create');
  
  const [inputVal, setInputVal] = useState<string>('');
  const [firstInputVal, setFirstInputVal] = useState<string>('');
  
  const [showPwd, setShowPwd] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [attempts, setAttempts] = useState<number>(0);
  const [lockoutTime, setLockoutTime] = useState<number>(0); // countdown in seconds

  // Reference for physical keyboard listener
  const inputRef = useRef<HTMLInputElement>(null);

  // Hashing function to align perfectly with SettingsScreen.tsx
  const hashPassword = (pwd: string) => {
    let hash = 0;
    for (let i = 0; i < pwd.length; i++) {
      const char = pwd.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return 'h_' + hash.toString(36);
  };

  // Check if a password hash exists in localStorage
  useEffect(() => {
    const storedHash = localStorage.getItem('myvault_pwd_hash');
    if (!storedHash) {
      setHasPassword(false);
      setIsSetupMode(true);
      setSetupStep('create');
    } else {
      setHasPassword(true);
      setIsSetupMode(false);
    }
  }, []);

  // Lockout Countdown Timer
  useEffect(() => {
    if (lockoutTime <= 0) return;
    const interval = setInterval(() => {
      setLockoutTime((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutTime]);

  // Handle shake animation trigger
  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  // Process input submission
  const handleSubmit = (valueToSubmit: string) => {
    if (lockoutTime > 0) return;
    setError('');

    if (valueToSubmit.length < 4) {
      setError('Key must be at least 4 digits/characters');
      triggerShake();
      return;
    }

    if (isSetupMode) {
      if (setupStep === 'create') {
        setFirstInputVal(valueToSubmit);
        setSetupStep('confirm');
        setInputVal('');
      } else {
        // Confirmation step
        if (valueToSubmit !== firstInputVal) {
          setError('PINs do not match. Start over.');
          setSetupStep('create');
          setFirstInputVal('');
          setInputVal('');
          triggerShake();
        } else {
          // Success! Save PIN
          const hashed = hashPassword(valueToSubmit);
          localStorage.setItem('myvault_pwd_hash', hashed);
          setHasPassword(true);
          setIsSetupMode(false);
          setInputVal('');
          onUnlock();
        }
      }
    } else {
      // Normal Login Unlock Flow
      const storedHash = localStorage.getItem('myvault_pwd_hash');
      if (storedHash && hashPassword(valueToSubmit) === storedHash) {
        // Valid PIN!
        setAttempts(0);
        setInputVal('');
        onUnlock();
      } else {
        // Invalid PIN
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        setInputVal('');
        triggerShake();

        if (nextAttempts >= 5) {
          setError('Too many failed attempts. Locked out for 30 seconds.');
          setLockoutTime(30);
        } else {
          setError(`Incorrect security key. ${5 - nextAttempts} attempts remaining.`);
        }
      }
    }
  };

  // Keyboard and Input Events
  const handleKeyPress = (char: string) => {
    if (lockoutTime > 0) return;
    setError('');
    
    // Limit to 12 chars max for standard PIN/Pass
    if (inputVal.length < 12) {
      setInputVal(prev => prev + char);
    }
  };

  const handleDelete = () => {
    if (lockoutTime > 0) return;
    setInputVal(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (lockoutTime > 0) return;
    setInputVal('');
    setError('');
  };

  // Listen to physical keyboard presses
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lockoutTime > 0) return;

      // Handle numbers
      if (/^[0-9]$/.test(e.key)) {
        handleKeyPress(e.key);
      }
      // Handle backspace
      else if (e.key === 'Backspace') {
        handleDelete();
      }
      // Handle Enter
      else if (e.key === 'Enter') {
        handleSubmit(inputVal);
      }
      // Handle Escape/Clear
      else if (e.key === 'Escape') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputVal, lockoutTime, isSetupMode, setupStep, firstInputVal]);

  const numpadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div 
      id="lockscreen-overlay" 
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-white select-none overflow-y-auto px-4 py-8"
    >
      {/* Decorative premium background elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/20 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none animate-pulse" />

      {/* Main Container */}
      <motion.div 
        animate={isShaking ? { x: [-10, 10, -8, 8, -5, 5, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-sm flex flex-col items-center space-y-6 text-center z-10"
      >
        {/* Lock Shield Icon Indicator */}
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className={`flex h-16 w-16 items-center justify-center rounded-2xl border bg-slate-900 shadow-xl transition-all duration-300
            ${isSetupMode 
              ? 'border-indigo-500/30 text-indigo-400' 
              : error 
                ? 'border-rose-500/30 text-rose-400' 
                : 'border-emerald-500/30 text-emerald-400'
            }
          `}
        >
          {isSetupMode ? (
            <Key className="h-8 w-8 animate-pulse" />
          ) : lockoutTime > 0 ? (
            <Clock className="h-8 w-8 text-rose-400 animate-spin" />
          ) : (
            <Lock className="h-8 w-8" />
          )}
        </motion.div>

        {/* Dynamic Descriptive Text */}
        <div className="space-y-1.5 px-4">
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {isSetupMode 
              ? setupStep === 'create' 
                ? 'Create Access Key' 
                : 'Confirm Access Key'
              : lockoutTime > 0 
                ? 'Vault Temporarily Locked' 
                : 'Vault Secured'
            }
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
            {isSetupMode
              ? setupStep === 'create'
                ? 'Specify a secure PIN/password code to safeguard your device media gallery folder locally.'
                : 'Please re-enter your access code to confirm configuration.'
              : lockoutTime > 0
                ? `Lockout active. Please wait ${lockoutTime} seconds before attempting again.`
                : 'Unlock with your private security access key to view local device content.'
            }
          </p>
        </div>

        {/* Hashed PIN code progress display bubble dots */}
        <div className="w-full max-w-[280px] space-y-4">
          {/* Visual dots */}
          <div className="flex items-center justify-center gap-4 h-6">
            {Array.from({ length: Math.max(4, inputVal.length) }).map((_, i) => {
              const hasChar = i < inputVal.length;
              return (
                <motion.div
                  key={i}
                  animate={hasChar ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.2 }}
                  className={`h-3 w-3 rounded-full transition-all duration-200
                    ${hasChar 
                      ? isSetupMode 
                        ? 'bg-indigo-400 shadow-md shadow-indigo-500/40' 
                        : 'bg-emerald-400 shadow-md shadow-emerald-500/40' 
                      : 'bg-slate-800'
                    }
                  `}
                />
              );
            })}
          </div>

          {/* Secure raw-input (for physical keyboards or alphanumeric typing fallback) */}
          <div className="relative">
            <input
              id="lock-input-field"
              ref={inputRef}
              type={showPwd ? 'text' : 'password'}
              value={inputVal}
              onChange={(e) => {
                if (lockoutTime > 0) return;
                setInputVal(e.target.value);
                setError('');
              }}
              placeholder={isSetupMode ? "Enter Access Code..." : "Enter Access Code..."}
              disabled={lockoutTime > 0}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 focus:border-indigo-500/60 focus:outline-none text-center text-sm font-semibold text-white tracking-widest placeholder-slate-600 rounded-xl transition-all font-mono"
            />
            {inputVal.length > 0 && (
              <button
                id="btn-lock-toggle-pwd"
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Error Notification */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center gap-2 text-rose-400 text-xs bg-rose-500/5 border border-rose-500/10 px-4 py-2 rounded-xl"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Premium Numeric Keypad */}
        <div className="w-full max-w-[280px] grid grid-cols-3 gap-3">
          {numpadKeys.map((key) => (
            <motion.button
              key={key}
              id={`numpad-${key}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleKeyPress(key)}
              disabled={lockoutTime > 0}
              className="h-14 rounded-2xl bg-slate-900 border border-slate-900/60 hover:bg-slate-800 hover:border-slate-800 flex items-center justify-center text-xl font-bold font-sans text-slate-100 hover:text-white transition-all cursor-pointer disabled:opacity-40"
            >
              {key}
            </motion.button>
          ))}

          {/* Clean */}
          <motion.button
            id="numpad-clear"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleClear}
            disabled={lockoutTime > 0}
            className="h-14 rounded-2xl bg-slate-950 border border-slate-900/40 text-slate-500 hover:text-slate-300 flex items-center justify-center text-xs font-semibold cursor-pointer disabled:opacity-40"
          >
            CLEAR
          </motion.button>

          {/* Zero */}
          <motion.button
            id="numpad-0"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleKeyPress('0')}
            disabled={lockoutTime > 0}
            className="h-14 rounded-2xl bg-slate-900 border border-slate-900/60 hover:bg-slate-800 hover:border-slate-800 flex items-center justify-center text-xl font-bold font-sans text-slate-100 hover:text-white transition-all cursor-pointer disabled:opacity-40"
          >
            0
          </motion.button>

          {/* Backspace */}
          <motion.button
            id="numpad-backspace"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDelete}
            disabled={lockoutTime > 0}
            className="h-14 rounded-2xl bg-slate-950 border border-slate-900/40 text-slate-500 hover:text-slate-300 flex items-center justify-center text-xs font-semibold cursor-pointer disabled:opacity-40"
          >
            DELETE
          </motion.button>
        </div>

        {/* Confirm / Unlock Action button */}
        <button
          id="btn-lock-submit"
          onClick={() => handleSubmit(inputVal)}
          disabled={lockoutTime > 0 || inputVal.length === 0}
          className={`w-full max-w-[280px] py-3.5 rounded-2xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed
            ${isSetupMode 
              ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:opacity-95 text-slate-950 shadow-indigo-500/10' 
              : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-95 text-slate-950 shadow-emerald-500/10'
            }
          `}
        >
          {isSetupMode ? (
            setupStep === 'create' ? 'Continue Setup' : 'Confirm & Safe Access'
          ) : (
            <>
              <ShieldCheck className="h-4.5 w-4.5" />
              <span>Unlock Vault</span>
            </>
          )}
        </button>

        {/* Zero-footprint branding security claim */}
        <p className="text-[10px] font-mono uppercase tracking-wider text-slate-600">
          Mash141 Local Encryption Gateway
        </p>
      </motion.div>
    </div>
  );
}
