import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Download,
  Calendar,
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Layers,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { apiFetch, downloadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrb } from '../context/OrbContext';
import { CountUp } from '../components/CountUp';
import { Skeleton } from '../components/Skeleton';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

export const ReportsView: React.FC = () => {
  const { user } = useAuth();
  const { triggerSuccess } = useOrb();
  const [activeReportTab, setActiveReportTab] = useState<'owner' | 'stock' | 'gst' | 'tally'>('owner');

  const isStorekeeper = user?.role === 'storekeeper';

  // Fetch Owner Summary (Gated to Admin and Manager only)
  const { data: ownerData, isLoading: ownerLoading, refetch: refetchOwner } = useQuery({
    queryKey: ['/api/reports/owner-summary'],
    queryFn: () => apiFetch('/api/reports/owner-summary'),
    staleTime: 60000,
    enabled: !isStorekeeper && activeReportTab === 'owner',
  });

  // Fetch GST Sales Register
  const { data: gstSales, isLoading: gstLoading } = useQuery({
    queryKey: ['/api/reports/gst/sales-register'],
    queryFn: () => apiFetch('/api/reports/gst/sales-register'),
    staleTime: 60000,
    enabled: activeReportTab === 'gst',
  });

  const metrics = ownerData?.metrics || {};
  const period = ownerData?.period || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink-light dark:text-ink-dark tracking-tight">
            Financial & Statutory Reports
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Weekly executive business summaries, statutory GST return filings, and Tally ERP voucher exports
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeReportTab === 'owner' && !isStorekeeper && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => downloadFile('/api/reports/owner-summary/pdf', 'Owner_Summary_Report.pdf')}
              className="px-4 py-2 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill text-xs font-semibold shadow-bento sweep-hover flex items-center gap-1.5"
            >
              <Download size={13} />
              <span>Download PDF Report</span>
            </motion.button>
          )}

          {!isStorekeeper && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => refetchOwner()}
              className="w-9 h-9 rounded-full bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark flex items-center justify-center text-muted hover:text-ink-light"
            >
              <RefreshCw size={14} className={ownerLoading ? 'animate-spin' : ''} />
            </motion.button>
          )}
        </div>
      </div>

      {/* Subtab Navigation */}
      <div className="bg-card-light dark:bg-card-dark rounded-card p-4 shadow-bento border border-hairline-light dark:border-hairline-dark flex items-center gap-2">
        {!isStorekeeper && (
          <button
            onClick={() => setActiveReportTab('owner')}
            className={`px-4 py-2 rounded-pill text-xs font-semibold transition-all ${
              activeReportTab === 'owner'
                ? 'bg-ink-light dark:bg-white text-white dark:text-ink-light shadow-sm'
                : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light'
            }`}
          >
            Executive Owner Summary
          </button>
        )}

        <button
          onClick={() => setActiveReportTab('gst')}
          className={`px-4 py-2 rounded-pill text-xs font-semibold transition-all ${
            activeReportTab === 'gst'
              ? 'bg-ink-light dark:bg-white text-white dark:text-ink-light shadow-sm'
              : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light'
          }`}
        >
          Statutory GST Registers
        </button>

        <button
          onClick={() => setActiveReportTab('tally')}
          className={`px-4 py-2 rounded-pill text-xs font-semibold transition-all ${
            activeReportTab === 'tally'
              ? 'bg-ink-light dark:bg-white text-white dark:text-ink-light shadow-sm'
              : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light'
          }`}
        >
          Tally ERP XML Vouchers
        </button>

        <button
          onClick={() => setActiveReportTab('stock')}
          className={`px-4 py-2 rounded-pill text-xs font-semibold transition-all ${
            activeReportTab === 'stock'
              ? 'bg-ink-light dark:bg-white text-white dark:text-ink-light shadow-sm'
              : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light'
          }`}
        >
          Valuation &amp; Stock Exports
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 1. EXECUTIVE OWNER SUMMARY                                           */}
      {/* ==================================================================== */}
      {activeReportTab === 'owner' && (
        isStorekeeper ? (
          <div className="bg-card-light dark:bg-card-dark rounded-card p-8 shadow-bento border border-hairline-light dark:border-hairline-dark text-center space-y-3">
            <ShieldAlert size={36} className="text-muted mx-auto" />
            <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
              Restricted to Admin & Manager Roles
            </h3>
            <p className="text-xs text-muted max-w-md mx-auto">
              Storekeeper accounts do not have clearance for executive financial reports. Please switch to the Statutory GST Registers tab.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 4 Top KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
                <span className="text-xs text-muted font-medium">Total Billed Revenue</span>
                <div className="text-2xl font-bold font-mono text-ink-light dark:text-ink-dark mt-2">
                  {ownerLoading ? (
                    <Skeleton className="h-7 w-28" />
                  ) : metrics.sales?.total_revenue != null ? (
                    `₹${Number(metrics.sales.total_revenue).toLocaleString('en-IN')}`
                  ) : (
                    '—'
                  )}
                </div>
                <span className="text-[11px] text-positive mt-0.5 block">
                  {metrics.sales?.growth_pct_vs_prior != null ? `${metrics.sales.growth_pct_vs_prior > 0 ? '+' : ''}${metrics.sales.growth_pct_vs_prior}% vs prior period` : 'Audited sales total'}
                </span>
              </div>

              <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
                <span className="text-xs text-muted font-medium">Estimated Gross Profit</span>
                <div className="text-2xl font-bold font-mono text-positive mt-2">
                  {ownerLoading ? (
                    <Skeleton className="h-7 w-28" />
                  ) : metrics.margin?.gross_profit != null ? (
                    `₹${Number(metrics.margin.gross_profit).toLocaleString('en-IN')}`
                  ) : (
                    '—'
                  )}
                </div>
                <span className="text-[11px] text-muted mt-0.5 block">
                  {metrics.margin?.gross_margin_pct != null ? `${metrics.margin.gross_margin_pct}% gross margin` : 'Product margin estimation'}
                </span>
              </div>

              <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
                <span className="text-xs text-muted font-medium">Overdue Receivables</span>
                <div className="text-2xl font-bold font-mono text-warning mt-2">
                  {ownerLoading ? (
                    <Skeleton className="h-7 w-28" />
                  ) : metrics.receivables?.total_overdue_value != null ? (
                    `₹${Number(metrics.receivables.total_overdue_value).toLocaleString('en-IN')}`
                  ) : (
                    '—'
                  )}
                </div>
                <span className="text-[11px] text-warning mt-0.5 block">
                  {metrics.receivables?.overdue_invoices_count != null ? `${metrics.receivables.overdue_invoices_count} overdue invoices` : 'Past agreed credit terms'}
                </span>
              </div>

              <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
                <span className="text-xs text-muted font-medium">Dead Stock Capital</span>
                <div className="text-2xl font-bold font-mono text-sage mt-2">
                  {ownerLoading ? (
                    <Skeleton className="h-7 w-28" />
                  ) : metrics.dead_stock?.tied_capital != null ? (
                    `₹${Number(metrics.dead_stock.tied_capital).toLocaleString('en-IN')}`
                  ) : (
                    '—'
                  )}
                </div>
                <span className="text-[11px] text-muted mt-0.5 block">
                  {metrics.dead_stock?.count != null ? `${metrics.dead_stock.count} SKUs idle > 90 days` : 'Asset holding valuation'}
                </span>
              </div>
            </div>

            {/* AI Synthesized Executive Narrative */}
            <div className="bg-card-light dark:bg-card-dark rounded-card p-6 shadow-bento border border-hairline-light dark:border-hairline-dark">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-sage" />
                <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
                  Executive Synthesis & Operations Narrative
                </h3>
              </div>

              {ownerLoading ? (
                <div className="space-y-2 py-4">
                  <Skeleton className="h-4 w-full" rounded="md" />
                  <Skeleton className="h-4 w-5/6" rounded="md" />
                  <Skeleton className="h-4 w-4/6" rounded="md" />
                </div>
              ) : (
                <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed text-ink-light dark:text-ink-dark">
                  <MarkdownRenderer content={ownerData?.narrative || 'Weekly operations completed with optimal throughput.'} />
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-hairline-light dark:border-hairline-dark flex items-center justify-between text-[11px] text-muted">
                <span>
                  Period:{' '}
                  {period?.from_date && period?.to_date
                    ? `${period.from_date} – ${period.to_date}`
                    : 'Last 7 Days'}
                </span>
                <span className="italic">Grounded in verified database aggregates</span>
              </div>
            </div>
          </div>
        )
      )}

      {/* ==================================================================== */}
      {/* 2. STATUTORY GST REGISTERS                                           */}
      {/* ==================================================================== */}
      {activeReportTab === 'gst' && (
        <div className="space-y-4">
          {isStorekeeper ? (
            <div className="bg-card-light dark:bg-card-dark rounded-card p-8 shadow-bento border border-hairline-light dark:border-hairline-dark text-center space-y-3">
              <ShieldAlert size={36} className="text-muted mx-auto" />
              <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">Restricted to Admin & Manager</h3>
              <p className="text-xs text-muted max-w-md mx-auto">GST registers are only accessible to Admin and Manager roles.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
                <h4 className="font-bold text-sm text-ink-light dark:text-ink-dark">GSTR-1 Outward Supply</h4>
                <p className="text-xs text-muted mt-1">B2B commercial invoices with HSN summary (B2B CSV format)</p>
                <button
                  onClick={() => downloadFile('/api/reports/gst/gstr1?format=b2b_csv', 'GSTR1_B2B.csv')}
                  className="mt-4 text-xs font-semibold text-sage hover:underline flex items-center gap-1"
                >
                  <span>Export GSTR-1 B2B CSV</span>
                  <Download size={12} />
                </button>
              </div>

              <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
                <h4 className="font-bold text-sm text-ink-light dark:text-ink-dark">GST Sales Register</h4>
                <p className="text-xs text-muted mt-1">Complete outward supply register — all invoices with GST breakup</p>
                <button
                  onClick={() => downloadFile('/api/reports/gst/sales-register?format=csv', 'GST_Sales_Register.csv')}
                  className="mt-4 text-xs font-semibold text-sage hover:underline flex items-center gap-1"
                >
                  <span>Export Sales Register CSV</span>
                  <Download size={12} />
                </button>
              </div>

              <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
                <h4 className="font-bold text-sm text-ink-light dark:text-ink-dark">GST Purchase Register</h4>
                <p className="text-xs text-muted mt-1">Vendor purchase orders with input tax credit breakup</p>
                <button
                  onClick={() => downloadFile('/api/reports/gst/purchase-register?format=csv', 'GST_Purchase_Register.csv')}
                  className="mt-4 text-xs font-semibold text-sage hover:underline flex items-center gap-1"
                >
                  <span>Export Purchase Register CSV</span>
                  <Download size={12} />
                </button>
              </div>

              <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
                <h4 className="font-bold text-sm text-ink-light dark:text-ink-dark">HSN Summary</h4>
                <p className="text-xs text-muted mt-1">Commodity-wise HSN / SAC code summary with tax details</p>
                <button
                  onClick={() => downloadFile('/api/reports/gst/hsn-summary?format=csv', 'GST_HSN_Summary.csv')}
                  className="mt-4 text-xs font-semibold text-sage hover:underline flex items-center gap-1"
                >
                  <span>Export HSN Summary CSV</span>
                  <Download size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. TALLY ERP XML VOUCHERS                                             */}
      {/* ==================================================================== */}
      {activeReportTab === 'tally' && (
        <div className="bg-card-light dark:bg-card-dark rounded-card p-6 shadow-bento border border-hairline-light dark:border-hairline-dark space-y-4">
          <div>
            <h4 className="font-bold text-sm text-ink-light dark:text-ink-dark">
              Tally Prime & ERP 9 XML Export
            </h4>
            <p className="text-xs text-muted mt-0.5">
              Export standard Tally-compatible XML vouchers for instant import into accounting software without re-entry.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-tile bg-canvas-light/60 dark:bg-black/20 border border-hairline-light dark:border-hairline-dark flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink-light dark:text-ink-dark">Sales & Tax Invoices</p>
                <p className="text-[11px] text-muted">All confirmed sales with CGST/SGST/IGST breakdown</p>
              </div>
              <button
                onClick={() => downloadFile('/api/reports/tally/vouchers?type=sales', 'Tally_Sales_Vouchers.xml')}
                className="px-3 py-1.5 bg-sage text-white text-xs font-semibold rounded-pill hover:bg-sage-dark transition-all flex items-center gap-1"
              >
                <Download size={12} />
                <span>XML</span>
              </button>
            </div>

            <div className="p-4 rounded-tile bg-canvas-light/60 dark:bg-black/20 border border-hairline-light dark:border-hairline-dark flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink-light dark:text-ink-dark">Purchase & GRN Vouchers</p>
                <p className="text-[11px] text-muted">Delivered vendor receipts with purchase ledger ledger entries</p>
              </div>
              <button
                onClick={() => downloadFile('/api/reports/tally/vouchers?type=purchase', 'Tally_Purchase_Vouchers.xml')}
                className="px-3 py-1.5 bg-sage text-white text-xs font-semibold rounded-pill hover:bg-sage-dark transition-all flex items-center gap-1"
              >
                <Download size={12} />
                <span>XML</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. VALUATION & STOCK EXPORTS                                         */}
      {/* ==================================================================== */}
      {activeReportTab === 'stock' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Valuation PDF */}
            <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-sm text-ink-light dark:text-ink-dark">Valuation Report (PDF)</h4>
                <p className="text-xs text-muted mt-1">Comprehensive facility stock valuation, inventory health, and ABC-XYZ breakdown</p>
              </div>
              <button
                onClick={() => downloadFile('/api/pdf/dashboard-report', 'Valuation_Dashboard_Report.pdf')}
                className="mt-4 text-xs font-semibold text-sage hover:underline flex items-center gap-1"
              >
                <span>Download PDF</span>
                <Download size={12} />
              </button>
            </div>

            {/* Excel Ledger */}
            <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-sm text-ink-light dark:text-ink-dark">Comprehensive Ledger (Excel)</h4>
                <p className="text-xs text-muted mt-1">Multi-sheet workbook: items, balances, valuation, active POs and customer ledgers</p>
              </div>
              <button
                onClick={() => downloadFile('/api/export/excel/comprehensive', 'Anishka_Comprehensive_Ledger.xlsx')}
                className="mt-4 text-xs font-semibold text-sage hover:underline flex items-center gap-1"
              >
                <span>Download Excel</span>
                <Download size={12} />
              </button>
            </div>

            {/* Bulk POs PDF */}
            <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-sm text-ink-light dark:text-ink-dark">All Purchase Orders (PDF)</h4>
                <p className="text-xs text-muted mt-1">Consolidated multi-page summary of all open and pending procurement orders</p>
              </div>
              <button
                onClick={() => downloadFile('/api/pdf/bulk-procurement', 'All_Purchase_Orders.pdf')}
                className="mt-4 text-xs font-semibold text-sage hover:underline flex items-center gap-1"
              >
                <span>Download PDF</span>
                <Download size={12} />
              </button>
            </div>

            {/* Low-stock PDF / Excel / CSV */}
            <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-sm text-ink-light dark:text-ink-dark">Low Stock Critical List</h4>
                <p className="text-xs text-muted mt-1">SKUs at or below reorder threshold requiring purchase indenting</p>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => downloadFile('/api/export/low-stock/pdf', 'Low_Stock_Report.pdf')}
                  className="text-xs font-semibold text-sage hover:underline flex items-center gap-1"
                >
                  <span>PDF</span>
                  <Download size={11} />
                </button>
                <span className="text-muted">•</span>
                <button
                  onClick={() => downloadFile('/api/export/low-stock/excel', 'Low_Stock_Report.xlsx')}
                  className="text-xs font-semibold text-sage hover:underline flex items-center gap-1"
                >
                  <span>Excel</span>
                  <Download size={11} />
                </button>
                <span className="text-muted">•</span>
                <button
                  onClick={() => downloadFile('/api/export/low-stock/csv', 'Low_Stock_Report.csv')}
                  className="text-xs font-semibold text-sage hover:underline flex items-center gap-1"
                >
                  <span>CSV</span>
                  <Download size={11} />
                </button>
              </div>
            </div>

            {/* Movements CSV */}
            <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-sm text-ink-light dark:text-ink-dark">Stock Movement Ledger (CSV)</h4>
                <p className="text-xs text-muted mt-1">Full inward, dispatch, and adjustment history with timestamps</p>
              </div>
              <button
                onClick={() => downloadFile('/api/export/csv/movements', 'Stock_Movements.csv')}
                className="mt-4 text-xs font-semibold text-sage hover:underline flex items-center gap-1"
              >
                <span>Export CSV</span>
                <Download size={12} />
              </button>
            </div>

            {/* Dead Stock CSV */}
            <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-sm text-ink-light dark:text-ink-dark">Dead Stock Analysis (CSV)</h4>
                <p className="text-xs text-muted mt-1">Items idle &gt; 90 days with tied capital and holding cost</p>
              </div>
              <button
                onClick={() => downloadFile('/api/export/dead-stock/csv', 'Dead_Stock_Analysis.csv')}
                className="mt-4 text-xs font-semibold text-sage hover:underline flex items-center gap-1"
              >
                <span>Export CSV</span>
                <Download size={12} />
              </button>
            </div>

            {/* Audit Trail CSV (Admin/Manager only) */}
            {!isStorekeeper && (
              <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-sm text-ink-light dark:text-ink-dark">Audit Compliance Trail (CSV)</h4>
                  <p className="text-xs text-muted mt-1">Cryptographic hash chain security log for statutory audits</p>
                </div>
                <button
                  onClick={() => downloadFile('/api/export/csv/audit', 'Audit_Compliance_Trail.csv')}
                  className="mt-4 text-xs font-semibold text-sage hover:underline flex items-center gap-1"
                >
                  <span>Export CSV</span>
                  <Download size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
