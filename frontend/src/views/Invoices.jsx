import React, { useState, useEffect, useCallback, useRef } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { exportToCsv } from '../utils/exportUtils';

/* ── Formatters ─────────────────────────────────────────────────────────── */
const fmt   = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtL  = (n) => { const v = Number(n || 0); return v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : fmt(v); };
const fmtPct= (n) => `${Number(n || 0).toFixed(1)}%`;

/* ── GSTIN state code map ────────────────────────────────────────────────── */
const STATE_CODES = {
  '01':'J&K','02':'HP','03':'Punjab','04':'Chandigarh','05':'Uttarakhand',
  '06':'Haryana','07':'Delhi','08':'Rajasthan','09':'UP','10':'Bihar',
  '11':'Sikkim','12':'Arunachal','13':'Nagaland','14':'Manipur','15':'Mizoram',
  '16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal','20':'Jharkhand',
  '21':'Odisha','22':'Chhattisgarh','23':'MP','24':'Gujarat','25':'Daman & Diu',
  '26':'DNH','27':'Maharashtra','28':'AP','29':'Karnataka','30':'Goa',
  '31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu','34':'Puducherry',
  '35':'A&N Islands','36':'Telangana','37':'AP (New)','38':'Ladakh',
};
const gstinStateCode = (g) => g ? g.slice(0, 2) : '';
const gstinStateName = (g) => STATE_CODES[gstinStateCode(g)] || '';
const validateGstin  = (g) => /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test((g || '').toUpperCase());

/* ── Status config ────────────────────────────────────────────────────────── */
const INV_STATUS = {
  DRAFT:          { color: '#6b7280', bg: '#f3f4f6',  label: 'Draft' },
  SENT:           { color: '#2563eb', bg: '#dbeafe',   label: 'Sent' },
  PARTIALLY_PAID: { color: '#d97706', bg: '#fef3c7',   label: 'Part Paid' },
  PAID:           { color: '#16a34a', bg: '#dcfce7',   label: 'Paid' },
  OVERDUE:        { color: '#dc2626', bg: '#fee2e2',   label: 'Overdue' },
  CANCELLED:      { color: '#6b7280', bg: '#f3f4f6',   label: 'Cancelled' },
};

function StatusBadge({ status }) {
  const c = INV_STATUS[status] || { color: '#6b7280', bg: '#f3f4f6', label: status };
  return <span style={{ background: c.bg, color: c.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{c.label}</span>;
}

/* ── GSTIN Input with validation indicator ─────────────────────────────── */
function GstinInput({ value, onChange, placeholder = '29AABCX1234Z1ZA', style = {} }) {
  const valid = !value || validateGstin(value);
  const state = value && valid ? gstinStateName(value) : '';
  return (
    <div style={{ position: 'relative' }}>
      <input value={value || ''} onChange={e => onChange(e.target.value.toUpperCase())}
        placeholder={placeholder} maxLength={15}
        style={{ ...style, paddingRight: value ? 80 : undefined,
          borderColor: value && !valid ? '#ef4444' : value && valid ? '#16a34a' : undefined }}
      />
      {value && (
        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          fontSize: 10, fontWeight: 700, color: valid ? '#16a34a' : '#ef4444', whiteSpace: 'nowrap' }}>
          {valid ? `✓ ${state || 'Valid'}` : '✗ Invalid'}
        </span>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Invoice Create / Edit Modal
══════════════════════════════════════════════════════════════════════════ */
function InvoiceFormModal({ invoice, onClose, onSave, companyProfile }) {
  const isEdit = !!invoice?.id;
  const today  = new Date().toISOString().slice(0, 10);
  const due30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const emptyLine = () => ({
    description: '', hsn_sac: '', qty: 1, unit: 'nos', rate: 0,
    discount_pct: 0, cgst_rate: 9, sgst_rate: 9, igst_rate: 18,
  });

  const [form, setForm] = useState(() => invoice ? {
    ...invoice,
    line_items: invoice.line_items || [emptyLine()],
  } : {
    invoice_number: '', invoice_date: today, due_date: due30,
    customer_name: '', customer_gstin: '', billing_address: '', shipping_address: '',
    place_of_supply: '', is_igst: false,
    notes: '', terms: 'Payment due within 30 days of invoice date.',
    reference_so_number: '', status: 'DRAFT',
    line_items: [emptyLine()],
  });
  const [saving, setSaving] = useState(false);

  const up = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-detect IGST when customer GSTIN entered
  const companyStateCode = gstinStateCode(companyProfile?.gstin || '');
  useEffect(() => {
    if (form.customer_gstin && validateGstin(form.customer_gstin) && companyStateCode) {
      const customerState = gstinStateCode(form.customer_gstin);
      up('is_igst', customerState !== companyStateCode);
      up('place_of_supply', STATE_CODES[customerState] || '');
    }
  }, [form.customer_gstin, companyStateCode]);

  const updLine = (i, k, v) => {
    const ls = [...form.line_items];
    ls[i] = { ...ls[i], [k]: v };
    setForm(f => ({ ...f, line_items: ls }));
  };

  const addLine    = () => setForm(f => ({ ...f, line_items: [...f.line_items, emptyLine()] }));
  const removeLine = (i) => setForm(f => ({ ...f, line_items: f.line_items.filter((_, j) => j !== i) }));

  // Derived totals
  const lines = form.line_items || [];
  const subtotal = lines.reduce((s, l) => s + (parseFloat(l.qty)||0)*(parseFloat(l.rate)||0)*(1-(parseFloat(l.discount_pct)||0)/100), 0);
  let cgst = 0, sgst = 0, igst = 0;
  lines.forEach(l => {
    const taxBase = (parseFloat(l.qty)||0)*(parseFloat(l.rate)||0)*(1-(parseFloat(l.discount_pct)||0)/100);
    if (form.is_igst) igst += taxBase * (parseFloat(l.igst_rate)||0) / 100;
    else { cgst += taxBase * (parseFloat(l.cgst_rate)||0) / 100; sgst += taxBase * (parseFloat(l.sgst_rate)||0) / 100; }
  });
  const grandTotal = subtotal + cgst + sgst + igst;

  const handleSave = async () => {
    if (!form.customer_name.trim()) { alert('Customer name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
        subtotal, taxable_amount: subtotal, total_tax: cgst+sgst+igst, grand_total: grandTotal };
      const url = isEdit ? `/api/invoices/${invoice.id}` : '/api/invoices';
      const r = await fetch(url, { method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(`Save failed ${r.status}`);
      const data = await r.json();
      onSave({ ...payload, id: data.id || invoice?.id, invoice_number: data.invoice_number || form.invoice_number });
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const INPUT = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };
  const LABEL = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)',
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--card)', borderRadius: 12, width: '100%', maxWidth: 1100,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg,#0f2744,#1a3a5c)', flexShrink: 0 }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>
              {isEdit ? `✏️ Edit Invoice — ${invoice.invoice_number}` : '+ New GST Invoice'}
            </div>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, marginTop: 2 }}>
              {form.is_igst ? '⚠ Inter-state supply — IGST applicable' : '✓ Intra-state supply — CGST + SGST applicable'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: 'rgba(255,255,255,.7)' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left: Customer + Terms */}
          <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)',
            overflowY: 'auto', padding: '14px 18px' }}>

            <div style={{ fontWeight: 700, fontSize: 11, color: '#2563eb', textTransform: 'uppercase',
              letterSpacing: 1, marginBottom: 10 }}>📋 Invoice Details</div>

            <label style={LABEL}>Invoice Number</label>
            <input value={form.invoice_number} onChange={e => up('invoice_number', e.target.value)}
              style={INPUT} placeholder="Auto-generated if blank" />
            <div style={{ height: 8 }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={LABEL}>Invoice Date *</label>
                <input type="date" value={form.invoice_date} onChange={e => up('invoice_date', e.target.value)} style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Due Date</label>
                <input type="date" value={form.due_date} onChange={e => up('due_date', e.target.value)} style={INPUT} />
              </div>
            </div>
            <div style={{ height: 8 }} />
            <label style={LABEL}>Reference SO #</label>
            <input value={form.reference_so_number} onChange={e => up('reference_so_number', e.target.value)}
              style={INPUT} placeholder="SO-2026-0033" />

            <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0 10px' }} />
            <div style={{ fontWeight: 700, fontSize: 11, color: '#2563eb', textTransform: 'uppercase',
              letterSpacing: 1, marginBottom: 10 }}>👤 Bill To</div>

            <label style={LABEL}>Customer Name *</label>
            <input value={form.customer_name} onChange={e => up('customer_name', e.target.value)}
              style={INPUT} placeholder="Company / Individual name" />
            <div style={{ height: 8 }} />
            <label style={LABEL}>Customer GSTIN</label>
            <GstinInput value={form.customer_gstin} onChange={v => up('customer_gstin', v)} style={INPUT} />
            {form.customer_gstin && validateGstin(form.customer_gstin) && (
              <div style={{ fontSize: 11, color: form.is_igst ? '#d97706' : '#16a34a', marginTop: 3 }}>
                {form.is_igst
                  ? `⚠ Different state (${gstinStateName(form.customer_gstin)}) → IGST @${(lines[0]?.igst_rate||18)}%`
                  : `✓ Same state → CGST @${(lines[0]?.cgst_rate||9)}% + SGST @${(lines[0]?.sgst_rate||9)}%`}
              </div>
            )}
            <div style={{ height: 8 }} />
            <label style={LABEL}>Billing Address</label>
            <textarea rows={2} value={form.billing_address} onChange={e => up('billing_address', e.target.value)}
              style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ height: 8 }} />
            <label style={LABEL}>Place of Supply</label>
            <input value={form.place_of_supply} onChange={e => up('place_of_supply', e.target.value)}
              style={INPUT} placeholder="e.g. Karnataka" />
            <div style={{ height: 8 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              fontSize: 12, color: 'var(--muted)', userSelect: 'none', marginBottom: 10 }}>
              <input type="checkbox" checked={form.is_igst} onChange={e => up('is_igst', e.target.checked)} />
              Override: Apply IGST (inter-state)
            </label>

            <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0' }} />
            <label style={LABEL}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => up('notes', e.target.value)}
              style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ height: 8 }} />
            <label style={LABEL}>Terms & Conditions</label>
            <textarea rows={2} value={form.terms} onChange={e => up('terms', e.target.value)}
              style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', fontSize: 11 }} />
            <div style={{ height: 8 }} />
            <label style={LABEL}>Status</label>
            <select value={form.status} onChange={e => up('status', e.target.value)} style={INPUT}>
              {Object.entries(INV_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {/* Right: Line items */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'var(--card)' }}>
              <span style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Line Items
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>{lines.length} items · {fmt(subtotal)} taxable</span>
              <button onClick={addLine} style={{ padding: '5px 12px', background: '#2563eb', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                + Add Line
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 820 }}>
                <thead>
                  <tr style={{ background: 'var(--hover)', position: 'sticky', top: 0, zIndex: 2 }}>
                    {['#','Description','HSN/SAC','Qty','Unit','Rate (₹)','Disc%',
                      form.is_igst ? 'IGST%' : 'CGST%',
                      form.is_igst ? '' : 'SGST%',
                      'Amount',''].filter(Boolean).map(h => (
                      <th key={h} style={{ padding: '7px 8px', textAlign: 'left', fontSize: 11,
                        fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const taxBase = (parseFloat(l.qty)||0)*(parseFloat(l.rate)||0)*(1-(parseFloat(l.discount_pct)||0)/100);
                    const tax = form.is_igst
                      ? taxBase * (parseFloat(l.igst_rate)||0) / 100
                      : taxBase * ((parseFloat(l.cgst_rate)||0) + (parseFloat(l.sgst_rate)||0)) / 100;
                    const lineTotal = taxBase + tax;
                    const CI = { padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4,
                      background: 'var(--bg)', color: 'var(--text)', fontSize: 12, boxSizing: 'border-box', width: '100%' };
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '7px 6px', color: 'var(--muted)', fontSize: 11 }}>{i+1}</td>
                        <td style={{ padding: '4px 6px', minWidth: 160 }}>
                          <input value={l.description} onChange={e => updLine(i,'description',e.target.value)}
                            placeholder="Item description" style={CI} />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input value={l.hsn_sac} onChange={e => updLine(i,'hsn_sac',e.target.value)}
                            placeholder="4411" style={{ ...CI, width: 60 }} />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input type="number" min="0" value={l.qty} onChange={e => updLine(i,'qty',e.target.value)}
                            style={{ ...CI, width: 52, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <select value={l.unit} onChange={e => updLine(i,'unit',e.target.value)} style={{ ...CI, width: 52 }}>
                            {['nos','sheet','rft','sqft','kg','mt','set','ls'].map(u => <option key={u}>{u}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input type="number" min="0" value={l.rate} onChange={e => updLine(i,'rate',e.target.value)}
                            style={{ ...CI, width: 80, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input type="number" min="0" max="100" value={l.discount_pct} onChange={e => updLine(i,'discount_pct',e.target.value)}
                            style={{ ...CI, width: 44, textAlign: 'center' }} />
                        </td>
                        {form.is_igst ? (
                          <td style={{ padding: '4px 6px' }}>
                            <select value={l.igst_rate} onChange={e => updLine(i,'igst_rate',e.target.value)} style={{ ...CI, width: 52 }}>
                              {[0,5,12,18,28].map(r => <option key={r} value={r}>{r}%</option>)}
                            </select>
                          </td>
                        ) : (
                          <>
                            <td style={{ padding: '4px 6px' }}>
                              <select value={l.cgst_rate} onChange={e => { updLine(i,'cgst_rate',e.target.value); updLine(i,'sgst_rate',e.target.value); }} style={{ ...CI, width: 52 }}>
                                {[0,2.5,6,9,14].map(r => <option key={r} value={r}>{r}%</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <select value={l.sgst_rate} onChange={e => updLine(i,'sgst_rate',e.target.value)} style={{ ...CI, width: 52 }}>
                                {[0,2.5,6,9,14].map(r => <option key={r} value={r}>{r}%</option>)}
                              </select>
                            </td>
                          </>
                        )}
                        <td style={{ padding: '7px 8px', fontWeight: 700, color: '#2563eb', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {lineTotal > 0 ? fmt(lineTotal) : '—'}
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <button onClick={() => removeLine(i)} style={{ background: 'none', border: 'none',
                            cursor: 'pointer', color: '#ef4444', fontSize: 14 }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end', background: 'var(--card)', flexShrink: 0 }}>
              <div style={{ width: 280, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {[
                  ['Subtotal (Taxable)', fmt(subtotal)],
                  ...(form.is_igst
                    ? [['IGST', fmt(igst)]]
                    : [['CGST', fmt(cgst)], ['SGST', fmt(sgst)]]),
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between',
                    padding: '7px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>{l}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px',
                  fontSize: 16, fontWeight: 900, background: '#2563eb', color: '#fff' }}>
                  <span>TOTAL</span><span>{fmt(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', background: 'var(--card)', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', background: 'var(--hover)',
            color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '8px 22px', background: 'linear-gradient(135deg,#1e3a5f,#2563eb)', color: '#fff',
              border: 'none', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}>
            {saving ? '⏳ Saving…' : isEdit ? '✅ Update Invoice' : '✅ Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Payment Modal
══════════════════════════════════════════════════════════════════════════ */
function PaymentModal({ invoice, onClose, onRecorded }) {
  const balance = (parseFloat(invoice.grand_total) || 0) - (parseFloat(invoice.paid_amount) || 0);
  const [amount,  setAmount]  = useState(balance.toFixed(2));
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [mode,    setMode]    = useState('NEFT');
  const [ref,     setRef]     = useState('');
  const [notes,   setNotes]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const handleSave = async () => {
    if (!parseFloat(amount) || parseFloat(amount) <= 0) { setError('Enter a valid amount'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch(`/api/invoices/${invoice.id}/payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(amount), payment_date: date, payment_mode: mode, reference: ref, notes }),
      });
      if (!r.ok) throw new Error(`Failed ${r.status}`);
      const d = await r.json();
      onRecorded(d.new_status);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const INPUT = { width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--card)', borderRadius: 12, width: '100%', maxWidth: 440, overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>
        <div style={{ background: 'linear-gradient(135deg,#14532d,#16a34a)', padding: '14px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>💰 Record Payment</div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, marginTop: 2 }}>
              {invoice.invoice_number} · Balance: {fmt(balance)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.7)', fontSize: 20 }}>✕</button>
        </div>
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Amount (₹) *</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={INPUT} min="0" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INPUT} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)} style={INPUT}>
              {['NEFT','RTGS','IMPS','UPI','CHEQUE','CASH','OTHER'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Reference / UTR No.</label>
            <input value={ref} onChange={e => setRef(e.target.value)} style={INPUT} placeholder="Transaction ID / Cheque No." />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} style={INPUT} />
          </div>
          {error && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '7px 14px', background: 'var(--hover)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '8px 18px', background: 'linear-gradient(135deg,#14532d,#16a34a)', color: '#fff',
                border: 'none', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
              {saving ? '⏳ Saving…' : '💰 Record Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Print Invoice (GST-compliant format)
══════════════════════════════════════════════════════════════════════════ */
function printInvoice(inv, companyProfile) {
  const cp = companyProfile || {};
  const lineRows = (inv.line_items || []).map((l, i) => {
    const taxBase = (parseFloat(l.qty)||0)*(parseFloat(l.rate)||0)*(1-(parseFloat(l.discount_pct)||0)/100);
    const tax = inv.is_igst
      ? taxBase * (parseFloat(l.igst_rate)||0) / 100
      : taxBase * ((parseFloat(l.cgst_rate)||0)+(parseFloat(l.sgst_rate)||0)) / 100;
    const taxCols = inv.is_igst
      ? `<td style="text-align:right">${l.igst_rate||18}%</td><td style="text-align:right">₹${tax.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>`
      : `<td style="text-align:right">${l.cgst_rate||9}%</td><td style="text-align:right">₹${(taxBase*(parseFloat(l.cgst_rate)||9)/100).toLocaleString('en-IN',{maximumFractionDigits:0})}</td><td style="text-align:right">${l.sgst_rate||9}%</td><td style="text-align:right">₹${(taxBase*(parseFloat(l.sgst_rate)||9)/100).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>`;
    return `<tr><td>${i+1}</td><td><strong>${l.description}</strong>${l.hsn_sac?`<br/><small>HSN: ${l.hsn_sac}</small>`:''}</td><td style="text-align:center">${l.qty} ${l.unit}</td><td style="text-align:right">₹${(parseFloat(l.rate)||0).toLocaleString('en-IN')}</td><td style="text-align:center">${l.discount_pct||0}%</td><td style="text-align:right">₹${taxBase.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>${taxCols}<td style="text-align:right;font-weight:700">₹${(taxBase+tax).toLocaleString('en-IN',{maximumFractionDigits:0})}</td></tr>`;
  }).join('');
  const taxHeader = inv.is_igst ? '<th>IGST%</th><th>IGST Amt</th>' : '<th>CGST%</th><th>CGST Amt</th><th>SGST%</th><th>SGST Amt</th>';
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Tax Invoice ${inv.invoice_number}</title>
<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#1f2937;margin:0;padding:24px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #2563eb;margin-bottom:16px}
.co{font-size:14px;font-weight:700}.co-sub{font-size:11px;color:#6b7280;line-height:1.7}
.inv-title{font-size:20px;font-weight:900;color:#2563eb;text-align:right}
.inv-meta{font-size:11px;color:#6b7280;text-align:right;line-height:1.8}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.party{border:1px solid #e5e7eb;border-radius:6px;padding:12px}
.party-lbl{font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.party-name{font-weight:700;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px}
th{background:#2563eb;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
td{padding:6px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}
tr:nth-child(even) td{background:#f9fafb}
.totals{width:280px;margin-left:auto;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden}
.tot-row{display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:12px}
.tot-grand{display:flex;justify-content:space-between;padding:10px 12px;font-size:15px;font-weight:900;background:#2563eb;color:#fff}
.footer{margin-top:20px;display:flex;justify-content:space-between;align-items:flex-end}
.sig{border-top:1px solid #e5e7eb;padding-top:6px;margin-top:40px;font-size:11px;color:#6b7280;min-width:180px}
.badge{display:inline-block;background:#dbeafe;color:#1d4ed8;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:700;margin-left:6px}
@media print{body{padding:12px}button{display:none!important}}
</style></head><body>
<div class="hdr">
  <div>
    ${cp.logo_url ? `<img src="${cp.logo_url}" style="height:40px;margin-bottom:4px;display:block">` : ''}
    <div class="co">${cp.company_name || 'InvenIQ Building Materials'}</div>
    <div class="co-sub">${cp.address || ''}<br/>${cp.gstin ? `GSTIN: ${cp.gstin}` : ''} ${cp.pan ? `| PAN: ${cp.pan}` : ''}</div>
  </div>
  <div>
    <div class="inv-title">TAX INVOICE <span class="badge">${inv.is_igst ? 'IGST' : 'CGST+SGST'}</span></div>
    <div class="inv-meta">
      Invoice No: <strong>${inv.invoice_number}</strong><br/>
      Date: <strong>${inv.invoice_date}</strong><br/>
      Due: <strong>${inv.due_date}</strong><br/>
      Place of Supply: <strong>${inv.place_of_supply || '—'}</strong>
    </div>
  </div>
</div>
<div class="parties">
  <div class="party">
    <div class="party-lbl">Bill To</div>
    <div class="party-name">${inv.customer_name}</div>
    ${inv.customer_gstin ? `<div style="font-size:11px;color:#6b7280;margin-top:4px">GSTIN: ${inv.customer_gstin}</div>` : ''}
    ${inv.billing_address ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${inv.billing_address}</div>` : ''}
  </div>
  <div class="party">
    <div class="party-lbl">From</div>
    <div class="party-name">${cp.company_name || 'InvenIQ'}</div>
    ${cp.address ? `<div style="font-size:11px;color:#6b7280;margin-top:4px">${cp.address}</div>` : ''}
    ${cp.bank_name ? `<div style="font-size:11px;color:#6b7280;margin-top:4px">Bank: ${cp.bank_name} | A/C: ${cp.bank_account || ''} | IFSC: ${cp.ifsc_code || ''}</div>` : ''}
  </div>
</div>
<table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Rate</th><th>Disc</th><th>Taxable Amt</th>${taxHeader}<th>Amount</th></tr></thead><tbody>${lineRows}</tbody></table>
<div class="totals">
  <div class="tot-row"><span style="color:#6b7280">Subtotal</span><span style="font-weight:600">₹${(inv.subtotal||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</span></div>
  ${inv.is_igst ? `<div class="tot-row"><span style="color:#6b7280">IGST</span><span>₹${(inv.igst_amount||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</span></div>` : `<div class="tot-row"><span style="color:#6b7280">CGST</span><span>₹${(inv.cgst_amount||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</span></div><div class="tot-row"><span style="color:#6b7280">SGST</span><span>₹${(inv.sgst_amount||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</span></div>`}
  <div class="tot-grand"><span>TOTAL</span><span>₹${(inv.grand_total||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</span></div>
</div>
${inv.terms ? `<div style="font-size:11px;color:#6b7280;margin-top:12px"><strong>Terms:</strong> ${inv.terms}</div>` : ''}
<div class="footer">
  <div style="font-size:11px;color:#6b7280">${inv.notes || ''}</div>
  <div class="sig">For ${cp.company_name || 'InvenIQ'}<br/>${cp.signature_name || 'Authorised Signatory'}</div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`);
  w.document.close();
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN VIEW
══════════════════════════════════════════════════════════════════════════ */
export default function Invoices({ dbStatus, onGoChat }) {
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [statusFilter,  setStatusFilter]  = useState('');
  const [search,        setSearch]        = useState('');
  const [showForm,      setShowForm]      = useState(false);
  const [editInvoice,   setEditInvoice]   = useState(null);
  const [viewInvoice,   setViewInvoice]   = useState(null);
  const [payModal,      setPayModal]      = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search)       params.set('search', search);
      const [invR, cpR] = await Promise.all([
        fetch(`/api/invoices?${params}`).then(r => r.json()),
        fetch('/api/company-profile').then(r => r.json()),
      ]);
      setData(invR);
      setCompanyProfile(cpR.profile || null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter, search]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  const silentFetch = useCallback(async () => { try { const r = await fetch(`/api/invoices`); const d = await r.json(); setData(d); } catch {} }, []);
  useAutoRefresh(silentFetch);

  const kpis = data?.kpis || {};
  const invoices = data?.invoices || [];

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--muted)', fontSize: 14 }}>Loading invoices…</div>;

  return (
    <div className="view">
      {/* Modals */}
      {showForm && (
        <InvoiceFormModal
          invoice={editInvoice}
          companyProfile={companyProfile}
          onClose={() => { setShowForm(false); setEditInvoice(null); }}
          onSave={(saved) => {
            setData(prev => ({ ...prev, invoices: editInvoice?.id
              ? (prev?.invoices || []).map(i => i.id === saved.id ? saved : i)
              : [saved, ...(prev?.invoices || [])] }));
            setShowForm(false); setEditInvoice(null); fetchData();
          }}
        />
      )}
      {payModal && (
        <PaymentModal
          invoice={payModal}
          onClose={() => setPayModal(null)}
          onRecorded={(newStatus) => {
            setData(prev => ({ ...prev, invoices: (prev?.invoices||[]).map(i =>
              i.id === payModal.id ? { ...i, paid_amount: parseFloat(i.grand_total), status: newStatus } : i) }));
            setPayModal(null); fetchData();
          }}
        />
      )}

      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Sales Invoices</div>
          <div className="psub">GST-compliant invoicing · IGST/CGST/SGST · Payments · Collections</div>
        </div>
        <div className="ph-actions">
          <DataSourceBadge source={data?.data_source} />
          <button className="btn-primary" onClick={() => { setEditInvoice(null); setShowForm(true); }}>+ New Invoice</button>
        </div>
      </div>

      {/* AI Banner */}
      {onGoChat && (
        <div className="ai-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <span style={{ fontSize: 22 }}>🧾</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Invoice Intelligence Active</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                {kpis.overdue_count > 0
                  ? `⚠ ${kpis.overdue_count} overdue invoice${kpis.overdue_count>1?'s':''} totalling ${fmtL(kpis.overdue_value)} — follow up now`
                  : 'No overdue invoices'
                }
                {' · '}DSO: <strong>{kpis.dso_days || 0} days</strong>
                {' · '}Outstanding: <strong>{fmtL(kpis.total_outstanding)}</strong>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="ai-banner-btn" onClick={() => onGoChat('Which invoices are overdue? Give me customer names, amounts, and a collection message for each.')}>📞 Collection List</button>
            <button className="ai-banner-btn" onClick={() => onGoChat('What is my current GST liability? Breakdown by CGST, SGST, and IGST for this month.')}>📊 GST Liability</button>
            <button className="ai-banner-btn" onClick={() => onGoChat('Analyse my AR aging — which customers have the highest outstanding and what is the risk?')}>⏱ AR Aging</button>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="kg g5">
        <div className="kc sb">
          <div className="kt"><span className="kl">Invoiced MTD</span></div>
          <div className="kv">{fmtL(kpis.total_invoiced_mtd)}</div>
          <div className="ks">This month</div>
        </div>
        <div className="kc sg">
          <div className="kt"><span className="kl">Collected</span></div>
          <div className="kv">{fmtL(kpis.collected)}</div>
          <div className="ks">Payments received</div>
        </div>
        <div className="kc sr">
          <div className="kt"><span className="kl">Overdue</span></div>
          <div className="kv" style={{ color: kpis.overdue_count > 0 ? 'var(--red)' : undefined }}>
            {fmtL(kpis.overdue_value)}
          </div>
          <div className="ks">{kpis.overdue_count || 0} invoice{kpis.overdue_count !== 1 ? 's' : ''}</div>
        </div>
        <div className="kc st">
          <div className="kt"><span className="kl">Outstanding</span></div>
          <div className="kv">{fmtL(kpis.total_outstanding)}</div>
          <div className="ks">Total receivable</div>
        </div>
        <div className="kc sa">
          <div className="kt"><span className="kl">DSO</span></div>
          <div className="kv">{kpis.dso_days || 0} days</div>
          <div className="ks">Avg collection days</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <input className="view-search" placeholder="🔍 Search by customer, invoice #…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="stabs">
          {[['','All',invoices.length],...Object.entries(INV_STATUS).map(([k,v])=>[k,v.label,invoices.filter(i=>i.status===k).length])].map(([k,l,c])=>(
            <button key={k} className={`stab${statusFilter===k?' active':''}`} onClick={()=>setStatusFilter(k)}>
              {l} {c>0&&<span className="stab-cnt">{c}</span>}
            </button>
          ))}
        </div>
        <button onClick={() => exportToCsv(invoices.map(i=>({'Invoice #':i.invoice_number,'Date':i.invoice_date,'Due':i.due_date,'Customer':i.customer_name,'GSTIN':i.customer_gstin,'Taxable':i.subtotal,'Tax':i.total_tax,'Total':i.grand_total,'Paid':i.paid_amount,'Status':i.status})), 'invoices')}
          style={{ padding:'6px 12px',background:'var(--hover)',color:'var(--text2)',border:'1px solid var(--border)',borderRadius:7,cursor:'pointer',fontWeight:600,fontSize:12 }}>
          ⬇ Export CSV
        </button>
      </div>

      {/* Invoices table */}
      <div className="card-table">
        <table className="tbl">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Customer</th>
              <th>GST Type</th>
              <th style={{textAlign:'right'}}>Taxable</th>
              <th style={{textAlign:'right'}}>Tax</th>
              <th style={{textAlign:'right'}}>Total</th>
              <th style={{textAlign:'right'}}>Paid</th>
              <th style={{textAlign:'right'}}>Balance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={11}>
                <div style={{textAlign:'center',padding:'50px 20px'}}>
                  <div style={{fontSize:40,marginBottom:12}}>🧾</div>
                  <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>{search||statusFilter?'No invoices match':'No invoices yet'}</div>
                  <div style={{fontSize:13,color:'var(--text3)',marginBottom:16}}>Create your first GST invoice</div>
                  <button className="btn-primary" onClick={()=>{setEditInvoice(null);setShowForm(true);}}>+ New Invoice</button>
                </div>
              </td></tr>
            ) : invoices.map(inv => {
              const balance = (parseFloat(inv.grand_total)||0) - (parseFloat(inv.paid_amount)||0);
              const daysOverdue = inv.status === 'OVERDUE'
                ? Math.ceil((new Date() - new Date(inv.due_date)) / 86400000) : 0;
              return (
                <tr key={inv.id} style={{cursor:'pointer'}} onClick={()=>setViewInvoice(inv)}>
                  <td><span style={{fontWeight:700,color:'#2563eb',fontFamily:'var(--mono)'}}>{inv.invoice_number}</span></td>
                  <td style={{fontSize:12,color:'var(--text2)'}}>{inv.invoice_date}</td>
                  <td>
                    <div style={{fontWeight:600}}>{inv.customer_name}</div>
                    {inv.customer_gstin && <div style={{fontSize:11,color:'var(--text3)'}}>{inv.customer_gstin}</div>}
                  </td>
                  <td>
                    <span style={{fontSize:10,fontWeight:700,background:inv.is_igst?'rgba(249,115,22,.12)':'rgba(37,99,235,.1)',
                      color:inv.is_igst?'#ea580c':'#2563eb',borderRadius:4,padding:'2px 7px'}}>
                      {inv.is_igst ? 'IGST' : 'CGST+SGST'}
                    </span>
                  </td>
                  <td style={{textAlign:'right',fontFamily:'var(--mono)',fontSize:13}}>{fmt(inv.subtotal)}</td>
                  <td style={{textAlign:'right',fontSize:12,color:'var(--text3)'}}>{fmt(inv.total_tax)}</td>
                  <td style={{textAlign:'right',fontWeight:700,fontFamily:'var(--mono)'}}>{fmt(inv.grand_total)}</td>
                  <td style={{textAlign:'right',fontSize:12,color:'#16a34a'}}>{fmt(inv.paid_amount)}</td>
                  <td style={{textAlign:'right',fontWeight:balance>0?700:400,color:balance>0?'#dc2626':undefined}}>{fmt(balance)}</td>
                  <td>
                    <StatusBadge status={inv.status} />
                    {daysOverdue > 0 && <div style={{fontSize:10,color:'#dc2626',marginTop:2}}>{daysOverdue}d overdue</div>}
                  </td>
                  <td onClick={e=>e.stopPropagation()}>
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={()=>printInvoice(inv,companyProfile)} title="Print" style={{background:'none',border:'none',cursor:'pointer',fontSize:14}}>🖨️</button>
                      {['DRAFT','SENT'].includes(inv.status) && (
                        <button onClick={()=>{setEditInvoice(inv);setShowForm(true);}} title="Edit" style={{background:'none',border:'none',cursor:'pointer',fontSize:14}}>✏️</button>
                      )}
                      {['SENT','PARTIALLY_PAID','OVERDUE'].includes(inv.status) && (
                        <button onClick={()=>setPayModal(inv)} title="Record Payment"
                          style={{background:'rgba(22,163,74,.1)',border:'1px solid rgba(22,163,74,.3)',color:'#16a34a',borderRadius:5,cursor:'pointer',fontSize:11,fontWeight:700,padding:'2px 7px'}}>
                          💰 Pay
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('What is my total GST liability this month and what collections are overdue?')}>
          <span>✨</span>
          <span>Ask AI: GST liability & overdue collections →</span>
        </div>
      )}
    </div>
  );
}
