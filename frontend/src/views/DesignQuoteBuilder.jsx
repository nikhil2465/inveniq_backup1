import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { ExportButton } from '../utils/exportUtils';

// ── Status configs ──────────────────────────────────────────────────────────
const Q_STATUS = {
  DRAFT:       { label: 'Draft',           color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  PENDING_L1:  { label: '⏳ Pending L1',   color: '#d97706', bg: 'rgba(217,119,6,0.14)' },
  PENDING_L2:  { label: '⏳ Pending L2',   color: '#ea580c', bg: 'rgba(234,88,12,0.14)' },
  PENDING_L3:  { label: '⏳ Pending L3',   color: '#dc2626', bg: 'rgba(220,38,38,0.14)' },
  APPROVED:    { label: '✅ Approved',      color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  SENT:        { label: 'Sent to Client',  color: '#0891b2', bg: 'rgba(8,145,178,0.12)' },
  REVISION:    { label: 'Revision',        color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  IN_PROGRESS: { label: 'In Progress',     color: '#0f766e', bg: 'rgba(15,118,110,0.12)' },
  COMPLETED:   { label: 'Completed',       color: '#059669', bg: 'rgba(5,150,105,0.12)' },
  CANCELLED:   { label: 'Cancelled',       color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
};

// ── Approval workflow helpers ─────────────────────────────────────────────────
const APPROVAL_LEVEL_LABEL = { PENDING_L1: 'L1 — Sales Manager', PENDING_L2: 'L2 — CFO', PENDING_L3: 'L3 — Admin' };
const ACTION_LABEL = {
  SUBMIT: '📤 Submit for Approval', APPROVE: '✅ Approve', ESCALATE_L2: '⬆️ Escalate to L2',
  ESCALATE_L3: '⬆️ Escalate to L3', APPROVE_RETURN_L1: '✅ Approve → Return to L1', REJECT: '↩️ Return to Draft',
};
const ACTION_COLOR = {
  SUBMIT: '#d97706', APPROVE: '#16a34a', ESCALATE_L2: '#ea580c',
  ESCALATE_L3: '#dc2626', APPROVE_RETURN_L1: '#0f766e', REJECT: '#6b7280',
};
const ACTION_HISTORY_LABEL = {
  SUBMIT: '📤 Submitted', APPROVE: '✅ Approved', ESCALATE_L2: '⬆️ Escalated to L2',
  ESCALATE_L3: '⬆️ Escalated to L3', APPROVE_RETURN_L1: '🔄 L3 Approved → Returned to L1', REJECT: '↩️ Returned to Draft',
};

// What actions are available per (status, role)
function getAllowedActions(status, role) {
  if (status === 'DRAFT' && ['architect','sales_manager','cfo','admin'].includes(role))
    return ['SUBMIT'];
  if (status === 'PENDING_L1' && ['sales_manager','admin'].includes(role))
    return ['APPROVE','ESCALATE_L2','REJECT'];
  if (status === 'PENDING_L2' && ['cfo','admin'].includes(role))
    return ['APPROVE','ESCALATE_L3','REJECT'];
  if (status === 'PENDING_L3' && role === 'admin')
    return ['APPROVE_RETURN_L1','REJECT'];
  return [];
}

// Form status dropdown should only show non-workflow statuses
const Q_STATUS_FORM_OPTIONS = ['DRAFT','SENT','REVISION','IN_PROGRESS','COMPLETED','CANCELLED'];
const P_STATUS = {
  DRAFT:     { label: 'Draft',     color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  SENT:      { label: 'Sent',      color: '#0891b2', bg: 'rgba(8,145,178,0.12)' },
  APPROVED:  { label: 'Approved',  color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  REVISION:  { label: 'Revision',  color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  COMPLETED: { label: 'Completed', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
  CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
};
const ITEM_TYPE_COLOR = {
  cp_fittings: '#0891b2', sanitary_ware: '#0891b2', bathroom_accessories: '#14b8a6',
  hardware_hinges: '#d97706', hardware_channels: '#f59e0b', hardware_handles: '#f97316',
  hardware_locks: '#ef4444', plumbing: '#3b82f6', tiles: '#0d9488',
  waterproofing: '#06b6d4', installation: '#16a34a', cabinet: '#14b8a6',
  wardrobe: '#6366f1', flooring: '#10b981', false_ceiling: '#64748b',
  countertop: '#f59e0b', other: '#9ca3af',
};

// ── Shared inline styles ─────────────────────────────────────────────────────
const MODAL_BG  = { position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16 };
const MODAL_BOX = { background:'var(--card)',borderRadius:14,boxShadow:'0 24px 64px rgba(0,0,0,0.35)',border:'1px solid var(--border)',width:'100%' };
const SEC_BTN   = { background:'transparent',border:'1px solid var(--border)',color:'var(--text)',borderRadius:7,padding:'5px 12px',fontSize:12,cursor:'pointer',fontWeight:600 };
const CLOSE_BTN = { background:'rgba(220,38,38,0.1)',border:'1px solid rgba(220,38,38,0.3)',color:'#dc2626',borderRadius:7,padding:'5px 10px',fontSize:13,cursor:'pointer',fontWeight:700 };
const PRI_BTN   = { background:'linear-gradient(135deg,#0f766e,#0d9488)',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontSize:13,cursor:'pointer',fontWeight:700 };
const INP       = { width:'100%',background:'var(--input)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',fontSize:13,color:'var(--text)',boxSizing:'border-box' };
// SEL — for <select> elements: forces light-mode OS dropdown popup, always readable
const SEL       = { ...INP, colorScheme:'light', background:'#ffffff', color:'#0d1b2e', border:'1.5px solid #ccfbf1' };
const LBL       = { fontSize:11,color:'var(--muted)',fontWeight:600,marginBottom:4,display:'block' };
// Section card + header — used in both QuoteFormModal and ProposalFormModal for visual grouping
const FIELD_CARD = { background:'#ffffff',borderRadius:10,border:'1px solid #e8e3ff',padding:'14px 16px',marginBottom:14,boxShadow:'0 1px 4px rgba(109,40,217,0.06)' };
const SEC_HDR_PRP = { fontSize:10,fontWeight:800,color:'#4338ca',textTransform:'uppercase',letterSpacing:1.1,marginBottom:12,display:'flex',alignItems:'center',gap:7,paddingLeft:9,borderLeft:'3px solid #6366f1' };
const SEC_HDR_QTE = { fontSize:10,fontWeight:800,color:'#134e4a',textTransform:'uppercase',letterSpacing:1.1,marginBottom:12,display:'flex',alignItems:'center',gap:7,paddingLeft:9,borderLeft:'3px solid #14b8a6' };

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const fmtC = (n) => '₹' + fmt(n);

// GST rate options for line-item selector
const GST_RATES = [0, 5, 12, 18, 28];

// HSN → default GST rate (Indian GST schedule)
const _HSN_GST = { '8481': 18, '6910': 18, '3922': 18, '8302': 18, '8301': 18, '7324': 18, '3917': 12, '6907': 5, '6908': 12, '3214': 18, '9954': 18, '7308': 18 };
function inferGstFromHsn(hsn) {
  if (!hsn) return 18;
  const code = String(hsn).replace(/\D/g, '').slice(0, 4);
  return _HSN_GST[code] ?? 18;
}

// File-type icon for document uploads
const FILE_ICON = (name) => {
  const ext = (name || '').toLowerCase().split('.').pop();
  if (ext === 'pdf') return '📄';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return '📊';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return '🖼';
  return '📎';
};

function StatusBadge({ status, cfg }) {
  const c = cfg[status] || { label: status, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
      background: c.bg, color: c.color, border: `1px solid ${c.color}40` }}>
      {c.label}
    </span>
  );
}

function ItemTypeBadge({ type }) {
  const color = ITEM_TYPE_COLOR[type] || '#9ca3af';
  const label = (type || '').replace(/_/g, ' ');
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
      background: color + '18', color, border: `1px solid ${color}40`, textTransform: 'capitalize' }}>
      {label}
    </span>
  );
}

// ── EmailModal ────────────────────────────────────────────────────────────────
function EmailModal({ quoteId, isProposal, defaultEmail, defaultName, quoteNumber, onClose }) {
  const [to, setTo]     = useState(defaultEmail || '');
  const [name, setName] = useState(defaultName || '');
  const [subj, setSubj] = useState(isProposal ? `Architect Fee Proposal — ${quoteNumber}` : `Interior Design Quotation — ${quoteNumber}`);
  const [msg, setMsg]   = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const send = async () => {
    if (!to.trim()) return;
    setBusy(true);
    try {
      const url = isProposal
        ? `/api/design-quotes/architect/proposals/${quoteId}/send-email`
        : `/api/design-quotes/${quoteId}/send-email`;
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_email: to, recipient_name: name, subject: subj, message: msg }) });
      const d = await r.json();
      setDone(d.simulated ? 'Simulated (SMTP not configured)' : `Sent to ${to}`);
    } catch { setDone('Send failed'); }
    finally { setBusy(false); }
  };

  return (
    <div style={MODAL_BG} onClick={onClose}>
      <div className="dqs-modal-scope" style={{ ...MODAL_BOX, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>📧 Send Email</span>
          <button onClick={onClose} style={CLOSE_BTN}>✕</button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#16a34a', fontWeight: 700 }}>{done}</div>
          ) : (
            <>
              <div><label style={LBL}>Recipient Email *</label><input style={INP} value={to} onChange={e => setTo(e.target.value)} placeholder="client@example.com" /></div>
              <div><label style={LBL}>Recipient Name</label><input style={INP} value={name} onChange={e => setName(e.target.value)} /></div>
              <div><label style={LBL}>Subject</label><input style={INP} value={subj} onChange={e => setSubj(e.target.value)} /></div>
              <div><label style={LBL}>Custom Message</label><textarea style={{ ...INP, height: 80, resize: 'vertical' }} value={msg} onChange={e => setMsg(e.target.value)} placeholder="Optional personal note…" /></div>
              <button onClick={send} disabled={busy || !to.trim()} style={{ ...PRI_BTN, opacity: (busy || !to.trim()) ? 0.6 : 1 }}>
                {busy ? 'Sending…' : '📤 Send'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── QuoteFormModal ────────────────────────────────────────────────────────────
function QuoteFormModal({ quote, onClose, onSaved }) {
  const isEdit = !!(quote && quote.id);
  const [form, setForm] = useState({
    client_name: '', client_phone: '', client_email: '', project_name: '',
    project_address: '', project_type: 'Residential', designer_name: '',
    designer_company: '', payment_terms: '50% Advance · 25% Mid · 25% Completion',
    validity_days: 30, gst_rate: 18, include_gst: true,
    notes: '', terms: '1. Design includes supply & installation.\n2. Structural changes billed separately.\n3. 1-year workmanship warranty.',
    status: 'DRAFT', margin_mode: 'per_line', overall_margin_pct: 0,
    sections: [],
    ...( quote ? { ...quote } : {} ),
  });
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const [newSecName, setNewSecName] = useState('');
  const [showBriefParser, setShowBriefParser] = useState(false);
  const [briefText, setBriefText] = useState('');
  const [parsingBrief, setParsingBrief] = useState(false);
  const [showImgSearchForm, setShowImgSearchForm] = useState(false);
  const [imgSearchSec, setImgSearchSec] = useState(0);
  const [qbSync, setQbSync] = useState(null); // {count, ageMin, expired}

  // QB→DQB import on mount — auto-import fresh data, show banner for expired
  useEffect(() => {
    try {
      const raw = localStorage.getItem('inveniq_qb_to_dqb');
      if (!raw) return;
      const stored = JSON.parse(raw);
      const { items, ts } = stored;
      const ageMin = Math.round((Date.now() - ts) / 60000);
      const expired = ageMin > 30;
      if (expired) {
        // Show banner so user knows data is available (stale)
        setQbSync({ count: (items || []).length, ageMin, expired: true, stored });
        return;
      }
      if (items && items.length > 0 && !isEdit) {
        const importedSection = {
          section_name: 'Imported from QB', section_order: 0, section_total: 0,
          items: items.map(i => ({ item_name: i.product_name || i.item_name || '', description: i.description || '', unit: i.unit || 'nos', qty: i.qty || 1, unit_price: i.unit_price || 0, margin_pct: 0, line_total: (i.qty || 1) * (i.unit_price || 0), inferred_hsn: i.inferred_hsn || '', inferred_category: i.inferred_category || '', gst_pct: i.gst_pct ?? inferGstFromHsn(i.inferred_hsn) })),
        };
        setForm(f => ({ ...f, sections: [importedSection, ...f.sections] }));
        localStorage.removeItem('inveniq_qb_to_dqb');
      }
    } catch {}
  }, [isEdit]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addSection = () => {
    if (!newSecName.trim()) return;
    const emptyItem = { item_name: '', description: '', unit: 'nos', qty: 1, unit_price: 0, margin_pct: 0, line_total: 0, inferred_hsn: '', inferred_category: '', gst_pct: form.gst_rate ?? 18 };
    setForm(f => ({ ...f, sections: [...f.sections, { section_name: newSecName.trim(), section_order: f.sections.length, section_total: 0, items: [emptyItem] }] }));
    setNewSecName('');
    setActiveSection(form.sections.length);
  };

  const removeSection = (idx) => {
    const sec = form.sections[idx];
    const count = (sec?.items || []).length;
    if (count > 0 && !window.confirm(
      `Remove section "${sec.section_name}" with ${count} item${count !== 1 ? 's' : ''}? This cannot be undone.`
    )) return;
    setForm(f => ({ ...f, sections: f.sections.filter((_, i) => i !== idx) }));
    setActiveSection(s => Math.max(0, s - 1));
  };

  const updateItem = (secIdx, itemIdx, key, val) => {
    setForm(f => {
      const sections = f.sections.map((sec, si) => {
        if (si !== secIdx) return sec;
        const items = sec.items.map((it, ii) => {
          if (ii !== itemIdx) return it;
          const updated = { ...it, [key]: val };
          const qty = parseFloat(updated.qty) || 0;
          const up  = parseFloat(updated.unit_price) || 0;
          const mp  = parseFloat(updated.margin_pct) || 0;
          updated.line_total = qty * up * (1 + mp / 100);
          return updated;
        });
        return { ...sec, items, section_total: items.reduce((s, x) => s + (x.line_total || 0), 0) };
      });
      return { ...f, sections };
    });
  };

  const addItem = (secIdx) => {
    setForm(f => {
      const sections = f.sections.map((sec, si) => {
        if (si !== secIdx) return sec;
        return { ...sec, items: [...sec.items, { item_name: '', description: '', unit: 'nos', qty: 1, unit_price: 0, margin_pct: 0, line_total: 0, inferred_hsn: '', inferred_category: '', gst_pct: f.gst_rate ?? 18 }] };
      });
      return { ...f, sections };
    });
  };

  const removeItem = (secIdx, itemIdx) => {
    setForm(f => {
      const sections = f.sections.map((sec, si) => {
        if (si !== secIdx) return sec;
        const items = sec.items.filter((_, ii) => ii !== itemIdx);
        return { ...sec, items, section_total: items.reduce((s, x) => s + (x.line_total || 0), 0) };
      });
      return { ...f, sections };
    });
  };

  // Totals — per-item GST rates
  const subtotal = form.sections.reduce((s, sec) => s + (sec.section_total || 0), 0);
  const gstAmt   = form.include_gst
    ? form.sections.reduce((s, sec) =>
        s + sec.items.reduce((is, it) =>
          is + (it.line_total || 0) * ((it.gst_pct ?? form.gst_rate ?? 18) / 100), 0), 0)
    : 0;
  const grandTotal = subtotal + gstAmt;
  // GST breakdown by rate (for summary panel)
  const gstBreakdown = (() => {
    if (!form.include_gst) return {};
    const bd = {};
    form.sections.forEach(sec => sec.items.forEach(it => {
      const rate = it.gst_pct ?? form.gst_rate ?? 18;
      const amt  = (it.line_total || 0) * (rate / 100);
      if (amt > 0) bd[rate] = (bd[rate] || 0) + amt;
    }));
    return bd;
  })();

  const parseBrief = async () => {
    if (!briefText.trim()) return;
    setParsingBrief(true);
    try {
      const r = await fetch('/api/design-quotes/parse-interior-brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief_text: briefText }),
      });
      const d = await r.json();
      const parsed = d.parsed || {};
      const rawItems = parsed.items || [];
      const grouped = {};
      rawItems.forEach(it => {
        const sec = it.section_name || 'General';
        if (!grouped[sec]) grouped[sec] = [];
        grouped[sec].push({ item_name: it.item_name || '', description: (it.description_lines || []).join('\n'), unit: it.unit || 'nos', qty: it.quantity || 1, unit_price: it.unit_price || 0, margin_pct: 0, line_total: (it.quantity || 1) * (it.unit_price || 0), inferred_hsn: '', inferred_category: it.item_type || '', gst_pct: form.gst_rate ?? 18 });
      });
      const newSections = Object.entries(grouped).map(([name, items], i) => ({ section_name: name, section_order: form.sections.length + i, section_total: items.reduce((s, x) => s + x.line_total, 0), items }));
      setForm(f => ({ ...f, sections: [...f.sections, ...newSections] }));
      setShowBriefParser(false); setBriefText('');
    } catch {}
    finally { setParsingBrief(false); }
  };

  const save = async () => {
    if (!form.client_name.trim()) return alert('Client name is required');
    setSaving(true);
    try {
      const payload = { ...form, subtotal, gst_amount: gstAmt, grand_total: grandTotal };
      const url    = isEdit ? `/api/design-quotes/${quote.id}` : '/api/design-quotes';
      const method = isEdit ? 'PUT' : 'POST';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      onSaved();
    } catch { alert('Save failed'); }
    finally { setSaving(false); }
  };

  const sec = form.sections[activeSection];

  return (
    <div style={MODAL_BG} onClick={onClose}>
      <div className="dqs-modal-scope" style={{ ...MODAL_BOX, maxWidth: 900, maxHeight: '94vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: isEdit ? 'linear-gradient(135deg,#1e3a5f 0%,#4c1d95 100%)' : 'linear-gradient(135deg,#0f2744 0%,#15803d 100%)', borderRadius: '14px 14px 0 0' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#ffffff' }}>{isEdit ? '✏️ Edit Interior Quote' : '+ New Interior Quote'}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{isEdit ? 'Update BOQ sections, pricing, and client details' : 'Build room-by-room BOQ with AI assistance · SAC 998331 · GST 18%'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setShowBriefParser(true); }} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.22)', color:'#ffffff', borderRadius:7, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:600 }}>🤖 Parse Brief</button>
            <button onClick={save} disabled={saving} style={{ ...PRI_BTN, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : '💾 Save'}</button>
            <button onClick={onClose} style={{ background:'rgba(220,38,38,0.2)', border:'1px solid rgba(220,38,38,0.4)', color:'#fca5a5', borderRadius:7, padding:'5px 10px', fontSize:13, cursor:'pointer', fontWeight:700 }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18, background: '#f0fdfc' }}>

          {/* QB→DQB sync banner — shown when QB data exists but expired */}
          {qbSync?.expired && (
            <div style={{ background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.25)', borderRadius: 8, padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ fontSize: 16 }}>🔗</span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: '#0f766e' }}>{qbSync.count} item{qbSync.count !== 1 ? 's' : ''} from Quote Builder</strong>
                <span style={{ color: 'var(--muted)', marginLeft: 6 }}>({qbSync.ageMin} min ago — import window expired)</span>
              </div>
              <button onClick={() => {
                const { items } = qbSync.stored;
                const sec = { section_name: 'Imported from QB', section_order: 0, section_total: 0,
                  items: items.map(i => ({ item_name: i.product_name || i.item_name || '', description: i.description || '', unit: i.unit || 'nos', qty: i.qty || 1, unit_price: i.unit_price || 0, margin_pct: 0, line_total: (i.qty||1)*(i.unit_price||0), inferred_hsn: i.inferred_hsn || '', inferred_category: i.inferred_category || '', gst_pct: i.gst_pct ?? 18 })) };
                setForm(f => ({ ...f, sections: [sec, ...f.sections] }));
                localStorage.removeItem('inveniq_qb_to_dqb');
                setQbSync(null);
              }} style={{ padding: '4px 14px', background: 'rgba(15,118,110,0.1)', color: '#0f766e', border: '1px solid rgba(15,118,110,0.3)', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>
                Import Anyway
              </button>
              <button onClick={() => { localStorage.removeItem('inveniq_qb_to_dqb'); setQbSync(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✕</button>
            </div>
          )}

          {/* Brief parser overlay */}
          {showBriefParser && (
            <div style={{ background: '#ffffff', border: '1px solid rgba(13,148,136,0.28)', borderRadius: 10, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(13,27,46,0.05)' }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#134e4a', marginBottom: 8 }}>🤖 AI Interior Brief Parser</div>
              <textarea style={{ ...INP, height: 100, resize: 'vertical' }} placeholder="Paste client brief, WhatsApp messages, or scope of work…" value={briefText} onChange={e => setBriefText(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={parseBrief} disabled={parsingBrief} style={{ ...PRI_BTN, opacity: parsingBrief ? 0.6 : 1 }}>{parsingBrief ? 'Parsing…' : '⚡ Parse & Add Sections'}</button>
                <button onClick={() => setShowBriefParser(false)} style={SEC_BTN}>Cancel</button>
              </div>
            </div>
          )}

          {/* Client & project info */}
          <div style={FIELD_CARD}>
            <div style={SEC_HDR_QTE}>👤 Client &amp; Project Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div><label style={LBL}>Client Name *</label><input style={INP} value={form.client_name} onChange={e => setF('client_name', e.target.value)} /></div>
              <div><label style={LBL}>Phone</label><input style={INP} value={form.client_phone} onChange={e => setF('client_phone', e.target.value)} /></div>
              <div><label style={LBL}>Email</label><input style={INP} value={form.client_email} onChange={e => setF('client_email', e.target.value)} /></div>
              <div><label style={LBL}>Project Name</label><input style={INP} value={form.project_name} onChange={e => setF('project_name', e.target.value)} /></div>
              <div><label style={LBL}>Project Type</label>
                <select style={SEL} value={form.project_type} onChange={e => setF('project_type', e.target.value)}>
                  {['Residential','Commercial','Hospitality','Office','Industrial','Other'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label style={LBL}>Status</label>
                <select style={SEL} value={form.status} onChange={e => setF('status', e.target.value)}>
                  {Q_STATUS_FORM_OPTIONS.map(k => <option key={k} value={k}>{Q_STATUS[k]?.label || k}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}><label style={LBL}>Project Address</label><input style={INP} value={form.project_address} onChange={e => setF('project_address', e.target.value)} /></div>
              <div><label style={LBL}>Designer Name</label><input style={INP} value={form.designer_name} onChange={e => setF('designer_name', e.target.value)} /></div>
              <div><label style={LBL}>Company</label><input style={INP} value={form.designer_company} onChange={e => setF('designer_company', e.target.value)} /></div>
              <div><label style={LBL}>Payment Terms</label><input style={INP} value={form.payment_terms} onChange={e => setF('payment_terms', e.target.value)} /></div>
              <div><label style={LBL}>Validity (days)</label><input style={INP} type="number" value={form.validity_days} onChange={e => setF('validity_days', +e.target.value)} /></div>
              <div><label style={LBL}>GST Rate %</label><input style={INP} type="number" value={form.gst_rate} onChange={e => setF('gst_rate', +e.target.value)} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input type="checkbox" checked={form.include_gst} onChange={e => setF('include_gst', e.target.checked)} id="incgst" />
                <label htmlFor="incgst" style={{ fontSize: 13, fontWeight: 600, color: '#0d1b2e' }}>Include GST in total</label>
              </div>
            </div>
          </div>

          {/* BOQ Sections */}
          <div style={FIELD_CARD}>
            <div style={SEC_HDR_QTE}>📋 BOQ Sections</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {form.sections.map((s, i) => (
                <button key={i} onClick={() => setActiveSection(i)} style={{ ...SEC_BTN, background: activeSection === i ? 'rgba(20,184,166,0.12)' : '#f0fdfc', color: activeSection === i ? '#14b8a6' : '#3d4f6b', borderColor: activeSection === i ? '#14b8a6' : '#ccfbf1', fontWeight: activeSection === i ? 700 : 500, boxShadow: activeSection === i ? '0 0 0 2px rgba(20,184,166,0.15)' : 'none', transition: 'all 0.12s' }}>
                  {s.section_name}
                </button>
              ))}
              <div style={{ display: 'flex', gap: 6, marginLeft: 4 }}>
                <input style={{ ...INP, width: 150, background: '#f0fdfc', border: '1.5px solid #ccfbf1', color: '#0d1b2e' }} placeholder="New section name…" value={newSecName} onChange={e => setNewSecName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSection()} />
                <button onClick={addSection} style={{ ...PRI_BTN, padding: '7px 14px', fontSize: 12 }}>+ Add</button>
              </div>
            </div>
          </div>

          {/* Active section items */}
          {sec && (
            <div style={{ background: '#ffffff', borderRadius: 10, border: '1px solid #e4e6eb', padding: 14, marginBottom: 14, boxShadow: '0 1px 3px rgba(13,27,46,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: '#0d1b2e', display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 9, borderLeft: '3px solid #14b8a6' }}>{sec.section_name}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setImgSearchSec(activeSection); setShowImgSearchForm(true); }} style={{ ...SEC_BTN, color: '#14b8a6', borderColor: 'rgba(20,184,166,0.4)' }}>📷 Search by Photo</button>
                  <button onClick={() => addItem(activeSection)} style={{ ...SEC_BTN, color: '#16a34a' }}>+ Add Item</button>
                  <button onClick={() => removeSection(activeSection)} style={{ ...SEC_BTN, color: '#dc2626' }}>Remove Section</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 820 }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg,#0a1628 0%,#162236 100%)' }}>
                    {['Item Name','Unit','Qty','Unit Price','Margin%','GST %','Base Total',''].map(h => (
                      <th key={h} style={{ padding: '8px 6px', textAlign: h === 'GST %' || h === 'Base Total' ? 'center' : 'left', color: h === 'GST %' ? '#fbbf24' : 'rgba(255,255,255,0.7)', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.items.map((it, ii) => {
                    const hasDim = it.length_ft || it.width_ft || it.height_ft;
                    const dimKey = `${activeSection}-${ii}`;
                    return (
                    <React.Fragment key={ii}>
                    <tr style={{ borderBottom: hasDim ? 'none' : '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 4px' }}>
                        <input style={{ ...INP, minWidth: 160 }} value={it.item_name} onChange={e => updateItem(activeSection, ii, 'item_name', e.target.value)} placeholder="Product name…" />
                      </td>
                      <td style={{ padding: '4px 4px' }}><input style={{ ...INP, width: 65 }} value={it.unit} onChange={e => updateItem(activeSection, ii, 'unit', e.target.value)} /></td>
                      <td style={{ padding: '4px 4px' }}><input style={{ ...INP, width: 55 }} type="number" value={it.qty} onChange={e => updateItem(activeSection, ii, 'qty', e.target.value)} /></td>
                      <td style={{ padding: '4px 4px' }}><input style={{ ...INP, width: 85 }} type="number" value={it.unit_price} onChange={e => updateItem(activeSection, ii, 'unit_price', e.target.value)} /></td>
                      <td style={{ padding: '4px 4px' }}><input style={{ ...INP, width: 60 }} type="number" value={it.margin_pct} onChange={e => updateItem(activeSection, ii, 'margin_pct', e.target.value)} /></td>
                      <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                        <select style={{ ...INP, width: 72, textAlign: 'center', color: '#b45309', fontWeight: 800, background: '#fffbeb', border: '1.5px solid rgba(217,119,6,0.45)', colorScheme: 'light', cursor: 'pointer' }}
                          value={it.gst_pct ?? form.gst_rate ?? 18}
                          onChange={e => updateItem(activeSection, ii, 'gst_pct', Number(e.target.value))}>
                          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 8px', fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'right' }}>{fmtC(it.line_total)}</td>
                      <td style={{ padding: '4px 4px', whiteSpace: 'nowrap' }}>
                        <button title="Toggle dimensions (L/W/H)"
                          onClick={() => updateItem(activeSection, ii, '_showDim', !it._showDim)}
                          style={{ ...SEC_BTN, padding: '2px 6px', marginRight: 3, color: (hasDim || it._showDim) ? '#0891b2' : 'var(--muted)', borderColor: (hasDim || it._showDim) ? 'rgba(8,145,178,0.35)' : 'var(--border)' }}>📐</button>
                        <button onClick={() => removeItem(activeSection, ii)} style={{ ...SEC_BTN, color: '#dc2626', padding: '2px 8px' }}>✕</button>
                      </td>
                    </tr>
                    {/* Dimension sub-row — toggle with 📐 button */}
                    {(it._showDim || hasDim) && (
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(8,145,178,0.03)' }}>
                        <td colSpan={8} style={{ padding: '3px 8px 6px 12px' }}>
                          <div className="dqb-dim-row">
                            <span style={{ fontSize: 10, color: '#0891b2', fontWeight: 700 }}>📐 Dimensions (ft):</span>
                            {[['L', 'length_ft'], ['W', 'width_ft'], ['H', 'height_ft']].map(([lbl, key]) => (
                              <React.Fragment key={key}>
                                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{lbl}:</span>
                                <input className="dqb-dim-input" type="number" min="0" step="0.1"
                                  placeholder="—"
                                  value={it[key] ?? ''}
                                  onChange={e => updateItem(activeSection, ii, key, parseFloat(e.target.value) || null)} />
                              </React.Fragment>
                            ))}
                            {hasDim && (
                              <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>
                                = {[it.length_ft, it.width_ft, it.height_ft].filter(Boolean).join(' × ')} ft
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
              <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 700, fontSize: 13 }}>Section Base Total: {fmtC(sec.section_total)}</div>
            </div>
          )}

          {/* Grand total summary */}
          <div style={FIELD_CARD}>
            <div style={SEC_HDR_QTE}>📊 Quote Summary</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
              <div style={{ fontSize: 13, color: '#3d4f6b' }}>Base Subtotal: <strong style={{ color: '#0d1b2e' }}>{fmtC(subtotal)}</strong></div>
              {form.include_gst && Object.entries(gstBreakdown).sort(([a],[b]) => +a - +b).map(([rate, amt]) => (
                <div key={rate} style={{ fontSize: 12, color: '#d97706' }}>GST @{rate}%: <strong>{fmtC(amt)}</strong></div>
              ))}
              {form.include_gst && Object.keys(gstBreakdown).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>GST: ₹0 (no items priced yet)</div>
              )}
              <div style={{ fontSize: 16, fontWeight: 900, color: '#14b8a6', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2 }}>Grand Total: {fmtC(grandTotal)}</div>
            </div>
          </div>

          {/* Notes & Terms */}
          <div style={FIELD_CARD}>
            <div style={SEC_HDR_QTE}>📝 Notes &amp; Terms</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={LBL}>Notes</label><textarea style={{ ...INP, height: 70, resize: 'vertical' }} value={form.notes} onChange={e => setF('notes', e.target.value)} /></div>
              <div><label style={LBL}>Terms &amp; Conditions</label><textarea style={{ ...INP, height: 70, resize: 'vertical' }} value={form.terms} onChange={e => setF('terms', e.target.value)} /></div>
            </div>
          </div>
        </div>
      </div>

      {/* DqbImageSearchModal — nested so results go directly into the active section */}
      {showImgSearchForm && (
        <DqbImageSearchModal
          sectionName={form.sections[imgSearchSec]?.section_name || ''}
          onClose={() => setShowImgSearchForm(false)}
          onAddItem={(it) => {
            setForm(f => {
              const sections = f.sections.map((sec, si) => {
                if (si !== imgSearchSec) return sec;
                const newItem = {
                  item_name: it.item_name || '', description: it.specifications || '',
                  unit: it.unit || 'Nos', qty: it.qty || 1, unit_price: 0,
                  margin_pct: 0, line_total: 0,
                  inferred_hsn: it.inferred_hsn || '', inferred_category: it.item_type || '',
                  gst_pct: inferGstFromHsn(it.inferred_hsn),
                };
                const items = [...sec.items, newItem];
                return { ...sec, items, section_total: items.reduce((s, x) => s + (x.line_total || 0), 0) };
              });
              return { ...f, sections };
            });
            setShowImgSearchForm(false);
          }}
        />
      )}
    </div>
  );
}

// ── QuoteDetailModal (P0-5: client approval workflow) ─────────────────────────
function QuoteDetailModal({ quote: initialQuote, onClose, onEdit, onStatusChange, currentUser }) {
  const [quote, setQuote]             = useState(initialQuote);
  const [updating, setUpdating]       = useState(false);
  const [showEmail, setShowEmail]     = useState(false);
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [approvalNotes, setApprovalNotes]     = useState('');
  const [aiRec, setAiRec]                     = useState(null);
  const [loadingAiRec, setLoadingAiRec]       = useState(false);
  const printRef = useRef();

  const myRole = currentUser?.role || 'architect';
  const allowedActions = getAllowedActions(quote.status, myRole);
  const isPendingApproval = ['PENDING_L1','PENDING_L2','PENDING_L3'].includes(quote.status);

  useEffect(() => {
    fetch(`/api/design-quotes/${quote.id}/approval-history`)
      .then(r => r.json()).then(d => setApprovalHistory(d.history || [])).catch(() => {});
  }, [quote.id]);

  const refreshHistory = async () => {
    try {
      const r = await fetch(`/api/design-quotes/${quote.id}/approval-history`);
      const d = await r.json();
      setApprovalHistory(d.history || []);
    } catch {}
  };

  const fetchAiRec = async () => {
    setLoadingAiRec(true);
    try {
      const r = await fetch(`/api/design-quotes/${quote.id}/ai-approval-recommendation`, { method: 'POST' });
      const d = await r.json();
      setAiRec(d);
    } catch {}
    finally { setLoadingAiRec(false); }
  };

  const handleApprovalAction = async (action) => {
    setUpdating(true);
    try {
      const r = await fetch(`/api/design-quotes/${quote.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: approvalNotes }),
      });
      const d = await r.json();
      if (r.ok) {
        const newStatus = d.new_status || d.status;
        setQuote(q => ({ ...q, status: newStatus, approval_cycle: d.approval_cycle ?? q.approval_cycle }));
        onStatusChange(quote.id, newStatus);
        setApprovalNotes('');
        await refreshHistory();
      } else {
        alert(d.detail || 'Action failed. You may not have permission.');
      }
    } catch { alert('Network error — please retry.'); }
    finally { setUpdating(false); }
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${quote.quote_number}</title><style>
      body{font-family:Arial,sans-serif;color:#1f2937;margin:0;padding:20px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{padding:8px 10px;border:1px solid #e5e7eb;text-align:left}
      th{background:#f3f4f6;font-weight:700}
      .stamp{border:3px solid #16a34a;color:#16a34a;font-size:28px;font-weight:900;padding:6px 18px;display:inline-block;transform:rotate(-8deg);letter-spacing:4px;margin:10px 0}
    </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:3px solid #14b8a6;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:40px;height:40px;background:#14b8a6;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:18px">IQ</div>
          <div><div style="font-weight:800;font-size:14px">InvenIQ — Design Studio</div><div style="font-size:11px;color:#6b7280">Hardware & Sanitary Fit-Out Quotations</div></div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:900;font-size:24px;color:#14b8a6;letter-spacing:2px">QUOTATION</div>
          <div style="font-size:12px;color:#6b7280;line-height:1.9">
            <div>Quote No. <strong style="color:#1f2937">${quote.quote_number}</strong></div>
            <div>Date <strong style="color:#1f2937">${quote.created_at || '—'}</strong></div>
            <div>Valid Till <strong style="color:#1f2937">${quote.valid_till || '—'}</strong></div>
          </div>
        </div>
      </div>
      ${quote.status === 'APPROVED' ? '<div class="stamp">CLIENT APPROVED</div>' : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
        <div><div style="font-weight:700;font-size:12px;color:#6b7280;margin-bottom:6px">BILL TO</div>
          <div style="font-weight:700">${quote.client_name}</div>
          <div style="font-size:12px;color:#6b7280">${quote.client_phone || ''}<br/>${quote.client_email || ''}<br/>${quote.project_address || ''}</div>
        </div>
        <div><div style="font-weight:700;font-size:12px;color:#6b7280;margin-bottom:6px">PROJECT</div>
          <div style="font-weight:700">${quote.project_name || '—'}</div>
          <div style="font-size:12px;color:#6b7280">Type: ${quote.project_type || 'Residential'}<br/>Designer: ${quote.designer_name || '—'}</div>
        </div>
      </div>
      ${(quote.sections || []).map(sec => `
        <div style="margin-bottom:20px">
          <div style="font-weight:800;font-size:13px;background:#f3f4f6;padding:8px 10px;border-radius:6px;margin-bottom:8px">${sec.section_name}</div>
          <table><thead><tr><th>#</th><th>Item</th><th>Unit</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:center;color:#d97706">GST%</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${(sec.items || []).map((it, i) => `<tr><td>${i+1}</td><td>${it.item_name}${it.description ? '<br/><span style="font-size:10px;color:#9ca3af">'+it.description+'</span>' : ''}${(it.length_ft||it.width_ft||it.height_ft)?'<br/><span style="font-size:10px;color:#0891b2">📐 '+[it.length_ft&&'L:'+it.length_ft+'ft',it.width_ft&&'W:'+it.width_ft+'ft',it.height_ft&&'H:'+it.height_ft+'ft'].filter(Boolean).join(' × ')+'</span>':''}</td><td>${it.unit}</td><td style="text-align:right">${it.qty}</td><td style="text-align:right">₹${Number(it.unit_price||0).toLocaleString('en-IN')}</td><td style="text-align:center;font-weight:700;color:#d97706">${it.gst_pct??quote.gst_rate??18}%</td><td style="text-align:right;font-weight:700">₹${Number(it.line_total||0).toLocaleString('en-IN')}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="6" style="text-align:right;font-weight:700">Section Total</td><td style="text-align:right;font-weight:800">₹${Number(sec.section_total||0).toLocaleString('en-IN')}</td></tr></tfoot>
          </table>
        </div>`).join('')}
      ${(() => {
        const bd = {};
        (quote.sections||[]).forEach(sec=>(sec.items||[]).forEach(it=>{
          const rate=it.gst_pct??quote.gst_rate??18;
          const amt=(it.line_total||0)*(rate/100);
          if(amt>0&&quote.include_gst) bd[rate]=(bd[rate]||0)+amt;
        }));
        const entries=Object.entries(bd).sort(([a],[b])=>+a-+b);
        const totalGst=entries.reduce((s,[,v])=>s+v,0)||(quote.gst_amount||0);
        return `<div style="margin-left:auto;width:320px;border:1px solid #e5e7eb;border-radius:8px;padding:14px">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>Base Subtotal</span><strong>₹${Number(quote.subtotal||0).toLocaleString('en-IN')}</strong></div>
          ${quote.include_gst?(entries.length>0?entries.map(([r,a])=>`<div style="display:flex;justify-content:space-between;font-size:12px;color:#d97706;margin-bottom:3px"><span>GST @${r}% (CGST ${r/2}% + SGST ${r/2}%)</span><span>₹${Math.round(a).toLocaleString('en-IN')}</span></div>`).join(''):`<div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-bottom:3px"><span>CGST @${Number(quote.gst_rate||18)/2}%</span><span>₹${Number((quote.gst_amount||0)/2).toLocaleString('en-IN')}</span></div><div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-bottom:3px"><span>SGST @${Number(quote.gst_rate||18)/2}%</span><span>₹${Number((quote.gst_amount||0)/2).toLocaleString('en-IN')}</span></div>`):''}
          ${quote.include_gst&&entries.length>1?`<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#d97706;border-top:1px solid #e5e7eb;padding-top:4px;margin-bottom:4px"><span>Total GST</span><span>₹${Math.round(totalGst).toLocaleString('en-IN')}</span></div>`:''}
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;color:#14b8a6;border-top:1px solid #e5e7eb;padding-top:8px"><span>Grand Total</span><span>₹${Number(quote.grand_total||0).toLocaleString('en-IN')}</span></div>
          ${quote.include_gst?'<div style="font-size:10px;color:#9ca3af;margin-top:4px">SAC: 9983 (Interior Design Services)</div>':''}
        </div>`;
      })()}
      ${quote.payment_terms ? `<div style="margin-top:20px"><strong style="font-size:12px">Payment Terms:</strong> <span style="font-size:12px;color:#6b7280">${quote.payment_terms}</span></div>` : ''}
      ${quote.terms ? `<div style="margin-top:12px"><strong style="font-size:12px">Terms & Conditions:</strong><div style="font-size:11px;color:#6b7280;white-space:pre-line;margin-top:4px">${quote.terms}</div></div>` : ''}
    </body></html>`);
    w.document.close(); w.print();
  };

  const shareWhatsApp = () => {
    const text = `*Design Quote — ${quote.quote_number}*\nInvenIQ Design Studio\n\n*Client:* ${quote.client_name || '—'}\n*Project:* ${quote.project_name || '—'}\n*Rooms:* ${(quote.sections || []).length}\n\n*Total (incl. GST):* ₹${Number(quote.grand_total||0).toLocaleString('en-IN')}\n\nPlease review and confirm to proceed.\nRegards, InvenIQ Design Studio`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div style={MODAL_BG} onClick={onClose}>
      <div className="dqs-modal-scope" style={{ ...MODAL_BOX, maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 16, fontFamily:"'Plus Jakarta Sans','Inter',-apple-system,sans-serif" }}>{quote.quote_number}</span>
            <StatusBadge status={quote.status} cfg={Q_STATUS} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {quote.client_name}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* Role-aware approval workflow buttons */}
            {allowedActions.map(action => (
              <button key={action} onClick={() => handleApprovalAction(action)} disabled={updating}
                style={{ ...SEC_BTN, color: ACTION_COLOR[action], borderColor: ACTION_COLOR[action]+'55', fontWeight: 700, opacity: updating ? 0.6 : 1 }}>
                {updating ? '…' : ACTION_LABEL[action]}
              </button>
            ))}
            {quote.status === 'APPROVED' && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 6, padding: '4px 10px' }}>✅ Approved</span>
            )}
            {isPendingApproval && (
              <span style={{ fontSize: 11, color: '#d97706', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 6, padding: '4px 10px', fontWeight: 600 }}>
                {APPROVAL_LEVEL_LABEL[quote.status]}
              </span>
            )}
            {(quote.approval_cycle > 0) && (
              <span style={{ fontSize: 11, color: '#0f766e', background: 'rgba(15,118,110,0.09)', borderRadius: 6, padding: '3px 8px', fontWeight: 700 }}>🔄 Cycle {quote.approval_cycle + 1}</span>
            )}
            <button onClick={shareWhatsApp} style={{ ...SEC_BTN, color: '#16a34a', borderColor: 'rgba(37,211,102,0.4)', fontWeight: 700 }}>📱 WhatsApp</button>
            <button onClick={handlePrint} style={{ ...SEC_BTN, color: '#14b8a6', borderColor: 'rgba(20,184,166,0.4)' }}>🖨 Print</button>
            <button onClick={() => setShowEmail(true)} style={{ ...SEC_BTN, color: '#0891b2', borderColor: 'rgba(8,145,178,0.4)' }}>📧 Email</button>
            <button onClick={() => {
              const allItems = [];
              (quote.sections || []).forEach(sec => {
                (sec.items || []).forEach(item => {
                  allItems.push({
                    product_name: item.item_name || '',
                    category: item.inferred_category || '',
                    room: sec.section_name || '',
                    quantity: item.qty || 1,
                    unit: item.unit || 'Nos',
                    unit_price: item.unit_price || 0,
                    hsn_code: item.inferred_hsn || '',
                    specifications: item.description || '',
                    inferred_category: item.inferred_category || '',
                    inferred_hsn: item.inferred_hsn || '',
                    gst_pct: item.gst_pct ?? 18,
                  });
                });
              });
              localStorage.setItem('inveniq_dqb_to_qb', JSON.stringify({
                ts: Date.now(),
                source: 'DQB',
                client_name: quote.client_name || '',
                project_name: quote.project_name || '',
                project_address: quote.project_address || '',
                items: allItems,
              }));
              alert(`${allItems.length} item${allItems.length !== 1 ? 's' : ''} sent to Quotation Builder!\nOpen Quotation Builder to create a supplier quote from these items.`);
            }} style={{ ...SEC_BTN, color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }}>🛒 Send to QB</button>
            <button onClick={onEdit} style={SEC_BTN}>✏️ Edit</button>
            <button onClick={onClose} style={CLOSE_BTN}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }} ref={printRef}>

          {/* Client + project meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20, fontSize: 13 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>CLIENT</div>
              <div style={{ fontWeight: 700 }}>{quote.client_name}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{quote.client_phone}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{quote.client_email}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>PROJECT</div>
              <div style={{ fontWeight: 700 }}>{quote.project_name || '—'}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{quote.project_type}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{quote.project_address}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>QUOTE INFO</div>
              <div style={{ fontSize: 12 }}>Date: <strong>{quote.created_at}</strong></div>
              <div style={{ fontSize: 12 }}>Valid Till: <strong style={{ color: new Date(quote.valid_till) < new Date() && quote.status !== 'APPROVED' ? '#dc2626' : 'var(--text)' }}>{quote.valid_till}</strong></div>
              <div style={{ fontSize: 12 }}>Designer: <strong>{quote.designer_name || '—'}</strong></div>
            </div>
          </div>

          {/* ── Approval action panel (managers with allowed actions) ── */}
          {allowedActions.length > 0 && (
            <div style={{ background: 'rgba(217,119,6,0.05)', border: '1.5px solid rgba(217,119,6,0.25)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#d97706' }}>⚡ Approval Decision</span>
                <span style={{ fontSize: 11, color: '#6b7280', background: 'var(--bg)', borderRadius: 20, padding: '2px 9px', border: '1px solid var(--border)' }}>{APPROVAL_LEVEL_LABEL[quote.status] || quote.status}</span>
                {!aiRec && (
                  <button onClick={fetchAiRec} disabled={loadingAiRec} style={{ marginLeft: 'auto', fontSize: 11, color: '#0f766e', background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.25)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}>
                    {loadingAiRec ? '🤖 Analysing…' : '🤖 Get AI Recommendation'}
                  </button>
                )}
              </div>
              {aiRec && (
                <div style={{ background: aiRec.recommendation === 'APPROVE' ? 'rgba(22,163,74,0.07)' : 'rgba(234,88,12,0.07)', border: `1px solid ${aiRec.recommendation === 'APPROVE' ? 'rgba(22,163,74,0.3)' : 'rgba(234,88,12,0.3)'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 12, color: aiRec.recommendation === 'APPROVE' ? '#16a34a' : '#ea580c' }}>
                      🤖 AI: {aiRec.recommendation === 'APPROVE' ? '✅ Recommend Approve' : '⬆️ Recommend Escalate'}
                    </span>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Confidence: {Math.round((aiRec.confidence || 0) * 100)}%</span>
                    <button onClick={() => setAiRec(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--muted)' }}>✕</button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 6 }}>{aiRec.reasoning}</div>
                  {(aiRec.risk_factors || []).length > 0 && (
                    <div style={{ fontSize: 11, color: '#ea580c' }}>⚠️ Risk factors: {aiRec.risk_factors.join(', ')}</div>
                  )}
                </div>
              )}
              <textarea
                value={approvalNotes}
                onChange={e => setApprovalNotes(e.target.value)}
                placeholder="Optional notes for this decision (visible in approval history)…"
                rows={2}
                style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '8px 10px', borderRadius: 7, border: '1px solid rgba(217,119,6,0.3)', background: 'var(--card)', color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {allowedActions.map(action => (
                  <button key={action} onClick={() => handleApprovalAction(action)} disabled={updating}
                    style={{ fontSize: 13, fontWeight: 700, padding: '7px 18px', borderRadius: 7, cursor: 'pointer', border: `1.5px solid ${ACTION_COLOR[action]}55`, background: `${ACTION_COLOR[action]}11`, color: ACTION_COLOR[action], opacity: updating ? 0.6 : 1, transition: 'all 0.12s' }}>
                    {updating ? '…' : ACTION_LABEL[action]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Approval history timeline ── */}
          {approvalHistory.length > 0 && (
            <div style={{ marginBottom: 18, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>📋 Approval History</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {approvalHistory.map((h, i) => {
                  const isLast = i === approvalHistory.length - 1;
                  const actionCfg = {
                    SUBMIT:           { color: '#d97706', label: '📤 Submitted for Approval' },
                    APPROVE:          { color: '#16a34a', label: '✅ Approved' },
                    ESCALATE_L2:      { color: '#ea580c', label: '⬆️ Escalated to L2 (CFO)' },
                    ESCALATE_L3:      { color: '#dc2626', label: '⬆️ Escalated to L3 (Admin)' },
                    APPROVE_RETURN_L1:{ color: '#0f766e', label: '🔄 L3 Approved — Returned to L1' },
                    REJECT:           { color: '#6b7280', label: '↩️ Returned to Draft' },
                  }[h.action] || { color: '#6b7280', label: h.action };
                  return (
                    <div key={i} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: actionCfg.color+'18', border: `2px solid ${actionCfg.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, zIndex: 1 }}>
                          {h.level === 'L1' ? '①' : h.level === 'L2' ? '②' : h.level === 'L3' ? '③' : '●'}
                        </div>
                        {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--border)', minHeight: 16, margin: '2px 0' }} />}
                      </div>
                      <div style={{ paddingBottom: isLast ? 0 : 14, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: actionCfg.color }}>{actionCfg.label}</span>
                          <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--card)', borderRadius: 10, padding: '1px 7px', border: '1px solid var(--border)' }}>
                            {h.actor_name || h.actor_role || 'System'} · {h.level}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{h.created_at}</div>
                        {h.notes && <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 3, fontStyle: 'italic' }}>"{h.notes}"</div>}
                        {h.ai_rec && (
                          <div style={{ fontSize: 10, color: '#0f766e', marginTop: 2 }}>🤖 AI recommendation at time: {h.ai_rec}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sections */}
          {(quote.sections || []).map((sec, si) => (
            <div key={si} style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 13, background: 'var(--bg)', padding: '7px 12px', borderRadius: 6, marginBottom: 8, border: '1px solid var(--border)' }}>{sec.section_name}</div>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>#</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Item</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--muted)', fontWeight: 600 }}>Unit</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--muted)', fontWeight: 600 }}>Qty</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--muted)', fontWeight: 600 }}>Rate</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', color: '#d97706', fontWeight: 700 }}>GST%</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--muted)', fontWeight: 600 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(sec.items || []).map((it, ii) => (
                    <tr key={ii} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{ii + 1}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <div style={{ fontWeight: 600 }}>{it.item_name}</div>
                        {it.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{it.description}</div>}
                        {it.inferred_category && <ItemTypeBadge type={it.inferred_category} />}
                        {(it.length_ft || it.width_ft || it.height_ft) && (
                          <div style={{ fontSize: 10, color: '#0891b2', marginTop: 2 }}>
                            📐 {[it.length_ft && `L:${it.length_ft}ft`, it.width_ft && `W:${it.width_ft}ft`, it.height_ft && `H:${it.height_ft}ft`].filter(Boolean).join(' × ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{it.unit}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{it.qty}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtC(it.unit_price)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706', background: 'rgba(217,119,6,0.1)', borderRadius: 10, padding: '1px 7px' }}>
                          {it.gst_pct ?? quote.gst_rate ?? 18}%
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtC(it.line_total)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bg)' }}>
                    <td colSpan={6} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>Section Total</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: '#14b8a6' }}>{fmtC(sec.section_total)}</td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          ))}

          {/* Summary — per-rate GST breakdown */}
          {(() => {
            const bdMap = {};
            (quote.sections || []).forEach(sec => (sec.items || []).forEach(it => {
              const rate = it.gst_pct ?? quote.gst_rate ?? 18;
              const amt  = (it.line_total || 0) * (rate / 100);
              if (amt > 0 && quote.include_gst) bdMap[rate] = (bdMap[rate] || 0) + amt;
            }));
            const bdEntries = Object.entries(bdMap).sort(([a],[b]) => +a - +b);
            const totalGst = bdEntries.reduce((s, [,v]) => s + v, 0) || (quote.gst_amount || 0);
            return (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, minWidth: 280 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span>Base Subtotal</span><strong>{fmtC(quote.subtotal)}</strong></div>
                  {quote.include_gst && (
                    bdEntries.length > 0 ? bdEntries.map(([rate, amt]) => (
                      <div key={rate} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#d97706', marginBottom: 3 }}>
                        <span>GST @{rate}% (CGST {rate/2}% + SGST {rate/2}%)</span><span>{fmtC(amt)}</span>
                      </div>
                    )) : <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 3 }}><span>CGST @{(quote.gst_rate || 18) / 2}%</span><span>{fmtC((quote.gst_amount || 0) / 2)}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 3 }}><span>SGST @{(quote.gst_rate || 18) / 2}%</span><span>{fmtC((quote.gst_amount || 0) / 2)}</span></div>
                    </>
                  )}
                  {quote.include_gst && bdEntries.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#d97706', borderTop: '1px solid var(--border)', paddingTop: 4, marginBottom: 4 }}>
                      <span>Total GST</span><span>{fmtC(totalGst)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 900, color: '#14b8a6', borderTop: '1px solid var(--border)', paddingTop: 8 }}><span>Grand Total</span><span>{fmtC(quote.grand_total)}</span></div>
                  {quote.include_gst && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>SAC: 9983 — Interior Design Services</div>}
                </div>
              </div>
            );
          })()}

          {/* Payment terms */}
          {quote.payment_terms && <div style={{ marginTop: 16, fontSize: 13 }}><strong>Payment Terms:</strong> <span style={{ color: 'var(--muted)' }}>{quote.payment_terms}</span></div>}
          {quote.notes && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', background: 'var(--bg)', borderRadius: 8, padding: 10, border: '1px solid var(--border)' }}>{quote.notes}</div>}
        </div>

        {showEmail && <EmailModal quoteId={quote.id} isProposal={false} defaultEmail={quote.client_email} defaultName={quote.client_name} quoteNumber={quote.quote_number} onClose={() => setShowEmail(false)} />}
      </div>
    </div>
  );
}

// ── WhatsAppScannerModal ──────────────────────────────────────────────────────
function WhatsAppScannerModal({ onClose, onCreateQuote }) {
  const [mode, setMode]         = useState('text'); // 'text' | 'doc'
  const [text, setText]         = useState('');
  const [files, setFiles]       = useState([]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult]     = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [parseStep, setParseStep] = useState(0); // 0=idle 1=ocr 2=structuring (doc mode only)
  const fileRef = useRef();

  const scan = async () => {
    setScanning(true);
    try {
      if (mode === 'text' && !text.trim()) { setScanning(false); return; }
      if (mode === 'doc' && files.length === 0 && !text.trim()) { setScanning(false); return; }
      const fd = new FormData();
      if (text.trim()) fd.append('text_input', text);
      files.forEach(f => fd.append('file', f));
      if (mode === 'doc') {
        setParseStep(1);
        const stepTimer = setTimeout(() => setParseStep(2), 9000);
        try {
          const r = await fetch('/api/design-quotes/parse-document', { method: 'POST', body: fd });
          const d = await r.json();
          setResult(d);
        } finally { clearTimeout(stepTimer); }
      } else {
        const r = await fetch('/api/design-quotes/scan', { method: 'POST', body: fd });
        const d = await r.json();
        setResult(d);
      }
    } catch { setResult(null); }
    finally { setScanning(false); setParseStep(0); }
  };

  const saveToCatalog = async (item) => {
    try {
      await fetch('/api/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_name: item.item_name, description: item.description || item.specifications || '', hsn_code: item.inferred_hsn || '', category: item.item_type || '', brand: '', unit: item.unit || 'Nos' }) });
      alert(`"${item.item_name}" saved to catalog`);
    } catch { alert('Save failed'); }
  };

  const useResult = () => {
    if (!result?.extracted) return;
    const ex = result.extracted;
    let rawRooms = ex.rooms || [];

    // Fallback: AI returned no rooms — synthesize a "General Requirements" section
    // so the quotation form always opens with at least one pre-filled section
    if (rawRooms.length === 0) {
      const fallbackDesc = [ex.notes, ex.budget_indication].filter(Boolean).join(' · ');
      rawRooms = [{
        room_name: 'General Requirements',
        items: [{
          item_name: ex.project_name ? `${ex.project_name} — Project Scope` : 'Project Requirements',
          description: fallbackDesc || 'As per client discussion',
          specifications: fallbackDesc || '',
          item_type: 'other',
          unit: 'Lot',
          qty: 1,
          unit_price: 0,
          inferred_hsn: '',
        }],
      }];
    }

    const sections = rawRooms.map((room, i) => ({
      section_name: room.room_name, section_order: i, section_total: 0,
      items: (room.items || []).map(it => ({
        item_name: it.item_name || '',
        description: [it.specifications, it.description].filter(Boolean).join(' · '),
        unit: it.unit || 'Nos',
        qty: it.qty || 1,
        unit_price: it.unit_price || 0,
        margin_pct: 0,
        line_total: (it.qty || 1) * (it.unit_price || 0),
        inferred_hsn: it.inferred_hsn || '',
        inferred_category: it.item_type || '',
        gst_pct: inferGstFromHsn(it.inferred_hsn),
        length_ft: it.length_ft || null,
        width_ft: it.width_ft || null,
        height_ft: it.height_ft || null,
        dim_type: it.dim_type || null,
      })),
    }));
    onCreateQuote({
      client_name: ex.client_name || '', client_phone: ex.client_phone || '',
      client_email: ex.client_email || '', project_name: ex.project_name || '',
      project_address: ex.project_address || '', project_type: ex.project_type || 'Residential',
      designer_name: ex.designer_name || '',
      notes: ex.notes || '', sections,
    });
  };

  // Size limit: 15 MB for documents/PDFs, 4 MB for images
  const oversized = files.filter(f => f.size > (mode === 'doc' ? 15 : 4) * 1024 * 1024);

  return (
    <div style={MODAL_BG} onClick={onClose}>
      <div className="dqs-modal-scope" style={{ ...MODAL_BOX, maxWidth: 800, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'linear-gradient(135deg,#0f2744 0%,#15803d 100%)', borderRadius: '14px 14px 0 0' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15, color: '#ffffff' }}>📱 WhatsApp / Document / Image Scanner</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Paste text, upload files (PDF, Word, Excel) or photos — AI reads everything and builds your BOQ</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(220,38,38,0.2)', border:'1px solid rgba(220,38,38,0.4)', color:'#fca5a5', borderRadius:7, padding:'5px 10px', fontSize:13, cursor:'pointer', fontWeight:700 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>

          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
            {[['text','💬 Text / WhatsApp'], ['doc','📄 AI Document Parser']].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setResult(null); }} style={{ ...SEC_BTN, background: mode === m ? 'rgba(8,145,178,0.12)' : 'transparent', color: mode === m ? '#0891b2' : 'var(--muted)', borderColor: mode === m ? '#0891b2' : 'var(--border)', fontWeight: mode === m ? 700 : 600 }}>{l}</button>
            ))}
          </div>

          {mode === 'text' && (
            <textarea style={{ ...INP, height: 140, resize: 'vertical', fontSize: 13 }}
              placeholder={`Paste WhatsApp messages, BOQ requirements, or project brief here…\n\nExamples:\n• "Need Jaquar CP fittings for 24 units, 3 bathrooms each — premium range"\n• "Master bath: EWC, basin mixer, shower set. Common bath: basic set. Kitchen: SS sink + mixer"`}
              value={text} onChange={e => setText(e.target.value)} />
          )}

          {mode === 'doc' && (
            <div>
              <div style={{ background: 'rgba(8,145,178,0.05)', border: '1px solid rgba(8,145,178,0.18)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                Upload any customer requirement file — handwritten PDFs, scanned documents, Word, Excel, CSV, or photos. AI reads every line and auto-fills rooms, items, dimensions &amp; HSN codes.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ods,.csv,.txt,image/*" style={{ display: 'none' }} onChange={e => setFiles(Array.from(e.target.files))} />
                <button onClick={() => fileRef.current.click()} style={{ ...PRI_BTN, background: 'linear-gradient(135deg,#0891b2,#06b6d4)', padding: '8px 16px', fontSize: 12 }}>
                  📎 Add Files ({files.length})
                </button>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>PDF · Word · Excel · CSV · Images (max 15 MB)</span>
              </div>

              {/* Oversized warning */}
              {oversized.length > 0 && (
                <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 10 }}>
                  ⚠ {oversized.map(f => f.name).join(', ')} {oversized.length === 1 ? 'is' : 'are'} over 15 MB. Please compress or split before uploading.
                </div>
              )}

              {files.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {files.map((f, i) => {
                    const isImg = f.type.startsWith('image/');
                    return (
                      <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {isImg ? (
                          <img src={URL.createObjectURL(f)} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `2px solid ${f.size > 15*1024*1024 ? '#dc2626' : 'var(--border)'}` }} />
                        ) : (
                          <div style={{ width: 80, height: 80, borderRadius: 8, border: '2px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontSize: 28 }}>
                            {FILE_ICON(f.name)}
                          </div>
                        )}
                        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2, maxWidth: 80, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize: 9, color: 'var(--muted)' }}>{(f.size/1024).toFixed(0)}KB</div>
                        <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} style={{ position:'absolute',top:-5,right:-5,width:18,height:18,borderRadius:'50%',background:'#dc2626',color:'#fff',border:'none',fontSize:10,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
              <textarea style={{ ...INP, height: 60, fontSize: 12 }} placeholder="Optional: add context — project name, client, no. of units, budget tier…" value={text} onChange={e => setText(e.target.value)} />
            </div>
          )}

          {/* Scan buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={scan} disabled={scanning || oversized.length > 0}
              style={{ ...PRI_BTN, background: 'linear-gradient(135deg,#0891b2,#06b6d4)', opacity: (scanning || oversized.length > 0) ? 0.5 : 1, fontSize: 13, padding: '10px 22px' }}>
              {scanning && mode === 'doc'
                ? parseStep === 2 ? '🧠 Step 2/2: Building BOQ…' : '📖 Step 1/2: Reading Document…'
                : scanning ? '⏳ AI Reading…'
                : mode === 'doc' ? '⚡ Extract & Build Quote' : '⚡ Scan & Extract'}
            </button>
            {scanning && mode !== 'doc' && <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>GPT-4o is analysing your requirements…</span>}
          </div>
          {scanning && mode === 'doc' && (
            <div style={{ fontSize: 11, color: '#0891b2', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.15)', borderRadius: 7, padding: '8px 12px', marginTop: 8 }}>
              {parseStep === 2
                ? '🧠 Structuring extracted text into room-wise BOQ sections…'
                : '📖 AI is reading every line of the document — handwriting, dimensions, item names…'}
              <span style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>This takes 15–25 seconds for scanned/handwritten documents</span>
            </div>
          )}

          {/* Scanner empty state */}
          {!result && !scanning && (
            <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 16px' }}>
              <div style={{ fontSize: 52, marginBottom: 14, lineHeight: 1 }}>🤖</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 8, fontFamily:"'Inter',-apple-system,sans-serif", letterSpacing: '-0.3px' }}>AI Scanner Ready</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65, marginBottom: 22, maxWidth: 300 }}>
                Paste a WhatsApp message or upload files — AI extracts room-by-room requirements and builds your complete BOQ in seconds.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginBottom: 22 }}>
                {['⚡ Room detection', '📐 Dimensions', '🧠 HSN inference', '✓ GST-ready BOQ'].map(f => (
                  <span key={f} style={{ fontSize: 11, background: 'rgba(15,118,110,0.08)', color: '#0f766e', border: '1px solid rgba(15,118,110,0.2)', borderRadius: 20, padding: '5px 13px', fontWeight: 600, whiteSpace: 'nowrap' }}>{f}</span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, width: '100%', maxWidth: 300 }}>
                {[['10+','Room types'],['< 5s','AI extract'],['18%','GST ready']].map(([v,l]) => (
                  <div key={l} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily:"'JetBrains Mono','Courier New',monospace" }}>{v}</div>
                    <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, marginTop: 3, textTransform: 'uppercase', letterSpacing: '.5px' }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results area */}
          {result?.extracted && (
            <div style={{ marginTop: 20 }}>

              {/* Error banner — shown when AI call failed (key exists but call errored) */}
              {result.scan_error && (
                <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#dc2626', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 3 }}>⚠ AI scan error — showing sample data below</div>
                    <div style={{ color: '#9ca3af', fontSize: 11 }}>{result.scan_error}</div>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>Tip: Check that your OpenAI API key has GPT-4o access and the image is under 4 MB. You can still create a quotation from the sample data and edit it.</div>
                  </div>
                  <button onClick={scan} style={{ ...SEC_BTN, fontSize: 11, padding: '4px 10px', flexShrink: 0, color: '#dc2626', borderColor: 'rgba(220,38,38,0.3)' }}>🔄 Retry</button>
                </div>
              )}

              {/* Demo note — shown only when NO API key is configured */}
              {result.demo_note && !result.scan_error && (
                <div style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#d97706', marginBottom: 12 }}>
                  <strong>Demo mode:</strong> {result.demo_note}
                </div>
              )}

              {/* AI source badge */}
              {result.data_source === 'ai' && (() => {
                const totalItems = (result.extracted.rooms || []).reduce((s, r) => s + (r.items||[]).length, 0);
                const roomCount = result.extracted.rooms?.length || 0;
                return (
                  <div style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#16a34a', marginBottom: 12, fontWeight: 700 }}>
                    {totalItems > 0
                      ? `✅ Live AI extraction — ${totalItems} items across ${roomCount} room(s)`
                      : '✅ Live AI extraction — project details captured below'}
                  </div>
                );
              })()}

              {/* Result header + summary */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{result.extracted.project_name || 'Extracted Requirements'}</div>
                  {result.extracted.client_name && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Client: {result.extracted.client_name}{result.extracted.no_of_units ? ` · ${result.extracted.no_of_units} units` : ''}{result.extracted.no_of_bathrooms_per_unit ? ` · ${result.extracted.no_of_bathrooms_per_unit} baths/unit` : ''}</div>}
                  {result.extracted.project_address && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{result.extracted.project_address}</div>}
                </div>
                {/* ALWAYS shown — primary CTA */}
                <button onClick={useResult} style={{ ...PRI_BTN, fontSize: 13, padding: '10px 22px', background: 'linear-gradient(135deg,#0f766e,#14b8a6)', boxShadow: '0 4px 14px rgba(15,118,110,0.4)' }}>
                  ✅ Create Quotation →
                </button>
              </div>

              {/* Empty-rooms message — shown when AI extracted client/project info but no room items */}
              {(result.extracted.rooms || []).length === 0 && !result.scan_error && (
                <div style={{ background: 'rgba(15,118,110,0.05)', border: '1px solid rgba(15,118,110,0.2)', borderRadius: 8, padding: '14px 16px', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f766e', marginBottom: 5 }}>📋 Project details extracted — no specific products identified</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.65 }}>
                    The document doesn&apos;t contain specific product names or SKUs. Click <strong style={{ color: 'var(--text)' }}>Create Quotation →</strong> to open a pre-filled form — a &quot;General Requirements&quot; section will be added so you can start filling in items immediately.
                  </div>
                  {(result.extracted.notes || result.extracted.budget_indication) && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--card)', borderRadius: 6, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, borderLeft: '3px solid rgba(15,118,110,0.4)' }}>
                      {[result.extracted.notes, result.extracted.budget_indication].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              )}

              {(result.extracted.rooms || []).map((room, ri) => (
                <div key={ri} style={{ background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'var(--card)', borderBottom: collapsed[ri] ? 'none' : '1px solid var(--border)' }} onClick={() => setCollapsed(c => ({ ...c, [ri]: !c[ri] }))}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{room.room_name} <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>· {(room.items || []).length} items</span></span>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>{collapsed[ri] ? '▶ Expand' : '▼ Collapse'}</span>
                  </div>
                  {!collapsed[ri] && (
                    <div style={{ padding: '8px 14px' }}>
                      {(room.items || []).map((it, ii) => (
                        <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{it.item_name}</div>
                            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                              <ItemTypeBadge type={it.item_type} />
                              {it.qty && <span style={{ fontSize: 10, color: '#0891b2', background: 'rgba(8,145,178,0.1)', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>Qty: {it.qty} {it.unit}</span>}
                              {it.inferred_hsn && <span style={{ fontSize: 10, color: '#6b7280', background: 'rgba(107,114,128,0.1)', borderRadius: 10, padding: '2px 8px' }}>HSN {it.inferred_hsn} · GST {inferGstFromHsn(it.inferred_hsn)}%</span>}
                              {it.material_preference && <span style={{ fontSize: 10, color: '#0f766e', background: 'rgba(15,118,110,0.08)', borderRadius: 10, padding: '2px 8px' }}>{it.material_preference}</span>}
                              {(it.length_ft || it.width_ft || it.height_ft) && (
                                <span style={{ fontSize: 10, color: '#0891b2', background: 'rgba(8,145,178,0.08)', borderRadius: 10, padding: '2px 8px', fontWeight: 600 }}>
                                  📐 {[it.length_ft && `L:${it.length_ft}ft`, it.width_ft && `W:${it.width_ft}ft`, it.height_ft && `H:${it.height_ft}ft`].filter(Boolean).join(' × ')}
                                </span>
                              )}
                            </div>
                            {it.specifications && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>{it.specifications}</div>}
                          </div>
                          <button onClick={() => saveToCatalog(it)} style={{ ...SEC_BTN, fontSize: 11, padding: '4px 10px', color: '#16a34a', borderColor: 'rgba(22,163,74,0.3)', flexShrink: 0, marginLeft: 12 }}>💾 Catalog</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DqbImageSearchModal ───────────────────────────────────────────────────────
function DqbImageSearchModal({ sectionName, onClose, onAddItem }) {
  const [files, setFiles]       = useState([]);
  const [selected, setSelected] = useState(0);
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef();

  const searchImages = async () => {
    if (files.length === 0) return;
    setSearching(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('file', f));
      fd.append('text_input', `Identify all hardware, sanitary fittings, CP fittings, tiles, plumbing products visible in these images for section: ${sectionName || 'General'}`);
      const r = await fetch('/api/design-quotes/scan', { method: 'POST', body: fd });
      const d = await r.json();
      const rooms = d?.extracted?.rooms || [];
      const items = rooms.flatMap(rm => (rm.items || []).map(it => ({ ...it, room_name: rm.room_name })));
      setResults(items);
    } catch {}
    finally { setSearching(false); }
  };

  return (
    <div style={MODAL_BG} onClick={onClose}>
      <div className="dqs-modal-scope" style={{ ...MODAL_BOX, maxWidth: 820, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 900, fontSize: 15 }}>📷 Search by Photo{sectionName ? ` — ${sectionName}` : ''}</span>
          <button onClick={onClose} style={CLOSE_BTN}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', gap: 16 }}>

          {/* Left: thumbnails */}
          <div style={{ width: 120, flexShrink: 0 }}>
            <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={e => { setFiles(Array.from(e.target.files)); setSelected(0); setResults([]); }} />
            <button onClick={() => fileRef.current.click()} style={{ ...SEC_BTN, width: '100%', marginBottom: 8 }}>+ Add Photos</button>
            {files.map((f, i) => (
              <div key={i} onClick={() => setSelected(i)} style={{ border: `2px solid ${selected === i ? '#14b8a6' : 'var(--border)'}`, borderRadius: 6, overflow: 'hidden', marginBottom: 6, cursor: 'pointer' }}>
                <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: 80, objectFit: 'cover' }} />
              </div>
            ))}
          </div>

          {/* Right: results */}
          <div style={{ flex: 1 }}>
            {files.length > 0 && (
              <button onClick={searchImages} disabled={searching} style={{ ...PRI_BTN, background: 'linear-gradient(135deg,#14b8a6,#0891b2)', marginBottom: 14, opacity: searching ? 0.6 : 1 }}>
                {searching ? '⏳ Searching…' : `🔍 Search All ${files.length} Image${files.length > 1 ? 's' : ''}`}
              </button>
            )}
            {files.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Add photos to identify hardware, sanitary ware, CP fittings, and tiles.</div>}
            {results.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{it.item_name}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    <ItemTypeBadge type={it.item_type} />
                    {it.inferred_hsn && <span style={{ fontSize: 10, color: '#6b7280', background: 'rgba(107,114,128,0.1)', borderRadius: 10, padding: '1px 7px' }}>HSN {it.inferred_hsn}</span>}
                  </div>
                  {it.specifications && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{it.specifications}</div>}
                </div>
                <button onClick={() => onAddItem(it, sectionName)} style={{ ...PRI_BTN, fontSize: 11, padding: '4px 12px', flexShrink: 0, marginLeft: 12 }}>+ Add</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ProposalFormModal ─────────────────────────────────────────────────────────
function ProposalFormModal({ proposal, onClose, onSaved }) {
  const isEdit = !!(proposal && proposal.id);
  const [form, setForm] = useState({
    client_name: '', client_phone: '', client_email: '', project_name: '',
    project_type: 'residential', typology: 'villa',
    plot_length: '', plot_width: '', plot_unit: 'feet', floors: 1,
    fee_model: 'percentage', fee_rate: 5.5, construction_cost: '',
    gst_pct: 18, validity_days: 30, notes: '', status: 'DRAFT',
    complexity: 'medium',
    ...(proposal ? { ...proposal } : {}),
  });
  const [saving, setSaving]     = useState(false);
  const [parsing, setParsing]   = useState(false);
  const [briefText, setBriefText] = useState('');
  const [showBrief, setShowBrief] = useState(false);
  const [areaCalc, setAreaCalc] = useState(null);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const calcAreas = async () => {
    if (!form.plot_length || !form.plot_width) return;
    try {
      const r = await fetch('/api/design-quotes/architect/calculate-areas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plot_length: +form.plot_length, plot_width: +form.plot_width, floors: +form.floors, typology: form.typology, plot_unit: form.plot_unit }),
      });
      setAreaCalc(await r.json());
    } catch {}
  };

  const parseBrief = async () => {
    if (!briefText.trim()) return;
    setParsing(true);
    try {
      const r = await fetch('/api/design-quotes/architect/parse-brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief_text: briefText }),
      });
      const d = await r.json();
      const p = d.parsed || {};
      setForm(f => ({
        ...f,
        project_type:  p.project_type  || f.project_type,
        typology:      p.typology       || f.typology,
        plot_length:   p.plot_length    || f.plot_length,
        plot_width:    p.plot_width     || f.plot_width,
        plot_unit:     p.plot_unit      || f.plot_unit,
        floors:        p.floors         || f.floors,
        fee_model:     p.fee_model_suggestion || f.fee_model,
        fee_rate:      p.suggested_fee_pct    || f.fee_rate,
        construction_cost: p.construction_budget || f.construction_cost,
        notes:         p.notes          || f.notes,
        complexity:    p.complexity     || f.complexity,
      }));
      setShowBrief(false); setBriefText('');
    } catch {}
    finally { setParsing(false); }
  };

  const totalFee = (() => {
    const fc = form.fee_model === 'percentage' ? (+form.construction_cost || 0) * ((+form.fee_rate || 0) / 100)
      : form.fee_model === 'per_sqft' ? (areaCalc?.builtup_area_sqft || 0) * (+form.fee_rate || 0)
      : (+form.fee_rate || 0);
    return Math.round(fc < 0 ? 0 : fc);
  })();
  const gstAmt = Math.round(totalFee * ((+form.gst_pct || 18) / 100));

  const save = async () => {
    if (!form.client_name.trim()) return alert('Client name is required');
    setSaving(true);
    try {
      const payload = { ...form, total_fee: totalFee, ...(areaCalc || {}) };
      const url    = isEdit ? `/api/design-quotes/architect/proposals/${proposal.id}` : '/api/design-quotes/architect/proposals';
      const method = isEdit ? 'PUT' : 'POST';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      onSaved();
    } catch { alert('Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div style={MODAL_BG} onClick={onClose}>
      <div className="dqs-modal-scope" style={{ ...MODAL_BOX, maxWidth: 780, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: isEdit ? 'linear-gradient(135deg,#1e3a5f 0%,#3730a3 100%)' : 'linear-gradient(135deg,#0f2744 0%,#6366f1 100%)', borderRadius: '14px 14px 0 0' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#ffffff' }}>{isEdit ? '✏️ Edit Architect Proposal' : '📐 New Architect Proposal'}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Fee % · Per Sqft · Lump Sum · Phase scheduling · SAC 998331 · GST 18%</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowBrief(true)} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.22)', color:'#ffffff', borderRadius:7, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:600 }}>🤖 Parse Brief</button>
            <button onClick={save} disabled={saving} style={{ ...PRI_BTN, background: 'linear-gradient(135deg,#6366f1,#818cf8)', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : '💾 Save'}</button>
            <button onClick={onClose} style={{ background:'rgba(220,38,38,0.2)', border:'1px solid rgba(220,38,38,0.4)', color:'#fca5a5', borderRadius:7, padding:'5px 10px', fontSize:13, cursor:'pointer', fontWeight:700 }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, background: '#f0fdfc' }}>
          {showBrief && (
            <div style={{ background: '#ffffff', border: '1px solid rgba(99,102,241,0.28)', borderRadius: 10, padding: 14, marginBottom: 14, boxShadow: '0 1px 3px rgba(13,27,46,0.05)' }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#4338ca', marginBottom: 8 }}>🤖 AI Architect Brief Parser</div>
              <textarea style={{ ...INP, height: 90 }} placeholder="Describe the project…" value={briefText} onChange={e => setBriefText(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={parseBrief} disabled={parsing} style={{ ...PRI_BTN, background: 'linear-gradient(135deg,#6366f1,#818cf8)', opacity: parsing ? 0.6 : 1 }}>{parsing ? 'Parsing…' : '⚡ Parse'}</button>
                <button onClick={() => setShowBrief(false)} style={SEC_BTN}>Cancel</button>
              </div>
            </div>
          )}

          <div style={FIELD_CARD}>
            <div style={SEC_HDR_PRP}>👤 Client &amp; Project Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div><label style={LBL}>Client Name *</label><input style={INP} value={form.client_name} onChange={e => setF('client_name', e.target.value)} /></div>
              <div><label style={LBL}>Phone</label><input style={INP} value={form.client_phone} onChange={e => setF('client_phone', e.target.value)} /></div>
              <div><label style={LBL}>Email</label><input style={INP} value={form.client_email} onChange={e => setF('client_email', e.target.value)} /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={LBL}>Project Name</label><input style={INP} value={form.project_name} onChange={e => setF('project_name', e.target.value)} /></div>
              <div><label style={LBL}>Project Type</label>
                <select style={SEL} value={form.project_type} onChange={e => setF('project_type', e.target.value)}>
                  {['residential','commercial','institutional','landscape','renovation','interior_only'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label style={LBL}>Typology</label>
                <select style={SEL} value={form.typology} onChange={e => setF('typology', e.target.value)}>
                  {['villa','row_house','apartment','duplex','office','retail','hotel','school','hospital','other'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label style={LBL}>Status</label>
                <select style={SEL} value={form.status} onChange={e => setF('status', e.target.value)}>
                  {Object.entries(P_STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Plot & Area */}
          <div style={FIELD_CARD}>
            <div style={SEC_HDR_PRP}>📐 Plot &amp; Area</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: areaCalc ? 12 : 0 }}>
              <div><label style={LBL}>Length</label><input style={INP} type="number" value={form.plot_length} onChange={e => setF('plot_length', e.target.value)} /></div>
              <div><label style={LBL}>Width</label><input style={INP} type="number" value={form.plot_width} onChange={e => setF('plot_width', e.target.value)} /></div>
              <div><label style={LBL}>Unit</label>
                <select style={SEL} value={form.plot_unit} onChange={e => setF('plot_unit', e.target.value)}>
                  <option>feet</option><option>meter</option>
                </select>
              </div>
              <div><label style={LBL}>Floors</label><input style={INP} type="number" value={form.floors} onChange={e => setF('floors', +e.target.value)} /></div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}><button onClick={calcAreas} style={{ ...SEC_BTN, width: '100%', borderColor: 'rgba(99,102,241,0.4)', color: '#4338ca', fontWeight: 700 }}>⚡ Calculate</button></div>
            </div>
            {areaCalc && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {[['Site Area', areaCalc.site_area_sqft], ['Built-Up', areaCalc.builtup_area_sqft], ['Carpet', areaCalc.carpet_area_sqft]].map(([l, v]) => (
                  <div key={l} style={{ background: 'rgba(99,102,241,0.07)', border: '1.5px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: 12, minWidth: 120 }}>
                    <div style={{ color: '#4338ca', fontWeight: 800, fontSize: 18 }}>{Number(v).toLocaleString('en-IN')}</div>
                    <div style={{ color: '#5e748a', marginTop: 2 }}>{l} (sqft)</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fee Structure */}
          <div style={FIELD_CARD}>
            <div style={SEC_HDR_PRP}>💰 Fee Structure</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 12 }}>
              <div><label style={LBL}>Fee Model</label>
                <select style={SEL} value={form.fee_model} onChange={e => setF('fee_model', e.target.value)}>
                  <option value="percentage">Percentage</option>
                  <option value="per_sqft">Per Sqft</option>
                  <option value="lump_sum">Lump Sum</option>
                </select>
              </div>
              <div><label style={LBL}>{form.fee_model === 'percentage' ? 'Fee %' : form.fee_model === 'per_sqft' ? '₹/sqft' : 'Amount ₹'}</label><input style={INP} type="number" value={form.fee_rate} onChange={e => setF('fee_rate', +e.target.value)} /></div>
              {form.fee_model === 'percentage' && <div><label style={LBL}>Construction Cost ₹</label><input style={INP} type="number" value={form.construction_cost} onChange={e => setF('construction_cost', e.target.value)} /></div>}
              <div><label style={LBL}>GST %</label><input style={INP} type="number" value={form.gst_pct} onChange={e => setF('gst_pct', +e.target.value)} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, fontSize: 13, background: '#e0fdf9', padding: '10px 14px', borderRadius: 8, border: '1px solid #ccfbf1' }}>
              <span style={{ color: '#5e748a' }}>Total Fee: <strong style={{ color: '#4338ca', fontSize: 14 }}>{fmtC(totalFee)}</strong></span>
              <span style={{ color: '#5e748a' }}>GST @{form.gst_pct}%: <strong style={{ color: '#0d1b2e' }}>{fmtC(gstAmt)}</strong></span>
              <span style={{ color: '#5e748a' }}>Payable: <strong style={{ fontSize: 16, color: '#4338ca' }}>{fmtC(totalFee + gstAmt)}</strong></span>
            </div>
          </div>

          {/* Validity, Complexity & Notes */}
          <div style={FIELD_CARD}>
            <div style={SEC_HDR_PRP}>⚙️ Settings &amp; Notes</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={LBL}>Validity (days)</label><input style={INP} type="number" value={form.validity_days} onChange={e => setF('validity_days', +e.target.value)} /></div>
              <div><label style={LBL}>Complexity</label>
                <select style={SEL} value={form.complexity} onChange={e => setF('complexity', e.target.value)}>
                  <option>simple</option><option>medium</option><option>complex</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}><label style={LBL}>Notes</label><textarea style={{ ...INP, height: 60 }} value={form.notes} onChange={e => setF('notes', e.target.value)} /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ProposalDetailModal (P0-3: SAC 998331 GST split on print) ─────────────────
function ProposalDetailModal({ proposal: initialProposal, onClose, onEdit, onStatusChange }) {
  const [proposal, setProposal] = useState(initialProposal);
  const [updating, setUpdating] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const handlePrint = () => {
    const p = proposal;
    const gstHalf = (p.gst_pct || 18) / 2;
    const feeWithGst = (p.total_fee || 0) * (1 + (p.gst_pct || 18) / 100);
    const cgst = (p.total_fee || 0) * (gstHalf / 100);
    const sgst = cgst;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${p.proposal_number}</title><style>
      body{font-family:Arial,sans-serif;color:#1f2937;margin:0;padding:20px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{padding:8px 10px;border:1px solid #e5e7eb;text-align:left}
      th{background:#eef2ff;font-weight:700}
      .stamp{border:3px solid #16a34a;color:#16a34a;font-size:26px;font-weight:900;padding:5px 16px;display:inline-block;transform:rotate(-8deg);letter-spacing:4px;margin:8px 0}
    </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:3px solid #6366f1;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:40px;height:40px;background:#6366f1;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:18px">IQ</div>
          <div><div style="font-weight:800;font-size:14px">InvenIQ — Design Studio</div><div style="font-size:11px;color:#6b7280">Architect Fee Proposal</div></div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:900;font-size:22px;color:#6366f1;letter-spacing:2px">FEE PROPOSAL</div>
          <div style="font-size:12px;color:#6b7280;line-height:1.9">
            <div>Proposal No. <strong style="color:#1f2937">${p.proposal_number}</strong></div>
            <div>Date <strong style="color:#1f2937">${p.created_at || '—'}</strong></div>
            <div>Valid Till <strong style="color:#1f2937">${p.valid_till || '—'}</strong></div>
          </div>
        </div>
      </div>
      ${p.status === 'APPROVED' ? '<div class="stamp">CLIENT APPROVED</div>' : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;font-size:13px">
        <div><div style="font-weight:700;font-size:11px;color:#6b7280;margin-bottom:5px">CLIENT</div>
          <div style="font-weight:700">${p.client_name}</div>
          <div style="color:#6b7280">${p.client_phone || ''} · ${p.client_email || ''}</div>
        </div>
        <div><div style="font-weight:700;font-size:11px;color:#6b7280;margin-bottom:5px">PROJECT</div>
          <div style="font-weight:700">${p.project_name || '—'}</div>
          <div style="color:#6b7280">${p.typology || ''} · ${p.floors || 1} floor(s)</div>
          <div style="color:#6b7280">Built-up: ${Number(p.builtup_area_sqft||0).toLocaleString('en-IN')} sqft</div>
        </div>
      </div>
      <table style="margin-bottom:20px"><thead>
        <tr><th>Phase</th><th style="text-align:center">%</th><th style="text-align:right">Fee (₹)</th><th>Due Date</th><th>Status</th></tr>
      </thead><tbody>
        ${(p.phases || []).map(ph => `<tr>
          <td>${ph.phase_name}</td>
          <td style="text-align:center">${ph.pct_of_total}%</td>
          <td style="text-align:right;font-weight:700">₹${Number(ph.fee_amount||0).toLocaleString('en-IN')}</td>
          <td>${ph.due_date || '—'}</td>
          <td>${ph.is_paid ? '<span style="color:#16a34a;font-weight:700">✓ Paid</span>' : '<span style="color:#d97706">Pending</span>'}</td>
        </tr>`).join('')}
      </tbody></table>
      <div style="margin-left:auto;width:300px;border:1px solid #e5e7eb;border-radius:8px;padding:16px;font-size:13px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Architect Fee</span><strong>₹${Number(p.total_fee||0).toLocaleString('en-IN')}</strong></div>
        <div style="display:flex;justify-content:space-between;color:#6b7280;margin-bottom:3px;font-size:12px"><span>CGST @${gstHalf}% (SAC 998331)</span><span>₹${Math.round(cgst).toLocaleString('en-IN')}</span></div>
        <div style="display:flex;justify-content:space-between;color:#6b7280;margin-bottom:8px;font-size:12px"><span>SGST @${gstHalf}% (SAC 998331)</span><span>₹${Math.round(sgst).toLocaleString('en-IN')}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;color:#6366f1;border-top:1px solid #e5e7eb;padding-top:8px"><span>Total Payable</span><span>₹${Math.round(feeWithGst).toLocaleString('en-IN')}</span></div>
        <div style="font-size:10px;color:#9ca3af;margin-top:4px">SAC 998331 — Architectural Services | GST @${p.gst_pct||18}%</div>
      </div>
      ${p.notes ? `<div style="margin-top:18px;font-size:12px;color:#6b7280"><strong>Notes:</strong> ${p.notes}</div>` : ''}
    </body></html>`);
    w.document.close(); w.print();
  };

  const updateStatus = async (newStatus) => {
    setUpdating(true);
    try {
      await fetch(`/api/design-quotes/architect/proposals/${proposal.id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setProposal(p => ({ ...p, status: newStatus }));
      onStatusChange(proposal.id, newStatus);
    } finally { setUpdating(false); }
  };

  const shareWhatsApp = () => {
    const text = `*Architect Fee Proposal — ${proposal.proposal_number}*\nInvenIQ Design Studio\n\n*Client:* ${proposal.client_name}\n*Project:* ${proposal.project_name || '—'}\n*Type:* ${proposal.typology || '—'}\n\n*Total Fee (excl. GST):* ₹${Number(proposal.total_fee||0).toLocaleString('en-IN')}\n*GST @${proposal.gst_pct||18}%:* ₹${Math.round((proposal.total_fee||0)*(proposal.gst_pct||18)/100).toLocaleString('en-IN')}\n\nSAC 998331 — Architectural Services\n\nPlease review and confirm.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const gstHalf = (proposal.gst_pct || 18) / 2;
  const cgst    = (proposal.total_fee || 0) * (gstHalf / 100);
  const totalPayable = (proposal.total_fee || 0) * (1 + (proposal.gst_pct || 18) / 100);

  return (
    <div style={MODAL_BG} onClick={onClose}>
      <div className="dqs-modal-scope" style={{ ...MODAL_BOX, maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 16, fontFamily:"'Plus Jakarta Sans','Inter',-apple-system,sans-serif" }}>{proposal.proposal_number}</span>
            <StatusBadge status={proposal.status} cfg={P_STATUS} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {proposal.client_name}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {proposal.status === 'DRAFT' && <button onClick={() => updateStatus('SENT')} disabled={updating} style={{ ...SEC_BTN, color: '#d97706', borderColor: 'rgba(217,119,6,0.4)', fontWeight: 700 }}>📤 Send for Approval</button>}
            {proposal.status === 'SENT'  && <button onClick={() => updateStatus('APPROVED')} disabled={updating} style={{ ...SEC_BTN, color: '#16a34a', borderColor: 'rgba(22,163,74,0.4)', fontWeight: 700 }}>✅ Mark Approved</button>}
            {proposal.status === 'APPROVED' && <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 6, padding: '4px 10px' }}>✅ Client Approved</span>}
            <button onClick={shareWhatsApp} style={{ ...SEC_BTN, color: '#16a34a', borderColor: 'rgba(37,211,102,0.4)', fontWeight: 700 }}>📱 WhatsApp</button>
            <button onClick={handlePrint} style={{ ...SEC_BTN, color: '#6366f1', borderColor: 'rgba(99,102,241,0.4)' }}>🖨 Print</button>
            <button onClick={() => setShowEmail(true)} style={{ ...SEC_BTN, color: '#0891b2', borderColor: 'rgba(8,145,178,0.4)' }}>📧 Email</button>
            <button onClick={onEdit} style={SEC_BTN}>✏️ Edit</button>
            <button onClick={onClose} style={CLOSE_BTN}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20, fontSize: 13 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>CLIENT</div>
              <div style={{ fontWeight: 700 }}>{proposal.client_name}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{proposal.client_phone}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{proposal.client_email}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>PROJECT</div>
              <div style={{ fontWeight: 700 }}>{proposal.project_name || '—'}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{proposal.typology} · {proposal.floors} floor(s)</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Built-up: {Number(proposal.builtup_area_sqft || 0).toLocaleString('en-IN')} sqft</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>FEE</div>
              <div style={{ fontWeight: 900, fontSize: 18, color: '#6366f1' }}>{fmtC(proposal.total_fee)}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Excl. GST @{proposal.gst_pct || 18}%</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Valid: {proposal.valid_till || '—'}</div>
            </div>
          </div>

          {/* Phase schedule */}
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>Payment Schedule</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['Phase','%','Fee','Due Date','Status'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Fee' ? 'right' : 'left', color: 'var(--muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(proposal.phases || []).map((ph, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{ph.phase_name}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{ph.pct_of_total}%</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtC(ph.fee_amount)}</td>
                  <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted)' }}>{ph.due_date || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ph.is_paid ? '#16a34a' : '#d97706' }}>{ph.is_paid ? '✓ Paid' : 'Pending'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* GST summary — P0-3 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, minWidth: 280 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span>Architect Fee</span><strong>{fmtC(proposal.total_fee)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 3 }}>
                <span>CGST @{gstHalf}% <span style={{ fontSize: 10 }}>(SAC 998331)</span></span><span>{fmtC(cgst)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                <span>SGST @{gstHalf}% <span style={{ fontSize: 10 }}>(SAC 998331)</span></span><span>{fmtC(cgst)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 900, color: '#6366f1', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <span>Total Payable</span><span>{fmtC(totalPayable)}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>SAC 998331 — Architectural Services | GST Registration mandatory above ₹20L</div>
            </div>
          </div>

          {proposal.notes && <div style={{ marginTop: 14, fontSize: 12, color: 'var(--muted)', background: 'var(--bg)', borderRadius: 8, padding: 10, border: '1px solid var(--border)' }}>{proposal.notes}</div>}
        </div>

        {showEmail && <EmailModal quoteId={proposal.id} isProposal={true} defaultEmail={proposal.client_email} defaultName={proposal.client_name} quoteNumber={proposal.proposal_number} onClose={() => setShowEmail(false)} />}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DesignQuoteBuilder({ onGoChat, dbStatus, currentUser }) {
  const [tab, setTab]             = useState('quotes');
  const [quotes, setQuotes]       = useState([]);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dataSource, setDataSource]     = useState('demo');
  const [showForm, setShowForm]         = useState(false);
  const [editQuote, setEditQuote]       = useState(null);
  const [viewQuote, setViewQuote]       = useState(null);
  const [showScanner, setShowScanner]   = useState(false);
  const [showProposalForm, setShowProposalForm]   = useState(false);
  const [editProposal, setEditProposal]           = useState(null);
  const [viewProposal, setViewProposal]           = useState(null);
  const [mergeMode, setMergeMode]                 = useState(false);
  const [mergeIds, setMergeIds]                   = useState([]);
  const [pendingApprovals, setPendingApprovals]   = useState([]);
  const [sortBy,  setSortBy]  = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [dateFilter, setDateFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [qbHeroSync, setQbHeroSync] = useState(null);

  const fetchQuotes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const r = await fetch(`/api/design-quotes?${params}`);
      const d = await r.json();
      setQuotes(d.quotes || []);
      setDataSource(d.data_source || 'demo');
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, [statusFilter, search]);

  const fetchProposals = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const r = await fetch(`/api/design-quotes/architect/proposals?${params}`);
      const d = await r.json();
      setProposals(d.proposals || []);
      setDataSource(d.data_source || 'demo');
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, [statusFilter, search]);

  useEffect(() => { setLoading(true); if (tab === 'quotes') fetchQuotes(); else fetchProposals(); }, [tab, fetchQuotes, fetchProposals]);

  useEffect(() => {
    const role = currentUser?.role;
    if (!role || !['sales_manager','cfo','admin'].includes(role)) return;
    fetch('/api/design-quotes/pending-approvals')
      .then(r => r.json()).then(d => setPendingApprovals(d.quotes || [])).catch(() => {});
  }, [currentUser]);

  // ── QB→DQS pending sync detection ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem('inveniq_qb_to_dqb');
      if (!raw) return;
      const stored = JSON.parse(raw);
      const ageMin = Math.round((Date.now() - stored.ts) / 60000);
      if (ageMin <= 30) setQbHeroSync({ count: (stored.items||[]).length, ageMin, stored });
    } catch {}
  }, []);

  // ── Inline approval action (from list row) ──
  const handleInlineApproval = useCallback(async (quoteId, action) => {
    let notes = '';
    if (action === 'REJECT') {
      const reason = window.prompt('Reason for returning to draft (optional):');
      if (reason === null) return; // user cancelled
      notes = reason.trim();
    }
    try {
      const r = await fetch(`/api/design-quotes/${quoteId}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(notes ? { notes } : {}) }),
      });
      const d = await r.json();
      if (r.ok) {
        const newStatus = d.new_status || d.status;
        setQuotes(qs => qs.map(q => q.id === quoteId ? { ...q, status: newStatus } : q));
        setPendingApprovals(pa => pa.filter(q => q.id !== quoteId));
      } else { alert(d.detail || 'Action failed.'); }
    } catch { alert('Network error — please retry.'); }
  }, []);

  // ── Client-side sort + archive + date filter ──
  const displayQuotes = useMemo(() => {
    let arr = [...quotes];
    if (!showArchived) arr = arr.filter(q => !['COMPLETED','CANCELLED'].includes(q.status));
    if (dateFilter) {
      const cutoff = new Date();
      if (dateFilter === '7d') cutoff.setDate(cutoff.getDate() - 7);
      else if (dateFilter === '30d') cutoff.setDate(cutoff.getDate() - 30);
      arr = arr.filter(q => !q.created_at || new Date(q.created_at) >= cutoff);
    }
    return [...arr].sort((a, b) => {
      let av = a[sortBy], bv = b[sortBy];
      if (sortBy === 'created_at' || sortBy === 'valid_till') { av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0; }
      else if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv||'').toLowerCase(); }
      else { av = av ?? 0; bv = bv ?? 0; }
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [quotes, sortBy, sortDir, dateFilter, showArchived]);

  const displayProposals = useMemo(() => {
    let arr = [...proposals];
    if (!showArchived) arr = arr.filter(p => !['COMPLETED','CANCELLED'].includes(p.status));
    if (dateFilter) {
      const cutoff = new Date();
      if (dateFilter === '7d') cutoff.setDate(cutoff.getDate() - 7);
      else if (dateFilter === '30d') cutoff.setDate(cutoff.getDate() - 30);
      arr = arr.filter(p => !p.created_at || new Date(p.created_at) >= cutoff);
    }
    return [...arr].sort((a, b) => {
      let av = a[sortBy], bv = b[sortBy];
      if (sortBy === 'created_at' || sortBy === 'valid_till') { av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0; }
      else if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv||'').toLowerCase(); }
      else { av = av ?? 0; bv = bv ?? 0; }
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [proposals, sortBy, sortDir, dateFilter, showArchived]);

  const deleteQuote = async (id) => {
    if (!window.confirm('Delete this quote?')) return;
    await fetch(`/api/design-quotes/${id}`, { method: 'DELETE' });
    fetchQuotes();
  };

  const cloneQuote = async (id) => {
    const r = await fetch(`/api/design-quotes/${id}/clone`, { method: 'POST' });
    const d = await r.json();
    setEditQuote({ ...d, id: null });
    setShowForm(true);
  };

  const doMerge = async () => {
    if (mergeIds.length < 2) return alert('Select at least 2 quotes to merge.');
    await fetch('/api/design-quotes/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote_ids: mergeIds }) });
    setMergeMode(false); setMergeIds([]);
    fetchQuotes();
  };

  // KPI computations
  const totalValue  = quotes.reduce((s, q) => s + Number(q.grand_total || 0), 0);
  const wonValue    = quotes.filter(q => q.status === 'APPROVED').reduce((s, q) => s + Number(q.grand_total || 0), 0);
  const activeCount = quotes.filter(q => !['CANCELLED','COMPLETED'].includes(q.status)).length;
  const expiredCount = quotes.filter(q => q.valid_till && new Date(q.valid_till) < new Date() && !['APPROVED','COMPLETED','CANCELLED'].includes(q.status)).length;

  const totalFees    = proposals.reduce((s, p) => s + Number(p.total_fee || 0), 0);
  const activeProps  = proposals.filter(p => !['CANCELLED','COMPLETED'].includes(p.status)).length;
  const approvedFees = proposals.filter(p => p.status === 'APPROVED').reduce((s, p) => s + Number(p.total_fee || 0), 0);

  if (loading) return <SkeletonView />;

  // client initials avatar
  const avatar = (name) => {
    const parts = (name || '?').trim().split(' ');
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>

      {/* ══ HERO ══ */}
      <div style={{ background:'linear-gradient(160deg,#042f2e 0%,#011f1e 100%)', padding:'36px 40px 0', position:'relative', overflow:'hidden' }}>

        {/* Single large ambient glow — top right */}
        <div style={{ position:'absolute',top:-160,right:-160,width:600,height:600,borderRadius:'50%',background:'radial-gradient(circle at center,rgba(13,148,136,0.28) 0%,rgba(13,148,136,0.08) 40%,transparent 70%)',pointerEvents:'none' }} />
        {/* Subtle bottom-left counter-glow */}
        <div style={{ position:'absolute',bottom:-80,left:-60,width:360,height:360,borderRadius:'50%',background:'radial-gradient(circle at center,rgba(20,184,166,0.1) 0%,transparent 65%)',pointerEvents:'none' }} />
        {/* Fine dot grid */}
        <div style={{ position:'absolute',inset:0,backgroundImage:'radial-gradient(rgba(13,148,136,0.12) 1px,transparent 1px)',backgroundSize:'28px 28px',pointerEvents:'none' }} />

        {/* ── Title row ── */}
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:16,position:'relative',zIndex:1 }}>
          <div style={{ display:'flex',alignItems:'center',gap:18 }}>
            {/* Icon mark */}
            <div style={{ width:58,height:58,borderRadius:16,background:'rgba(13,148,136,0.15)',border:'1px solid rgba(13,148,136,0.35)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,flexShrink:0,boxShadow:'0 0 0 1px rgba(13,148,136,0.1), 0 8px 32px rgba(109,40,217,0.4)' }}>🎨</div>
            <div>
              <div style={{ fontSize:30,fontWeight:900,color:'#ffffff',letterSpacing:'-1px',lineHeight:1,marginBottom:6,fontFamily:"'Plus Jakarta Sans','Inter',-apple-system,sans-serif" }}>Design Quote Studio</div>
              <div style={{ fontSize:12,color:'rgba(255,255,255,0.46)',letterSpacing:0.5,fontWeight:500,fontFamily:"'Inter',-apple-system,sans-serif" }}>Interior Fit-Out BOQ &nbsp;·&nbsp; Architect Fee Proposals &nbsp;·&nbsp; GST-Ready Prints</div>
              <div style={{ display:'flex',alignItems:'center',gap:10,marginTop:8 }}>
                <DataSourceBadge source={dataSource} />
                <span style={{ fontSize:10,color:'rgba(13,148,136,0.7)',fontWeight:700,letterSpacing:0.6,background:'rgba(13,148,136,0.12)',padding:'2px 8px',borderRadius:20,border:'1px solid rgba(13,148,136,0.25)' }}>SAC 998331 · GST 18%</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',paddingTop:4 }}>
            {tab === 'quotes' && (mergeMode ? (
              <>
                <span style={{ fontSize:11,color:'rgba(255,255,255,0.7)',background:'rgba(255,255,255,0.07)',padding:'5px 14px',borderRadius:20,fontWeight:700,border:'1px solid rgba(255,255,255,0.12)' }}>{mergeIds.length} selected</span>
                <button onClick={doMerge} style={{ background:'linear-gradient(135deg,#0ea5e9,#0284c7)',color:'#fff',border:'none',borderRadius:9,padding:'9px 20px',fontSize:12,cursor:'pointer',fontWeight:700,boxShadow:'0 4px 14px rgba(14,165,233,0.4)' }}>🔀 Merge</button>
                <button onClick={() => { setMergeMode(false); setMergeIds([]); }} style={{ background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:9,padding:'9px 16px',fontSize:12,cursor:'pointer' }}>Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => setShowScanner(true)} style={{ background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.75)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:9,padding:'9px 16px',fontSize:12,cursor:'pointer',fontWeight:600 }}>📱 WhatsApp Scan</button>
                <button onClick={() => setMergeMode(true)} style={{ background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.75)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:9,padding:'9px 16px',fontSize:12,cursor:'pointer',fontWeight:600 }}>🔀 Merge</button>
                <button onClick={() => { setEditQuote(null); setShowForm(true); }} style={{ background:'#0d9488',color:'#fff',border:'none',borderRadius:9,padding:'10px 24px',fontSize:13,cursor:'pointer',fontWeight:800,boxShadow:'0 4px 20px rgba(13,148,136,0.55)',letterSpacing:'-0.2px' }}>+ New Quote</button>
              </>
            ))}
            {tab === 'proposals' && (
              <button onClick={() => { setEditProposal(null); setShowProposalForm(true); }} style={{ background:'#0d9488',color:'#fff',border:'none',borderRadius:9,padding:'10px 24px',fontSize:13,cursor:'pointer',fontWeight:800,boxShadow:'0 4px 20px rgba(13,148,136,0.55)',letterSpacing:'-0.2px' }}>+ New Proposal</button>
            )}
          </div>
        </div>

        {/* ── AI strip ── */}
        {onGoChat && (
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginTop:20,background:'rgba(13,148,136,0.07)',border:'1px solid rgba(13,148,136,0.18)',borderRadius:10,padding:'10px 18px',position:'relative',zIndex:1,flexWrap:'wrap' }}>
            <div style={{ display:'flex',alignItems:'center',gap:10 }}>
              <div style={{ width:30,height:30,borderRadius:8,background:'rgba(13,148,136,0.2)',border:'1px solid rgba(13,148,136,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0 }}>🎨</div>
              <div>
                <div style={{ fontSize:12,fontWeight:700,color:'#ffffff',letterSpacing:'-0.1px' }}>Design Intelligence Active</div>
                <div style={{ fontSize:10.5,color:'rgba(255,255,255,0.45)',marginTop:2 }}>
                  {tab === 'quotes'
                    ? <>Pipeline: <strong style={{ color:'#5eead4' }}>{fmtC(totalValue)}</strong> · Won: <strong style={{ color:'#34d399' }}>{fmtC(wonValue)}</strong> · {activeCount} active</>
                    : <>Total fees: <strong style={{ color:'#5eead4' }}>{fmtC(totalFees)}</strong> · Approved: <strong style={{ color:'#34d399' }}>{fmtC(approvedFees)}</strong> · {activeProps} active</>}
                </div>
              </div>
            </div>
            <div style={{ display:'flex',gap:6,flexShrink:0,flexWrap:'wrap' }}>
              {(tab === 'quotes' ? [
                ['📊 Pipeline Analysis', 'Analyse my interior design quote pipeline — win rates, average deal size, top clients, and which projects are most likely to close this month.'],
                ['⏰ Expiry Follow-ups',  'Which design quotations are expiring soon? For each, suggest the best follow-up strategy to convert or extend before they expire.'],
                ['💰 Pricing Strategy',  'Based on my won and lost interior design quotations, what is the optimal pricing strategy by project type and client segment?'],
                ['📐 BOQ Estimator',     'Help me estimate a complete BOQ for a typical 2BHK interior fit-out — room-wise material breakdown with quantities and market rates.'],
              ] : [
                ['📋 Approval Status',   'Which architect fee proposals are awaiting approval? Summarise each with client, scope, fee amount, and days pending.'],
                ['📐 Phase Payments',    'Analyse my architect fee proposals — which phases are pending payment, and what is the total outstanding fee across all projects?'],
                ['💼 Fee Benchmarking',  'How do my architect fees compare to industry benchmarks for residential and commercial fit-out projects?'],
                ['🤖 Draft Proposal',   'Help me draft a professional architect fee proposal for a commercial office fit-out of 5000 sqft with full design and execution oversight.'],
              ]).map(([lbl, q]) => (
                <button key={lbl} onClick={() => onGoChat(q)} style={{ background:'rgba(13,148,136,0.12)',color:'rgba(255,255,255,0.8)',border:'1px solid rgba(13,148,136,0.22)',borderRadius:8,padding:'5px 12px',fontSize:11,cursor:'pointer',fontWeight:600,whiteSpace:'nowrap',transition:'all 0.12s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(13,148,136,0.22)';e.currentTarget.style.color='#ffffff';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='rgba(13,148,136,0.12)';e.currentTarget.style.color='rgba(255,255,255,0.8)';}}>{lbl}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── QB→DQS pending sync banner ── */}
        {qbHeroSync && tab === 'quotes' && (
          <div style={{ marginTop:12, background:'rgba(217,119,6,0.08)', border:'1px solid rgba(217,119,6,0.3)', borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', gap:12, position:'relative', zIndex:1, flexWrap:'wrap' }}>
            <span style={{ fontSize:18 }}>🔗</span>
            <div style={{ flex:1 }}>
              <span style={{ fontWeight:800, fontSize:12, color:'#d97706' }}>{qbHeroSync.count} item{qbHeroSync.count!==1?'s':''} from Quote Builder</span>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginLeft:8 }}>({qbHeroSync.ageMin} min ago) · Ready to import into a new quotation</span>
            </div>
            <button onClick={() => { setEditQuote(null); setShowForm(true); }}
              style={{ fontSize:11, fontWeight:700, color:'#d97706', background:'rgba(217,119,6,0.12)', border:'1px solid rgba(217,119,6,0.35)', borderRadius:7, padding:'5px 14px', cursor:'pointer', whiteSpace:'nowrap' }}>
              📥 Open in New Quote →
            </button>
            <button onClick={() => { localStorage.removeItem('inveniq_qb_to_dqb'); setQbHeroSync(null); }}
              style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', fontSize:16, lineHeight:1, padding:4 }}>✕</button>
          </div>
        )}

        {/* ── KPI strip ── */}
        <div style={{ display:'grid',gridTemplateColumns:tab==='quotes'?'repeat(5,1fr)':'repeat(4,1fr)',gap:10,marginTop:16,position:'relative',zIndex:1 }}>
          {(tab === 'quotes' ? [
            { icon:'💰', label:'Pipeline',      value:fmtC(totalValue),  sub:'total quoted',     top:'#0d9488', q:'Analyse my interior design quote pipeline — total value, deal stages, and top clients by project value.' },
            { icon:'✅', label:'Won / Approved', value:fmtC(wonValue),    sub:'confirmed value',  top:'#34d399', q:'Show all won and approved interior design quotations. What is my win rate and average deal size?' },
            { icon:'📋', label:'Active',         value:activeCount,        sub:'open quotes',      top:'#14b8a6', q:'List all active interior design quotations with client, project value, status, and days since creation.' },
            { icon:'⏰', label:'Expiring',       value:expiredCount,       sub:'need attention',   top:expiredCount>0?'#fb7185':'#14b8a6', q:'Which interior design quotations are expiring or have expired? For each, suggest the best follow-up action.' },
            { icon:'📁', label:'Total Quotes',   value:quotes.length,      sub:'all time',         top:'#0d9488', q:'Give me a complete summary of all my design quotations — status breakdown, monthly trend, and average deal size.' },
          ] : [
            { icon:'💼', label:'Total Fees',    value:fmtC(totalFees),    sub:'total pipeline',  top:'#0d9488', q:'What is my total architect fee pipeline? Break down by project type, status, and fee range.' },
            { icon:'✅', label:'Approved Fees', value:fmtC(approvedFees), sub:'won value',        top:'#34d399', q:'Which architect fee proposals have been approved? What is the total approved value and which phases are pending payment?' },
            { icon:'📐', label:'Active',        value:activeProps,         sub:'open proposals',  top:'#14b8a6', q:'List all active architect fee proposals with client, project name, total fee, and payment completion status.' },
            { icon:'📁', label:'Total',         value:proposals.length,    sub:'all proposals',   top:'#0d9488', q:'Give me a complete overview of all architect fee proposals — status distribution, average fee, and revenue collected.' },
          ]).map(k => (
            <div key={k.label} onClick={() => onGoChat && onGoChat(k.q)} style={{ background:'rgba(255,255,255,0.04)',borderRadius:'12px 12px 0 0',padding:'16px 18px',borderTop:`2.5px solid ${k.top}`,borderLeft:'1px solid rgba(255,255,255,0.07)',borderRight:'1px solid rgba(255,255,255,0.07)',borderBottom:'none',cursor:'pointer',transition:'background 0.12s' }} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'}>
              <div style={{ display:'flex',alignItems:'center',gap:5,marginBottom:8 }}>
                <span style={{ fontSize:13 }}>{k.icon}</span>
                <span style={{ fontSize:9,color:'rgba(255,255,255,0.38)',fontWeight:700,textTransform:'uppercase',letterSpacing:1.2 }}>{k.label}</span>
              </div>
              <div style={{ fontSize:22,fontWeight:900,color:'#f5f3ff',lineHeight:1,letterSpacing:'-0.8px',fontFamily:"'Plus Jakarta Sans','JetBrains Mono',monospace" }}>{k.value}</div>
              <div style={{ fontSize:10,color:'rgba(255,255,255,0.3)',marginTop:5,letterSpacing:0.3,fontFamily:"'Inter',-apple-system,sans-serif" }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display:'flex',gap:2,marginTop:10,position:'relative',zIndex:1 }}>
          {[
            ['quotes',    '🏠 Interior Quotations', quotes.length],
            ['proposals', '📐 Architect Proposals',  proposals.length],
          ].map(([t,lbl,cnt]) => (
            <button key={t} onClick={() => { setTab(t); setStatusFilter(''); setSearch(''); if (['grand_total','total_fee'].includes(sortBy)) setSortBy('created_at'); }} style={{
              background: tab===t ? 'var(--card)' : 'transparent',
              color: tab===t ? '#0d9488' : 'rgba(255,255,255,0.45)',
              border: tab===t ? '1px solid var(--border)' : '1px solid transparent',
              borderBottom: tab===t ? '1px solid var(--card)' : 'none',
              borderRadius:'10px 10px 0 0', padding:'10px 26px', fontSize:13, fontWeight:700,
              cursor:'pointer', marginRight:2, letterSpacing:'-0.1px', display:'flex', alignItems:'center', gap:8,
            }}>
              {lbl}
              {cnt > 0 && <span style={{ fontSize:10, fontWeight:800, padding:'1px 7px', borderRadius:20, background: tab===t ? 'rgba(13,148,136,0.15)' : 'rgba(255,255,255,0.08)', color: tab===t ? '#0d9488' : 'rgba(255,255,255,0.4)', lineHeight:'16px', minWidth:20, textAlign:'center' }}>{cnt}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ══ BODY ══ */}
      <div className="dqs-content" style={{ padding:'0 40px 40px', background:'#f0fdfc', borderLeft:'1px solid #ccfbf1', borderRight:'1px solid #ccfbf1', borderBottom:'1px solid #ccfbf1', marginBottom:24 }}>

        {/* Toolbar */}
        <div style={{ display:'flex',gap:10,alignItems:'center',padding:'14px 0',borderBottom:'1px solid var(--border)',flexWrap:'wrap' }}>
          <div style={{ position:'relative',flex:'1 1 220px',maxWidth:280 }}>
            <span style={{ position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--muted)',fontSize:13,pointerEvents:'none' }}>🔍</span>
            <input style={{ ...INP,paddingLeft:34,fontSize:12.5,borderRadius:8,background:'#ffffff',border:'1.5px solid #ccfbf1',color:'#0d1b2e' }} placeholder={tab==='quotes'?'Search client, project, quote#…':'Search client, project, proposal#…'} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {/* Status filter pills */}
          <div style={{ display:'flex',gap:5,flexWrap:'wrap' }}>
            {[['','All'],...Object.entries(tab==='quotes'?Q_STATUS:P_STATUS).map(([k,v])=>[k,v.label])].map(([k,lbl]) => {
              const v=(tab==='quotes'?Q_STATUS:P_STATUS)[k]||{};
              const on=statusFilter===k;
              return (
                <button key={k} onClick={() => setStatusFilter(on?'':k)} style={{ fontSize:11.5,fontWeight:700,padding:'5px 14px',borderRadius:20,cursor:'pointer',transition:'all 0.12s', border:on?`1.5px solid ${v.color||'#0d9488'}`:'1.5px solid var(--border)', background:on?(v.bg||'rgba(13,148,136,0.1)'):'transparent', color:on?(v.color||'#0d9488'):'var(--muted)' }}>
                  {lbl}
                </button>
              );
            })}
          </div>
          {/* Date filter pills */}
          <div style={{ display:'flex',gap:4,alignItems:'center',flexShrink:0 }}>
            {[['7d','7d'],['30d','30d']].map(([v,lbl]) => (
              <button key={v} onClick={() => setDateFilter(dateFilter===v?'':v)}
                style={{ padding:'4px 10px', fontSize:11, fontWeight:700, borderRadius:20, cursor:'pointer', background: dateFilter===v?'rgba(13,148,136,0.12)':'transparent', color: dateFilter===v?'#0d9488':'var(--muted)', border: dateFilter===v?'1.5px solid rgba(13,148,136,0.4)':'1.5px solid var(--border)' }}>
                {lbl}
              </button>
            ))}
          </div>
          {/* Sort control */}
          <select value={`${sortBy}:${sortDir}`} onChange={e => { const [col,dir]=e.target.value.split(':'); setSortBy(col); setSortDir(dir); }}
            style={{ fontSize:11.5, fontWeight:600, border:'1.5px solid var(--border)', borderRadius:8, padding:'5px 10px', background:'#ffffff', color:'var(--muted)', cursor:'pointer', flexShrink:0 }}>
            <option value="created_at:desc">Date ↓</option>
            <option value="created_at:asc">Date ↑</option>
            <option value={tab === 'proposals' ? 'total_fee:desc' : 'grand_total:desc'}>Value ↓</option>
            <option value={tab === 'proposals' ? 'total_fee:asc' : 'grand_total:asc'}>Value ↑</option>
            <option value="client_name:asc">Client A–Z</option>
            <option value="status:asc">Status</option>
          </select>
          {/* Archive toggle */}
          <button onClick={() => setShowArchived(v => !v)}
            style={{ fontSize:11, fontWeight:700, padding:'5px 10px', borderRadius:8, cursor:'pointer', background: showArchived?'rgba(107,114,128,0.1)':'transparent', color: showArchived?'#6b7280':'var(--muted)', border: showArchived?'1.5px solid rgba(107,114,128,0.4)':'1.5px solid var(--border)', flexShrink:0, whiteSpace:'nowrap' }}
            title={showArchived?'Hide completed/cancelled':'Show completed/cancelled'}>
            {showArchived ? '📂 Incl. Archived' : '📁 Active Only'}
          </button>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <span style={{ fontSize:11,color:'var(--muted)',fontWeight:600,whiteSpace:'nowrap' }}>
              {tab==='quotes'?`${displayQuotes.length} quote${displayQuotes.length!==1?'s':''}`:`${displayProposals.length} proposal${displayProposals.length!==1?'s':''}`}
            </span>
            <ExportButton
              rows={tab==='quotes' ? displayQuotes : displayProposals}
              filename={tab==='quotes' ? 'interior_quotations' : 'architect_proposals'}
              columns={tab==='quotes' ? [
                { key:'quote_number', label:'Quote #' }, { key:'client_name', label:'Client' },
                { key:'project_name', label:'Project' }, { key:'grand_total',  label:'Value (₹)' },
                { key:'status',       label:'Status'  }, { key:'valid_till',   label:'Valid Till' },
                { key:'created_at',   label:'Created'  },
              ] : [
                { key:'proposal_number', label:'Proposal #' }, { key:'client_name', label:'Client' },
                { key:'project_name',    label:'Project'    }, { key:'total_fee',    label:'Total Fee (₹)' },
                { key:'status',          label:'Status'     }, { key:'valid_till',   label:'Valid Till' },
                { key:'created_at',      label:'Created'    },
              ]}
            />
          </div>
        </div>

        {/* ── Pending approvals banner (managers only) ── */}
        {pendingApprovals.length > 0 && tab === 'quotes' && (
          <div style={{ margin: '10px 0 2px', background: 'rgba(217,119,6,0.06)', border: '1.5px solid rgba(217,119,6,0.3)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18 }}>⏳</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: '#d97706' }}>
                {pendingApprovals.length} quote{pendingApprovals.length !== 1 ? 's' : ''} awaiting your approval
              </span>
              <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
                {pendingApprovals.map(q => q.quote_number).join(', ')}
              </span>
            </div>
            <button onClick={() => {
              const role = currentUser?.role;
              if (role === 'cfo') setStatusFilter('PENDING_L2');
              else if (role === 'admin') setStatusFilter('');
              else setStatusFilter('PENDING_L1');
            }} style={{ fontSize: 12, fontWeight: 700, color: '#d97706', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.35)', borderRadius: 7, padding: '5px 14px', cursor: 'pointer' }}>
              View Pending →
            </button>
          </div>
        )}

        {/* ── Quotes list ── */}
        {tab === 'quotes' && (
          <>
            {displayQuotes.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 20px' }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🎨</div>
                <div style={{ fontWeight:800, fontSize:16, marginBottom:6 }}>No quotations yet</div>
                <div style={{ color:'var(--muted)', fontSize:13, marginBottom:20 }}>Create your first interior design BOQ or scan a WhatsApp message to get started.</div>
                <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
                  <button onClick={() => { setEditQuote(null); setShowForm(true); }} style={PRI_BTN}>+ New Quote</button>
                  <button onClick={() => setShowScanner(true)} style={{ ...SEC_BTN, color:'#0891b2', borderColor:'rgba(8,145,178,0.4)' }}>📱 WhatsApp Scan</button>
                </div>
              </div>
            ) : (
              <>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'linear-gradient(135deg,#042f2e 0%,#011f1e 100%)' }}>
                    {mergeMode && <th style={{ padding:'11px 10px', width:36 }}></th>}
                    <th style={{ padding:'11px 14px', textAlign:'left', fontWeight:700, color:'rgba(255,255,255,0.65)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Quote</th>
                    <th style={{ padding:'11px 14px', textAlign:'left', fontWeight:700, color:'rgba(255,255,255,0.65)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Client & Project</th>
                    <th style={{ padding:'11px 14px', textAlign:'left', fontWeight:700, color:'rgba(255,255,255,0.65)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Status</th>
                    <th style={{ padding:'11px 14px', textAlign:'right', fontWeight:700, color:'rgba(255,255,255,0.65)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Value</th>
                    <th style={{ padding:'11px 14px', textAlign:'center', fontWeight:700, color:'rgba(255,255,255,0.65)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Validity</th>
                    <th style={{ padding:'11px 14px', textAlign:'center', fontWeight:700, color:'rgba(255,255,255,0.65)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Rooms</th>
                    <th style={{ padding:'11px 14px', width:140 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {displayQuotes.map(q => {
                    const expired = q.valid_till && new Date(q.valid_till) < new Date() && !['APPROVED','COMPLETED','CANCELLED'].includes(q.status);
                    const sc = Q_STATUS[q.status] || Q_STATUS.DRAFT;
                    const daysSince = q.created_at ? Math.floor((new Date() - new Date(q.created_at)) / 86400000) : null;
                    const ageStyle = daysSince === null ? null :
                      daysSince <= 2  ? { bg:'rgba(22,163,74,.1)',  tc:'#16a34a', bc:'rgba(22,163,74,.25)',  lbl:'NEW' } :
                      daysSince <= 7  ? { bg:'rgba(13,148,136,.1)', tc:'#0d9488', bc:'rgba(13,148,136,.25)', lbl:`${daysSince}d` } :
                      daysSince <= 30 ? { bg:'#f0f1f4',             tc:'#5e748a', bc:'#d8dce3',              lbl:`${daysSince}d` } :
                      daysSince <= 90 ? { bg:'rgba(217,119,6,.07)', tc:'#d97706', bc:'rgba(217,119,6,.2)',   lbl:`${Math.floor(daysSince/7)}w` } :
                                        { bg:'rgba(220,38,38,.07)', tc:'#dc2626', bc:'rgba(220,38,38,.2)',   lbl:`${Math.floor(daysSince/30)}m` };
                    const isPendingApproval = ['PENDING_L1','PENDING_L2','PENDING_L3'].includes(q.status);
                    return (
                      <tr key={q.id}
                        onClick={() => !mergeMode && setViewQuote(q)}
                        style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {mergeMode && (
                          <td style={{ padding:'12px 10px' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={mergeIds.includes(q.id)}
                              onChange={e => setMergeIds(e.target.checked ? [...mergeIds, q.id] : mergeIds.filter(x => x !== q.id))} />
                          </td>
                        )}
                        {/* left accent + quote# */}
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:4, height:38, borderRadius:4, background: sc.color, flexShrink:0 }} />
                            <div>
                              <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                                <div style={{ fontWeight:800, fontSize:13, color:'#0d9488', letterSpacing:'-0.2px' }}>{q.quote_number}</div>
                                {ageStyle && <span style={{ fontSize:8, borderRadius:3, padding:'1px 5px', fontWeight:700, fontFamily:"'JetBrains Mono','Courier New',monospace", whiteSpace:'nowrap', lineHeight:'14px', background:ageStyle.bg, color:ageStyle.tc, border:`1px solid ${ageStyle.bc}` }}>{ageStyle.lbl}</span>}
                                {isPendingApproval && daysSince !== null && daysSince >= 3 && (
                                  <span style={{ fontSize:8, borderRadius:3, padding:'1px 5px', fontWeight:800, fontFamily:"'JetBrains Mono','Courier New',monospace", whiteSpace:'nowrap', lineHeight:'14px', background:'rgba(220,38,38,0.07)', color:'#dc2626', border:'1px solid rgba(220,38,38,0.2)' }}>⏳ {daysSince}d pending</span>
                                )}
                              </div>
                              <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{q.created_at || '—'}</div>
                            </div>
                          </div>
                        </td>
                        {/* client avatar + name */}
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#0f766e,#0d9488)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:12, flexShrink:0, boxShadow:'0 2px 8px rgba(13,148,136,0.35)' }}>{avatar(q.client_name)}</div>
                            <div>
                              <div style={{ fontWeight:700, fontSize:13 }}>{q.client_name}</div>
                              <div style={{ fontSize:11, color:'var(--muted)', marginTop:1, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.project_name || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px' }}><StatusBadge status={q.status} cfg={Q_STATUS} /></td>
                        <td style={{ padding:'12px 14px', textAlign:'right' }}>
                          <div style={{ fontWeight:800, fontSize:14 }}>{fmtC(q.grand_total)}</div>
                          {q.gst_amount > 0 && <div style={{ fontSize:10, color:'var(--muted)' }}>incl. GST</div>}
                        </td>
                        <td style={{ padding:'12px 14px', textAlign:'center' }}>
                          <div style={{ fontSize:12, fontWeight: expired ? 700 : 400, color: expired ? '#dc2626' : 'var(--muted)' }}>{q.valid_till || '—'}</div>
                          {expired && <div style={{ fontSize:10, color:'#dc2626', fontWeight:700 }}>EXPIRED</div>}
                        </td>
                        <td style={{ padding:'12px 14px', textAlign:'center' }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--muted)' }}>{(q.sections || []).length}</div>
                        </td>
                        <td style={{ padding:'12px 10px', textAlign:'right' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display:'flex', gap:3, justifyContent:'flex-end', flexWrap:'wrap' }}>
                            {/* Role-aware inline approval actions */}
                            {(() => {
                              const actions = getAllowedActions(q.status, currentUser?.role);
                              const btnCfg = {
                                SUBMIT:            { label:'📤 Submit',  color:'#0891b2', bg:'rgba(8,145,178,0.1)',  border:'rgba(8,145,178,0.3)' },
                                APPROVE:           { label:'✅ Approve', color:'#16a34a', bg:'rgba(22,163,74,0.1)', border:'rgba(22,163,74,0.3)' },
                                ESCALATE_L2:       { label:'⬆ L2',       color:'#d97706', bg:'rgba(217,119,6,0.1)', border:'rgba(217,119,6,0.3)' },
                                ESCALATE_L3:       { label:'⬆ L3',       color:'#d97706', bg:'rgba(217,119,6,0.1)', border:'rgba(217,119,6,0.3)' },
                                APPROVE_RETURN_L1: { label:'✅ Approve', color:'#16a34a', bg:'rgba(22,163,74,0.1)', border:'rgba(22,163,74,0.3)' },
                                REJECT:            { label:'✗ Reject',   color:'#dc2626', bg:'rgba(220,38,38,0.1)', border:'rgba(220,38,38,0.3)' },
                              };
                              return actions.map(action => {
                                const cfg = btnCfg[action]; if (!cfg) return null;
                                return (
                                  <button key={action}
                                    onClick={() => handleInlineApproval(q.id, action)}
                                    style={{ ...SEC_BTN, padding:'3px 7px', fontSize:10, fontWeight:700, color:cfg.color, background:cfg.bg, borderColor:cfg.border }}
                                    title={action}>{cfg.label}</button>
                                );
                              });
                            })()}
                            {/* View & Send + Create Proposal shortcuts for APPROVED quotes */}
                            {q.status === 'APPROVED' && (<>
                              <button onClick={() => setViewQuote(q)} style={{ ...SEC_BTN, padding:'3px 7px', fontSize:10, fontWeight:700, color:'#0891b2', background:'rgba(8,145,178,0.1)', borderColor:'rgba(8,145,178,0.3)' }} title="View & Send to Client">📧 Send</button>
                              <button onClick={() => { setEditProposal({ client_name: q.client_name, project_name: q.project_name }); setShowProposalForm(true); }} style={{ ...SEC_BTN, padding:'3px 7px', fontSize:10, fontWeight:700, color:'#6366f1', background:'rgba(99,102,241,0.1)', borderColor:'rgba(99,102,241,0.3)' }} title="Create Architect Fee Proposal from this Quote">📐 Proposal</button>
                            </>)}
                            <button onClick={() => setViewQuote(q)} style={{ ...SEC_BTN, padding:'4px 10px' }} title="View">👁</button>
                            <button onClick={() => { setEditQuote(q); setShowForm(true); }} style={{ ...SEC_BTN, padding:'4px 10px' }} title="Edit">✏️</button>
                            <button onClick={() => cloneQuote(q.id)} style={{ ...SEC_BTN, padding:'4px 10px' }} title="Clone">📋</button>
                            <button onClick={() => deleteQuote(q.id)} style={{ ...SEC_BTN, padding:'4px 10px', color:'#dc2626', borderColor:'rgba(220,38,38,0.3)' }} title="Delete">🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Value summary bar */}
              <div className="dqs-summary-bar">
                <div className="dqs-sum-item"><span className="dqs-sum-label">Total Pipeline</span><span className="dqs-sum-val accent">{fmtC(totalValue)}</span></div>
                <div className="dqs-sum-item"><span className="dqs-sum-label">Won</span><span className="dqs-sum-val" style={{color:'#16a34a'}}>{fmtC(wonValue)}</span></div>
                <div className="dqs-sum-item"><span className="dqs-sum-label">Active</span><span className="dqs-sum-val">{activeCount}</span></div>
                <div className="dqs-sum-item"><span className="dqs-sum-label">Quotes</span><span className="dqs-sum-val">{displayQuotes.length}</span></div>
                {expiredCount > 0 && <div className="dqs-sum-item"><span className="dqs-sum-label" style={{color:'#dc2626'}}>Expired</span><span className="dqs-sum-val" style={{color:'#dc2626'}}>{expiredCount}</span></div>}
              </div>
              </>
            )}
          </>
        )}

        {/* ── Proposals list ── */}
        {tab === 'proposals' && (
          <>
            {proposals.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 20px' }}>
                <div style={{ fontSize:48, marginBottom:12 }}>📐</div>
                <div style={{ fontWeight:800, fontSize:16, marginBottom:6 }}>No proposals yet</div>
                <div style={{ color:'var(--muted)', fontSize:13, marginBottom:20 }}>Create your first architect fee proposal with automated phase scheduling and BOQ generation.</div>
                <button onClick={() => { setEditProposal(null); setShowProposalForm(true); }} style={{ ...PRI_BTN, background:'linear-gradient(135deg,#0f766e,#0d9488)' }}>+ New Architect Proposal</button>
              </div>
            ) : (
              <>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'linear-gradient(135deg,#042f2e 0%,#011f1e 100%)' }}>
                    <th style={{ padding:'11px 14px', textAlign:'left', fontWeight:700, color:'rgba(255,255,255,0.65)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Proposal</th>
                    <th style={{ padding:'11px 14px', textAlign:'left', fontWeight:700, color:'rgba(255,255,255,0.65)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Client & Project</th>
                    <th style={{ padding:'11px 14px', textAlign:'left', fontWeight:700, color:'rgba(255,255,255,0.65)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Status</th>
                    <th style={{ padding:'11px 14px', textAlign:'right', fontWeight:700, color:'rgba(255,255,255,0.65)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Total Fee</th>
                    <th style={{ padding:'11px 14px', textAlign:'center', fontWeight:700, color:'rgba(255,255,255,0.65)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Validity</th>
                    <th style={{ padding:'11px 14px', textAlign:'center', fontWeight:700, color:'rgba(255,255,255,0.65)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Phases</th>
                    <th style={{ padding:'11px 14px', width:120 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {displayProposals.map(p => {
                    const sc = P_STATUS[p.status] || P_STATUS.DRAFT;
                    const paidPhases = (p.phases || []).filter(ph => ph.is_paid).length;
                    return (
                      <tr key={p.id}
                        onClick={() => setViewProposal(p)}
                        style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:4, height:38, borderRadius:4, background: sc.color, flexShrink:0 }} />
                            <div>
                              <div style={{ fontWeight:800, fontSize:13, color:'#0d9488' }}>{p.proposal_number}</div>
                              <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{p.created_at || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#0d9488,#0f766e)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:12, flexShrink:0, boxShadow:'0 2px 8px rgba(13,148,136,0.35)' }}>{avatar(p.client_name)}</div>
                            <div>
                              <div style={{ fontWeight:700, fontSize:13 }}>{p.client_name}</div>
                              <div style={{ fontSize:11, color:'var(--muted)', marginTop:1, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.project_name || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px' }}><StatusBadge status={p.status} cfg={P_STATUS} /></td>
                        <td style={{ padding:'12px 14px', textAlign:'right' }}>
                          <div style={{ fontWeight:800, fontSize:14 }}>{fmtC(p.total_fee)}</div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>excl. GST</div>
                        </td>
                        <td style={{ padding:'12px 14px', textAlign:'center', fontSize:12, color:'var(--muted)' }}>{p.valid_till || '—'}</td>
                        <td style={{ padding:'12px 14px', textAlign:'center' }}>
                          <div style={{ fontSize:12, fontWeight:700 }}>{paidPhases} / {(p.phases || []).length}</div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>paid</div>
                        </td>
                        <td style={{ padding:'12px 10px', textAlign:'right' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                            <button onClick={() => setViewProposal(p)} style={{ ...SEC_BTN, padding:'4px 10px' }}>👁</button>
                            <button onClick={() => { setEditProposal(p); setShowProposalForm(true); }} style={{ ...SEC_BTN, padding:'4px 10px' }}>✏️</button>
                            <button onClick={async e => { e.stopPropagation(); if (!window.confirm('Delete proposal?')) return; await fetch(`/api/design-quotes/architect/proposals/${p.id}`, { method:'DELETE' }); fetchProposals(); }} style={{ ...SEC_BTN, padding:'4px 10px', color:'#dc2626', borderColor:'rgba(220,38,38,0.3)' }}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="dqs-summary-bar">
                <div className="dqs-sum-item"><span className="dqs-sum-label">Total Fees</span><span className="dqs-sum-val accent">{fmtC(totalFees)}</span></div>
                <div className="dqs-sum-item"><span className="dqs-sum-label">Approved</span><span className="dqs-sum-val" style={{color:'#16a34a'}}>{fmtC(approvedFees)}</span></div>
                <div className="dqs-sum-item"><span className="dqs-sum-label">Active</span><span className="dqs-sum-val">{activeProps}</span></div>
                <div className="dqs-sum-item"><span className="dqs-sum-label">Proposals</span><span className="dqs-sum-val">{displayProposals.length}</span></div>
              </div>
              </>
            )}
          </>
        )}
      </div>

      {/* AI CTA */}
      <div style={{ padding: '0 32px 24px' }}>
        <div className="ai-cta-bar">
          <span>💬 Ask AI about your design pipeline, quote win rates, or pending approvals</span>
          <button className="ai-cta-btn" onClick={() => onGoChat && onGoChat('Analyse my design quote pipeline and flag any quotes needing attention')}>Ask AI</button>
        </div>
      </div>

      {/* Modals */}
      {showForm        && <QuoteFormModal quote={editQuote} onClose={() => { setShowForm(false); setEditQuote(null); }} onSaved={() => { setShowForm(false); setEditQuote(null); fetchQuotes(); }} />}
      {viewQuote       && <QuoteDetailModal quote={viewQuote} currentUser={currentUser} onClose={() => setViewQuote(null)} onEdit={() => { setEditQuote(viewQuote); setShowForm(true); setViewQuote(null); }} onStatusChange={(id, st) => { setQuotes(qs => qs.map(q => q.id === id ? { ...q, status: st } : q)); setViewQuote(v => v && v.id === id ? { ...v, status: st } : v); setPendingApprovals(pa => pa.filter(q => q.id !== id)); }} />}
      {showScanner     && <WhatsAppScannerModal onClose={() => setShowScanner(false)} onCreateQuote={(q) => { setShowScanner(false); setEditQuote({ ...q, id: null }); setShowForm(true); }} />}
      {showProposalForm && <ProposalFormModal proposal={editProposal} onClose={() => { setShowProposalForm(false); setEditProposal(null); }} onSaved={() => { setShowProposalForm(false); setEditProposal(null); fetchProposals(); }} />}
      {viewProposal    && <ProposalDetailModal proposal={viewProposal} onClose={() => setViewProposal(null)} onEdit={() => { setEditProposal(viewProposal); setShowProposalForm(true); setViewProposal(null); }} onStatusChange={(id, st) => { setProposals(ps => ps.map(p => p.id === id ? { ...p, status: st } : p)); setViewProposal(v => v && v.id === id ? { ...v, status: st } : v); }} />}
    </div>
  );
}
