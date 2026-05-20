/**
 * POScannerModals — shared "Scan to PO" modals used across multiple pages.
 * Exposes: POScannerModal, POPreviewModal
 * Consumers: POGRN.jsx (inline copy), SalesOrders.jsx (imports from here)
 */
import React, { useState, useEffect, useRef } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const plusDays = (n) =>
  new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

// ── Shared style tokens ───────────────────────────────────────────────────────

const MODAL_OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
  zIndex: 1000, display: 'flex', alignItems: 'flex-start',
  justifyContent: 'center', overflowY: 'auto', padding: '24px 16px',
};
const MODAL_BOX = {
  background: 'var(--surface)', borderRadius: 14, width: '100%',
  maxWidth: 720, boxShadow: '0 24px 80px rgba(0,0,0,.35)',
  border: '1px solid var(--border)', marginTop: 8,
};
const MODAL_HDR = {
  padding: '18px 22px 14px', borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
};
const MODAL_BODY = { padding: '18px 22px', maxHeight: '70vh', overflowY: 'auto' };
const MODAL_FTR = {
  padding: '14px 22px', borderTop: '1px solid var(--border)',
  display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--s3)',
  borderRadius: '0 0 14px 14px',
};
const INPUT = {
  width: '100%', padding: '8px 11px', border: '1px solid var(--border)',
  borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)',
  fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none',
  transition: 'border-color .15s',
};
const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px',
  fontFamily: 'var(--mono)',
};
const ROW2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 };
const ROW3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 };
const FIELD = { marginBottom: 14 };
const SECTION_TITLE = {
  fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1.6,
  textTransform: 'uppercase', fontFamily: 'var(--mono)', marginBottom: 12,
  marginTop: 6, paddingBottom: 6, borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', gap: 6,
};
const BTN_PRIMARY = {
  padding: '9px 22px', background: 'var(--b2)', color: '#fff', border: 'none',
  borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'var(--font)', display: 'inline-flex', alignItems: 'center', gap: 6,
};
const BTN_GHOST = {
  padding: '9px 18px', background: 'var(--s3)', color: 'var(--text2)',
  border: '1px solid var(--border)', borderRadius: 8, fontSize: 13,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
};
const BTN_GREEN = {
  padding: '9px 22px', background: 'var(--green)', color: '#fff', border: 'none',
  borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'var(--font)', display: 'inline-flex', alignItems: 'center', gap: 6,
};

// ── PO SCANNER MODAL ──────────────────────────────────────────────────────────

export function POScannerModal({ onClose, onPreview }) {
  const [mode, setMode]             = useState('image');
  const [file, setFile]             = useState(null);
  const [fileUrl, setFileUrl]       = useState(null);
  const [textInput, setTextInput]   = useState('');
  const [scanning, setScanning]     = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const [error, setError]           = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [editData, setEditData]     = useState({
    supplier_name: '', payment_terms: '', expected_date: '', notes: '', items: [],
  });
  const [suppliers, setSuppliers]   = useState([]);
  const [suppOpen, setSuppOpen]     = useState(false);
  const fileRef = useRef(null);
  const suppRef = useRef(null);

  useEffect(() => {
    fetch('/api/procurement/suppliers')
      .then(r => r.json())
      .then(d => setSuppliers(d.suppliers || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const close = (e) => {
      if (suppRef.current && !suppRef.current.contains(e.target)) setSuppOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (!scanResult) return;
    setEditData({
      supplier_name: scanResult.supplier_name || '',
      payment_terms: scanResult.payment_terms || '',
      expected_date: scanResult.expected_date || plusDays(7),
      notes: scanResult.notes || '',
      items: (scanResult.items || []).map((it, i) => ({ ...it, _key: i })),
    });
  }, [scanResult]);

  const pickFile = (f) => {
    setFile(f);
    setFileUrl(URL.createObjectURL(f));
    setScanResult(null);
    setError('');
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  };

  const doScan = async () => {
    if (mode === 'image' && !file)            return setError('Upload an image first.');
    if (mode === 'text' && !textInput.trim()) return setError('Paste product text first.');
    setScanning(true); setError(''); setScanResult(null);
    try {
      const fd = new FormData();
      if (mode === 'image' && file) fd.append('file', file);
      if (textInput.trim())         fd.append('text_input', textInput.trim());
      const res  = await fetch('/api/po/scan', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) setScanResult(data);
      else setError(data.error || 'Extraction failed — please try again.');
    } catch { setError('Network error — could not reach server.'); }
    finally { setScanning(false); }
  };

  const setE = (field) => (val) => setEditData(d => ({ ...d, [field]: val }));
  const updItem = (idx, field, val) =>
    setEditData(d => ({ ...d, items: d.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) }));
  const removeItem = (idx) =>
    setEditData(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));
  const addItem = () =>
    setEditData(d => ({
      ...d,
      items: [...d.items, { sku_name: '', category: '', quantity: '', unit: 'Sheets', unit_price: '', specifications: '', _key: Date.now() }],
    }));

  const canScan = mode === 'image' ? !!file : textInput.trim().length > 0;

  return (
    <div style={MODAL_OVERLAY} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...MODAL_BOX, maxWidth: 780 }}>
        <div style={MODAL_HDR}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>📷 Scan to Create PO</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 3 }}>
              Upload a product image or paste text — AI extracts PO details automatically
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <div style={MODAL_BODY}>
          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: 'var(--s3)', padding: 3, borderRadius: 8, border: '1px solid var(--border)', width: 'fit-content' }}>
            {[{ id: 'image', label: '📷 Image / Photo' }, { id: 'text', label: '📝 Paste Text' }].map(t => (
              <button key={t.id} onClick={() => { setMode(t.id); setScanResult(null); setError(''); }}
                style={{ padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all .15s', background: mode === t.id ? 'var(--surface)' : 'transparent', color: mode === t.id ? 'var(--b2)' : 'var(--text3)', boxShadow: mode === t.id ? 'var(--sh)' : 'none' }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Image upload drop zone */}
          {mode === 'image' && (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${dragOver ? 'var(--b2)' : 'var(--border)'}`, borderRadius: 10, padding: fileUrl ? 0 : '36px 24px', textAlign: 'center', cursor: 'pointer', marginBottom: 10, background: dragOver ? 'rgba(59,130,246,.05)' : 'var(--s3)', transition: 'all .15s', overflow: 'hidden' }}>
                {fileUrl ? (
                  <div style={{ position: 'relative' }}>
                    <img src={fileUrl} alt="Upload preview" style={{ maxWidth: '100%', maxHeight: 240, display: 'block', margin: '0 auto', borderRadius: 8 }} />
                    <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 10, padding: '3px 8px', borderRadius: 4 }}>Click to replace</div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📷</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Drop product image here or click to browse</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Product photos, catalog pages, labels, brochures — JPG / PNG / WebP up to 10 MB</div>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => e.target.files[0] && pickFile(e.target.files[0])} />
              </div>
              {file && (
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 14 }}>
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </div>
              )}
            </>
          )}

          {/* Text paste area */}
          {mode === 'text' && (
            <div style={{ marginBottom: 14 }}>
              <label style={LABEL}>Product text, catalog listing, or description</label>
              <textarea value={textInput} onChange={e => setTextInput(e.target.value)} rows={7}
                placeholder={'Paste product details here.\n\nExamples:\n• Merino HPL 1mm Matte BW-8071 8×4 — 50 Sheets @ ₹480\n• Greenlam Compact 6mm White 8×4 — 20 Sheets @ ₹1,200\n• Supplier: Merino Industries | Payment: NET-30 Days'}
                style={{ ...INPUT, resize: 'vertical', lineHeight: 1.6, fontSize: 12 }} />
            </div>
          )}

          {/* Extract button */}
          {!scanResult && (
            <button onClick={doScan} disabled={scanning || !canScan}
              style={{ ...BTN_PRIMARY, background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', width: '100%', justifyContent: 'center', marginBottom: 10, padding: '11px 24px', opacity: (!scanning && !canScan) ? 0.45 : 1, cursor: (!scanning && !canScan) ? 'not-allowed' : 'pointer' }}>
              {scanning ? '⏳ AI is extracting PO details…' : '✨ Extract PO Details with AI'}
            </button>
          )}

          {error && (
            <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 7, padding: '9px 13px', fontSize: 12, color: 'var(--r2)', marginBottom: 14 }}>
              ⚠ {error}
            </div>
          )}

          {/* Extracted & editable results */}
          {scanResult && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '8px 12px', background: 'var(--g5)', border: '1px solid var(--g4)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: 'var(--green)' }}>✓</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
                    AI Extraction Complete — {editData.items.length} item{editData.items.length !== 1 ? 's' : ''} found
                    {scanResult.demo && (
                      <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>(demo mode)</span>
                    )}
                  </span>
                </div>
                <button onClick={() => { setScanResult(null); setError(''); }}
                  style={{ fontSize: 11, padding: '3px 9px', background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                  ↺ Re-scan
                </button>
              </div>

              {/* Editable supplier / order fields */}
              <div style={ROW3}>
                {/* Supplier combo-box (from Procurement Intelligence) */}
                <div style={FIELD} ref={suppRef}>
                  <label style={LABEL}>
                    Supplier Name
                    {suppliers.length > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--b2)', marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>
                        {suppliers.length} from Procurement
                      </span>
                    )}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      value={editData.supplier_name}
                      onChange={e => { setE('supplier_name')(e.target.value); setSuppOpen(true); }}
                      onFocus={() => setSuppOpen(true)}
                      style={{ ...INPUT, paddingRight: 28 }}
                      placeholder="Type or select supplier…"
                      autoComplete="off"
                    />
                    <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text3)', pointerEvents: 'none' }}>▾</span>
                    {suppOpen && (() => {
                      const q = editData.supplier_name.toLowerCase();
                      const filtered = suppliers.filter(s => s.name.toLowerCase().includes(q));
                      if (!filtered.length) return null;
                      return (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.18)', marginTop: 2, maxHeight: 220, overflowY: 'auto' }}>
                          {filtered.map(s => {
                            const isPref = s.recommendation === 'PREFERRED';
                            const isGood = s.recommendation === 'GOOD';
                            const badgeC = isPref
                              ? { bg: 'var(--g3)', txt: 'var(--green)', border: 'var(--g4)' }
                              : isGood
                              ? { bg: 'var(--b5,#eff6ff)', txt: 'var(--b2)', border: 'var(--b4,#bfdbfe)' }
                              : { bg: 'var(--a3)', txt: 'var(--a2)', border: 'var(--a4)' };
                            return (
                              <div key={s.name}
                                onMouseDown={e => { e.preventDefault(); setE('supplier_name')(s.name); setSuppOpen(false); }}
                                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--s3)'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 700, fontFamily: 'var(--mono)', background: badgeC.bg, color: badgeC.txt, border: `1px solid ${badgeC.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                    {s.recommendation}
                                  </span>
                                </div>
                                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: s.on_time_pct >= 90 ? 'var(--green)' : s.on_time_pct >= 80 ? 'var(--a2)' : 'var(--r2)', fontWeight: 700, flexShrink: 0 }}>
                                  {s.on_time_pct}% OT
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div style={FIELD}>
                  <label style={LABEL}>Payment Terms</label>
                  <input value={editData.payment_terms} onChange={e => setE('payment_terms')(e.target.value)} style={INPUT} placeholder="e.g. NET-30 Days" />
                </div>
                <div style={FIELD}>
                  <label style={LABEL}>Expected Date</label>
                  <input type="date" value={editData.expected_date} onChange={e => setE('expected_date')(e.target.value)} style={INPUT} />
                </div>
              </div>
              <div style={FIELD}>
                <label style={LABEL}>Notes / Instructions</label>
                <input value={editData.notes} onChange={e => setE('notes')(e.target.value)} style={INPUT} placeholder="Grade requirements, certifications, handling notes…" />
              </div>

              {/* Line items */}
              <div style={{ ...SECTION_TITLE, marginTop: 4 }}>📦 Extracted Line Items</div>
              {editData.items.map((item, idx) => (
                <div key={item._key ?? idx} style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px 8px', marginBottom: 10, position: 'relative' }}>
                  <button onClick={() => removeItem(idx)}
                    style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--r2)', lineHeight: 1, padding: '0 2px' }}>×</button>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Line Item {idx + 1}
                  </div>
                  <div style={ROW2}>
                    <div style={FIELD}>
                      <label style={LABEL}>SKU / Product Name</label>
                      <input value={item.sku_name || ''} onChange={e => updItem(idx, 'sku_name', e.target.value)} style={INPUT} placeholder="Full product name" />
                    </div>
                    <div style={FIELD}>
                      <label style={LABEL}>Category</label>
                      <input value={item.category || ''} onChange={e => updItem(idx, 'category', e.target.value)} style={INPUT} placeholder="e.g. Laminates" />
                    </div>
                  </div>
                  <div style={ROW3}>
                    <div style={FIELD}>
                      <label style={LABEL}>Quantity</label>
                      <input type="number" value={item.quantity ?? ''} onChange={e => updItem(idx, 'quantity', e.target.value)} style={INPUT} placeholder="0" />
                    </div>
                    <div style={FIELD}>
                      <label style={LABEL}>Unit</label>
                      <input value={item.unit || ''} onChange={e => updItem(idx, 'unit', e.target.value)} style={INPUT} placeholder="Sheets" />
                    </div>
                    <div style={FIELD}>
                      <label style={LABEL}>Unit Price (₹)</label>
                      <input type="number" value={item.unit_price ?? ''} onChange={e => updItem(idx, 'unit_price', e.target.value)} style={INPUT} placeholder="0.00" />
                    </div>
                  </div>
                  <div style={FIELD}>
                    <label style={LABEL}>Specifications</label>
                    <input value={item.specifications || ''} onChange={e => updItem(idx, 'specifications', e.target.value)} style={INPUT} placeholder="Size, finish, grade, design code…" />
                  </div>
                  {item.quantity && item.unit_price && (
                    <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700, marginBottom: 4 }}>
                      = ₹{(Number(item.quantity) * Number(item.unit_price)).toLocaleString('en-IN')} total
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addItem}
                style={{ width: '100%', padding: '8px 16px', background: 'var(--s3)', border: '1px dashed var(--border)', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: 'var(--text3)', fontWeight: 600, marginBottom: 4 }}>
                + Add Line Item
              </button>
            </>
          )}
        </div>

        <div style={MODAL_FTR}>
          <button onClick={onClose} style={BTN_GHOST}>Cancel</button>
          {scanResult && (
            <button onClick={() => onPreview(editData)}
              disabled={editData.items.length === 0}
              style={{ ...BTN_PRIMARY, background: 'var(--b2)', opacity: editData.items.length === 0 ? 0.45 : 1, cursor: editData.items.length === 0 ? 'not-allowed' : 'pointer' }}>
              👁 Preview PO →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PO PREVIEW MODAL ──────────────────────────────────────────────────────────

export function POPreviewModal({ scanResult, onEdit, onClose, onSuccess }) {
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState('');

  const items      = scanResult?.items || [];
  const grandTotal = items.reduce(
    (s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0,
  );
  const poDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const handleCreate = async () => {
    if (!items.length) return;
    setCreating(true); setError('');
    const results = [];
    for (const item of items) {
      try {
        const noteParts = [
          scanResult.payment_terms ? `Payment: ${scanResult.payment_terms}` : '',
          item.category             ? `Category: ${item.category}`           : '',
          item.specifications       ? `Specs: ${item.specifications}`         : '',
        ].filter(Boolean);
        const res = await fetch('/api/po', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supplier_name: scanResult.supplier_name || 'Unknown Supplier',
            sku_name:      item.sku_name || 'Product',
            quantity:      Number(item.quantity) || 1,
            unit_price:    item.unit_price != null ? Number(item.unit_price) : null,
            expected_date: scanResult.expected_date || undefined,
            notes:         noteParts.join(' | ') || undefined,
            category:      item.category || undefined,
            unit:          item.unit || undefined,
          }),
        });
        const data = await res.json();
        if (data.success) results.push({ ...data, sku_name: item.sku_name });
      } catch { /* non-blocking: continue with next item */ }
    }
    setCreating(false);
    if (results.length > 0) onSuccess(results);
    else setError('Could not create POs — please try again.');
  };

  return (
    <div style={{ ...MODAL_OVERLAY, zIndex: 1100 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...MODAL_BOX, maxWidth: 760 }}>
        <div style={MODAL_HDR}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>📋 Purchase Order Preview</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 3 }}>
              {items.length} line item{items.length !== 1 ? 's' : ''} · Estimated total ₹{grandTotal.toLocaleString('en-IN')}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <div style={MODAL_BODY}>
          {/* PO Document */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            {/* Header banner */}
            <div style={{ background: 'var(--b2)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: 0.4 }}>PURCHASE ORDER</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.7)', fontFamily: 'var(--mono)', marginTop: 3 }}>Draft · {poDate}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{scanResult?.supplier_name || '—'}</div>
                {scanResult?.expected_date && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.75)', fontFamily: 'var(--mono)', marginTop: 2 }}>ETA: {scanResult.expected_date}</div>
                )}
                {scanResult?.payment_terms && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.75)', fontFamily: 'var(--mono)', marginTop: 1 }}>{scanResult.payment_terms}</div>
                )}
              </div>
            </div>

            {/* Line items table */}
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>Product / SKU</th>
                    <th>Category</th>
                    <th>Specifications</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Rate (₹)</th>
                    <th>Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const rowTotal = Number(item.quantity || 0) * Number(item.unit_price || 0);
                    return (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', textAlign: 'center', fontSize: 11 }}>{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{item.sku_name || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>{item.category || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 150 }}>{item.specifications || '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 600, textAlign: 'right' }}>{item.quantity ?? '—'}</td>
                        <td style={{ fontSize: 11 }}>{item.unit || '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{item.unit_price != null ? Number(item.unit_price).toLocaleString('en-IN') : '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right', color: rowTotal > 0 ? 'var(--green)' : 'var(--text3)' }}>
                          {rowTotal > 0 ? rowTotal.toLocaleString('en-IN') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Grand total row */}
            <div style={{ padding: '12px 18px', background: 'var(--s3)', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              {scanResult?.notes
                ? <div style={{ fontSize: 11, color: 'var(--text3)', maxWidth: '55%', fontStyle: 'italic' }}>📝 {scanResult.notes}</div>
                : <div />}
              <div>
                <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Grand Total:&nbsp;</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
                  ₹{grandTotal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 7, padding: '9px 13px', fontSize: 12, color: 'var(--r2)', marginBottom: 12 }}>
              ⚠ {error}
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textAlign: 'center' }}>
            Clicking Create will raise {items.length} PO{items.length !== 1 ? 's' : ''} (one per line item) to {scanResult?.supplier_name || 'the supplier'}.
          </div>
        </div>

        <div style={MODAL_FTR}>
          <button onClick={onEdit}  style={BTN_GHOST} disabled={creating}>✏ Edit</button>
          <button onClick={onClose} style={BTN_GHOST} disabled={creating}>Cancel</button>
          <button onClick={handleCreate}
            disabled={creating || !items.length}
            style={{ ...BTN_GREEN, opacity: (creating || !items.length) ? 0.65 : 1, cursor: (creating || !items.length) ? 'not-allowed' : 'pointer' }}>
            {creating
              ? `⏳ Creating ${items.length} PO${items.length !== 1 ? 's' : ''}…`
              : `📋 Create ${items.length} PO${items.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
