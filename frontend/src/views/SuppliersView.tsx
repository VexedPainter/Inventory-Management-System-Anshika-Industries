import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Search,
  Plus,
  Truck,
  Star,
  Clock,
  Phone,
  Mail,
  MapPin,
  X,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrb } from '../context/OrbContext';
import { Skeleton } from '../components/Skeleton';

interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  contact_email?: string;
  email?: string;
  city?: string;
  lead_time_days?: number;
  rating?: number;
  category?: string;
  approved?: boolean;
}

export const SuppliersView: React.FC = () => {
  const { user } = useAuth();
  const { triggerSuccess, triggerAlert } = useOrb();
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();

  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    contact_person: 'Sales Executive',
    phone: '+91 124 400 0000',
    contact_email: 'sales@supplier.com',
    city: 'Gurugram',
    lead_time_days: 3,
    category: 'MIG Torch Spares',
    rating: 4.8,
  });

  const { data, isLoading, refetch, isFetching } = useQuery<Supplier[]>({
    queryKey: ['/api/suppliers'],
    queryFn: () => apiFetch('/api/suppliers'),
    staleTime: 60000,
  });

  const suppliers = Array.isArray(data) ? data : [];

  const filteredSuppliers = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(q))
    );
  }, [suppliers, search]);

  const addSupplierMutation = useMutation({
    mutationFn: (payload: any) =>
      apiFetch('/api/suppliers', {
        method: 'POST',
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      triggerSuccess('New supplier registered successfully');
      setIsAddOpen(false);
      setAddForm({
        name: '',
        contact_person: 'Sales Executive',
        phone: '+91 124 400 0000',
        contact_email: 'sales@supplier.com',
        city: 'Gurugram',
        lead_time_days: 3,
        category: 'MIG Torch Spares',
        rating: 4.8,
      });
    },
    onError: (err: any) => {
      triggerAlert(err.message || 'Failed to add supplier');
    },
  });

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink-light dark:text-ink-dark tracking-tight">
            Approved Supplier Directory
          </h2>
          <p className="text-xs text-muted mt-0.5">
            OEM manufacturers, authorized distributors, delivery lead times, and SLA ratings
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsAddOpen(true)}
              className="px-4 py-2 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill text-xs font-semibold shadow-bento sweep-hover flex items-center gap-1.5 transition-all"
            >
              <Plus size={14} />
              <span>Register Supplier</span>
            </motion.button>
          )}

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => refetch()}
            className="w-9 h-9 rounded-full bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark flex items-center justify-center text-muted hover:text-ink-light"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </motion.button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="bg-card-light dark:bg-card-dark rounded-card p-4 shadow-bento border border-hairline-light dark:border-hairline-dark flex items-center justify-between">
        <div className="relative flex items-center bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-1.5 border border-hairline-light dark:border-hairline-dark text-xs w-72">
          <Search size={14} className="text-muted mr-2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vendor name, city, contact…"
            className="bg-transparent text-ink-light dark:text-ink-dark focus:outline-none w-full"
          />
        </div>
        <span className="text-xs text-muted">
          <strong>{filteredSuppliers.length}</strong> active vendors
        </span>
      </div>

      {/* Suppliers Table (56px rows, sticky header, hover row tint) */}
      <div className="bg-card-light dark:bg-card-dark rounded-card shadow-bento border border-hairline-light dark:border-hairline-dark overflow-hidden">
        <div className="overflow-x-auto max-h-[640px] no-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-white/85 dark:bg-[#181B1A]/90 backdrop-blur-md border-b border-hairline-light dark:border-hairline-dark text-muted font-medium uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Vendor ID</th>
                <th className="py-3.5 px-4">Supplier Name</th>
                <th className="py-3.5 px-4">Specialization</th>
                <th className="py-3.5 px-4">Contact Person</th>
                <th className="py-3.5 px-4">Contact Info</th>
                <th className="py-3.5 px-4 text-center">City / Region</th>
                <th className="py-3.5 px-4 text-center">Lead Time</th>
                <th className="py-3.5 px-4 text-center">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="h-14">
                    <td colSpan={8} className="px-4">
                      <Skeleton className="h-8 w-full" rounded="md" />
                    </td>
                  </tr>
                ))
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-xs text-muted">
                    No suppliers match your query.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((s, idx) => (
                  <tr
                    key={s.id || idx}
                    className="h-14 hover:bg-black/2 dark:hover:bg-white/2 transition-colors"
                  >
                    <td className="py-2 px-4 font-mono font-semibold text-sage text-[11px]">
                      {s.id}
                    </td>

                    <td className="py-2 px-4 font-semibold text-ink-light dark:text-ink-dark">
                      {s.name}
                    </td>

                    <td className="py-2 px-4 text-muted">
                      {s.category || 'Welding Supplies'}
                    </td>

                    <td className="py-2 px-4 text-ink-light dark:text-ink-dark">
                      {s.contact_person || 'Sales Manager'}
                    </td>

                    <td className="py-2 px-4 text-muted">
                      <div className="flex flex-col text-[11px] font-mono">
                        <span>{s.phone || '—'}</span>
                        <span className="text-muted/70">{s.contact_email || s.email || '—'}</span>
                      </div>
                    </td>

                    <td className="py-2 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded text-muted">
                        <MapPin size={10} />
                        {s.city || 'Delhi-NCR'}
                      </span>
                    </td>

                    <td className="py-2 px-4 text-center font-mono">
                      <span className="inline-flex items-center gap-1 text-sage font-semibold">
                        <Clock size={12} />
                        {s.lead_time_days || 3} days
                      </span>
                    </td>

                    <td className="py-2 px-4 text-center">
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-xs bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full">
                        <Star size={11} className="fill-amber-500 text-amber-500" />
                        {s.rating || 4.8}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Register Supplier */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              className="relative z-10 bg-card-light dark:bg-card-dark max-w-md w-full rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark text-xs"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline-light dark:border-hairline-dark">
                <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
                  Register Authorized Vendor
                </h3>
                <button onClick={() => setIsAddOpen(false)} className="text-muted hover:text-ink-light">
                  <X size={16} />
                </button>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  addSupplierMutation.mutate(addForm);
                }}
                className="space-y-3.5 mt-4"
              >
                <div>
                  <label className="block text-muted font-medium mb-1">Company / Vendor Name *</label>
                  <input
                    type="text"
                    required
                    value={addForm.name}
                    onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                    className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-medium"
                    placeholder="e.g. Binzel India Spares Pvt Ltd"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-medium mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={addForm.contact_person}
                      onChange={e => setAddForm({ ...addForm, contact_person: e.target.value })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark"
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">City / Region</label>
                    <input
                      type="text"
                      value={addForm.city}
                      onChange={e => setAddForm({ ...addForm, city: e.target.value })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-medium mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={addForm.phone}
                      onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">Lead Time (Days)</label>
                    <input
                      type="number"
                      min="1"
                      value={addForm.lead_time_days}
                      onChange={e => setAddForm({ ...addForm, lead_time_days: Number(e.target.value) })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-mono font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-muted font-medium mb-1">Email Address</label>
                  <input
                    type="email"
                    value={addForm.contact_email}
                    onChange={e => setAddForm({ ...addForm, contact_email: e.target.value })}
                    className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-mono"
                  />
                </div>

                <div className="pt-3 border-t border-hairline-light dark:border-hairline-dark flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="px-4 py-2 bg-black/5 dark:bg-white/10 rounded-pill text-muted"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={addSupplierMutation.isPending}
                    className="px-5 py-2 bg-sage hover:bg-sage-dark text-white rounded-pill font-semibold sweep-hover"
                  >
                    {addSupplierMutation.isPending ? 'Saving…' : 'Register Vendor'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
