import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserCog,
  UserPlus,
  Search,
  Shield,
  KeyRound,
  CheckCircle2,
  X,
  AlertCircle,
  RefreshCw,
  Lock
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { Skeleton } from '../components/Skeleton';

interface UserItem {
  id: number;
  username: string;
  full_name: string;
  role: 'admin' | 'manager' | 'storekeeper';
  is_active?: boolean;
  created_at?: string;
  must_change_password?: boolean;
}

export const UsersView: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'storekeeper' as 'admin' | 'manager' | 'storekeeper',
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const { data: users = [], isLoading, refetch, isFetching } = useQuery<UserItem[]>({
    queryKey: ['users-list'],
    queryFn: async () => {
      return await apiFetch<UserItem[]>('/api/users');
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      return await apiFetch('/api/users', {
        method: 'POST',
        body: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setIsAddOpen(false);
      setFormData({ username: '', password: '', full_name: '', role: 'storekeeper' });
      setSuccessMsg('User successfully created with default password change requirement.');
      setTimeout(() => setSuccessMsg(''), 4000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to create user');
    },
  });

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name || '').toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role.toLowerCase() === roleFilter.toLowerCase();
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin':
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20';
      case 'manager':
        return 'bg-[#5F7F6D]/15 text-[#5F7F6D] dark:text-[#8FE3FF] border border-[#5F7F6D]/20';
      case 'storekeeper':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20';
      default:
        return 'bg-black/5 dark:bg-white/10 text-muted';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-white">
              User Accounts & RBAC
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Shield className="w-3.5 h-3.5" />
              Admin Only
            </span>
          </div>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">
            Manage system access credentials, role-based access control, and credential policies.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2.5 rounded-full border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-ink dark:text-white transition-colors"
            title="Refresh Users"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setErrorMsg('');
              setIsAddOpen(true);
            }}
            className="sweep-hover inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white dark:bg-white dark:text-ink text-sm font-medium hover:scale-[0.98] transition-transform shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add New User
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-2xl bg-[#3E8E63]/10 border border-[#3E8E63]/20 text-[#3E8E63] text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {successMsg}
        </div>
      )}

      {/* Filter Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search by full name or username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-full bg-white dark:bg-[#181B1A] border border-black/10 dark:border-white/10 text-sm text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-[#5F7F6D]"
          />
        </div>

        <div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full px-4 py-2.5 rounded-full bg-white dark:bg-[#181B1A] border border-black/10 dark:border-white/10 text-sm text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-[#5F7F6D]"
          >
            <option value="ALL">All Roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="storekeeper">Storekeeper</option>
          </select>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-[#181B1A] rounded-3xl border border-black/5 dark:border-white/5 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-16 text-center">
            <UserCog className="w-12 h-12 text-muted mx-auto mb-3 opacity-40" />
            <p className="text-base font-semibold text-ink dark:text-white">No user accounts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="sticky top-0 bg-white/90 dark:bg-[#181B1A]/90 backdrop-blur-md border-b border-black/5 dark:border-white/5 z-10 text-xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Username</th>
                  <th className="px-6 py-4">Role & Access Tier</th>
                  <th className="px-6 py-4">Security Status</th>
                  <th className="px-6 py-4">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {filteredUsers.map((u) => (
                  <motion.tr
                    key={u.id || u.username}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-14 hover:bg-black/2 dark:hover:bg-white/2 transition-colors"
                  >
                    <td className="px-6 py-3 font-semibold text-ink dark:text-white">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center font-bold text-xs">
                          {u.full_name ? u.full_name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        {u.full_name || u.username}
                      </div>
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-muted">
                      @{u.username}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${getRoleBadge(u.role)}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      {u.must_change_password ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <KeyRound className="w-3.5 h-3.5" />
                          Password Change Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#3E8E63]/10 text-[#3E8E63]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Active & Verified
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-muted">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : 'Standard Seeding'}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white dark:bg-[#181B1A] rounded-3xl p-6 max-w-md w-full shadow-2xl border border-black/10 dark:border-white/10 space-y-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[#5F7F6D]" />
                  <h3 className="text-lg font-bold text-ink dark:text-white">Create New Account</h3>
                </div>
                <button
                  onClick={() => setIsAddOpen(false)}
                  className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-muted"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-2xl bg-[#D4574E]/10 border border-[#D4574E]/20 text-[#D4574E] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {errorMsg}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setErrorMsg('');
                  createUserMutation.mutate(formData);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Sharma"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full px-4 py-2 rounded-2xl border border-black/10 dark:border-white/10 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[#5F7F6D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ramesh.wms"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-4 py-2 rounded-2xl border border-black/10 dark:border-white/10 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[#5F7F6D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Temporary Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Must be at least 8 characters"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 rounded-2xl border border-black/10 dark:border-white/10 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[#5F7F6D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    RBAC Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value as any })
                    }
                    className="w-full px-4 py-2 rounded-2xl border border-black/10 dark:border-white/10 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[#5F7F6D]"
                  >
                    <option value="storekeeper">Storekeeper (Inventory, Stock in/out, Receipts)</option>
                    <option value="manager">Manager (+ PO Approval, Pricing, Reports, Audit)</option>
                    <option value="admin">Admin (Full Access + User Governance)</option>
                  </select>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="px-5 py-2.5 rounded-full border border-black/10 dark:border-white/10 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createUserMutation.isPending}
                    className="sweep-hover px-6 py-2.5 rounded-full bg-ink text-white dark:bg-white dark:text-ink text-sm font-medium hover:scale-[0.98] transition-transform"
                  >
                    {createUserMutation.isPending ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
