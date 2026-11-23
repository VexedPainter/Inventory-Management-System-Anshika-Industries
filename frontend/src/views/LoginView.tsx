import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, User, AlertCircle, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AiOrb } from '../components/AiOrb';

export const LoginView: React.FC = () => {
  const { login, isLoading, showForcedPasswordModal, changePassword, dismissForcedPasswordModal } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin@2026');
  const [errorMsg, setErrorMsg] = useState('');

  // Forced password modal state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [isChangingPwd, setIsChangingPwd] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await login(username, password);
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please check credentials.');
    }
  };

  const handleForcedPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    if (newPassword.length < 8) {
      setPwdError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('Passwords do not match.');
      return;
    }
    setIsChangingPwd(true);
    try {
      await changePassword(password, newPassword);
    } catch (err: any) {
      setPwdError(err.message || 'Failed to update password.');
    } finally {
      setIsChangingPwd(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas-light dark:bg-canvas-dark text-ink-light dark:text-ink-dark flex flex-col items-center justify-center p-4 transition-colors duration-300">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-card-light dark:bg-card-dark rounded-card p-8 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col items-center relative"
      >
        {/* Glowing 3D AI Orb floating above the form */}
        <div className="mb-4">
          <AiOrb size={68} className="animate-orb" />
        </div>

        {/* Title & Subtitle */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold tracking-tight text-ink-light dark:text-ink-dark">
            Anishka Inventory
          </h1>
          <p className="text-xs text-muted mt-1">
            Enterprise Industrial Welding Spares ERP
          </p>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="w-full mb-4 p-3 bg-negative/10 border border-negative/20 text-negative rounded-tile text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1.5">
              Username
            </label>
            <div className="relative flex items-center">
              <User size={15} className="absolute left-3.5 text-muted" />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                placeholder="admin, manager, storekeeper"
                className="w-full pl-10 pr-4 py-2.5 bg-canvas-light/60 dark:bg-black/20 border border-hairline-light dark:border-hairline-dark rounded-pill text-xs sm:text-sm text-ink-light dark:text-ink-dark focus:outline-none focus:border-sage transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted mb-1.5">
              Password
            </label>
            <div className="relative flex items-center">
              <Lock size={15} className="absolute left-3.5 text-muted" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Enter password"
                className="w-full pl-10 pr-4 py-2.5 bg-canvas-light/60 dark:bg-black/20 border border-hairline-light dark:border-hairline-dark rounded-pill text-xs sm:text-sm text-ink-light dark:text-ink-dark focus:outline-none focus:border-sage transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-ink-light dark:bg-ink-dark text-white rounded-pill text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Authenticating…</span>
              </>
            ) : (
              <>
                <span>Sign in to Workspace</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Credentials */}
        <div className="w-full mt-6 pt-5 border-t border-hairline-light dark:border-hairline-dark text-center">
          <span className="text-[11px] text-muted block mb-2 font-medium">Quick Demo Accounts:</span>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { setUsername('admin'); setPassword('admin@2026'); setErrorMsg(''); }}
              className="text-[11px] font-mono px-2.5 py-1 bg-canvas-light dark:bg-black/30 rounded-pill hover:bg-black/5 text-sage font-medium"
            >
              admin
            </button>
            <button
              type="button"
              onClick={() => { setUsername('manager'); setPassword('manager@2026'); setErrorMsg(''); }}
              className="text-[11px] font-mono px-2.5 py-1 bg-canvas-light dark:bg-black/30 rounded-pill hover:bg-black/5 text-sage font-medium"
            >
              manager
            </button>
            <button
              type="button"
              onClick={() => { setUsername('storekeeper'); setPassword('storekeeper@2026'); setErrorMsg(''); }}
              className="text-[11px] font-mono px-2.5 py-1 bg-canvas-light dark:bg-black/30 rounded-pill hover:bg-black/5 text-sage font-medium"
            >
              storekeeper
            </button>
          </div>
        </div>
      </motion.div>

      {/* Forced Change Password Modal */}
      {showForcedPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm bg-card-light dark:bg-card-dark rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark"
          >
            <div className="w-10 h-10 rounded-full bg-warning/10 text-warning flex items-center justify-center mb-3">
              <ShieldCheck size={20} />
            </div>
            <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
              Password Update Required
            </h3>
            <p className="text-xs text-muted mt-1">
              For security compliance, default passwords must be updated on first login.
            </p>

            {pwdError && (
              <div className="mt-3 p-2 bg-negative/10 text-negative rounded text-[11px]">
                {pwdError}
              </div>
            )}

            <form onSubmit={handleForcedPasswordSubmit} className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  placeholder="Min 8 characters"
                  className="w-full px-3 py-2 bg-canvas-light dark:bg-black/20 rounded-pill text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repeat new password"
                  className="w-full px-3 py-2 bg-canvas-light dark:bg-black/20 rounded-pill text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={dismissForcedPasswordModal}
                  className="flex-1 py-2 bg-canvas-light dark:bg-black/20 rounded-pill text-xs font-semibold"
                >
                  Later
                </button>
                <button
                  type="submit"
                  disabled={isChangingPwd}
                  className="flex-1 py-2 bg-sage text-white rounded-pill text-xs font-semibold hover:bg-sage-dark disabled:opacity-50"
                >
                  {isChangingPwd ? 'Updating…' : 'Update & Continue'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
