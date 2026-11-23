import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const ForcedPasswordModal: React.FC = () => {
  const { user, changePassword } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    try {
      setIsSubmitting(true);
      await changePassword(oldPassword, newPassword);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="forced-pwd-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-card-light dark:bg-card-dark rounded-3xl p-6 md:p-8 shadow-2xl border border-hairline-light dark:border-hairline-dark space-y-4"
      >
        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
          <KeyRound className="w-6 h-6" />
        </div>

        <div>
          <h2 id="forced-pwd-title" className="text-xl font-bold text-ink-light dark:text-ink-dark">
            Password Update Required
          </h2>
          <p className="text-xs text-muted mt-1">
            Welcome, <span className="font-semibold">{user?.full_name || user?.username}</span>. Your account requires a password change before continuing.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-2xl bg-negative/10 border border-negative/20 text-negative text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
              Current / Temporary Password
            </label>
            <input
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Enter temporary password"
              className="w-full px-4 py-2.5 rounded-2xl border border-hairline-light dark:border-hairline-dark bg-transparent text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
              New Password
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full px-4 py-2.5 rounded-2xl border border-hairline-light dark:border-hairline-dark bg-transparent text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full px-4 py-2.5 rounded-2xl border border-hairline-light dark:border-hairline-dark bg-transparent text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-pill bg-ink-light text-white dark:bg-white dark:text-ink-light text-sm font-semibold hover:scale-[0.98] transition-transform shadow-sm flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Updating Password...' : 'Save New Password & Continue'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
