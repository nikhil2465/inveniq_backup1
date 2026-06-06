import React, { useState, useEffect, useRef, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';

// ── Status configs ──────────────────────────────────────────────────────────
const Q_STATUS = {
  DRAFT:       { label: 'Draft',       color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  SENT:        { label: 'Sent',        color: '#0891b2', bg: 'rgba(8,145,178,0.12)' },
  APPROVED:    { label: 'Approved',    color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  REVISION:    { label: 'Revision',    color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  IN_PROGRESS: { label: 'In Progress', color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },
  COMPLETED:   { label: 'Completed',   color: '#059669', bg: 'rgba(5,150,105,0.12)' },
  CANCELLED:   { label: 'Cancelled',   color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
};
const P_STATUS = {
  DRAFT:     { label: 'Draft',     color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  SENT:      { label: 'Sent',      color: '#0891b2', bg: 'rgba(8,145,178,0.12)' },
  APPROVED:  { label: 'Approved',  color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  REVISION:  { label: 'Revision',  color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  COMPLETED: { label: 'Completed', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
  CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
};
const ITEM_TYPE_COLOR = {
  cp_fittings: '#0891b2', sanitary_ware: '#7c3aed', bathroom_accessories: '#14b8a6',
  hardware_hinges: '#d97706', hardware_channels: '#f59e0b', hardware_handles: '#f97316',
  hardware_locks: '#ef4444', plumbing: '#3b82f6', tiles: '#8b5cf6',
  waterproofing: '#06b6d4', installation: '#16a34a', cabinet: '#a855f7',
  wardrobe: '#6366f1', flooring: '#10b981', false_ceiling: '#64748b',
  countertop: '#f59e0b', other: '#9ca3af',
};

// ── Shared inline styles ─────────────────────────────────────────────────────
const MODAL_BG  = { position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16 };
const MODAL_BOX = { background:'var(--card)',borderRadius:14,boxShadow:'0 24px 64px rgba(0,0,0,0.35)',border:'1px solid var(--border)',width:'100%' };
const SEC_BTN   = { background:'transparent',border:'1px solid var(--border)',color:'var(--text)',borderRadius:7,padding:'5px 12px',fontSize:12,cursor:'pointer',fontWeight:600 };
const CLOSE_BTN = { background:'rgba(220,38,38,0.1)',border:'1px solid rgba(220,38,38,0.3)',color:'#dc2626',borderRadius:7,padding:'5px 10px',fontSize:13,cursor:'pointer',fontWeight:700 };
const PRI_BTN   = { background:'linear-gradient(135deg,#7c3aed,#a855f7)',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontSize:13,cursor:'pointer',fontWeight:700 };
const INP       = { width:'100%',background:'var(--input)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',fontSize:13,color:'var(--text)',boxSizing:'border-box' };
const LBL       = { fontSize:11,color:'var(--muted)',fontWeight:600,marginBottom:4,display:'block' };

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
      <div style={{ ...MODAL_BOX, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
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
  // File parser states
  const [showFileParser, setShowFileParser] = useState(false);
  const [parserFiles, setParserFiles] = useState([]);
  const [parsingFile, setParsingFile] = useState(false);
  const [fileParserResult, setFileParserResult] = useState(null);
  const fileParserRef = useRef();

  // QB→DQB import on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('inveniq_qb_to_dqb');
      if (!raw) return;
      const { items, ts } = JSON.parse(raw);
      if (Date.now() - ts > 30 * 60 * 1000) { localStorage.removeItem('inveniq_qb_to_dqb'); return; }
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
    setForm(f => ({ ...f, sections: [...f.sections, { section_name: newSecName.trim(), section_order: f.sections.length, section_total: 0, items: [] }] }));
    setNewSecName('');
    setActiveSection(form.sections.length);
  };

  const removeSection = (idx) => {
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

  const parseFile = async () => {
    if (parserFiles.length === 0) return;
    setParsingFile(true);
    setFileParserResult(null);
    try {
      const fd = new FormData();
      parserFiles.forEach(f => fd.append('file', f));
      // Use the general document parser — works for any file type
      const r = await fetch('/api/design-quotes/parse-document', { method: 'POST', body: fd });
      const d = await r.json();
      setFileParserResult(d);
    } catch { setFileParserResult(null); }
    finally { setParsingFile(false); }
  };

  const addFileSections = (autoFillClient = false) => {
    if (!fileParserResult?.extracted) return;
    const ex = fileParserResult.extracted;
    const rawRooms = ex.rooms || [];
    const newSecs = rawRooms.map((room, i) => ({
      section_name: room.room_name || `Section ${i + 1}`,
      section_order: form.sections.length + i,
      section_total: 0,
      items: (room.items || []).map(it => {
        const base = (it.qty || 1) * (it.unit_price || 0);
        return {
          item_name: it.item_name || '',
          description: [it.description, it.specifications].filter(Boolean).join(' · '),
          unit: it.unit || 'Nos',
          qty: it.qty || 1,
          unit_price: it.unit_price || 0,
          margin_pct: 0,
          line_total: base,
          inferred_hsn: it.inferred_hsn || '',
          inferred_category: it.item_type || '',
          gst_pct: inferGstFromHsn(it.inferred_hsn),
          length_ft: it.length_ft || null,
          width_ft: it.width_ft || null,
          height_ft: it.height_ft || null,
          dim_type: it.dim_type || null,
        };
      }),
    }));
    setForm(f => {
      const updates = { sections: [...f.sections, ...newSecs] };
      if (autoFillClient) {
        if (!f.client_name.trim() && ex.client_name)    updates.client_name    = ex.client_name;
        if (!f.client_phone.trim() && ex.client_phone)  updates.client_phone   = ex.client_phone;
        if (!f.client_email.trim() && ex.client_email)  updates.client_email   = ex.client_email;
        if (!f.project_name.trim() && ex.project_name)  updates.project_name   = ex.project_name;
        if (!f.project_address.trim() && ex.project_address) updates.project_address = ex.project_address;
        if (ex.project_type)  updates.project_type  = ex.project_type;
        if (ex.designer_name && !f.designer_name.trim()) updates.designer_name = ex.designer_name;
        if (ex.notes && !f.notes.trim())                updates.notes          = ex.notes;
      }
      return { ...f, ...updates };
    });
    setShowFileParser(false);
    setParserFiles([]);
    setFileParserResult(null);
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
      <div style={{ ...MODAL_BOX, maxWidth: 900, maxHeight: '94vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 900, fontSize: 16 }}>{isEdit ? '✏️ Edit Quote' : '+ New Interior Quote'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setShowFileParser(true); setShowBriefParser(false); }} style={{ ...SEC_BTN, color: '#0891b2', borderColor: 'rgba(8,145,178,0.4)' }}>📄 Upload File</button>
            <button onClick={() => { setShowBriefParser(true); setShowFileParser(false); }} style={{ ...SEC_BTN, color: '#7c3aed', borderColor: 'rgba(124,58,237,0.4)' }}>🤖 Parse Brief</button>
            <button onClick={save} disabled={saving} style={{ ...PRI_BTN, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : '💾 Save'}</button>
            <button onClick={onClose} style={CLOSE_BTN}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>

          {/* Brief parser overlay */}
          {showBriefParser && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>🤖 AI Interior Brief Parser</div>
              <textarea style={{ ...INP, height: 100, resize: 'vertical' }} placeholder="Paste client brief, WhatsApp messages, or scope of work…" value={briefText} onChange={e => setBriefText(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={parseBrief} disabled={parsingBrief} style={{ ...PRI_BTN, opacity: parsingBrief ? 0.6 : 1 }}>{parsingBrief ? 'Parsing…' : '⚡ Parse & Add Sections'}</button>
                <button onClick={() => setShowBriefParser(false)} style={SEC_BTN}>Cancel</button>
              </div>
            </div>
          )}

          {/* File parser overlay */}
          {showFileParser && (
            <div style={{ background: 'rgba(8,145,178,0.04)', border: '1px solid rgba(8,145,178,0.25)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#0891b2' }}>📄 AI Document Parser</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>Upload PDF, Word (.docx), Excel (.xlsx), CSV, or images — AI reads all content including dimensions, quantities, HSN codes, and product details.</div>
              <input ref={fileParserRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ods,.csv,.txt,image/*" style={{ display: 'none' }} onChange={e => { setParserFiles(Array.from(e.target.files)); setFileParserResult(null); }} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <button onClick={() => fileParserRef.current.click()} style={{ ...SEC_BTN, color: '#0891b2', borderColor: 'rgba(8,145,178,0.4)' }}>
                  + Add Files {parserFiles.length > 0 ? `(${parserFiles.length})` : ''}
                </button>
                {parserFiles.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {parserFiles.map((f, i) => (
                      <span key={i} style={{ fontSize: 11, background: 'rgba(8,145,178,0.1)', border: '1px solid rgba(8,145,178,0.25)', borderRadius: 6, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {FILE_ICON(f.name)} {f.name}
                        <button onClick={() => setParserFiles(fs => fs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 11, padding: 0 }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {parserFiles.length > 0 && (
                <button onClick={parseFile} disabled={parsingFile} style={{ ...PRI_BTN, background: 'linear-gradient(135deg,#0891b2,#06b6d4)', opacity: parsingFile ? 0.6 : 1, marginBottom: fileParserResult ? 12 : 0 }}>
                  {parsingFile ? '⏳ AI Reading File…' : '⚡ Extract & Add to Quote'}
                </button>
              )}
              {fileParserResult?.extracted && (() => {
                const ex = fileParserResult.extracted;
                const rooms = ex.rooms || [];
                const totalItems = rooms.reduce((s, r) => s + (r.items || []).length, 0);
                const hasClient = !!(ex.client_name || ex.project_name || ex.project_address);
                const isAi = fileParserResult.data_source === 'ai';
                const hasError = !!fileParserResult.scan_error;
                return (
                  <div style={{ marginTop: 10 }}>
                    {/* Error / demo banners */}
                    {hasError && (
                      <div style={{ fontSize: 11, color: '#dc2626', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
                        ⚠ {fileParserResult.scan_error}
                      </div>
                    )}
                    {fileParserResult.demo_note && !hasError && (
                      <div style={{ fontSize: 11, color: '#d97706', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
                        🔶 {fileParserResult.demo_note}
                      </div>
                    )}

                    {/* Success banner */}
                    {isAi && totalItems > 0 && (
                      <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, marginBottom: 10, background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 6, padding: '8px 12px' }}>
                        ✅ Extracted <strong>{totalItems} items</strong> across <strong>{rooms.length} sections</strong> from your document
                      </div>
                    )}

                    {/* 0-items message */}
                    {isAi && totalItems === 0 && (
                      <div style={{ fontSize: 11, color: '#d97706', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
                        ⚠ AI could not find any BOQ items in this document. It may be a scanned image, or the text may not contain product/item lists. Try a text-based PDF or paste the requirements as text.
                      </div>
                    )}

                    {/* Section pills */}
                    {rooms.length > 0 && (
                      <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {rooms.map((r, i) => (
                          <span key={i} style={{ background: 'rgba(8,145,178,0.1)', border: '1px solid rgba(8,145,178,0.2)', borderRadius: 20, padding: '2px 10px', fontSize: 11, color: '#0891b2', fontWeight: 600 }}>
                            {r.room_name} <span style={{ opacity: 0.7 }}>({(r.items || []).length})</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Client / project details detected */}
                    {hasClient && (
                      <div style={{ background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0891b2', marginBottom: 6 }}>📋 Client & Project Details Detected</div>
                        {ex.client_name    && <div style={{ fontSize: 12, marginBottom: 3 }}>👤 <strong>{ex.client_name}</strong>{ex.client_phone ? ` · ${ex.client_phone}` : ''}{ex.client_email ? ` · ${ex.client_email}` : ''}</div>}
                        {ex.project_name   && <div style={{ fontSize: 12, marginBottom: 3 }}>🏗 {ex.project_name}</div>}
                        {ex.project_address && <div style={{ fontSize: 12, marginBottom: 3, color: 'var(--muted)' }}>📍 {ex.project_address}</div>}
                        {ex.notes          && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>{ex.notes.slice(0, 120)}{ex.notes.length > 120 ? '…' : ''}</div>}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {totalItems > 0 && hasClient && (
                        <button onClick={() => addFileSections(true)}
                          style={{ ...PRI_BTN, background: 'linear-gradient(135deg,#0891b2,#06b6d4)', fontSize: 12 }}>
                          ✅ Add Sections + Fill Client Details
                        </button>
                      )}
                      {totalItems > 0 && (
                        <button onClick={() => addFileSections(false)}
                          style={{ ...SEC_BTN, color: '#0891b2', borderColor: 'rgba(8,145,178,0.4)', fontSize: 12 }}>
                          📋 Add {rooms.length} Section{rooms.length !== 1 ? 's' : ''} Only
                        </button>
                      )}
                      {hasClient && !totalItems && (
                        <button onClick={() => addFileSections(true)}
                          style={{ ...PRI_BTN, background: 'linear-gradient(135deg,#0891b2,#06b6d4)', fontSize: 12 }}>
                          👤 Fill Client & Project Details
                        </button>
                      )}
                      <button onClick={() => { setFileParserResult(null); setParserFiles([]); }} style={SEC_BTN}>🔄 Re-upload</button>
                      <button onClick={() => { setShowFileParser(false); setFileParserResult(null); setParserFiles([]); }} style={SEC_BTN}>Cancel</button>
                    </div>
                  </div>
                );
              })()}
              {!fileParserResult && !parsingFile && parserFiles.length === 0 && (
                <button onClick={() => setShowFileParser(false)} style={{ ...SEC_BTN, marginTop: 4 }}>Cancel</button>
              )}
            </div>
          )}

          {/* Client & project info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div><label style={LBL}>Client Name *</label><input style={INP} value={form.client_name} onChange={e => setF('client_name', e.target.value)} /></div>
            <div><label style={LBL}>Phone</label><input style={INP} value={form.client_phone} onChange={e => setF('client_phone', e.target.value)} /></div>
            <div><label style={LBL}>Email</label><input style={INP} value={form.client_email} onChange={e => setF('client_email', e.target.value)} /></div>
            <div><label style={LBL}>Project Name</label><input style={INP} value={form.project_name} onChange={e => setF('project_name', e.target.value)} /></div>
            <div><label style={LBL}>Project Type</label>
              <select style={INP} value={form.project_type} onChange={e => setF('project_type', e.target.value)}>
                {['Residential','Commercial','Hospitality','Office','Industrial','Other'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={LBL}>Status</label>
              <select style={INP} value={form.status} onChange={e => setF('status', e.target.value)}>
                {Object.entries(Q_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}><label style={LBL}>Project Address</label><input style={INP} value={form.project_address} onChange={e => setF('project_address', e.target.value)} /></div>
            <div><label style={LBL}>Designer Name</label><input style={INP} value={form.designer_name} onChange={e => setF('designer_name', e.target.value)} /></div>
            <div><label style={LBL}>Company</label><input style={INP} value={form.designer_company} onChange={e => setF('designer_company', e.target.value)} /></div>
            <div><label style={LBL}>Payment Terms</label><input style={INP} value={form.payment_terms} onChange={e => setF('payment_terms', e.target.value)} /></div>
            <div><label style={LBL}>Validity (days)</label><input style={INP} type="number" value={form.validity_days} onChange={e => setF('validity_days', +e.target.value)} /></div>
            <div><label style={LBL}>GST Rate %</label><input style={INP} type="number" value={form.gst_rate} onChange={e => setF('gst_rate', +e.target.value)} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <input type="checkbox" checked={form.include_gst} onChange={e => setF('include_gst', e.target.checked)} id="incgst" />
              <label htmlFor="incgst" style={{ fontSize: 13, fontWeight: 600 }}>Include GST in total</label>
            </div>
          </div>

          {/* Sections */}
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>BOQ Sections</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {form.sections.map((s, i) => (
              <button key={i} onClick={() => setActiveSection(i)} style={{ ...SEC_BTN, background: activeSection === i ? 'rgba(168,85,247,0.12)' : 'transparent', color: activeSection === i ? '#a855f7' : 'var(--muted)', borderColor: activeSection === i ? '#a855f7' : 'var(--border)' }}>
                {s.section_name}
              </button>
            ))}
            <div style={{ display: 'flex', gap: 4 }}>
              <input style={{ ...INP, width: 140 }} placeholder="Section name…" value={newSecName} onChange={e => setNewSecName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSection()} />
              <button onClick={addSection} style={PRI_BTN}>+ Add</button>
            </div>
          </div>

          {/* Active section items */}
          {sec && (
            <div style={{ background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 700 }}>{sec.section_name}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setImgSearchSec(activeSection); setShowImgSearchForm(true); }} style={{ ...SEC_BTN, color: '#a855f7', borderColor: 'rgba(168,85,247,0.4)' }}>📷 Search by Photo</button>
                  <button onClick={() => addItem(activeSection)} style={{ ...SEC_BTN, color: '#16a34a' }}>+ Add Item</button>
                  <button onClick={() => removeSection(activeSection)} style={{ ...SEC_BTN, color: '#dc2626' }}>Remove Section</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 820 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Item Name','Unit','Qty','Unit Price','Margin%','GST %','Base Total',''].map(h => (
                      <th key={h} style={{ padding: '4px 6px', textAlign: h === 'GST %' || h === 'Base Total' ? 'center' : 'left', color: h === 'GST %' ? '#d97706' : 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.items.map((it, ii) => (
                    <tr key={ii} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 4px' }}>
                        <input style={{ ...INP, minWidth: 160 }} value={it.item_name} onChange={e => updateItem(activeSection, ii, 'item_name', e.target.value)} placeholder="Product name…" />
                        {(it.length_ft || it.width_ft || it.height_ft) && (
                          <div style={{ fontSize: 10, color: '#0891b2', marginTop: 2 }}>
                            📐 {[it.length_ft && `L:${it.length_ft}ft`, it.width_ft && `W:${it.width_ft}ft`, it.height_ft && `H:${it.height_ft}ft`].filter(Boolean).join(' × ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '4px 4px' }}><input style={{ ...INP, width: 65 }} value={it.unit} onChange={e => updateItem(activeSection, ii, 'unit', e.target.value)} /></td>
                      <td style={{ padding: '4px 4px' }}><input style={{ ...INP, width: 55 }} type="number" value={it.qty} onChange={e => updateItem(activeSection, ii, 'qty', e.target.value)} /></td>
                      <td style={{ padding: '4px 4px' }}><input style={{ ...INP, width: 85 }} type="number" value={it.unit_price} onChange={e => updateItem(activeSection, ii, 'unit_price', e.target.value)} /></td>
                      <td style={{ padding: '4px 4px' }}><input style={{ ...INP, width: 60 }} type="number" value={it.margin_pct} onChange={e => updateItem(activeSection, ii, 'margin_pct', e.target.value)} /></td>
                      <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                        <select
                          style={{ ...INP, width: 72, textAlign: 'center', color: '#d97706', fontWeight: 700, background: 'rgba(217,119,6,0.07)', borderColor: 'rgba(217,119,6,0.3)' }}
                          value={it.gst_pct ?? form.gst_rate ?? 18}
                          onChange={e => updateItem(activeSection, ii, 'gst_pct', Number(e.target.value))}>
                          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 8px', fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'right' }}>{fmtC(it.line_total)}</td>
                      <td style={{ padding: '4px 4px' }}><button onClick={() => removeItem(activeSection, ii)} style={{ ...SEC_BTN, color: '#dc2626', padding: '2px 8px' }}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 700, fontSize: 13 }}>Section Base Total: {fmtC(sec.section_total)}</div>
            </div>
          )}

          {/* Grand total summary */}
          <div style={{ marginTop: 16, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
              <div style={{ fontSize: 13 }}>Base Subtotal: <strong>{fmtC(subtotal)}</strong></div>
              {form.include_gst && Object.entries(gstBreakdown).sort(([a],[b]) => +a - +b).map(([rate, amt]) => (
                <div key={rate} style={{ fontSize: 12, color: '#d97706' }}>GST @{rate}%: <strong>{fmtC(amt)}</strong></div>
              ))}
              {form.include_gst && Object.keys(gstBreakdown).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>GST: ₹0 (no items priced yet)</div>
              )}
              <div style={{ fontSize: 16, fontWeight: 900, color: '#a855f7', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2 }}>Grand Total: {fmtC(grandTotal)}</div>
            </div>
          </div>

          {/* Notes & Terms */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
            <div><label style={LBL}>Notes</label><textarea style={{ ...INP, height: 70, resize: 'vertical' }} value={form.notes} onChange={e => setF('notes', e.target.value)} /></div>
            <div><label style={LBL}>Terms & Conditions</label><textarea style={{ ...INP, height: 70, resize: 'vertical' }} value={form.terms} onChange={e => setF('terms', e.target.value)} /></div>
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
function QuoteDetailModal({ quote: initialQuote, onClose, onEdit, onStatusChange }) {
  const [quote, setQuote]           = useState(initialQuote);
  const [updating, setUpdating]     = useState(false);
  const [showEmail, setShowEmail]   = useState(false);
  const printRef = useRef();

  const handlePrint = () => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${quote.quote_number}</title><style>
      body{font-family:Arial,sans-serif;color:#1f2937;margin:0;padding:20px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{padding:8px 10px;border:1px solid #e5e7eb;text-align:left}
      th{background:#f3f4f6;font-weight:700}
      .stamp{border:3px solid #16a34a;color:#16a34a;font-size:28px;font-weight:900;padding:6px 18px;display:inline-block;transform:rotate(-8deg);letter-spacing:4px;margin:10px 0}
    </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:3px solid #a855f7;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:40px;height:40px;background:#a855f7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:18px">IQ</div>
          <div><div style="font-weight:800;font-size:14px">InvenIQ — Design Studio</div><div style="font-size:11px;color:#6b7280">Hardware & Sanitary Fit-Out Quotations</div></div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:900;font-size:24px;color:#a855f7;letter-spacing:2px">QUOTATION</div>
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
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;color:#a855f7;border-top:1px solid #e5e7eb;padding-top:8px"><span>Grand Total</span><span>₹${Number(quote.grand_total||0).toLocaleString('en-IN')}</span></div>
          ${quote.include_gst?'<div style="font-size:10px;color:#9ca3af;margin-top:4px">SAC: 9983 (Interior Design Services)</div>':''}
        </div>`;
      })()}
      ${quote.payment_terms ? `<div style="margin-top:20px"><strong style="font-size:12px">Payment Terms:</strong> <span style="font-size:12px;color:#6b7280">${quote.payment_terms}</span></div>` : ''}
      ${quote.terms ? `<div style="margin-top:12px"><strong style="font-size:12px">Terms & Conditions:</strong><div style="font-size:11px;color:#6b7280;white-space:pre-line;margin-top:4px">${quote.terms}</div></div>` : ''}
    </body></html>`);
    w.document.close(); w.print();
  };

  // P0-5: Client approval workflow
  const sendForApproval = async () => {
    setUpdating(true);
    try {
      await fetch(`/api/design-quotes/${quote.id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SENT' }),
      });
      setQuote(q => ({ ...q, status: 'SENT' }));
      onStatusChange(quote.id, 'SENT');
    } finally { setUpdating(false); }
  };

  const markApproved = async () => {
    setUpdating(true);
    try {
      await fetch(`/api/design-quotes/${quote.id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      });
      setQuote(q => ({ ...q, status: 'APPROVED' }));
      onStatusChange(quote.id, 'APPROVED');
    } finally { setUpdating(false); }
  };

  const shareWhatsApp = () => {
    const text = `*Design Quote — ${quote.quote_number}*\nInvenIQ Design Studio\n\n*Client:* ${quote.client_name || '—'}\n*Project:* ${quote.project_name || '—'}\n*Rooms:* ${(quote.sections || []).length}\n\n*Total (incl. GST):* ₹${Number(quote.grand_total||0).toLocaleString('en-IN')}\n\nPlease review and confirm to proceed.\nRegards, InvenIQ Design Studio`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div style={MODAL_BG} onClick={onClose}>
      <div style={{ ...MODAL_BOX, maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 16 }}>{quote.quote_number}</span>
            <StatusBadge status={quote.status} cfg={Q_STATUS} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {quote.client_name}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* P0-5: Approval buttons */}
            {quote.status === 'DRAFT' && (
              <button onClick={sendForApproval} disabled={updating} style={{ ...SEC_BTN, color: '#d97706', borderColor: 'rgba(217,119,6,0.4)', fontWeight: 700 }}>📤 Send for Approval</button>
            )}
            {quote.status === 'SENT' && (
              <button onClick={markApproved} disabled={updating} style={{ ...SEC_BTN, color: '#16a34a', borderColor: 'rgba(22,163,74,0.4)', fontWeight: 700 }}>✅ Mark Approved</button>
            )}
            {quote.status === 'APPROVED' && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 6, padding: '4px 10px' }}>✅ Client Approved</span>
            )}
            <button onClick={shareWhatsApp} style={{ ...SEC_BTN, color: '#16a34a', borderColor: 'rgba(37,211,102,0.4)', fontWeight: 700 }}>📱 WhatsApp</button>
            <button onClick={handlePrint} style={{ ...SEC_BTN, color: '#a855f7', borderColor: 'rgba(168,85,247,0.4)' }}>🖨 Print</button>
            <button onClick={() => setShowEmail(true)} style={{ ...SEC_BTN, color: '#0891b2', borderColor: 'rgba(8,145,178,0.4)' }}>📧 Email</button>
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
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: '#a855f7' }}>{fmtC(sec.section_total)}</td>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 900, color: '#a855f7', borderTop: '1px solid var(--border)', paddingTop: 8 }}><span>Grand Total</span><span>{fmtC(quote.grand_total)}</span></div>
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
  const [mode, setMode]         = useState('text'); // 'text' | 'file'
  const [text, setText]         = useState('');
  const [files, setFiles]       = useState([]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult]     = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const fileRef = useRef();

  const scan = async () => {
    setScanning(true);
    try {
      if (mode === 'text' && !text.trim()) { setScanning(false); return; }
      if (mode === 'image' && files.length === 0 && !text.trim()) { setScanning(false); return; }
      const fd = new FormData();
      if (text.trim()) fd.append('text_input', text);
      files.forEach(f => fd.append('file', f));
      const r = await fetch('/api/design-quotes/scan', { method: 'POST', body: fd });
      const d = await r.json();
      setResult(d);
    } catch { setResult(null); }
    finally { setScanning(false); }
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
    const sections = (ex.rooms || []).map((room, i) => ({
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
      notes: ex.notes || '', sections,
    });
  };

  // Check image sizes before scan
  const oversized = files.filter(f => f.size > 4 * 1024 * 1024);

  return (
    <div style={MODAL_BG} onClick={onClose}>
      <div style={{ ...MODAL_BOX, maxWidth: 800, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'linear-gradient(135deg,rgba(8,145,178,0.08),transparent)' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15 }}>📱 WhatsApp / Document / Image Scanner</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Paste text, upload files (PDF, Word, Excel) or photos — AI reads everything and builds your BOQ</div>
          </div>
          <button onClick={onClose} style={CLOSE_BTN}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>

          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
            {[['text','💬 Text / WhatsApp'], ['file','📄 Files / Photos']].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); }} style={{ ...SEC_BTN, background: mode === m ? 'rgba(8,145,178,0.12)' : 'transparent', color: mode === m ? '#0891b2' : 'var(--muted)', borderColor: mode === m ? '#0891b2' : 'var(--border)', fontWeight: mode === m ? 700 : 600 }}>{l}</button>
            ))}
          </div>

          {mode === 'text' && (
            <textarea style={{ ...INP, height: 140, resize: 'vertical', fontSize: 13 }}
              placeholder={`Paste WhatsApp messages, BOQ requirements, or project brief here…\n\nExamples:\n• "Need Jaquar CP fittings for 24 units, 3 bathrooms each — premium range"\n• "Master bath: EWC, basin mixer, shower set. Common bath: basic set. Kitchen: SS sink + mixer"`}
              value={text} onChange={e => setText(e.target.value)} />
          )}

          {mode === 'file' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ods,.csv,.txt,image/*" style={{ display: 'none' }} onChange={e => setFiles(Array.from(e.target.files))} />
                <button onClick={() => fileRef.current.click()} style={{ ...PRI_BTN, background: 'linear-gradient(135deg,#0891b2,#06b6d4)', padding: '8px 16px', fontSize: 12 }}>
                  📎 Add Files ({files.length})
                </button>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>PDF · Word · Excel · CSV · Images (max 4 MB per image)</span>
              </div>

              {/* Oversized warning */}
              {oversized.length > 0 && (
                <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 10 }}>
                  ⚠ {oversized.map(f => f.name).join(', ')} {oversized.length === 1 ? 'is' : 'are'} over 4 MB (images only). Please compress or reduce resolution before uploading.
                </div>
              )}

              {files.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {files.map((f, i) => {
                    const isImg = f.type.startsWith('image/');
                    return (
                      <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {isImg ? (
                          <img src={URL.createObjectURL(f)} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `2px solid ${f.size > 4*1024*1024 ? '#dc2626' : 'var(--border)'}` }} />
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
              {scanning ? '⏳ AI Reading…' : mode === 'file' ? '⚡ Parse Files & Extract' : '⚡ Scan & Extract'}
            </button>
            {scanning && <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>GPT-4o is analysing your requirements…</span>}
          </div>

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
              {result.data_source === 'ai' && (
                <div style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#16a34a', marginBottom: 12, fontWeight: 700 }}>
                  ✅ Live AI extraction — {(result.extracted.rooms || []).reduce((s, r) => s + (r.items||[]).length, 0)} items extracted from your {result.extracted.rooms?.length || 0} room(s)
                </div>
              )}

              {/* Result header + summary */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{result.extracted.project_name || 'Extracted Requirements'}</div>
                  {result.extracted.client_name && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Client: {result.extracted.client_name}{result.extracted.no_of_units ? ` · ${result.extracted.no_of_units} units` : ''}{result.extracted.no_of_bathrooms_per_unit ? ` · ${result.extracted.no_of_bathrooms_per_unit} baths/unit` : ''}</div>}
                </div>
                {/* ALWAYS shown — primary CTA */}
                <button onClick={useResult} style={{ ...PRI_BTN, fontSize: 13, padding: '10px 22px', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', boxShadow: '0 4px 14px rgba(124,58,237,0.4)' }}>
                  ✅ Create Quotation →
                </button>
              </div>

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
                              {it.material_preference && <span style={{ fontSize: 10, color: '#7c3aed', background: 'rgba(124,58,237,0.08)', borderRadius: 10, padding: '2px 8px' }}>{it.material_preference}</span>}
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
      <div style={{ ...MODAL_BOX, maxWidth: 820, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
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
              <div key={i} onClick={() => setSelected(i)} style={{ border: `2px solid ${selected === i ? '#a855f7' : 'var(--border)'}`, borderRadius: 6, overflow: 'hidden', marginBottom: 6, cursor: 'pointer' }}>
                <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: 80, objectFit: 'cover' }} />
              </div>
            ))}
          </div>

          {/* Right: results */}
          <div style={{ flex: 1 }}>
            {files.length > 0 && (
              <button onClick={searchImages} disabled={searching} style={{ ...PRI_BTN, background: 'linear-gradient(135deg,#a855f7,#6366f1)', marginBottom: 14, opacity: searching ? 0.6 : 1 }}>
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
      <div style={{ ...MODAL_BOX, maxWidth: 780, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 900, fontSize: 16 }}>{isEdit ? '✏️ Edit Proposal' : '+ New Architect Proposal'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowBrief(true)} style={{ ...SEC_BTN, color: '#6366f1', borderColor: 'rgba(99,102,241,0.4)' }}>🤖 Parse Brief</button>
            <button onClick={save} disabled={saving} style={{ ...PRI_BTN, background: 'linear-gradient(135deg,#6366f1,#818cf8)', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : '💾 Save'}</button>
            <button onClick={onClose} style={CLOSE_BTN}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {showBrief && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>🤖 AI Architect Brief Parser</div>
              <textarea style={{ ...INP, height: 90 }} placeholder="Describe the project…" value={briefText} onChange={e => setBriefText(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={parseBrief} disabled={parsing} style={{ ...PRI_BTN, background: 'linear-gradient(135deg,#6366f1,#818cf8)', opacity: parsing ? 0.6 : 1 }}>{parsing ? 'Parsing…' : '⚡ Parse'}</button>
                <button onClick={() => setShowBrief(false)} style={SEC_BTN}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={LBL}>Client Name *</label><input style={INP} value={form.client_name} onChange={e => setF('client_name', e.target.value)} /></div>
            <div><label style={LBL}>Phone</label><input style={INP} value={form.client_phone} onChange={e => setF('client_phone', e.target.value)} /></div>
            <div><label style={LBL}>Email</label><input style={INP} value={form.client_email} onChange={e => setF('client_email', e.target.value)} /></div>
            <div style={{ gridColumn: '1/-1' }}><label style={LBL}>Project Name</label><input style={INP} value={form.project_name} onChange={e => setF('project_name', e.target.value)} /></div>
            <div><label style={LBL}>Project Type</label>
              <select style={INP} value={form.project_type} onChange={e => setF('project_type', e.target.value)}>
                {['residential','commercial','institutional','landscape','renovation','interior_only'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={LBL}>Typology</label>
              <select style={INP} value={form.typology} onChange={e => setF('typology', e.target.value)}>
                {['villa','row_house','apartment','duplex','office','retail','hotel','school','hospital','other'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={LBL}>Status</label>
              <select style={INP} value={form.status} onChange={e => setF('status', e.target.value)}>
                {Object.entries(P_STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {/* Plot dimensions */}
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Plot & Area</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 10 }}>
            <div><label style={LBL}>Length</label><input style={INP} type="number" value={form.plot_length} onChange={e => setF('plot_length', e.target.value)} /></div>
            <div><label style={LBL}>Width</label><input style={INP} type="number" value={form.plot_width} onChange={e => setF('plot_width', e.target.value)} /></div>
            <div><label style={LBL}>Unit</label>
              <select style={INP} value={form.plot_unit} onChange={e => setF('plot_unit', e.target.value)}>
                <option>feet</option><option>meter</option>
              </select>
            </div>
            <div><label style={LBL}>Floors</label><input style={INP} type="number" value={form.floors} onChange={e => setF('floors', +e.target.value)} /></div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}><button onClick={calcAreas} style={{ ...SEC_BTN, width: '100%' }}>Calculate</button></div>
          </div>
          {areaCalc && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              {[['Site Area', areaCalc.site_area_sqft], ['Built-Up', areaCalc.builtup_area_sqft], ['Carpet', areaCalc.carpet_area_sqft]].map(([l, v]) => (
                <div key={l} style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: 12 }}>
                  <div style={{ color: '#6366f1', fontWeight: 700, fontSize: 16 }}>{Number(v).toLocaleString('en-IN')}</div>
                  <div style={{ color: 'var(--muted)' }}>{l} (sqft)</div>
                </div>
              ))}
            </div>
          )}

          {/* Fee */}
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Fee Structure</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
            <div><label style={LBL}>Fee Model</label>
              <select style={INP} value={form.fee_model} onChange={e => setF('fee_model', e.target.value)}>
                <option value="percentage">Percentage</option>
                <option value="per_sqft">Per Sqft</option>
                <option value="lump_sum">Lump Sum</option>
              </select>
            </div>
            <div><label style={LBL}>{form.fee_model === 'percentage' ? 'Fee %' : form.fee_model === 'per_sqft' ? '₹/sqft' : 'Amount ₹'}</label><input style={INP} type="number" value={form.fee_rate} onChange={e => setF('fee_rate', +e.target.value)} /></div>
            {form.fee_model === 'percentage' && <div><label style={LBL}>Construction Cost ₹</label><input style={INP} type="number" value={form.construction_cost} onChange={e => setF('construction_cost', e.target.value)} /></div>}
            <div><label style={LBL}>GST %</label><input style={INP} type="number" value={form.gst_pct} onChange={e => setF('gst_pct', +e.target.value)} /></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, fontSize: 13, marginBottom: 14, background: 'var(--bg)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
            <span>Total Fee: <strong style={{ color: '#6366f1' }}>{fmtC(totalFee)}</strong></span>
            <span>GST @{form.gst_pct}%: <strong>{fmtC(gstAmt)}</strong></span>
            <span>Payable: <strong style={{ fontSize: 15, color: '#6366f1' }}>{fmtC(totalFee + gstAmt)}</strong></span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={LBL}>Validity (days)</label><input style={INP} type="number" value={form.validity_days} onChange={e => setF('validity_days', +e.target.value)} /></div>
            <div><label style={LBL}>Complexity</label>
              <select style={INP} value={form.complexity} onChange={e => setF('complexity', e.target.value)}>
                <option>simple</option><option>medium</option><option>complex</option>
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}><label style={LBL}>Notes</label><textarea style={{ ...INP, height: 60 }} value={form.notes} onChange={e => setF('notes', e.target.value)} /></div>
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
      <div style={{ ...MODAL_BOX, maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 16 }}>{proposal.proposal_number}</span>
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
export default function DesignQuoteBuilder({ onGoChat, dbStatus }) {
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
      const r = await fetch(`/api/design-quotes/architect/proposals?${params}`);
      const d = await r.json();
      setProposals(d.proposals || []);
      setDataSource(d.data_source || 'demo');
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { setLoading(true); if (tab === 'quotes') fetchQuotes(); else fetchProposals(); }, [tab, fetchQuotes, fetchProposals]);

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
      <div style={{ background:'#09000f', padding:'36px 40px 0', position:'relative', overflow:'hidden' }}>

        {/* Single large ambient glow — top right */}
        <div style={{ position:'absolute',top:-160,right:-160,width:600,height:600,borderRadius:'50%',background:'radial-gradient(circle at center,rgba(139,92,246,0.28) 0%,rgba(109,40,217,0.12) 40%,transparent 70%)',pointerEvents:'none' }} />
        {/* Subtle bottom-left counter-glow */}
        <div style={{ position:'absolute',bottom:-80,left:-60,width:360,height:360,borderRadius:'50%',background:'radial-gradient(circle at center,rgba(192,38,211,0.1) 0%,transparent 65%)',pointerEvents:'none' }} />
        {/* Fine dot grid */}
        <div style={{ position:'absolute',inset:0,backgroundImage:'radial-gradient(rgba(139,92,246,0.12) 1px,transparent 1px)',backgroundSize:'28px 28px',pointerEvents:'none' }} />

        {/* ── Title row ── */}
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:16,position:'relative',zIndex:1 }}>
          <div style={{ display:'flex',alignItems:'center',gap:18 }}>
            {/* Icon mark */}
            <div style={{ width:58,height:58,borderRadius:16,background:'rgba(139,92,246,0.15)',border:'1px solid rgba(139,92,246,0.35)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,flexShrink:0,boxShadow:'0 0 0 1px rgba(139,92,246,0.1), 0 8px 32px rgba(109,40,217,0.4)' }}>🎨</div>
            <div>
              <div style={{ fontSize:30,fontWeight:900,color:'#ffffff',letterSpacing:'-1px',lineHeight:1,marginBottom:6 }}>Design Quote Studio</div>
              <div style={{ fontSize:12,color:'rgba(255,255,255,0.42)',letterSpacing:0.4,fontWeight:500 }}>Interior Fit-Out BOQ &nbsp;·&nbsp; Architect Fee Proposals &nbsp;·&nbsp; GST-Ready Prints</div>
              <div style={{ display:'flex',alignItems:'center',gap:10,marginTop:8 }}>
                <DataSourceBadge source={dataSource} />
                <span style={{ fontSize:10,color:'rgba(139,92,246,0.7)',fontWeight:700,letterSpacing:0.6,background:'rgba(139,92,246,0.12)',padding:'2px 8px',borderRadius:20,border:'1px solid rgba(139,92,246,0.25)' }}>SAC 998331 · GST 18%</span>
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
                <button onClick={() => { setEditQuote(null); setShowForm(true); }} style={{ background:'#8b5cf6',color:'#fff',border:'none',borderRadius:9,padding:'10px 24px',fontSize:13,cursor:'pointer',fontWeight:800,boxShadow:'0 4px 20px rgba(139,92,246,0.55)',letterSpacing:'-0.2px' }}>+ New Quote</button>
              </>
            ))}
            {tab === 'proposals' && (
              <button onClick={() => { setEditProposal(null); setShowProposalForm(true); }} style={{ background:'#8b5cf6',color:'#fff',border:'none',borderRadius:9,padding:'10px 24px',fontSize:13,cursor:'pointer',fontWeight:800,boxShadow:'0 4px 20px rgba(139,92,246,0.55)',letterSpacing:'-0.2px' }}>+ New Proposal</button>
            )}
          </div>
        </div>

        {/* ── KPI strip ── */}
        <div style={{ display:'grid',gridTemplateColumns:tab==='quotes'?'repeat(5,1fr)':'repeat(4,1fr)',gap:10,marginTop:32,position:'relative',zIndex:1 }}>
          {(tab === 'quotes' ? [
            { icon:'💰', label:'Pipeline',      value:fmtC(totalValue),  sub:'total quoted',     top:'#a78bfa' },
            { icon:'✅', label:'Won / Approved', value:fmtC(wonValue),    sub:'confirmed value',  top:'#34d399' },
            { icon:'📋', label:'Active',         value:activeCount,        sub:'open quotes',      top:'#60a5fa' },
            { icon:'⏰', label:'Expiring',       value:expiredCount,       sub:'need attention',   top:expiredCount>0?'#fb7185':'#a78bfa' },
            { icon:'📁', label:'Total Quotes',   value:quotes.length,      sub:'all time',         top:'#a78bfa' },
          ] : [
            { icon:'💼', label:'Total Fees',    value:fmtC(totalFees),    sub:'total pipeline',  top:'#a78bfa' },
            { icon:'✅', label:'Approved Fees', value:fmtC(approvedFees), sub:'won value',        top:'#34d399' },
            { icon:'📐', label:'Active',        value:activeProps,         sub:'open proposals',  top:'#60a5fa' },
            { icon:'📁', label:'Total',         value:proposals.length,    sub:'all proposals',   top:'#a78bfa' },
          ]).map(k => (
            <div key={k.label} style={{ background:'rgba(255,255,255,0.04)',borderRadius:'12px 12px 0 0',padding:'16px 18px',borderTop:`2.5px solid ${k.top}`,borderLeft:'1px solid rgba(255,255,255,0.07)',borderRight:'1px solid rgba(255,255,255,0.07)',borderBottom:'none' }}>
              <div style={{ display:'flex',alignItems:'center',gap:5,marginBottom:8 }}>
                <span style={{ fontSize:13 }}>{k.icon}</span>
                <span style={{ fontSize:9,color:'rgba(255,255,255,0.38)',fontWeight:700,textTransform:'uppercase',letterSpacing:1.2 }}>{k.label}</span>
              </div>
              <div style={{ fontSize:22,fontWeight:900,color:'#f5f3ff',lineHeight:1,letterSpacing:'-0.8px' }}>{k.value}</div>
              <div style={{ fontSize:10,color:'rgba(255,255,255,0.28)',marginTop:5,letterSpacing:0.3 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display:'flex',gap:2,marginTop:10,position:'relative',zIndex:1 }}>
          {[['quotes','🏠 Interior Quotations'],['proposals','📐 Architect Proposals']].map(([t,lbl]) => (
            <button key={t} onClick={() => { setTab(t); setStatusFilter(''); setSearch(''); }} style={{
              background: tab===t ? 'var(--card)' : 'transparent',
              color: tab===t ? '#8b5cf6' : 'rgba(255,255,255,0.45)',
              border: tab===t ? '1px solid var(--border)' : '1px solid transparent',
              borderBottom: tab===t ? '1px solid var(--card)' : 'none',
              borderRadius:'10px 10px 0 0', padding:'10px 26px', fontSize:13, fontWeight:700,
              cursor:'pointer', marginRight:2, letterSpacing:'-0.1px',
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* ══ BODY ══ */}
      <div style={{ padding:'0 40px 40px', background:'var(--card)', borderLeft:'1px solid var(--border)', borderRight:'1px solid var(--border)', borderBottom:'1px solid var(--border)', marginBottom:24 }}>

        {/* Toolbar */}
        <div style={{ display:'flex',gap:10,alignItems:'center',padding:'14px 0',borderBottom:'1px solid var(--border)',flexWrap:'wrap' }}>
          {tab === 'quotes' && (
            <div style={{ position:'relative',flex:'1 1 240px',maxWidth:300 }}>
              <span style={{ position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--muted)',fontSize:13,pointerEvents:'none' }}>🔍</span>
              <input style={{ ...INP,paddingLeft:34,fontSize:12.5,borderRadius:8 }} placeholder="Search client, project, quote#…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          )}
          <div style={{ display:'flex',gap:5,flexWrap:'wrap' }}>
            {[['','All'],...Object.entries(tab==='quotes'?Q_STATUS:P_STATUS).map(([k,v])=>[k,v.label])].map(([k,lbl]) => {
              const v=(tab==='quotes'?Q_STATUS:P_STATUS)[k]||{};
              const on=statusFilter===k;
              return (
                <button key={k} onClick={() => setStatusFilter(on?'':k)} style={{ fontSize:11.5,fontWeight:700,padding:'5px 14px',borderRadius:20,cursor:'pointer',transition:'all 0.12s', border:on?`1.5px solid ${v.color||'#8b5cf6'}`:'1.5px solid var(--border)', background:on?(v.bg||'rgba(139,92,246,0.1)'):'transparent', color:on?(v.color||'#8b5cf6'):'var(--muted)' }}>
                  {lbl}
                </button>
              );
            })}
          </div>
          <span style={{ marginLeft:'auto',fontSize:11,color:'var(--muted)',fontWeight:600,whiteSpace:'nowrap' }}>
            {tab==='quotes'?`${quotes.length} quote${quotes.length!==1?'s':''}`:`${proposals.length} proposal${proposals.length!==1?'s':''}`}
          </span>
        </div>

        {/* ── Quotes list ── */}
        {tab === 'quotes' && (
          <>
            {quotes.length === 0 ? (
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
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'2px solid var(--border)' }}>
                    {mergeMode && <th style={{ padding:'11px 10px', width:36 }}></th>}
                    <th style={{ padding:'11px 14px', textAlign:'left', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Quote</th>
                    <th style={{ padding:'11px 14px', textAlign:'left', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Client & Project</th>
                    <th style={{ padding:'11px 14px', textAlign:'left', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Status</th>
                    <th style={{ padding:'11px 14px', textAlign:'right', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Value</th>
                    <th style={{ padding:'11px 14px', textAlign:'center', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Validity</th>
                    <th style={{ padding:'11px 14px', textAlign:'center', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Rooms</th>
                    <th style={{ padding:'11px 14px', width:140 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map(q => {
                    const expired = q.valid_till && new Date(q.valid_till) < new Date() && !['APPROVED','COMPLETED','CANCELLED'].includes(q.status);
                    const sc = Q_STATUS[q.status] || Q_STATUS.DRAFT;
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
                              <div style={{ fontWeight:800, fontSize:13, color:'#9333ea', letterSpacing:'-0.2px' }}>{q.quote_number}</div>
                              <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{q.created_at || '—'}</div>
                            </div>
                          </div>
                        </td>
                        {/* client avatar + name */}
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#6b21c8,#be185d)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:12, flexShrink:0, boxShadow:'0 2px 8px rgba(107,33,200,0.35)' }}>{avatar(q.client_name)}</div>
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
                          <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
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
                <button onClick={() => { setEditProposal(null); setShowProposalForm(true); }} style={{ ...PRI_BTN, background:'linear-gradient(135deg,#6366f1,#818cf8)' }}>+ New Architect Proposal</button>
              </div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'2px solid var(--border)' }}>
                    <th style={{ padding:'11px 14px', textAlign:'left', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Proposal</th>
                    <th style={{ padding:'11px 14px', textAlign:'left', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Client & Project</th>
                    <th style={{ padding:'11px 14px', textAlign:'left', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Status</th>
                    <th style={{ padding:'11px 14px', textAlign:'right', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Total Fee</th>
                    <th style={{ padding:'11px 14px', textAlign:'center', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Validity</th>
                    <th style={{ padding:'11px 14px', textAlign:'center', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>Phases</th>
                    <th style={{ padding:'11px 14px', width:120 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map(p => {
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
                              <div style={{ fontWeight:800, fontSize:13, color:'#6366f1' }}>{p.proposal_number}</div>
                              <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{p.created_at || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#4338ca,#6b21c8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:12, flexShrink:0, boxShadow:'0 2px 8px rgba(67,56,202,0.35)' }}>{avatar(p.client_name)}</div>
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
      {viewQuote       && <QuoteDetailModal quote={viewQuote} onClose={() => setViewQuote(null)} onEdit={() => { setEditQuote(viewQuote); setShowForm(true); setViewQuote(null); }} onStatusChange={(id, st) => { setQuotes(qs => qs.map(q => q.id === id ? { ...q, status: st } : q)); setViewQuote(v => v && v.id === id ? { ...v, status: st } : v); }} />}
      {showScanner     && <WhatsAppScannerModal onClose={() => setShowScanner(false)} onCreateQuote={(q) => { setShowScanner(false); setEditQuote({ ...q, id: null }); setShowForm(true); }} />}
      {showProposalForm && <ProposalFormModal proposal={editProposal} onClose={() => { setShowProposalForm(false); setEditProposal(null); }} onSaved={() => { setShowProposalForm(false); setEditProposal(null); fetchProposals(); }} />}
      {viewProposal    && <ProposalDetailModal proposal={viewProposal} onClose={() => setViewProposal(null)} onEdit={() => { setEditProposal(viewProposal); setShowProposalForm(true); setViewProposal(null); }} onStatusChange={(id, st) => { setProposals(ps => ps.map(p => p.id === id ? { ...p, status: st } : p)); setViewProposal(v => v && v.id === id ? { ...v, status: st } : v); }} />}
    </div>
  );
}
