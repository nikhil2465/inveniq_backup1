/**
 * InvenIQ — AI Assistant
 * Professional streaming chat component with Ask / Explain / Act modes,
 * MCP tool chips, RCA badge, follow-up suggestions, and markdown rendering.
 *
 * New features:
 *   - PO Creation: OpenAI function-calling driven PO creation with inline confirmation card
 *   - Act mode RCA templates: structured root-cause frameworks shown in responses
 *   - po_grn tool chip: live PO & GRN data shown alongside response metadata
 */
import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import './AIAssistant.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const MODES = [
  {
    id: 'ask',
    label: 'Ask',
    icon: '💬',
    kbd: '1',
    color: 'ask',
    desc: 'Get instant, data-backed answers from your inventory.',
  },
  {
    id: 'explain',
    label: 'Explain',
    icon: '🔍',
    kbd: '2',
    color: 'explain',
    desc: 'Understand root causes with detailed analysis.',
  },
  {
    id: 'act',
    label: 'Act',
    icon: '⚡',
    kbd: '3',
    color: 'act',
    desc: 'Generate step-by-step action plans + RCA templates.',
  },
];

const MODE_DESC = {
  ask:     'Get instant, data-backed answers from your inventory.',
  explain: 'Understand root causes with detailed analysis.',
  act:     'Generate executable action plans with RCA templates.',
};

const SUGGESTIONS = [
  {
    category: '📦 Stock & Inventory',
    color: '#3b82f6',
    items: [
      'Which SKUs need immediate reorder?',
      'What items are overstocked right now?',
      'Show me slow-moving inventory this quarter',
    ],
  },
  {
    category: '📋 Procurement',
    color: '#7c3aed',
    items: [
      'Show status of all open purchase orders',
      'Which GRN discrepancies need action today?',
      'Create a PO for 300 sheets of 18mm BWP from Century',
    ],
  },
  {
    category: '📈 Business Growth',
    color: '#16a34a',
    items: [
      'How can I grow my revenue by 30% next quarter?',
      'Which customers should I target to expand business?',
      'What products have the highest growth potential?',
    ],
  },
  {
    category: '💰 Finance & Margins',
    color: '#d97706',
    items: [
      'What is my working capital situation?',
      'Which products am I underpricing right now?',
      'Show gross margin by product category',
    ],
  },
  {
    category: '📚 Learn Inventory',
    color: '#0891b2',
    items: [
      'What is EOQ and how do I calculate it for my business?',
      'Explain safety stock formula with my actual data',
      'How does ABC analysis work? Show my current ABC classification',
    ],
  },
  {
    category: '📄 Quotes & Projects',
    color: '#be185d',
    items: [
      'What is my quotation win rate and how can I improve it?',
      'Which quotes are expiring this week — give me the contact details and follow-up scripts',
      'Analyse my pipeline — which deals am I most likely to win?',
    ],
  },
  {
    category: '💡 Daily Insights',
    color: '#059669',
    items: [
      'Show me today\'s business insights',
      'What are my top priorities for this week?',
      'Give me a complete business health check',
    ],
  },
];

const TOOL_CHIP_CLASS = {
  stock: 'tool-stock', finance: 'tool-finance', supplier: 'tool-supplier',
  customer: 'tool-customer', order: 'tool-order', demand: 'tool-demand',
  freight: 'tool-freight', email: 'tool-email', po_grn: 'tool-supplier',
  sales: 'tool-sales', inward: 'tool-inward',
  knowledge: 'tool-knowledge', insights: 'tool-insights',
  quotes: 'tool-quotes', projects: 'tool-projects', catalog: 'tool-catalog',
};

const TOOL_EMOJI = {
  stock: '📦', finance: '💰', supplier: '🏭', customer: '👥',
  order: '📋', demand: '📈', freight: '🚚', email: '📧', po_grn: '📋',
  sales: '💹', inward: '🔄',
  knowledge: '📚', insights: '💡',
  quotes: '📄', projects: '🏗️', catalog: '🗂️',
};

// ─── Markdown Renderer (Professional — tables, headings, inline formatting) ────
function MarkdownRenderer({ text }) {
  const rendered = useMemo(() => {
    if (!text) return '';
    const lines = text.split('\n');
    const out = [];
    let inUl = false, inOl = false, inTable = false;
    let tableHeader = null, tableRows = [];

    const closeList = () => {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
    };

    const closeTable = () => {
      if (!inTable) return;
      inTable = false;
      if (tableHeader) {
        const ths = tableHeader.map(h => `<th>${formatInline(h.trim())}</th>`).join('');
        let html = `<div class="iq-md-table-wrap"><table class="iq-md-table"><thead><tr>${ths}</tr></thead><tbody>`;
        html += tableRows.map(row => `<tr>${row.map(c => `<td>${formatInline(c.trim())}</td>`).join('')}</tr>`).join('');
        html += '</tbody></table></div>';
        out.push(html);
      }
      tableHeader = null;
      tableRows = [];
    };

    const parseTableRow = (line) =>
      line.replace(/^\|/, '').replace(/\|$/, '').split('|');

    const isSeparator = (line) => /^\|[-| :]+\|$/.test(line.trim());

    lines.forEach((raw) => {
      const line = raw;

      // Table row detection
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        closeList();
        if (isSeparator(line)) return; // skip separator rows
        const cells = parseTableRow(line.trim());
        if (!inTable) {
          inTable = true;
          tableHeader = cells;
        } else {
          tableRows.push(cells);
        }
        return;
      }

      // Close table before handling other elements
      closeTable();

      if (/^### (.+)/.test(line)) {
        closeList();
        out.push(`<h3>${formatInline(line.replace(/^### /, ''))}</h3>`);
      } else if (/^## (.+)/.test(line)) {
        closeList();
        out.push(`<h2>${formatInline(line.replace(/^## /, ''))}</h2>`);
      } else if (/^#### (.+)/.test(line)) {
        closeList();
        out.push(`<h4>${formatInline(line.replace(/^#### /, ''))}</h4>`);
      } else if (/^\*\*(.+)\*\*$/.test(line.trim())) {
        closeList();
        out.push(`<p><strong>${line.trim().replace(/^\*\*|\*\*$/g, '')}</strong></p>`);
      } else if (/^---+$/.test(line.trim())) {
        closeList(); out.push('<hr />');
      } else if (/^[-•*] (.+)/.test(line)) {
        if (!inUl) { out.push('<ul>'); inUl = true; }
        const item = line.replace(/^[-•*] /, '');
        out.push(`<li>${formatInline(item)}</li>`);
      } else if (/^\d+\. (.+)/.test(line)) {
        if (!inOl) { out.push('<ol>'); inOl = true; }
        const item = line.replace(/^\d+\. /, '');
        out.push(`<li>${formatInline(item)}</li>`);
      } else if (line.trim() === '') {
        closeList();
        out.push('<div class="spacer"></div>');
      } else {
        closeList();
        out.push(`<p>${formatInline(line)}</p>`);
      }
    });
    closeList();
    closeTable();
    return out.join('');
  }, [text]);

  return (
    <div
      className="iq-md"
      dangerouslySetInnerHTML={{ __html: rendered }}  // eslint-disable-line react/no-danger
    />
  );
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(text) {
  const safe = escapeHtml(text);
  return safe
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

// ─── Icon Components ──────────────────────────────────────────────────────────
const IconSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const IconCopy = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const IconArrow = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);
const IconBot = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="white"
    stroke="white" strokeWidth="0">
    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.38-1 1.72V7h3a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3h3V5.72A2 2 0 0 1 10 4a2 2 0 0 1 2-2zm-3 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-3 5a4 4 0 0 0-3.46 2h6.92A4 4 0 0 0 12 16z" />
  </svg>
);
const IconUser = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="white"
    stroke="white" strokeWidth="0">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
  </svg>
);
const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconSpark = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L9.1 9.1 2 12l7.1 2.9L12 22l2.9-7.1L22 12l-7.1-2.9z" />
  </svg>
);

// ─── Tool Chips Helper ────────────────────────────────────────────────────────
function parseToolChips(tools) {
  if (!tools || !tools.length) return [];
  return tools.map((t) => {
    const key = typeof t === 'string' ? t : t.tool || '';
    const label = key.replace('query_', '').replace(/_/g, ' ');
    const baseKey = key.replace(/_/g, '');
    const cls = TOOL_CHIP_CLASS[key] || TOOL_CHIP_CLASS[label.split(' ')[0]] || 'tool-order';
    const emoji = TOOL_EMOJI[key] || TOOL_EMOJI[label.split(' ')[0]] || '🔧';
    return { key, label, cls, emoji, baseKey };
  });
}

// ─── PO Confirmation Card — Professional Worldwide PO Template ───────────────
function POConfirmCard({ action, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const po = action.po_data || {};

  // ── Success State ────────────────────────────────────────────────────────
  if (action.status === 'success') {
    const res = action.result || {};
    const totalVal = res.total_value > 0
      ? `₹${Number(res.total_value).toLocaleString('en-IN')}`
      : null;
    return (
      <div style={{
        marginTop: 14, fontFamily: "'Segoe UI', Arial, sans-serif",
        border: '2px solid #16a34a', borderRadius: 10, overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(22,163,74,0.12)',
      }}>
        <div style={{ background: '#16a34a', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Purchase Order Issued Successfully</div>
            <div style={{ color: '#bbf7d0', fontSize: 11 }}>PO has been created and added to your procurement records</div>
          </div>
        </div>
        <div style={{ background: '#f0fdf4', padding: '14px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontSize: 12, color: '#166534' }}>
            <div><span style={{ color: '#15803d', fontWeight: 600 }}>PO Number: </span>
              <code style={{ background: '#dcfce7', padding: '2px 8px', borderRadius: 4, fontWeight: 700, letterSpacing: '0.5px' }}>
                {res.po_number || 'PO-DEMO'}
              </code>
            </div>
            <div><span style={{ color: '#15803d', fontWeight: 600 }}>Date Issued: </span>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div><span style={{ color: '#15803d', fontWeight: 600 }}>Vendor: </span>{res.supplier || po.supplier_name}</div>
            <div><span style={{ color: '#15803d', fontWeight: 600 }}>Product: </span>{res.sku || po.sku_name}</div>
            <div><span style={{ color: '#15803d', fontWeight: 600 }}>Quantity: </span>{(res.quantity || po.quantity)?.toLocaleString('en-IN')} sheets</div>
            <div><span style={{ color: '#15803d', fontWeight: 600 }}>Expected Delivery: </span>{res.expected_date || po.expected_date || 'Within 7 days'}</div>
            {totalVal && <div style={{ gridColumn: '1/-1' }}><span style={{ color: '#15803d', fontWeight: 600 }}>Total Order Value (incl. GST): </span><strong>{totalVal}</strong></div>}
          </div>
          {res.demo_mode && (
            <div style={{ marginTop: 8, color: '#6b7280', fontSize: 10, borderTop: '1px solid #d1fae5', paddingTop: 6 }}>
              ℹ️ Demo mode — PO not persisted. Connect MySQL to store in database.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Error State ──────────────────────────────────────────────────────────
  if (action.status === 'error') {
    return (
      <div style={{
        marginTop: 12, padding: '12px 16px', background: '#fef2f2',
        border: '1px solid #fca5a5', borderRadius: 10, fontSize: 12, color: '#dc2626',
      }}>
        ❌ <strong>PO creation failed:</strong> {action.error || 'Unknown error'}
      </div>
    );
  }

  // ── Cancelled State ──────────────────────────────────────────────────────
  if (action.status === 'cancelled') {
    return (
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
        PO creation cancelled. You can ask me to create a new PO anytime.
      </div>
    );
  }

  // ── Pending — Professional PO Document Template ──────────────────────────
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const deliveryDate = po.expected_date
    ? new Date(po.expected_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : (() => { const d = new Date(today); d.setDate(d.getDate() + 7); return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); })();

  const qty = Number(po.quantity) || 0;
  const unitPrice = Number(po.unit_price) || 0;
  const hasPrice = unitPrice > 0;
  const subtotal = hasPrice ? qty * unitPrice : 0;
  const gst = hasPrice ? Math.round(subtotal * 0.18) : 0;
  const grandTotal = subtotal + gst;

  const fmtINR = (n) => `₹${n.toLocaleString('en-IN')}`;

  // Table styles
  const thStyle = {
    background: '#1e3a5f', color: '#fff', fontSize: 10, fontWeight: 700,
    padding: '6px 8px', textAlign: 'left', letterSpacing: '0.5px', textTransform: 'uppercase',
  };
  const tdStyle = {
    fontSize: 11, padding: '7px 8px', color: '#1e293b',
    borderBottom: '1px solid #e2e8f0', verticalAlign: 'top',
  };
  const labelStyle = { fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 2, display: 'block' };
  const valueStyle = { fontSize: 12, color: '#0f172a', fontWeight: 500 };

  const handleConfirm = async () => {
    setBusy(true);
    await onConfirm(po);
    setBusy(false);
  };

  return (
    <div style={{
      marginTop: 14, fontFamily: "'Segoe UI', Arial, sans-serif",
      border: '1.5px solid #cbd5e1', borderRadius: 10, overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
      maxWidth: 680,
    }}>

      {/* ── PO Header ── */}
      <div style={{ background: '#1e3a5f', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#93c5fd', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>StockSense Plywood Dealers</div>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: '1px' }}>PURCHASE ORDER</div>
          <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 3 }}>Bangalore, Karnataka · GSTIN: 29AABCS1234F1ZX</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ background: '#f59e0b', color: '#1e3a5f', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 4, letterSpacing: '0.5px', marginBottom: 6, display: 'inline-block' }}>DRAFT — PENDING APPROVAL</div>
          <div style={{ color: '#94a3b8', fontSize: 10 }}><span style={{ color: '#cbd5e1', fontWeight: 600 }}>Date: </span>{todayStr}</div>
          <div style={{ color: '#94a3b8', fontSize: 10 }}><span style={{ color: '#cbd5e1', fontWeight: 600 }}>Delivery By: </span>{deliveryDate}</div>
        </div>
      </div>

      {/* ── Vendor + Ship To ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, background: '#f8fafc' }}>
        <div style={{ padding: '12px 20px', borderRight: '1px solid #e2e8f0' }}>
          <div style={{ ...labelStyle }}>Vendor / Bill To</div>
          <div style={{ ...valueStyle, fontWeight: 700 }}>{po.supplier_name || '—'}</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>
            Authorised Supplier<br />
            {po.supplier_name?.toLowerCase().includes('century') ? 'Mumbai, Maharashtra' : 'India'}
          </div>
        </div>
        <div style={{ padding: '12px 20px' }}>
          <div style={{ ...labelStyle }}>Ship / Deliver To</div>
          <div style={{ ...valueStyle, fontWeight: 700 }}>StockSense Plywood Dealers</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>
            Main Warehouse, Bangalore<br />
            Karnataka — 560001
          </div>
        </div>
      </div>

      {/* ── Order Terms Bar ── */}
      <div style={{ background: '#eef2ff', padding: '7px 20px', display: 'flex', gap: 28, borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
        {[
          ['Payment Terms', 'Net 30 Days'],
          ['Delivery Terms', 'FOB — Destination'],
          ['Currency', 'INR (Indian Rupee)'],
          ['GST Rate', '18% (IGST)'],
        ].map(([lbl, val]) => (
          <div key={lbl}>
            <span style={{ fontSize: 9, color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' }}>{lbl}</span>
            <span style={{ fontSize: 10, color: '#1e293b', fontWeight: 600 }}>{val}</span>
          </div>
        ))}
      </div>

      {/* ── Line Items Table ── */}
      <div style={{ padding: '0 0 0 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 30 }}>#</th>
              <th style={{ ...thStyle }}>Description / SKU</th>
              <th style={{ ...thStyle, width: 70, textAlign: 'center' }}>Qty (Sheets)</th>
              <th style={{ ...thStyle, width: 100, textAlign: 'right' }}>Unit Price</th>
              <th style={{ ...thStyle, width: 110, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...tdStyle, textAlign: 'center', color: '#64748b' }}>1</td>
              <td style={{ ...tdStyle }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{po.sku_name || '—'}</div>
                {po.notes && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{po.notes}</div>}
              </td>
              <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>{qty.toLocaleString('en-IN')}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                {hasPrice ? fmtINR(unitPrice) : <span style={{ color: '#f59e0b', fontSize: 10 }}>From DB</span>}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                {hasPrice ? fmtINR(subtotal) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Totals ── */}
      {hasPrice ? (
        <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '10px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ display: 'flex', gap: 48, fontSize: 11, color: '#475569' }}>
              <span>Subtotal</span><span style={{ minWidth: 90, textAlign: 'right' }}>{fmtINR(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', gap: 48, fontSize: 11, color: '#475569' }}>
              <span>IGST @ 18%</span><span style={{ minWidth: 90, textAlign: 'right' }}>{fmtINR(gst)}</span>
            </div>
            <div style={{ display: 'flex', gap: 48, fontSize: 13, fontWeight: 800, color: '#1e3a5f', borderTop: '2px solid #1e3a5f', paddingTop: 6, marginTop: 2 }}>
              <span>GRAND TOTAL</span><span style={{ minWidth: 90, textAlign: 'right' }}>{fmtINR(grandTotal)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: '#fffbeb', borderTop: '1px solid #fde68a', padding: '8px 20px', fontSize: 10, color: '#92400e' }}>
          ℹ️ Unit price will be auto-fetched from your product database. Final value calculated on confirmation.
        </div>
      )}

      {/* ── Authorisation Footer ── */}
      <div style={{ background: '#f1f5f9', borderTop: '1px solid #e2e8f0', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: '#64748b', maxWidth: 320 }}>
          <strong style={{ color: '#475569' }}>Authorisation required</strong> — Review all details above.
          By approving, you confirm this PO is accurate and authorised for procurement.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => onCancel()}
            disabled={busy}
            style={{
              padding: '8px 16px', background: '#fff', border: '1.5px solid #cbd5e1',
              borderRadius: 7, fontSize: 12, cursor: 'pointer', color: '#64748b', fontWeight: 600,
            }}
          >
            ✕ Reject PO
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            style={{
              padding: '8px 20px', background: busy ? '#9ca3af' : '#1e3a5f',
              border: 'none', borderRadius: 7, fontSize: 12,
              cursor: busy ? 'not-allowed' : 'pointer',
              color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {busy ? (
              <>
                <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                Issuing PO…
              </>
            ) : '✓ Approve & Issue PO'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Single Message ───────────────────────────────────────────────────────────
function AiMessage({ msg, isStreaming, onFollowUp, onConfirmPO, onCancelPO }) {
  const [copied, setCopied] = useState(false);
  const [reaction, setReaction] = useState(null);

  const modeInfo   = MODES.find((m) => m.id === msg.mode) || MODES[0];
  const toolChips  = parseToolChips(msg.tools);
  const rcaFlag    = msg.rca_applied;
  const showFooter = !isStreaming;

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const ts = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '';

  const pendingActions = (msg.actions || []).filter(
    (a) => a.type === 'create_po',
  );

  return (
    <div className="iq-msg ai">
      <div className="iq-msg-wrap">
        <div className="iq-avatar ai"><IconBot /></div>
        <div className="iq-ai-bubble-wrap">
          {/* Chips row */}
          <div className="iq-chips-row">
            <span className={`iq-chip mode-${modeInfo.color}`}>
              {modeInfo.icon} {modeInfo.label.toUpperCase()}
            </span>
            {rcaFlag && <span className="iq-chip rca">🔎 RCA</span>}
            {pendingActions.length > 0 && !isStreaming && (
              <span className="iq-chip" style={{ background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd' }}>
                📋 Create PO
              </span>
            )}
            {toolChips.map((c) => (
              <span key={c.key} className={`iq-chip ${c.cls}`}>
                {c.emoji} {c.label}
              </span>
            ))}
          </div>

          {/* Bubble */}
          <div className="iq-ai-bubble">
            <MarkdownRenderer text={msg.content} />
            {isStreaming && <span className="iq-stream-cursor" />}

            {/* PO Confirmation Cards */}
            {!isStreaming && pendingActions.map((action, idx) => (
              <POConfirmCard
                key={idx}
                action={action}
                onConfirm={(poData) => onConfirmPO(msg.id, idx, poData)}
                onCancel={() => onCancelPO(msg.id, idx)}
              />
            ))}

            {showFooter && (
              <>
                <div className="iq-msg-footer">
                  <div className="iq-msg-meta">
                    <span>InvenIQ AI</span>
                    {msg.model && <><span>·</span><span>{msg.model}</span></>}
                    {ts && <><span>·</span><span>{ts}</span></>}
                    {msg.data_source === 'mysql' && (
                      <><span>·</span><span style={{ color: '#16a34a' }}>● Live DB</span></>
                    )}
                  </div>
                  <div className="iq-msg-actions">
                    <div className="iq-reactions">
                      <button
                        className={`iq-reaction up ${reaction === 'up' ? 'on' : ''}`}
                        onClick={() => setReaction(reaction === 'up' ? null : 'up')}
                        title="Helpful"
                      >👍</button>
                      <button
                        className={`iq-reaction dn ${reaction === 'dn' ? 'on' : ''}`}
                        onClick={() => setReaction(reaction === 'dn' ? null : 'dn')}
                        title="Not helpful"
                      >👎</button>
                    </div>
                    <div className="iq-divider" />
                    <button
                      className={`iq-action-btn ${copied ? 'copied' : ''}`}
                      onClick={handleCopy}
                    >
                      <IconCopy />{copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Follow-up suggestions */}
                {msg.follow_ups?.length > 0 && (
                  <div className="iq-followups">
                    <div className="iq-followup-label">
                      <span>✨</span> Suggested follow-ups
                    </div>
                    {msg.follow_ups.map((q, i) => (
                      <button key={i} className="iq-followup-chip" onClick={() => onFollowUp(q)}>
                        {q} <IconArrow />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AIAssistant({ pendingQuery, onPendingQueryConsumed, dbStatus }) {
  const [mode, setMode]           = useState('ask');
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState(null);
  const [error, setError]         = useState(null);

  const [isListening, setIsListening] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);

  const messagesEndRef  = useRef(null);
  const textareaRef     = useRef(null);
  const abortRef        = useRef(null);
  const sendMessageRef  = useRef(null);  // stable ref so effects can call latest sendMessage
  const recognitionRef  = useRef(null);
  const isSendingRef    = useRef(false); // ref guard prevents StrictMode double-fire & concurrent sends

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Load chat history from localStorage on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('iq_chat_history') || '[]');
      setChatHistory(saved);
    } catch { /* ignore */ }
  }, []);

  // Stop any live recognition on unmount
  useEffect(() => () => recognitionRef.current?.stop(), []);

  // Consume pending query from parent — auto-send to chatbot
  useEffect(() => {
    if (pendingQuery) {
      onPendingQueryConsumed?.();
      // Use ref so we always call the latest sendMessage (avoids stale closure)
      setTimeout(() => sendMessageRef.current?.(pendingQuery), 80);
    }
  }, [pendingQuery, onPendingQueryConsumed]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'TEXTAREA') return;
      if (e.key === '1') setMode('ask');
      if (e.key === '2') setMode('explain');
      if (e.key === '3') setMode('act');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleInputChange = (e) => {
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    setInput(el.value);
  };

  // ── PO Action Handlers ────────────────────────────────────
  const handleConfirmPO = useCallback(async (msgId, actionIdx, poData) => {
    // Set action to loading
    setMessages((prev) => prev.map((m) => {
      if (m.id !== msgId) return m;
      const actions = (m.actions || []).map((a, i) =>
        i === actionIdx ? { ...a, status: 'loading' } : a,
      );
      return { ...m, actions };
    }));

    try {
      const res = await fetch('/api/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: poData.supplier_name,
          sku_name: poData.sku_name,
          quantity: poData.quantity,
          unit_price: poData.unit_price || null,
          expected_date: poData.expected_date || null,
          notes: poData.notes || null,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.detail || result.error || `HTTP ${res.status}`);
      }
      setMessages((prev) => prev.map((m) => {
        if (m.id !== msgId) return m;
        const actions = (m.actions || []).map((a, i) =>
          i === actionIdx ? { ...a, status: 'success', result } : a,
        );
        return { ...m, actions };
      }));
    } catch (err) {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== msgId) return m;
        const actions = (m.actions || []).map((a, i) =>
          i === actionIdx ? { ...a, status: 'error', error: err.message } : a,
        );
        return { ...m, actions };
      }));
    }
  }, []);

  const handleCancelPO = useCallback((msgId, actionIdx) => {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== msgId) return m;
      const actions = (m.actions || []).map((a, i) =>
        i === actionIdx ? { ...a, status: 'cancelled' } : a,
      );
      return { ...m, actions };
    }));
  }, []);

  // ── Voice Input ──────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError('Voice input is not supported in this browser. Please use Chrome or Edge.');
      return;
    }
    const recog = new SR();
    recog.continuous    = false;
    recog.interimResults = true;
    recog.lang          = 'en-IN';
    recog.onstart  = () => setIsListening(true);
    recog.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      setInput(transcript);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
      }
    };
    recog.onend   = () => setIsListening(false);
    recog.onerror = () => setIsListening(false);
    recognitionRef.current = recog;
    recog.start();
  }, [isListening]);

  // ── Export Chat ───────────────────────────────────────────
  const exportChat = useCallback(() => {
    if (messages.length === 0) return;
    const lines = messages
      .filter(m => m.content)
      .map(m => {
        const role = m.role === 'user' ? 'YOU' : 'InvenIQ AI';
        const ts   = m.timestamp ? new Date(m.timestamp).toLocaleString('en-IN') : '';
        return `[${ts}] ${role}:\n${m.content}`;
      });
    const header = `InvenIQ AI Chat Export\nDate: ${new Date().toLocaleString('en-IN')}\nMode: ${mode.toUpperCase()}\n${'─'.repeat(50)}`;
    const blob   = new Blob(
      [`${header}\n\n${lines.join('\n\n─────────────────────\n\n')}`],
      { type: 'text/plain;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `inveniq-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, mode]);

  // ── History helpers ───────────────────────────────────────
  const loadHistoryEntry = useCallback((entry) => {
    setMessages(entry.messages);
    setMode(entry.mode || 'ask');
    setShowHistory(false);
  }, []);

  const deleteHistoryEntry = useCallback((id, e) => {
    e.stopPropagation();
    setChatHistory(prev => {
      const updated = prev.filter(h => h.id !== id);
      try { localStorage.setItem('iq_chat_history', JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, []);

  // ── Send message ──────────────────────────────────────────
  const sendMessage = useCallback(async (query) => {
    const text = (query || input).trim();
    if (!text || isSendingRef.current) return;
    isSendingRef.current = true;

    setError(null);
    const userMsgId = `u-${Date.now()}`;
    const aiMsgId   = `a-${Date.now() + 1}`;

    // Build conversation history for the API (last 16 messages, completed only)
    const history = messages
      .filter((m) => m.content && m.content.length > 0)
      .slice(-16)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    const userMsg = {
      id: userMsgId, role: 'user', mode,
      content: text, timestamp: new Date().toISOString(),
    };
    const aiMsg = {
      id: aiMsgId, role: 'ai', mode,
      content: '', tools: [], rca_applied: false,
      follow_ups: [], model: null, data_source: null,
      actions: [],
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setStreaming(true);
    setStreamingId(aiMsgId);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, mode, history }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.detail || `HTTP ${resp.status}`);
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;

          try {
            const evt = JSON.parse(raw);
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== aiMsgId) return m;

                if (evt.type === 'token') {
                  return { ...m, content: m.content + (evt.content || '') };
                }
                if (evt.type === 'meta') {
                  return {
                    ...m,
                    tools:       evt.tools_used   ?? m.tools,
                    rca_applied: evt.rca_performed ?? m.rca_applied,
                    model:       evt.model         ?? m.model,
                    data_source: evt.data_source   ?? m.data_source,
                  };
                }
                if (evt.type === 'done') {
                  return { ...m, follow_ups: evt.follow_ups ?? m.follow_ups };
                }
                if (evt.type === 'action' && evt.action_type === 'create_po') {
                  // Add PO creation action card with 'pending' status
                  const newAction = {
                    type: 'create_po',
                    po_data: evt.po_data || {},
                    status: 'pending',
                    result: null,
                    error: null,
                  };
                  return { ...m, actions: [...(m.actions || []), newAction] };
                }
                if (evt.type === 'error') {
                  return { ...m, content: m.content || `Error: ${evt.message}` };
                }
                return m;
              })
            );
          } catch {
            // skip malformed event
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Unexpected error. Please try again.');
        setMessages((prev) => prev.filter((m) => m.id !== aiMsgId || m.content.length > 0));
      }
    } finally {
      setStreaming(false);
      setStreamingId(null);
      isSendingRef.current = false;
    }
  }, [input, mode, messages]);

  // Keep ref current so pendingQuery effect always calls the latest sendMessage
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFollowUp = useCallback((q) => {
    setTimeout(() => sendMessageRef.current?.(q), 50);
  }, []);

  const handleNewChat = () => {
    abortRef.current?.abort();
    // Persist non-trivial conversations to history
    if (messages.length >= 2) {
      const firstUser = messages.find(m => m.role === 'user');
      const entry = {
        id:      Date.now(),
        ts:      new Date().toISOString(),
        preview: (firstUser?.content || 'Conversation').slice(0, 72),
        mode,
        messages,
      };
      setChatHistory(prev => {
        const updated = [entry, ...prev].slice(0, 10);
        try { localStorage.setItem('iq_chat_history', JSON.stringify(updated)); } catch { /* ignore */ }
        return updated;
      });
    }
    setMessages([]);
    setInput('');
    setStreaming(false);
    setStreamingId(null);
    setError(null);
  };

  const canSend = input.trim().length > 0 && !streaming;
  const activeModeInfo = MODES.find((m) => m.id === mode);

  return (
    <div className="iq-chat-view">
      {/* Header */}
      <div className="iq-header">
        <div className="iq-header-left">
          <div className="iq-header-logo"><IconSpark /></div>
          <div>
            <div className="iq-header-title">InvenIQ AI Assistant</div>
            <div className="iq-header-sub">GPT-4o · MCP Tools · RCA Engine · Function Calling</div>
          </div>
        </div>
        <div className="iq-header-right">
          <div className="iq-badge">
            <span className={`iq-badge-dot ${dbStatus?.status === 'live' ? 'live' : 'model'}`} />
            {dbStatus?.status === 'live' ? 'MySQL Live' : 'Demo Mode'}
          </div>
          <div className="iq-badge">
            <span className="iq-badge-dot model" />
            GPT-4o
          </div>
          {messages.length > 0 && (
            <button className="iq-icon-btn" onClick={exportChat} title="Export conversation as .txt">
              ↓ Export
            </button>
          )}
          <button
            className={`iq-icon-btn${chatHistory.length > 0 ? ' iq-icon-btn--active' : ''}`}
            onClick={() => setShowHistory(true)}
            title={`Conversation history (${chatHistory.length} saved)`}
          >
            🕐 History
            {chatHistory.length > 0 && (
              <span className="iq-hist-badge">{chatHistory.length}</span>
            )}
          </button>
          <button className="iq-new-chat-btn" onClick={handleNewChat}>
            <IconPlus /> New chat
          </button>
        </div>
      </div>

      {/* Mode Bar */}
      <div className="iq-mode-bar">
        <div className="iq-mode-pills">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`iq-mode-pill ${m.color} ${mode === m.id ? 'active' : ''}`}
              onClick={() => setMode(m.id)}
              title={`${m.desc} (press ${m.kbd})`}
            >
              {m.icon} {m.label}
              <span className="iq-pill-kbd">{m.kbd}</span>
            </button>
          ))}
        </div>
        <div className="iq-mode-desc">{MODE_DESC[mode]}</div>
      </div>

      {/* Chat Container */}
      <div className="iq-chat-container">
        <div className="iq-messages">
          {messages.length === 0 ? (
            <div className="iq-empty">
              <div className="iq-empty-hero">
                <div className="iq-empty-icon"><IconSpark /></div>
                <div className="iq-empty-title">Ask anything about your inventory</div>
                <div className="iq-empty-sub">
                  InvenIQ AI analyses your real-time stock, orders, finance & customer data to give
                  precise, actionable answers. Ask about growth strategies, pricing optimisation,
                  collections, or root causes — use <strong>Act</strong> mode to create purchase orders directly from chat.
                </div>
                <div className="iq-empty-pills">
                  {[
                    { label: '📦 Stock Intelligence', color: '#3b82f6' },
                    { label: '📋 PO & GRN', color: '#7c3aed' },
                    { label: '💰 Finance Insights', color: '#16a34a' },
                    { label: '⚡ Act + RCA Templates', color: '#d97706' },
                  ].map((p) => (
                    <span key={p.label} className="iq-empty-pill">
                      <span className="iq-empty-pill-dot" style={{ background: p.color }} />
                      {p.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="iq-suggestion-grid">
                {SUGGESTIONS.map((cat) => (
                  <div key={cat.category} className="iq-suggestion-card">
                    <div className="iq-suggestion-card-header" style={{ color: cat.color }}>
                      {cat.category}
                    </div>
                    {cat.items.map((q) => (
                      <button
                        key={q}
                        className="iq-suggestion-item"
                        onClick={() => sendMessage(q)}
                      >
                        <span>{q}</span>
                        <IconArrow />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="iq-msg user">
                  <div className="iq-msg-wrap user-wrap">
                    <div className="iq-avatar user"><IconUser /></div>
                    <div className="iq-user-bubble">
                      <div className="iq-user-meta">
                        <span className="iq-user-mode-tag">
                          {MODES.find((m) => m.id === msg.mode)?.icon}{' '}
                          {msg.mode?.toUpperCase()}
                        </span>
                      </div>
                      <div className="iq-user-text">{msg.content}</div>
                    </div>
                  </div>
                </div>
              ) : (msg.id === streamingId && msg.content === '') ? null : (
                <AiMessage
                  key={msg.id}
                  msg={msg}
                  isStreaming={msg.id === streamingId}
                  onFollowUp={handleFollowUp}
                  onConfirmPO={handleConfirmPO}
                  onCancelPO={handleCancelPO}
                />
              )
            )
          )}

          {/* Typing Indicator — mode-aware with tool feedback */}
          {streaming && messages[messages.length - 1]?.role === 'ai' &&
           messages[messages.length - 1]?.content === '' && (() => {
            const lastMsg = messages[messages.length - 1];
            const hasTools = lastMsg?.tools?.length > 0;
            const typingLabel = lastMsg?.mode === 'explain'
              ? (hasTools ? '🔍 Running root cause analysis…' : '🔍 Analysing root causes…')
              : lastMsg?.mode === 'act'
              ? (hasTools ? '⚡ Building action plan + RCA…' : '⚡ Preparing action plan…')
              : (hasTools ? `📦 Querying ${lastMsg.tools[0]?.replace('query_', '')} data…` : '🔎 Checking your inventory data…');
            return (
              <div className="iq-typing">
                <div className="iq-avatar ai"><IconBot /></div>
                <div className="iq-typing-bubble">
                  <div className="iq-typing-dots">
                    <span /><span /><span />
                  </div>
                  <div className="iq-typing-label">{typingLabel}</div>
                </div>
              </div>
            );
          })()}

          <div ref={messagesEndRef} />
        </div>

        {/* Error Banner */}
        {error && (
          <div className="iq-error">
            <div className="iq-error-inner">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
            <button className="iq-error-close" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Input Area */}
        <div className="iq-input-area">
          <div className="iq-input-row">
            <textarea
              ref={textareaRef}
              className="iq-textarea"
              rows={1}
              placeholder={
                mode === 'act'
                  ? '⚡ Act mode — ask for action plans, RCA templates, or create a new PO…'
                  : `${activeModeInfo?.icon} ${activeModeInfo?.label} mode — ask anything about your business…`
              }
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={streaming}
            />
            <button
              className={`iq-mic-btn${isListening ? ' iq-mic-btn--on' : ''}`}
              onClick={toggleVoice}
              type="button"
              title={isListening ? 'Stop recording (click to stop)' : 'Voice input (click to speak)'}
              disabled={streaming}
            >
              {isListening ? '⏹' : '🎤'}
            </button>
            <button
              className={`iq-send-btn ${mode}`}
              disabled={!canSend}
              onClick={() => sendMessage()}
              title="Send (Enter)"
            >
              <IconSend />
            </button>
          </div>
          <div className="iq-input-hint">
            <div className="iq-hint-keys">
              <span><kbd>Enter</kbd> Send</span>
              <span><kbd>Shift+Enter</kbd> New line</span>
              <span><kbd>1/2/3</kbd> Switch mode</span>
              <span><kbd>🎤</kbd> Voice</span>
            </div>
            <span>Powered by GPT-4o · Knowledge Base · Proactive Insights · RCA Engine · Business Growth AI</span>
          </div>
        </div>
      </div>

      {/* ── Conversation History Panel ── */}
      {showHistory && (
        <div className="iq-hist-overlay" onClick={() => setShowHistory(false)}>
          <div className="iq-hist-panel" onClick={e => e.stopPropagation()}>
            <div className="iq-hist-hdr">
              <span>🕐 Conversation History</span>
              <button className="iq-hist-close" onClick={() => setShowHistory(false)}>✕</button>
            </div>
            {chatHistory.length === 0 ? (
              <div className="iq-hist-empty">
                No saved conversations yet.<br />
                Start chatting, then click <strong>New chat</strong> — it auto-saves here.
              </div>
            ) : (
              <div className="iq-hist-list">
                {chatHistory.map(entry => (
                  <div
                    key={entry.id}
                    className="iq-hist-entry"
                    onClick={() => loadHistoryEntry(entry)}
                  >
                    <div className="iq-hist-entry-top">
                      <span className="iq-hist-mode">
                        {MODES.find(m => m.id === entry.mode)?.icon || '💬'}{' '}
                        {(entry.mode || 'ask').toUpperCase()}
                      </span>
                      <span className="iq-hist-date">
                        {new Date(entry.ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                      <button
                        className="iq-hist-del"
                        onClick={(e) => deleteHistoryEntry(entry.id, e)}
                        title="Delete"
                      >✕</button>
                    </div>
                    <div className="iq-hist-preview">{entry.preview}</div>
                    <div className="iq-hist-meta">{entry.messages.length} messages</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
