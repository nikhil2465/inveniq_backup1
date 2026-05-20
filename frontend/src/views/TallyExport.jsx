import React, { useState, useEffect, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import { exportToCsv } from '../utils/exportUtils';

// ── Column definitions (match backend field names exactly) ───────────────────
const STOCK_COLS = [
  { key: 'Name',                label: 'Name' },
  { key: 'Under (Stock Group)', label: 'Under (Stock Group)' },
  { key: 'Units',               label: 'Units' },
  { key: 'Opening Qty',         label: 'Opening Qty' },
  { key: 'Opening Rate (Rs.)',  label: 'Opening Rate (Rs.)' },
  { key: 'Opening Value (Rs.)', label: 'Opening Value (Rs.)' },
  { key: 'HSN Code',            label: 'HSN Code' },
  { key: 'GST Rate (%)',        label: 'GST Rate (%)' },
  { key: 'Taxability',          label: 'Taxability' },
];

const CUST_COLS = [
  { key: 'Name',                   label: 'Name' },
  { key: 'Under',                  label: 'Under' },
  { key: 'Mailing Name',           label: 'Mailing Name' },
  { key: 'Address',                label: 'Address' },
  { key: 'State',                  label: 'State' },
  { key: 'GSTIN/UIN',              label: 'GSTIN/UIN' },
  { key: 'Phone',                  label: 'Phone' },
  { key: 'Email',                  label: 'Email' },
  { key: 'Opening Balance (Rs.)',  label: 'Opening Balance (Rs.)' },
  { key: 'Dr/Cr',                  label: 'Dr/Cr' },
  { key: 'Registration Type',      label: 'Registration Type' },
];

const SUPP_COLS = [
  { key: 'Name',                   label: 'Name' },
  { key: 'Under',                  label: 'Under' },
  { key: 'Mailing Name',           label: 'Mailing Name' },
  { key: 'State',                  label: 'State' },
  { key: 'GSTIN/UIN',              label: 'GSTIN/UIN' },
  { key: 'Phone',                  label: 'Phone' },
  { key: 'Email',                  label: 'Email' },
  { key: 'Opening Balance (Rs.)',  label: 'Opening Balance (Rs.)' },
  { key: 'Dr/Cr',                  label: 'Dr/Cr' },
  { key: 'Payment Terms (Days)',   label: 'Payment Terms (Days)' },
  { key: 'Registration Type',      label: 'Registration Type' },
];

const SALES_COLS = [
  { key: 'Date (DD-MM-YYYY)',      label: 'Date (DD-MM-YYYY)' },
  { key: 'Voucher Type',           label: 'Voucher Type' },
  { key: 'Voucher No',             label: 'Voucher No' },
  { key: 'Party Name (Customer)', label: 'Party Name (Customer)' },
  { key: 'Stock Item',             label: 'Stock Item' },
  { key: 'Quantity',               label: 'Quantity' },
  { key: 'Rate (Rs.)',             label: 'Rate (Rs.)' },
  { key: 'Amount (Rs.)',           label: 'Amount (Rs.)' },
  { key: 'GST Rate (%)',           label: 'GST Rate (%)' },
  { key: 'CGST (Rs.)',             label: 'CGST (Rs.)' },
  { key: 'SGST (Rs.)',             label: 'SGST (Rs.)' },
  { key: 'IGST (Rs.)',             label: 'IGST (Rs.)' },
  { key: 'Total Amount (Rs.)',     label: 'Total Amount (Rs.)' },
  { key: 'Narration',              label: 'Narration' },
];

const PURCH_COLS = [
  { key: 'Date (DD-MM-YYYY)',      label: 'Date (DD-MM-YYYY)' },
  { key: 'Voucher Type',           label: 'Voucher Type' },
  { key: 'Voucher No',             label: 'Voucher No' },
  { key: 'Reference PO No',        label: 'Reference PO No' },
  { key: 'Party Name (Supplier)', label: 'Party Name (Supplier)' },
  { key: 'Stock Item',             label: 'Stock Item' },
  { key: 'Quantity',               label: 'Quantity' },
  { key: 'Rate (Rs.)',             label: 'Rate (Rs.)' },
  { key: 'Amount (Rs.)',           label: 'Amount (Rs.)' },
  { key: 'GST Rate (%)',           label: 'GST Rate (%)' },
  { key: 'CGST (Rs.)',             label: 'CGST (Rs.)' },
  { key: 'SGST (Rs.)',             label: 'SGST (Rs.)' },
  { key: 'IGST (Rs.)',             label: 'IGST (Rs.)' },
  { key: 'Total Amount (Rs.)',     label: 'Total Amount (Rs.)' },
];

// ── Export card definitions ──────────────────────────────────────────────────
const EXPORT_CONFIGS = [
  {
    key:        'stock-items',
    title:      'Stock Items',
    sub:        'Product Masters',
    icon:       '📦',
    accent:     '#16a34a',
    summaryKey: 'stock_items',
    endpoint:   'stock-items',
    rowsKey:    'items',
    filename:   'Tally_Stock_Items',
    cols:       STOCK_COLS,
    hasPeriod:  true,
    desc:       'All product stock masters including hardware fittings, sanitary CP fittings, kitchen systems, and door hardware. Import once to create your Tally stock item ledger.',
    tallyPath:  'Gateway of Tally → Import → Masters → Stock Items',
  },
  {
    key:        'customer-ledgers',
    title:      'Customer Ledgers',
    sub:        'Sundry Debtors',
    icon:       '👥',
    accent:     '#0572CE',
    summaryKey: 'customer_ledgers',
    endpoint:   'customer-ledgers',
    rowsKey:    'ledgers',
    filename:   'Tally_Customer_Ledgers',
    cols:       CUST_COLS,
    hasPeriod:  false,
    desc:       'Customer accounts under Sundry Debtors with GSTIN, addresses, and opening balances. Includes contractors, kitchen studios, bath studios, and retailers.',
    tallyPath:  'Gateway of Tally → Import → Masters → Ledgers',
  },
  {
    key:        'supplier-ledgers',
    title:      'Supplier Ledgers',
    sub:        'Sundry Creditors',
    icon:       '🏭',
    accent:     '#9333ea',
    summaryKey: 'supplier_ledgers',
    endpoint:   'supplier-ledgers',
    rowsKey:    'ledgers',
    filename:   'Tally_Supplier_Ledgers',
    cols:       SUPP_COLS,
    hasPeriod:  false,
    desc:       'Supplier/vendor accounts under Sundry Creditors with GSTIN and payment terms. Covers Ebco, Hafele, Hettich, Jaquar, and Hindware with opening balances.',
    tallyPath:  'Gateway of Tally → Import → Masters → Ledgers',
  },
  {
    key:        'sales-vouchers',
    title:      'Sales Vouchers',
    sub:        'Sales Transactions',
    icon:       '🧾',
    accent:     '#d97706',
    summaryKey: 'sales_vouchers',
    endpoint:   'sales-vouchers',
    rowsKey:    'vouchers',
    filename:   'Tally_Sales_Vouchers',
    cols:       SALES_COLS,
    hasPeriod:  true,
    desc:       'Sales invoices with stock item line items and GST breakup (CGST + SGST). Each row is one line item. Ready for GSTR-1 reconciliation in Tally.',
    tallyPath:  'Gateway of Tally → Import → Transactions → Sales Vouchers',
  },
  {
    key:        'purchase-vouchers',
    title:      'Purchase Vouchers',
    sub:        'Purchase Transactions',
    icon:       '📑',
    accent:     '#dc2626',
    summaryKey: 'purchase_vouchers',
    endpoint:   'purchase-vouchers',
    rowsKey:    'vouchers',
    filename:   'Tally_Purchase_Vouchers',
    cols:       PURCH_COLS,
    hasPeriod:  true,
    desc:       'Purchase entries from GRN receipts with PO reference numbers and GST details. Maps to Tally purchase vouchers for GSTR-2B reconciliation.',
    tallyPath:  'Gateway of Tally → Import → Transactions → Purchase Vouchers',
  },
];

// ── Inline icons ─────────────────────────────────────────────────────────────
const DownloadIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
    <path d="M8 2v9M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

const SpinnerIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" width="12" height="12" style={{ animation: 'te-spin 1s linear infinite' }}>
    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" opacity=".25"/>
    <path d="M13.5 8a5.5 5.5 0 00-5.5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const InfoIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" width="14" height="14" style={{ flexShrink: 0, marginTop: 1 }}>
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" opacity=".8"/>
    <path d="M8 7v5M8 5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".9"/>
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────────────
export default function TallyExport({ dbStatus, period, onGoChat }) {
  // ALL hooks unconditionally before any early return (React rules of hooks)
  const [summary,        setSummary]        = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [downloadingKey, setDownloadingKey] = useState(null);
  const [toast,          setToast]          = useState(null);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/tally/summary');
      if (res.ok) setSummary(await res.json());
    } catch {
      /* non-fatal — counts show placeholder */
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // Auto-dismiss toast after 4 s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleDownload = useCallback(async (cfg) => {
    if (downloadingKey) return; // prevent concurrent downloads
    setDownloadingKey(cfg.key);
    try {
      const qs  = cfg.hasPeriod ? `?period=${encodeURIComponent(period)}` : '';
      const res = await fetch(`/api/tally/${cfg.endpoint}${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = data[cfg.rowsKey] ?? [];
      if (!rows.length) {
        setToast({ type: 'error', msg: 'No records found to export.' });
        return;
      }
      exportToCsv(rows, cfg.cols, cfg.filename);
      setToast({ type: 'success', msg: `${rows.length} records → ${cfg.filename}.csv` });
    } catch {
      setToast({ type: 'error', msg: 'Export failed — please try again.' });
    } finally {
      setDownloadingKey(null);
    }
  }, [downloadingKey, period]);

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100 }}>

      {/* ── Page header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 className="te-title">Tally Prime Export</h1>
          <p className="te-sub">Export InvenIQ data as Tally Prime-compatible CSV files for seamless import into your accounts</p>
        </div>
        <DataSourceBadge dbStatus={dbStatus} />
      </div>

      {/* ── How to import steps ──────────────────────────────────── */}
      <div className="te-how">
        <div className="te-how-title">How to import into Tally Prime — 4 steps</div>
        <div className="te-steps">
          {[
            { n: 1, head: 'Download CSV',        body: 'Click "Download CSV" on any card below. A Tally-formatted file downloads instantly to your computer.' },
            { n: 2, head: 'Open Tally Prime',    body: 'Launch Tally Prime and go to the Gateway of Tally on the machine where your company data is stored.' },
            { n: 3, head: 'Navigate to Import',  body: 'Click Import → Masters (for Stock Items / Ledgers) or Transactions (for Sales / Purchase Vouchers).' },
            { n: 4, head: 'Select & Import File',body: 'Browse to the downloaded CSV file. Map columns if prompted by Tally, then click Import to finish.' },
          ].map(s => (
            <div key={s.n} className="te-step">
              <div className="te-step-num">{s.n}</div>
              <div className="te-step-text">
                <strong>{s.head}</strong>
                {s.body}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Export cards grid ────────────────────────────────────── */}
      <div className="te-grid">
        {EXPORT_CONFIGS.map(cfg => {
          const info          = summary?.[cfg.summaryKey];
          const count         = info?.count;
          const countLoading  = summaryLoading || count === undefined;
          const isDownloading = downloadingKey === cfg.key;

          return (
            <div
              key={cfg.key}
              className="te-card"
              style={{ '--te-accent': cfg.accent }}
            >
              {/* Card header */}
              <div className="te-card-head">
                <span className="te-card-icon">{cfg.icon}</span>
                <div>
                  <div className="te-card-title">{cfg.title}</div>
                  <div className="te-card-sub">{cfg.sub}</div>
                </div>
              </div>

              {/* Description */}
              <div className="te-card-desc">{cfg.desc}</div>

              {/* Tally import path */}
              <div className="te-card-path">
                <div className="te-card-path-label">Tally Import Path</div>
                {cfg.tallyPath}
              </div>

              {/* Footer row: count badge + download button */}
              <div className="te-card-footer">
                <span className={`te-card-count${countLoading ? ' te-loading' : ''}`}>
                  {countLoading ? '…' : `${count} records`}
                </span>
                <button
                  className="te-btn"
                  onClick={() => handleDownload(cfg)}
                  disabled={!!downloadingKey}
                  title={isDownloading ? 'Exporting…' : `Download ${cfg.title} as CSV`}
                >
                  {isDownloading ? <SpinnerIcon /> : <DownloadIcon />}
                  {isDownloading ? 'Exporting…' : 'Download CSV'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── AI insight ───────────────────────────────────────────── */}
      {onGoChat && (
        <div className="ai-cta-bar" style={{ marginBottom: 14 }} onClick={() => onGoChat('Review my Tally export data — are there any GST rate mismatches between stock items, gaps in HSN codes, duplicate ledger names, or purchase vouchers without PO references that would cause import errors in Tally Prime?')}>
          <span>✨</span>
          <span>Ask AI: Validate export data — check for GST mismatches, duplicate ledgers, missing HSN codes before Tally import →</span>
        </div>
      )}

      {/* ── Info notice ──────────────────────────────────────────── */}
      <div className="te-notice">
        <InfoIcon />
        <span>
          CSV files are formatted for <strong>Tally Prime 2.1+</strong>. GST breakup assumes
          intra-state supply (CGST + SGST); update the IGST column manually for inter-state
          transactions. For Tally ERP 9 compatibility, use the XML import method instead.
          Date format is <strong>DD-MM-YYYY</strong> as required by Tally.
        </span>
      </div>

      {/* ── Toast notification ───────────────────────────────────── */}
      {toast && (
        <div className={`te-toast te-toast-${toast.type}`}>
          {toast.type === 'success'
            ? (
              <svg viewBox="0 0 16 16" fill="none" width="14" height="14" style={{ flexShrink: 0 }}>
                <circle cx="8" cy="8" r="6.5" fill="rgba(255,255,255,.2)"/>
                <path d="M5 8l2.5 2.5L11 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="none" width="14" height="14" style={{ flexShrink: 0 }}>
                <circle cx="8" cy="8" r="6.5" fill="rgba(255,255,255,.2)"/>
                <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            )
          }
          {toast.msg}
        </div>
      )}
    </div>
  );
}
