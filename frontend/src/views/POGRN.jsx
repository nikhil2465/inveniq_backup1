import React, { useState, useEffect, useCallback } from 'react';
import PageLoader from '../components/PageLoader';
import ErrorState from '../components/ErrorState';
import DataSourceBadge from '../components/DataSourceBadge';

// ── INDUSTRY CATALOGS ─────────────────────────────────────────────────────────

const LOUVERS = {
  suppliers: [
    'Alufit Systems', 'Aluline India', 'Alumax Profiles',
    'Supreme Profile India', 'Jindal Aluminium', 'Hindalco Industries',
    'Technal India', 'YKK AP India', 'Alupco', 'Custom / Other',
  ],
  categories: [
    'Aluminium Z-Profile Louvers', 'Aluminium S-Profile Louvers',
    'Aluminium C-Profile Louvers', 'Aluminium T-Profile Louvers',
    'PVC Louvers / Ventilation Slats', 'Timber / Wood Louvers',
    'Aluminium Perforated Panels', 'Fixed Blade Screens',
    'Operable Louvre System (Manual)', 'Operable Louvre System (Motorised)',
  ],
  blade_widths: ['50mm', '65mm', '80mm', '100mm', '120mm', '150mm', '200mm', 'Custom'],
  pitches: ['100mm', '110mm', '120mm', '150mm', '200mm', 'Custom'],
  finishes: [
    'Mill / Natural Aluminium (Uncoated)',
    'Anodized Silver — AA-10 (10 micron)',
    'Anodized Bronze — AA-25 (25 micron)',
    'Powder Coated White (RAL 9016)',
    'Powder Coated Light Grey (RAL 7035)',
    'Powder Coated Anthracite (RAL 7016)',
    'Powder Coated Black (RAL 9005)',
    'Powder Coated Custom RAL Colour',
    'Duplex (Anodized + PVDF Painted)',
  ],
  systems: ['Fixed / Static', 'Operable Manual', 'Operable Motorised', 'Louvre with Insect Screen'],
  grades: ['Commercial Grade', 'Architectural Grade', 'Structural / Facade Grade'],
  units: ['Running Meters (RM)', 'Square Meters (SQM)', 'Pieces / Sets', 'Kilograms (KG)', 'Linear Feet'],
  payment: ['100% Advance', '50% Advance + 50% on Delivery', 'NET-30 Days', 'NET-45 Days', 'NET-60 Days', 'LC at Sight'],
};

const LAMINATES = {
  suppliers: [
    'Merino Industries Ltd', 'Greenlam Industries Ltd', 'Formica India Pvt Ltd',
    'Action Tesa Ltd', 'Sundek International', 'Century Plyboards (Laminates)',
    'Durian Industries', 'Stylam Industries', 'Archidply', 'Virgo Polymer India', 'Custom / Other',
  ],
  types: [
    'HPL — High Pressure Laminate (Standard 1mm)',
    'HPL — Compact Grade (6mm)',
    'HPL — Compact Grade (12mm)',
    'LPL — Low Pressure Laminate (0.8mm)',
    'Acrylic Laminate (High Gloss)',
    'Veneer Laminate (Natural Wood)',
    'PVC Edge Banding (0.4mm / 1mm / 2mm)',
    'Solid Core HPL Panel',
    'Exterior HPL (Weather Resistant)',
    'FR-Rated HPL (Fire Resistant)',
    'Decorative MDF Panel',
  ],
  sizes: [
    "8×4 ft (2440×1220mm) — Standard",
    "8×3 ft (2440×915mm)",
    "10×4 ft (3050×1220mm)",
    "12×4 ft (3660×1220mm)",
    "Custom Size",
  ],
  thicknesses: [
    '0.4mm — Edge Banding', '0.8mm — Surface (LPL)', '1mm — Standard HPL',
    '1.5mm — Heavy Duty HPL', '6mm — Compact', '12mm — Compact',
    '18mm — Board', '25mm — Thick Board',
  ],
  finishes: [
    'Matte / Silk (S/SL)', 'Gloss (G)', 'High Gloss (HG)',
    'Suede / Textured (T)', 'Metallic (M)', 'Syncro 3D / Registered',
    'Natural Woodgrain', 'Stone / Marble Effect', 'Soft Touch (ST)',
    'Anti-Fingerprint (AF)',
  ],
  fire_ratings: ['Standard (Non-FR)', 'FR — Fire Resistant (Class B)', 'FR Class A (Highest)', 'FR Class 1 (EN 13501)'],
  units: ['Sheets', 'Square Meters (SQM)', 'Linear Meters (LM)', 'Rolls'],
  payment: ['100% Advance', '50% Advance + 50% on Delivery', 'NET-30 Days', 'NET-45 Days', 'NET-60 Days', 'Credit LC'],
};

const CONDITION_OPTIONS = ['Good — Accepted', 'Minor Damage — Accepted with Note', 'Partial Damage — Partial Accept', 'Damaged — Rejected', 'Short Delivery', 'Wrong Grade / Specification'];
const QUALITY_OPTIONS = ['Passed ✓', 'Partially Passed ⚠', 'Failed / Rejected ✗'];

// ── HELPERS ───────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];
const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

const blankPO = () => ({
  supplier_name: '', supplier_contact: '', payment_terms: '',
  delivery_location: '', expected_date: plusDays(7), notes: '',
  // Louvers
  lv_category: '', lv_blade_width: '', lv_pitch: '', lv_finish: '',
  lv_system: '', lv_grade: '', lv_color: '',
  // Laminates
  lm_type: '', lm_size: '', lm_thickness: '', lm_finish: '',
  lm_fire_rating: '', lm_design_code: '',
  // Common
  quantity: '', unit: '', unit_price: '',
});

const blankGRN = () => ({
  po_number: '', supplier_name: '', invoice_number: '',
  invoice_date: today(), received_date: today(),
  product_name: '', qty_ordered: '', qty_received: '',
  unit: 'Sheets', condition: 'Good — Accepted',
  quality_status: 'Passed ✓', vehicle_number: '',
  received_by: '', invoice_value: '', grn_value: '',
  notes: '',
});

// ── STYLES ────────────────────────────────────────────────────────────────────

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

// ── SELECT / INPUT HELPERS ────────────────────────────────────────────────────

function Sel({ label, value, onChange, options, required }) {
  return (
    <div style={FIELD}>
      <label style={LABEL}>{label}{required && <span style={{ color: 'var(--r2)' }}> *</span>}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ ...INPUT, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28 }}>
        <option value="">— Select —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Inp({ label, value, onChange, type = 'text', placeholder = '', required }) {
  return (
    <div style={FIELD}>
      <label style={LABEL}>{label}{required && <span style={{ color: 'var(--r2)' }}> *</span>}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} style={INPUT} />
    </div>
  );
}

// ── SUCCESS CARD ──────────────────────────────────────────────────────────────

function SuccessCard({ result, type, onClose, onAskAI }) {
  const isMatch = result.match_status === 'MATCH';
  return (
    <div style={{ textAlign: 'center', padding: '32px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{type === 'po' ? '📋' : '📦'}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: type === 'po' ? 'var(--b2)' : 'var(--green)', marginBottom: 6 }}>
        {type === 'po' ? 'Purchase Order Created' : 'GRN Recorded Successfully'}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)', marginBottom: 16 }}>
        {type === 'po' ? result.po_number : result.grn_number}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320, margin: '0 auto 24px', textAlign: 'left' }}>
        {type === 'po' && <>
          <Row label="Supplier" val={result.supplier} />
          <Row label="SKU / Product" val={result.sku || result.sku_name} />
          <Row label="Quantity" val={`${result.quantity} units`} />
          <Row label="Total Value" val={`₹${Number(result.total_value || 0).toLocaleString('en-IN')}`} />
          <Row label="Expected Date" val={result.expected_date} />
        </>}
        {type === 'grn' && <>
          <Row label="Supplier" val={result.supplier} />
          <Row label="PO Reference" val={result.po_number} />
          <Row label="Invoice Value" val={`₹${Number(result.invoice_value || 0).toLocaleString('en-IN')}`} />
          <Row label="GRN Value" val={`₹${Number(result.grn_value || 0).toLocaleString('en-IN')}`} />
          <Row label="Match Status" val={
            <span style={{ color: isMatch ? 'var(--green)' : 'var(--r2)', fontWeight: 700 }}>
              {isMatch ? '✓ MATCH' : '⚠ MISMATCH'}
            </span>
          } />
          {!isMatch && <Row label="Discrepancy" val={`₹${Number(result.discrepancy_amt || 0).toLocaleString('en-IN')}`} />}
        </>}
        {result.demo_mode && (
          <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', fontFamily: 'var(--mono)', marginTop: 4 }}>
            Demo mode — not saved to DB
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={onAskAI} style={BTN_GREEN}>
          🤖 Discuss with AI
        </button>
        <button onClick={onClose} style={BTN_GHOST}>Done</button>
      </div>
    </div>
  );
}

function Row({ label, val }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12 }}>{val}</span>
    </div>
  );
}

// ── CREATE PO MODAL ───────────────────────────────────────────────────────────

function CreatePOModal({ industry, onClose, onSuccess, prefill }) {
  const [form, setForm] = useState(() => ({
    ...blankPO(),
    supplier_name: prefill?.supplier || '',
    unit_price: prefill?.rate ? String(prefill.rate) : '',
    lm_type: prefill?.item && industry === 'laminates' ? (prefill.item.split('(')[0].trim()) : '',
    lv_category: prefill?.item && industry === 'louvers' ? (prefill.item.split('(')[0].trim()) : '',
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const cat = industry === 'louvers' ? LOUVERS : LAMINATES;
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.supplier_name.trim()) return setError('Supplier name is required.');
    if (!form.quantity || Number(form.quantity) <= 0) return setError('Quantity must be greater than 0.');

    const sku = industry === 'louvers'
      ? `${form.lv_category} ${form.lv_blade_width} ${form.lv_finish}`.trim() || 'Louver Profile'
      : `${form.lm_type} ${form.lm_thickness} ${form.lm_size}`.trim() || 'Laminate Sheet';

    const notes = industry === 'louvers'
      ? `Industry: Louvers | Category: ${form.lv_category} | Width: ${form.lv_blade_width} | Finish: ${form.lv_finish} | System: ${form.lv_system} | Pitch: ${form.lv_pitch} | Grade: ${form.lv_grade} | Color: ${form.lv_color} | Payment: ${form.payment_terms} | Delivery: ${form.delivery_location} | ${form.notes}`
      : `Industry: Laminates | Type: ${form.lm_type} | Size: ${form.lm_size} | Thickness: ${form.lm_thickness} | Finish: ${form.lm_finish} | FR: ${form.lm_fire_rating} | Design: ${form.lm_design_code} | Payment: ${form.payment_terms} | Delivery: ${form.delivery_location} | ${form.notes}`;

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: form.supplier_name,
          sku_name: sku,
          quantity: Number(form.quantity),
          unit_price: form.unit_price ? Number(form.unit_price) : null,
          expected_date: form.expected_date || undefined,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess({ ...data, sku_name: sku });
      } else {
        setError(data.detail || data.error || 'Failed to create PO. Please try again.');
      }
    } catch {
      setError('Network error — could not reach server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={MODAL_OVERLAY} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={MODAL_BOX}>
        <div style={MODAL_HDR}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
              {industry === 'louvers' ? '🏗️ New Purchase Order — Louvers & Profiles' : '🎨 New Purchase Order — Laminates & Boards'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 3 }}>
              Fill in the details below. Fields marked * are required.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <div style={MODAL_BODY}>
          {/* Supplier */}
          <div style={SECTION_TITLE}>🏭 Supplier Details</div>
          <div style={ROW2}>
            <div>
              <label style={LABEL}>Supplier Name <span style={{ color: 'var(--r2)' }}>*</span></label>
              <input list="supplier-list" value={form.supplier_name} onChange={e => set('supplier_name')(e.target.value)}
                placeholder="Type or select supplier…" style={INPUT} />
              <datalist id="supplier-list">
                {cat.suppliers.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <Inp label="Supplier Contact / Mobile" value={form.supplier_contact} onChange={set('supplier_contact')} placeholder="+91 98765 43210" />
          </div>
          <div style={ROW3}>
            <Sel label="Payment Terms" value={form.payment_terms} onChange={set('payment_terms')} options={cat.payment} />
            <Inp label="Delivery Location" value={form.delivery_location} onChange={set('delivery_location')} placeholder="e.g. Whitefield, Bengaluru" />
            <Inp label="Expected Delivery Date" value={form.expected_date} onChange={set('expected_date')} type="date" required />
          </div>

          {/* Industry-specific product fields */}
          {industry === 'louvers' ? (
            <>
              <div style={SECTION_TITLE}>🏗️ Louver Specifications</div>
              <div style={ROW2}>
                <Sel label="Product Category *" value={form.lv_category} onChange={set('lv_category')} options={LOUVERS.categories} required />
                <Sel label="Louvre System Type" value={form.lv_system} onChange={set('lv_system')} options={LOUVERS.systems} />
              </div>
              <div style={ROW3}>
                <Sel label="Blade Width" value={form.lv_blade_width} onChange={set('lv_blade_width')} options={LOUVERS.blade_widths} />
                <Sel label="Blade Pitch / Spacing" value={form.lv_pitch} onChange={set('lv_pitch')} options={LOUVERS.pitches} />
                <Sel label="Grade / Application" value={form.lv_grade} onChange={set('lv_grade')} options={LOUVERS.grades} />
              </div>
              <div style={ROW2}>
                <Sel label="Surface Finish" value={form.lv_finish} onChange={set('lv_finish')} options={LOUVERS.finishes} />
                <Inp label="Custom Colour / RAL Code" value={form.lv_color} onChange={set('lv_color')} placeholder="e.g. RAL 7040, or Champagne" />
              </div>
            </>
          ) : (
            <>
              <div style={SECTION_TITLE}>🎨 Laminate Specifications</div>
              <div style={ROW2}>
                <Sel label="Product Type *" value={form.lm_type} onChange={set('lm_type')} options={LAMINATES.types} required />
                <Inp label="Design Code / Series" value={form.lm_design_code} onChange={set('lm_design_code')} placeholder="e.g. BW-8071, Merino 6521" />
              </div>
              <div style={ROW3}>
                <Sel label="Sheet Size" value={form.lm_size} onChange={set('lm_size')} options={LAMINATES.sizes} />
                <Sel label="Thickness" value={form.lm_thickness} onChange={set('lm_thickness')} options={LAMINATES.thicknesses} />
                <Sel label="Surface Finish" value={form.lm_finish} onChange={set('lm_finish')} options={LAMINATES.finishes} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <Sel label="Fire Rating" value={form.lm_fire_rating} onChange={set('lm_fire_rating')} options={LAMINATES.fire_ratings} />
              </div>
            </>
          )}

          {/* Quantity & Pricing */}
          <div style={SECTION_TITLE}>📦 Quantity &amp; Pricing</div>
          <div style={ROW3}>
            <Inp label="Quantity *" value={form.quantity} onChange={set('quantity')} type="number" placeholder="e.g. 200" required />
            <Sel label="Unit of Measure" value={form.unit} onChange={set('unit')} options={cat.units} />
            <Inp label="Unit Price (₹)" value={form.unit_price} onChange={set('unit_price')} type="number" placeholder="e.g. 640" />
          </div>
          {form.quantity && form.unit_price && (
            <div style={{ background: 'var(--g5)', border: '1px solid var(--g4)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>Estimated Total Value</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
                ₹{(Number(form.quantity) * Number(form.unit_price)).toLocaleString('en-IN')}
              </span>
            </div>
          )}

          {/* Notes */}
          <div style={FIELD}>
            <label style={LABEL}>Additional Notes / Special Instructions</label>
            <textarea value={form.notes} onChange={e => set('notes')(e.target.value)}
              rows={3} placeholder="Packing requirements, inspection notes, any special handling instructions…"
              style={{ ...INPUT, resize: 'vertical', lineHeight: 1.5 }} />
          </div>

          {error && (
            <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 7, padding: '9px 13px', fontSize: 12, color: 'var(--r2)', marginBottom: 8 }}>
              ⚠ {error}
            </div>
          )}
        </div>

        <div style={MODAL_FTR}>
          <button onClick={onClose} style={BTN_GHOST} disabled={submitting}>Cancel</button>
          <button onClick={handleSubmit} style={BTN_PRIMARY} disabled={submitting}>
            {submitting ? '⏳ Creating PO…' : '📋 Create Purchase Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CREATE GRN MODAL ──────────────────────────────────────────────────────────

function CreateGRNModal({ industry, onClose, onSuccess }) {
  const [form, setForm] = useState(blankGRN());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const cat = industry === 'louvers' ? LOUVERS : LAMINATES;

  const handleSubmit = async () => {
    if (!form.supplier_name.trim()) return setError('Supplier name is required.');
    if (!form.invoice_number.trim()) return setError('Invoice number is required.');

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/grn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: form.supplier_name,
          po_number: form.po_number || null,
          invoice_number: form.invoice_number,
          invoice_date: form.invoice_date || null,
          received_date: form.received_date || null,
          product_name: form.product_name || null,
          qty_ordered: form.qty_ordered ? Number(form.qty_ordered) : null,
          qty_received: form.qty_received ? Number(form.qty_received) : null,
          unit: form.unit || 'sheets',
          condition: form.condition,
          invoice_value: form.invoice_value ? Number(form.invoice_value) : null,
          grn_value: form.grn_value ? Number(form.grn_value) : null,
          vehicle_number: form.vehicle_number || null,
          received_by: form.received_by || null,
          quality_status: form.quality_status,
          industry: industry,
          notes: [
            form.condition !== 'Good — Accepted' ? `Condition: ${form.condition}` : '',
            `Quality: ${form.quality_status}`,
            form.vehicle_number ? `Vehicle: ${form.vehicle_number}` : '',
            form.received_by ? `Received by: ${form.received_by}` : '',
            form.notes,
          ].filter(Boolean).join(' | '),
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data);
      } else {
        setError(data.detail || data.error || 'GRN creation failed.');
      }
    } catch {
      setError('Network error — could not reach server.');
    } finally {
      setSubmitting(false);
    }
  };

  const isShortDelivery = form.qty_ordered && form.qty_received && Number(form.qty_received) < Number(form.qty_ordered);
  const invoiceMismatch = form.invoice_value && form.grn_value && Math.abs(Number(form.invoice_value) - Number(form.grn_value)) > 1;

  return (
    <div style={MODAL_OVERLAY} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={MODAL_BOX}>
        <div style={MODAL_HDR}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
              {industry === 'louvers' ? '🏗️ Record GRN — Louvers & Profiles' : '🎨 Record GRN — Laminates & Boards'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 3 }}>
              Goods Received Note — 3-way match against PO &amp; invoice. Fields marked * are required.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <div style={MODAL_BODY}>
          {/* Reference */}
          <div style={SECTION_TITLE}>📑 Document References</div>
          <div style={ROW3}>
            <Inp label="PO Number (if applicable)" value={form.po_number} onChange={set('po_number')} placeholder="PO-7734" />
            <Inp label="Supplier Invoice No. *" value={form.invoice_number} onChange={set('invoice_number')} placeholder="INV-2026-0041" required />
            <Inp label="Invoice Date" value={form.invoice_date} onChange={set('invoice_date')} type="date" />
          </div>
          <div style={ROW2}>
            <div>
              <label style={LABEL}>Supplier Name <span style={{ color: 'var(--r2)' }}>*</span></label>
              <input list="grn-supplier-list" value={form.supplier_name} onChange={e => set('supplier_name')(e.target.value)}
                placeholder="Type or select supplier…" style={INPUT} />
              <datalist id="grn-supplier-list">
                {cat.suppliers.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <Inp label="Date Received" value={form.received_date} onChange={set('received_date')} type="date" />
          </div>

          {/* Product */}
          <div style={SECTION_TITLE}>📦 Product Details</div>
          <div style={FIELD}>
            <Inp label="Product / SKU Received" value={form.product_name} onChange={set('product_name')} placeholder={industry === 'louvers' ? 'e.g. Aluminium Z-Profile 100mm Anodized Silver' : 'e.g. Merino HPL 1mm Matte BW-8071 8×4'} />
          </div>
          <div style={ROW3}>
            <Inp label="Qty Ordered" value={form.qty_ordered} onChange={set('qty_ordered')} type="number" placeholder="200" />
            <Inp label="Qty Received" value={form.qty_received} onChange={set('qty_received')} type="number" placeholder="200" />
            <Sel label="Unit" value={form.unit} onChange={set('unit')} options={cat.units} />
          </div>
          {isShortDelivery && (
            <div style={{ background: 'var(--a3)', border: '1px solid var(--a4)', borderRadius: 8, padding: '9px 13px', fontSize: 12, color: 'var(--a2)', marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
              ⚠ Short delivery detected: {Number(form.qty_ordered) - Number(form.qty_received)} {form.unit || 'units'} short. AI will flag this for credit note.
            </div>
          )}
          <div style={ROW2}>
            <Sel label="Condition of Goods" value={form.condition} onChange={set('condition')} options={CONDITION_OPTIONS} />
            <Sel label="Quality Check Result" value={form.quality_status} onChange={set('quality_status')} options={QUALITY_OPTIONS} />
          </div>

          {/* Valuation */}
          <div style={SECTION_TITLE}>💰 Invoice vs GRN Valuation (3-Way Match)</div>
          <div style={ROW2}>
            <Inp label="Invoice Value (₹)" value={form.invoice_value} onChange={set('invoice_value')} type="number" placeholder="e.g. 128000" />
            <Inp label="Accepted GRN Value (₹)" value={form.grn_value} onChange={set('grn_value')} type="number" placeholder="e.g. 128000" />
          </div>
          {invoiceMismatch && (
            <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 8, padding: '9px 13px', fontSize: 12, color: 'var(--r2)', marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
              ⚠ Price variance detected: ₹{Math.abs(Number(form.invoice_value) - Number(form.grn_value)).toLocaleString('en-IN')}. AI will flag this as MISMATCH and suggest payment action.
            </div>
          )}

          {/* Logistics */}
          <div style={SECTION_TITLE}>🚚 Logistics &amp; Receipt</div>
          <div style={ROW3}>
            <Inp label="Vehicle / Truck Number" value={form.vehicle_number} onChange={set('vehicle_number')} placeholder="KA-01-AB-1234" />
            <Inp label="Received By (Name)" value={form.received_by} onChange={set('received_by')} placeholder="Store Manager" />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Discrepancy / Inspection Notes</label>
            <textarea value={form.notes} onChange={e => set('notes')(e.target.value)}
              rows={3} placeholder="Describe any damage, shortfall, grade mismatch, or special observations…"
              style={{ ...INPUT, resize: 'vertical', lineHeight: 1.5 }} />
          </div>

          {error && (
            <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 7, padding: '9px 13px', fontSize: 12, color: 'var(--r2)', marginBottom: 8 }}>
              ⚠ {error}
            </div>
          )}
        </div>

        <div style={MODAL_FTR}>
          <button onClick={onClose} style={BTN_GHOST} disabled={submitting}>Cancel</button>
          <button onClick={handleSubmit} style={BTN_GREEN} disabled={submitting}>
            {submitting ? '⏳ Recording GRN…' : '📦 Record GRN'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── QUOTATIONS SECTION ────────────────────────────────────────────────────────

function QuotationsSection({ goChat, onRaisePO, industry }) {
  const [quotes, setQuotes]         = useState([]);
  const [qLoading, setQLoading]     = useState(true);
  const [filter, setFilter]         = useState('all');  // 'all' | 'laminates' | 'louvers'
  const [expanded, setExpanded]     = useState({});

  useEffect(() => {
    setQLoading(true);
    fetch('/api/quotations?industry=all')
      .then(r => r.json())
      .then(d => { setQuotes(d.quotations || []); setQLoading(false); })
      .catch(() => setQLoading(false));
  }, []);

  const shown = filter === 'all' ? quotes : quotes.filter(q => q.industry === filter);
  const toggle = (item) => setExpanded(e => ({ ...e, [item]: !e[item] }));

  // Best rate = lowest total landed cost (rate + freight) among all quotes for item
  const bestSupplier = (qItem) => {
    if (!qItem.quotes?.length) return null;
    return qItem.quotes.reduce((a, b) =>
      (a.rate + a.freight) <= (b.rate + b.freight) ? a : b
    );
  };

  const compareAI = (qItem) => {
    const lines = qItem.quotes.map(q =>
      `${q.supplier}: ₹${q.rate}/${qItem.unit} + ₹${q.freight} freight = ₹${q.rate + q.freight} landed (${q.reliability}% reliability, ${q.lead_time} lead time)`
    ).join('; ');
    goChat(`Compare supplier quotes for ${qItem.item}: ${lines}. Which supplier should I choose considering total landed cost, reliability, lead time, and quality? Give me a clear recommendation.`);
  };

  const IND_TABS = [
    { id: 'all', label: 'All Industries' },
    { id: 'laminates', label: '🎨 Laminates' },
    { id: 'louvers', label: '🏗️ Louvers' },
  ];

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="ch" style={{ marginBottom: 14 }}>
        <div>
          <div className="ctit">Supplier Quotations — Rate Comparison</div>
          <div className="csub">
            Compare supplier rates, total landed cost &amp; reliability per item ·
            Click any row to raise a PO
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => goChat('Analyse all current supplier quotes across laminates and louvers. Which items have the best negotiation opportunity and where am I overpaying?')}
            style={{ padding: '5px 12px', background: 'var(--g3)', color: 'var(--green)', border: '1px solid var(--g4)', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            🤖 AI Analysis
          </button>
          <button
            onClick={() => goChat('Help me request new quotations from suppliers for my key inventory items — draft a professional rate inquiry email')}
            style={{ padding: '5px 12px', background: 'var(--b3)', color: 'var(--b2)', border: '1px solid var(--b4)', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            + Request Quotes
          </button>
        </div>
      </div>

      {/* Industry filter */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: 'var(--s3)', padding: 3, borderRadius: 8, border: '1px solid var(--border)', width: 'fit-content' }}>
        {IND_TABS.map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, transition: 'all .15s', background: filter === t.id ? 'var(--surface)' : 'transparent', color: filter === t.id ? 'var(--b2)' : 'var(--text3)', boxShadow: filter === t.id ? 'var(--sh)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {qLoading ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text3)', fontSize: 13 }}>Loading quotations…</div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text3)', fontSize: 13 }}>No quotations for this filter.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map(qItem => {
            const best = bestSupplier(qItem);
            const isOpen = expanded[qItem.item] !== false; // default open
            return (
              <div key={qItem.item} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                {/* Item header — click to collapse */}
                <div
                  onClick={() => toggle(qItem.item)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--s3)', cursor: 'pointer', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{qItem.item}</span>
                    <span style={{ fontSize: 9, background: qItem.industry === 'louvers' ? '#fef3c7' : '#dbeafe', color: qItem.industry === 'louvers' ? '#92400e' : '#1e40af', padding: '2px 7px', borderRadius: 4, fontWeight: 700, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
                      {qItem.industry === 'louvers' ? '🏗️ Louvers' : '🎨 Laminates'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{qItem.category}</span>
                    {qItem.last_purchased_rate && (
                      <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                        Last PO: ₹{qItem.last_purchased_rate}/{qItem.unit} from {qItem.last_supplier}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {best && (
                      <span style={{ fontSize: 10, background: 'var(--g3)', color: 'var(--green)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontFamily: 'var(--mono)', border: '1px solid var(--g4)' }}>
                        Best: ₹{best.rate + best.freight} landed
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{qItem.quotes?.length} quotes</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Quote rows */}
                {isOpen && (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tbl" style={{ marginBottom: 0 }}>
                      <thead>
                        <tr>
                          <th>Supplier</th>
                          <th>Rate ({qItem.unit})</th>
                          <th>Freight</th>
                          <th style={{ color: 'var(--green)' }}>Landed Cost</th>
                          <th>Lead Time</th>
                          <th>MOQ</th>
                          <th>Reliability</th>
                          <th>Valid Till</th>
                          <th>Notes</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qItem.quotes.map(q => {
                          const landed = q.rate + q.freight;
                          const isBest = best && q.supplier === best.supplier;
                          const reliabilityColor = q.reliability >= 90 ? 'var(--green)' : q.reliability >= 80 ? 'var(--a2)' : 'var(--r2)';
                          return (
                            <tr key={q.supplier} style={{ background: isBest ? 'var(--g5)' : undefined }}>
                              <td style={{ fontWeight: 700 }}>
                                {isBest && <span style={{ fontSize: 9, background: 'var(--g3)', color: 'var(--green)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--mono)', marginRight: 5, border: '1px solid var(--g4)' }}>BEST</span>}
                                {q.supplier}
                              </td>
                              <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>₹{q.rate}</td>
                              <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>₹{q.freight}</td>
                              <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: isBest ? 'var(--green)' : 'var(--text)' }}>
                                ₹{landed}
                                {qItem.last_purchased_rate && landed < qItem.last_purchased_rate + 15 && (
                                  <span style={{ fontSize: 9, color: 'var(--green)', marginLeft: 4 }}>
                                    ▼{Math.round(((qItem.last_purchased_rate + 15) - landed) / (qItem.last_purchased_rate + 15) * 100)}%
                                  </span>
                                )}
                              </td>
                              <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{q.lead_time}</td>
                              <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{q.moq}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{ width: `${q.reliability}%`, height: '100%', background: reliabilityColor, borderRadius: 2 }} />
                                  </div>
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: reliabilityColor, fontWeight: 700 }}>{q.reliability}%</span>
                                </div>
                              </td>
                              <td style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text3)' }}>{q.valid_till}</td>
                              <td style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 160 }}>{q.notes}</td>
                              <td onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button
                                    onClick={() => onRaisePO({ supplier: q.supplier, item: qItem.item, rate: q.rate, industry: qItem.industry })}
                                    style={{ fontSize: 10, padding: '3px 8px', background: 'var(--b2)', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                    Raise PO
                                  </button>
                                  <button
                                    onClick={() => goChat(`${q.supplier} is quoting ₹${q.rate}/${qItem.unit} for ${qItem.item} (landed ₹${landed} including freight). Reliability: ${q.reliability}%, lead time: ${q.lead_time}. Should I accept this quote? Compare with my last purchase rate of ₹${qItem.last_purchased_rate}/${qItem.unit}.`)}
                                    style={{ fontSize: 10, padding: '3px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--b2)', fontWeight: 600 }}>
                                    Ask AI
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {/* Per-item AI compare footer */}
                    <div style={{ padding: '8px 14px', background: 'var(--s3)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>
                        Landed cost savings vs best vs worst: ₹{qItem.quotes.reduce((mx, q) => Math.max(mx, q.rate + q.freight), 0) - (best ? best.rate + best.freight : 0)}/{qItem.unit}
                      </span>
                      <button onClick={() => compareAI(qItem)}
                        style={{ fontSize: 11, padding: '4px 12px', background: 'var(--g3)', color: 'var(--green)', border: '1px solid var(--g4)', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>
                        🤖 Compare All Quotes with AI
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function POGRN({ onGoChat }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [industry, setIndustry]   = useState('laminates');
  const [modal, setModal]         = useState(null);   // null | 'po' | 'grn'
  const [success, setSuccess]     = useState(null);   // { type, result }
  const [poPreFill, setPoPreFill] = useState(null);   // { supplier, item, rate, industry }

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/po-grn');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const goChat = (q) => { if (onGoChat) onGoChat(q); };

  // Called from QuotationsSection "Raise PO" button
  const handleRaisePOFromQuote = ({ supplier, item, rate, industry: ind }) => {
    setIndustry(ind);
    setPoPreFill({ supplier, item, rate, industry: ind });
    setModal('po');
  };

  const handlePOSuccess = (result) => {
    setModal(null);
    setPoPreFill(null);
    setSuccess({ type: 'po', result });
    fetchData();
  };
  const handleGRNSuccess = (result) => {
    setModal(null);
    setSuccess({ type: 'grn', result });
    fetchData();
  };
  const handleSuccessAI = () => {
    const { type, result } = success;
    const q = type === 'po'
      ? `I just created PO ${result.po_number} for ${result.quantity} units of ${result.sku || result.sku_name} from ${result.supplier} worth ₹${Number(result.total_value || 0).toLocaleString('en-IN')}. What should I do next to ensure on-time delivery?`
      : result.match_status === 'MISMATCH'
        ? `GRN ${result.grn_number} from ${result.supplier} shows a ₹${Number(result.discrepancy_amt || 0).toLocaleString('en-IN')} discrepancy. What action should I take?`
        : `GRN ${result.grn_number} from ${result.supplier} has been recorded successfully with a full match. Any follow-up actions needed?`;
    setSuccess(null);
    goChat(q);
  };

  if (loading) return (
    <div className="view">
      <div className="ph"><div className="pg">PO &amp; GRN — Procurement Lifecycle</div></div>
      <PageLoader label="Loading procurement data…" />
    </div>
  );

  if (error) return (
    <div className="view">
      <div className="ph"><div className="pg">PO &amp; GRN</div></div>
      <div className="card"><ErrorState message={`Could not load: ${error}`} onRetry={fetchData} /></div>
    </div>
  );

  const kpis          = data?.kpis || {};
  const openPOs       = data?.open_pos || [];
  const discrepancies = data?.grn_discrepancies || [];
  const isLive        = data?.data_source === 'mysql';

  const fillColor = (pct) => pct >= 100 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626';
  const statusBadge = (status, days) => {
    if (status === 'OVERDUE')  return { cls: 'br', label: `OVERDUE +${days}d` };
    if (status === 'RECEIVED') return { cls: 'bg', label: 'COMPLETE' };
    if (status === 'PARTIAL')  return { cls: 'ba', label: 'IN PROGRESS' };
    return { cls: 'bs', label: status };
  };

  const industryLabel = industry === 'louvers' ? 'Louvers & Profiles' : 'Laminates & Boards';

  return (
    <div className="view">

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {modal === 'po' && (
        <CreatePOModal industry={industry} prefill={poPreFill} onClose={() => { setModal(null); setPoPreFill(null); }} onSuccess={handlePOSuccess} />
      )}
      {modal === 'grn' && (
        <CreateGRNModal industry={industry} onClose={() => setModal(null)} onSuccess={handleGRNSuccess} />
      )}

      {/* ── Success overlay ─────────────────────────────────────────────── */}
      {success && (
        <div style={MODAL_OVERLAY} onClick={e => e.target === e.currentTarget && setSuccess(null)}>
          <div style={{ ...MODAL_BOX, maxWidth: 440, marginTop: 80 }}>
            <SuccessCard
              result={success.result}
              type={success.type}
              onClose={() => { setSuccess(null); }}
              onAskAI={handleSuccessAI}
            />
          </div>
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="ph" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="pg">PO &amp; GRN — Procurement Lifecycle</div>
          <div className="psub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            Purchase orders · Goods received notes · 3-way match · AI discrepancy detection
            {' '}<DataSourceBadge source={isLive ? 'mysql' : 'mock'} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => goChat('Show me the status of all open and overdue purchase orders and any GRN issues I should know about')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
            🤖 Ask AI
          </button>
          <button onClick={() => setModal('grn')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--green)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
            📦 Record GRN
          </button>
          <button onClick={() => setModal('po')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'var(--b2)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
            + Create PO
          </button>
        </div>
      </div>

      {/* ── Industry Selector ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>Industry:</span>
        <div style={{ display: 'flex', background: 'var(--s3)', borderRadius: 8, padding: 3, border: '1px solid var(--border)', gap: 3 }}>
          {[
            { id: 'laminates', icon: '🎨', label: 'Laminates & Boards' },
            { id: 'louvers', icon: '🏗️', label: 'Louvers & Profiles' },
          ].map(ind => (
            <button key={ind.id} onClick={() => setIndustry(ind.id)}
              style={{
                padding: '7px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, transition: 'all .15s',
                background: industry === ind.id ? 'var(--surface)' : 'transparent',
                color: industry === ind.id ? 'var(--b2)' : 'var(--text3)',
                boxShadow: industry === ind.id ? 'var(--sh)' : 'none',
              }}>
              {ind.icon} {ind.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          PO &amp; GRN forms are configured for <strong style={{ color: 'var(--text2)' }}>{industryLabel}</strong>
        </div>
      </div>

      {/* ── AI Banner ───────────────────────────────────────────────────── */}
      <div className="ai-banner" style={{ marginBottom: 16 }}>
        <div className="ai-ic">AI</div>
        <div style={{ flex: 1 }}>
          <div className="ai-lbl">AI Procurement Assistant — {industryLabel}</div>
          <div style={{ fontSize: 12, color: 'var(--green)' }}>
            Ask about supplier pricing, PO status, GRN discrepancies, or create POs via chat.
            {' '}<strong>Tip:</strong> After creating a PO/GRN, click "Discuss with AI" for instant RCA and follow-up actions.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={() => goChat(`Give me a summary of all ${industryLabel} procurement issues — overdue POs, GRN mismatches, and any supplier risks`)}
            style={{ padding: '6px 13px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            📊 Briefing
          </button>
          <button onClick={() => goChat(`I want to create a new purchase order for ${industryLabel}. Help me raise one with AI.`)}
            style={{ padding: '6px 13px', background: 'var(--surface)', color: 'var(--green)', border: '1px solid var(--g4)', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            + PO via AI
          </button>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="kg g5">
        {[
          { cls: 'sb', l: 'Open POs', v: String(kpis.open_pos ?? 8), d: `${kpis.open_po_value ?? '₹12.4L'} total`, s: `${kpis.ai_auto_pos ?? 4} AI auto-generated` },
          { cls: 'sr', l: 'Overdue POs', v: String(kpis.overdue_pos ?? 2), d: kpis.overdue_po_list ? `▼ ${kpis.overdue_po_list.slice(0, 38)}…` : '▼ 2 suppliers behind', s: 'Follow up required today' },
          { cls: 'sg', l: 'GRN Match Rate', v: kpis.grn_match_rate ?? '96%', d: `▲ ${kpis.grn_mismatches_mtd ?? 3} mismatches MTD`, s: `${kpis.grn_variance_value ?? '₹8,400'} variance flagged` },
          { cls: 'sa', l: 'Partial POs', v: String(kpis.partial_pos ?? 3), d: '▲ Partially delivered', s: 'Check fill rates below' },
          { cls: 'st', l: 'GRN Issues', v: String(discrepancies.length), d: '▲ AI flagged', s: 'Review discrepancy log' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} onClick={() => goChat(`Explain the current status of ${k.l} and what action I should take`)} style={{ cursor: 'pointer' }}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd wn">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      {/* ── Quick Action Cards ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          {
            icon: industry === 'louvers' ? '🏗️' : '🎨',
            title: `New PO — ${industryLabel}`,
            desc: industry === 'louvers'
              ? 'Raise a PO for aluminium / PVC / timber louvre profiles. Fields: blade width, finish, pitch, system type, RAL colour, grade.'
              : 'Raise a PO for HPL, acrylic, veneer, compact boards. Fields: design code, sheet size, thickness, surface finish, fire rating.',
            btn: `Create ${industryLabel} PO`, color: 'var(--b2)', action: () => setModal('po'),
          },
          {
            icon: '📦', title: 'Record Goods Receipt (GRN)',
            desc: 'Log received goods against a PO. System performs automatic 3-way match — PO vs Invoice vs GRN. AI flags discrepancies instantly.',
            btn: 'Record GRN', color: 'var(--green)', action: () => setModal('grn'),
          },
          {
            icon: '🤖', title: 'AI Procurement Analysis',
            desc: `Ask AI about ${industryLabel.toLowerCase()} pricing benchmarks, supplier reliability, overdue POs, GRN discrepancies, and working capital impact.`,
            btn: 'Ask AI', color: '#7c3aed',
            action: () => goChat(`I need a comprehensive procurement analysis for my ${industryLabel} business — supplier performance, PO status, GRN issues, and recommended actions`),
          },
        ].map(c => (
          <div key={c.title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', boxShadow: 'var(--sh)' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{c.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 12 }}>{c.desc}</div>
            <button onClick={c.action}
              style={{ padding: '7px 14px', background: c.color, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
              {c.btn}
            </button>
          </div>
        ))}
      </div>

      {/* ── Open POs Table ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="ch" style={{ marginBottom: 12 }}>
          <div>
            <div className="ctit">Open Purchase Orders</div>
            <div className="csub">Track all open, partial, and overdue POs · Click any row to ask AI</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="bdg ba">{openPOs.length} Open</span>
            <button onClick={() => setModal('po')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--b2)', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
              + New PO
            </button>
          </div>
        </div>
        {openPOs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)', fontSize: 13 }}>No open purchase orders.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>PO#</th><th>Supplier</th><th>SKU / Product</th><th>Ordered</th><th>Received</th><th>Fill %</th><th>Value</th><th>ETA</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {openPOs.map(po => {
                const badge = statusBadge(po.status, po.overdue_days);
                return (
                  <tr key={po.po_number} style={{ cursor: 'pointer' }}
                    onClick={() => goChat(`What is the status of ${po.po_number} from ${po.supplier}? Any risks?`)}>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--b2)', fontWeight: 600 }}>{po.po_number}</td>
                    <td style={{ fontWeight: 600 }}>{po.supplier}</td>
                    <td style={{ fontSize: 11.5 }}>{po.sku}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{po.qty_ordered}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{po.qty_received}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: fillColor(po.fill_pct) }}>{po.fill_pct}%</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{po.value}</td>
                    <td><span className={`bdg ${badge.cls}`}>{po.eta}</span></td>
                    <td><span className={`bdg ${badge.cls}`}>{badge.label}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => goChat(`Explain the status of ${po.po_number} from ${po.supplier} and give me an action plan`)}
                          style={{ fontSize: 10, padding: '2px 7px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--b2)', fontWeight: 600 }}>
                          Ask AI
                        </button>
                        <button onClick={() => { setModal('grn'); }}
                          style={{ fontSize: 10, padding: '2px 7px', background: 'none', border: '1px solid var(--g4)', borderRadius: 4, cursor: 'pointer', color: 'var(--green)', fontWeight: 600 }}>
                          GRN
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── GRN Discrepancy Log ─────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="ch" style={{ marginBottom: 12 }}>
          <div>
            <div className="ctit">GRN Discrepancy Log — AI Flagged</div>
            <div className="csub">Mismatches between PO, invoice, and goods received · Click RCA+Fix for action plan</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`bdg ${discrepancies.length > 0 ? 'br' : 'bg'}`}>
              {discrepancies.length} {discrepancies.length === 1 ? 'Mismatch' : 'Mismatches'}
            </span>
            <button onClick={() => setModal('grn')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--green)', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
              + Record GRN
            </button>
          </div>
        </div>
        {discrepancies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#16a34a', fontSize: 13 }}>
            ✓ No GRN discrepancies — all receipts matched.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>GRN#</th><th>PO#</th><th>Supplier</th><th>Invoice</th><th>GRN Value</th><th>Variance</th><th>Issue</th><th>Recommended Action</th><th>RCA + Fix</th></tr>
            </thead>
            <tbody>
              {discrepancies.map(g => (
                <tr key={g.grn_number}>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--b2)' }}>{g.grn_number}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{g.po_number}</td>
                  <td style={{ fontWeight: 600 }}>{g.supplier}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{g.invoice_value}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: '#dc2626' }}>{g.grn_value}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: '#dc2626' }}>{g.discrepancy_amt}</td>
                  <td style={{ fontSize: 11 }}>{g.notes}</td>
                  <td style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>{g.action}</td>
                  <td>
                    <button onClick={() => goChat(`Explain the GRN discrepancy ${g.grn_number} for ${g.supplier}: ${g.notes}. Give me a step-by-step action plan to resolve it.`)}
                      style={{ fontSize: 10, padding: '2px 7px', background: 'none', border: '1px solid #dc2626', borderRadius: 4, cursor: 'pointer', color: '#dc2626', fontWeight: 600 }}>
                      RCA + Fix
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Supplier Quotations ─────────────────────────────────────────── */}
      <QuotationsSection
        goChat={goChat}
        onRaisePO={handleRaisePOFromQuote}
        industry={industry}
      />

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'right', marginTop: 10, fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        <DataSourceBadge source={isLive ? 'mysql' : 'mock'} />
        <button onClick={fetchData} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: 'var(--text3)', fontSize: 11, padding: '3px 9px', fontFamily: 'var(--mono)' }}>
          ↻ Refresh
        </button>
        <span style={{ fontFamily: 'var(--mono)' }}>Updated {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Show me my PO and GRN status — which purchase orders are overdue, any GRN mismatches, and what should I follow up with suppliers today?')}>
          <span>✨</span>
          <span>Ask AI: Overdue POs, GRN mismatches & supplier follow-ups →</span>
        </div>
      )}
    </div>
  );
}
