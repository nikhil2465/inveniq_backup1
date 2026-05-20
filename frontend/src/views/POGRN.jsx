import React, { useState, useEffect, useCallback, useRef } from 'react';
import PageLoader from '../components/PageLoader';
import ErrorState from '../components/ErrorState';
import DataSourceBadge from '../components/DataSourceBadge';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { ExportButton } from '../utils/exportUtils';
import { printCreditNote } from '../utils/printUtils';

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
const OPERATION_TYPES = [
  'Regular Purchase', 'Emergency Purchase', 'Import Purchase',
  'Project Purchase', 'Sample Purchase', 'Capital Purchase', 'Inter-branch Transfer',
];

// ── HELPERS ───────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];
const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

const blankPO = () => ({
  supplier_name: '', supplier_contact: '', payment_terms: '',
  delivery_location: '', expected_date: plusDays(7), notes: '',
  operation_type: 'Regular Purchase',
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
  // Landing cost charges
  lc_freight: '', lc_insurance: '', lc_loading: '', lc_transport: '', lc_other: '',
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
  const isDraftPO = type === 'po' && (result.status === 'DRAFT' || result.demo_mode);
  return (
    <div style={{ textAlign: 'center', padding: '32px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{type === 'po' ? '📋' : '📦'}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: isDraftPO ? '#d97706' : type === 'po' ? 'var(--b2)' : 'var(--green)', marginBottom: 6 }}>
        {isDraftPO ? 'Draft PO Created — Pending Approval' : type === 'po' ? 'Purchase Order Created' : 'GRN Recorded Successfully'}
      </div>
      {isDraftPO && (
        <div style={{ fontSize: 11.5, color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 16px', marginBottom: 12, lineHeight: 1.5 }}>
          This PO is saved as <strong>Draft</strong> and requires <strong>Sales &amp; Finance approval</strong> before it can be issued to the supplier.<br />
          Go to the <strong>Pending Approvals</strong> tab to review and approve.
        </div>
      )}
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
          {result.operation_type && <Row label="Operation Type" val={result.operation_type} />}
        </>}
        {type === 'grn' && <>
          <Row label="Supplier" val={result.supplier} />
          {result.godown_name && <Row label="Received At" val={result.godown_name} />}
          <Row label="PO Reference" val={result.po_number} />
          <Row label="Invoice Value" val={`₹${Number(result.invoice_value || 0).toLocaleString('en-IN')}`} />
          <Row label="GRN Value" val={`₹${Number(result.grn_value || 0).toLocaleString('en-IN')}`} />
          <Row label="Match Status" val={
            <span style={{ color: isMatch ? 'var(--green)' : 'var(--r2)', fontWeight: 700 }}>
              {isMatch ? '✓ MATCH' : '⚠ MISMATCH'}
            </span>
          } />
          {!isMatch && <Row label="Discrepancy" val={`₹${Number(result.discrepancy_amt || 0).toLocaleString('en-IN')}`} />}
          {result.total_landed_cost > 0 && <>
            <Row label="Total Landed Cost" val={
              <span style={{ color: 'var(--b2)', fontWeight: 700 }}>
                ₹{Number(result.total_landed_cost).toLocaleString('en-IN')}
              </span>
            } />
            {result.landing_cost_per_unit > 0 && <Row label="Landed Cost / Unit" val={`₹${Number(result.landing_cost_per_unit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} />}
          </>}
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
          operation_type: form.operation_type || 'Regular Purchase',
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
          <div style={{ marginBottom: 14 }}>
            <Sel label="Operation Type *" value={form.operation_type} onChange={set('operation_type')} options={OPERATION_TYPES} required />
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
  const [form, setForm]               = useState(blankGRN());
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const [showLandingCost, setShowLandingCost] = useState(false);
  // Open POs (unreceived)
  const [openPos, setOpenPos]         = useState([]);
  const [posLoading, setPosLoading]   = useState(true);
  const [selectedPoId, setSelectedPoId] = useState('');
  // Invoice scan
  const [scanState, setScanState]     = useState(null); // null | 'scanning' | 'done' | 'error'
  const [scanMsg, setScanMsg]         = useState('');
  const fileInputRef                  = useRef(null);
  // Destination warehouse
  const [godowns, setGodowns]         = useState([]);
  const [godownId, setGodownId]       = useState('');
  const [godownName, setGodownName]   = useState('');

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const cat = industry === 'louvers' ? LOUVERS : LAMINATES;

  // Fetch unreceived POs and warehouses on mount
  useEffect(() => {
    setPosLoading(true);
    fetch('/api/po-grn/open-pos')
      .then(r => r.json())
      .then(d => { setOpenPos(d.open_pos || []); setPosLoading(false); })
      .catch(() => { setOpenPos([]); setPosLoading(false); });
    fetch('/api/warehouses')
      .then(r => r.json())
      .then(d => setGodowns(d.warehouses || []))
      .catch(() => {});
  }, []);

  // Auto-fill form when a PO is selected from the dropdown
  const handlePoSelect = (poId) => {
    setSelectedPoId(poId);
    if (!poId) return;
    const po = openPos.find(p => String(p.po_id ?? p.id ?? p.po_number) === poId);
    if (!po) return;
    setForm(f => ({
      ...f,
      po_number:     po.po_number || f.po_number,
      supplier_name: po.supplier_name || po.supplier || f.supplier_name,
      product_name:  po.sku_name || po.product_name || po.sku || f.product_name,
      qty_ordered:   po.qty_pending ?? po.qty_ordered ?? po.quantity ?? f.qty_ordered,
      unit:          po.unit || f.unit,
    }));
  };

  // Scan invoice via GPT-4o Vision
  const handleScanFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanState('scanning');
    setScanMsg('Analysing invoice with AI…');
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const raw = ev.target.result; // data:image/jpeg;base64,...
        const base64 = raw.split(',')[1];
        const image_type = file.type || 'image/jpeg';
        const res = await fetch('/api/po-grn/scan-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: base64, image_type }),
        });
        const data = await res.json();
        if (data.success && data.extracted) {
          const x = data.extracted;
          setForm(f => ({
            ...f,
            invoice_number: x.invoice_number || f.invoice_number,
            supplier_name:  x.supplier_name  || f.supplier_name,
            product_name:   x.product_name   || f.product_name,
            qty_ordered:    x.qty_ordered != null ? String(x.qty_ordered) : f.qty_ordered,
            qty_received:   x.qty_received != null ? String(x.qty_received) : f.qty_received,
            invoice_value:  x.invoice_value != null ? String(x.invoice_value) : f.invoice_value,
            grn_value:      x.grn_value != null ? String(x.grn_value) : f.grn_value,
            vehicle_number: x.vehicle_number || f.vehicle_number,
            received_by:    x.received_by    || f.received_by,
            po_number:      x.po_number      || f.po_number,
            notes:          x.notes          || f.notes,
          }));
          setScanState('done');
          setScanMsg(data.demo ? 'Demo scan complete — fields pre-filled with sample data.' : 'Invoice scanned — fields pre-filled. Please verify before saving.');
        } else {
          setScanState('error');
          setScanMsg(data.detail || 'Invoice scan failed — please fill fields manually.');
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setScanState('error');
      setScanMsg('Network error during scan — please fill fields manually.');
    }
    // Reset file input so same file can be re-scanned if needed
    e.target.value = '';
  };

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
          godown_id: godownId ? Number(godownId) : null,
          godown_name: godownName || null,
          freight_charges:   form.lc_freight   ? Number(form.lc_freight)   : 0,
          insurance_charges: form.lc_insurance ? Number(form.lc_insurance) : 0,
          loading_unloading: form.lc_loading   ? Number(form.lc_loading)   : 0,
          local_transport:   form.lc_transport ? Number(form.lc_transport) : 0,
          other_charges:     form.lc_other     ? Number(form.lc_other)     : 0,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Scan invoice button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={scanState === 'scanning'}
              style={{ ...BTN_PRIMARY, fontSize: 12, padding: '7px 14px', background: scanState === 'scanning' ? 'var(--text3)' : 'var(--purple, #7c3aed)' }}
              title="Scan supplier invoice image to auto-fill this form"
            >
              {scanState === 'scanning' ? '⏳ Scanning…' : '📷 Scan Invoice'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleScanFile}
            />
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 4px' }}>×</button>
          </div>
        </div>

        <div style={MODAL_BODY}>

          {/* Scan status banner */}
          {scanState && (
            <div style={{
              background: scanState === 'done' ? 'var(--g3)' : scanState === 'error' ? 'var(--r3)' : 'var(--b3)',
              border: `1px solid ${scanState === 'done' ? 'var(--g4)' : scanState === 'error' ? 'var(--r4)' : 'var(--b4)'}`,
              borderRadius: 8, padding: '9px 13px', fontSize: 12,
              color: scanState === 'done' ? 'var(--green)' : scanState === 'error' ? 'var(--r2)' : 'var(--b2)',
              marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{scanState === 'done' ? '✅' : scanState === 'error' ? '⚠' : '🔍'} {scanMsg}</span>
              <button onClick={() => { setScanState(null); setScanMsg(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, padding: '0 2px' }}>×</button>
            </div>
          )}

          {/* Open PO Selector */}
          <div style={SECTION_TITLE}>📋 Select from Unreceived Purchase Orders</div>
          <div style={{ marginBottom: 16 }}>
            {posLoading ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', padding: '8px 0' }}>Loading open POs…</div>
            ) : openPos.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>No unreceived purchase orders found — fill details manually below.</div>
            ) : (
              <>
                <label style={LABEL}>Link to a Purchase Order (auto-fills fields below)</label>
                <select
                  value={selectedPoId}
                  onChange={e => handlePoSelect(e.target.value)}
                  style={{ ...INPUT, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28 }}
                >
                  <option value="">— Manual entry (no PO) —</option>
                  {openPos.map(po => {
                    const id = String(po.po_id ?? po.id ?? po.po_number);
                    const qtyLabel = po.qty_pending != null ? `${po.qty_pending} ${po.unit || 'units'} pending` : po.quantity != null ? `${po.quantity} ${po.unit || 'units'}` : '';
                    const valLabel = po.total_value ? ` · ₹${Number(po.total_value).toLocaleString('en-IN')}` : '';
                    return (
                      <option key={id} value={id}>
                        {po.po_number} — {po.supplier_name} | {po.sku_name || po.product_name || 'No SKU'}{qtyLabel ? ` | ${qtyLabel}` : ''}{valLabel}
                      </option>
                    );
                  })}
                </select>
                {selectedPoId && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 5 }}>
                    ✓ PO fields auto-filled — verify quantities below and enter invoice details.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Reference */}
          <div style={SECTION_TITLE}>📑 Document References</div>
          <div style={ROW3}>
            <Inp label="PO Number" value={form.po_number} onChange={set('po_number')} placeholder="PO-7734" />
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

          {/* Destination Warehouse */}
          <div style={FIELD}>
            <label style={LABEL}>Destination Warehouse / Godown</label>
            <select
              value={godownId}
              onChange={e => {
                const wh = godowns.find(g => String(g.godown_id) === e.target.value);
                setGodownId(e.target.value);
                setGodownName(wh?.godown_name || '');
              }}
              style={{ ...INPUT, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28 }}
            >
              <option value="">— No specific warehouse —</option>
              {godowns.map(g => (
                <option key={g.godown_id} value={g.godown_id}>
                  {g.godown_name}{g.current_stock_sheets != null
                    ? ` (${g.current_stock_sheets} sheets · ${g.utilisation_pct != null ? g.utilisation_pct.toFixed(0) : '?'}% full)`
                    : ''}
                </option>
              ))}
            </select>
            {godownId && (
              <div style={{ fontSize: 11, color: 'var(--b2)', fontFamily: 'var(--mono)', marginTop: 5 }}>
                ✓ Goods will be stocked in <strong>{godownName}</strong> after GRN is recorded.
              </div>
            )}
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

          {/* Landing Cost */}
          <div
            style={{ ...SECTION_TITLE, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setShowLandingCost(v => !v)}
          >
            <span>📦 Landing Cost Breakdown {showLandingCost ? '▲' : '▼'}</span>
            {(() => {
              const total = [form.lc_freight, form.lc_insurance, form.lc_loading, form.lc_transport, form.lc_other]
                .reduce((s, v) => s + (Number(v) || 0), 0);
              return total > 0 ? (
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', color: 'var(--b2)', fontSize: 11 }}>
                  +₹{total.toLocaleString('en-IN')} charges
                </span>
              ) : (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                  Optional — click to expand
                </span>
              );
            })()}
          </div>
          {showLandingCost && (
            <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
              <div style={ROW3}>
                <Inp label="Freight / Shipping (₹)" value={form.lc_freight} onChange={set('lc_freight')} type="number" placeholder="0" />
                <Inp label="Insurance (₹)" value={form.lc_insurance} onChange={set('lc_insurance')} type="number" placeholder="0" />
                <Inp label="Loading / Unloading (₹)" value={form.lc_loading} onChange={set('lc_loading')} type="number" placeholder="0" />
              </div>
              <div style={ROW2}>
                <Inp label="Local Transport (₹)" value={form.lc_transport} onChange={set('lc_transport')} type="number" placeholder="0" />
                <Inp label="Other Charges (₹)" value={form.lc_other} onChange={set('lc_other')} type="number" placeholder="0" />
              </div>
              {(() => {
                const grnVal = Number(form.grn_value) || 0;
                const totalCharges = [form.lc_freight, form.lc_insurance, form.lc_loading, form.lc_transport, form.lc_other]
                  .reduce((s, v) => s + (Number(v) || 0), 0);
                const totalLanded = grnVal + totalCharges;
                const qtyRec = Number(form.qty_received) || 0;
                const perUnit = qtyRec > 0 ? (totalLanded / qtyRec).toFixed(2) : '—';
                return (
                  <div style={{ background: 'var(--b5)', border: '1px solid var(--b4)', borderRadius: 8, padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 3 }}>Total Charges</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--b2)', fontFamily: 'var(--mono)' }}>₹{totalCharges.toLocaleString('en-IN')}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 3 }}>Total Landed Cost</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--green)', fontFamily: 'var(--mono)' }}>₹{totalLanded.toLocaleString('en-IN')}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 3 }}>Landed Cost / Unit</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', fontFamily: 'var(--mono)' }}>₹{perUnit}</div>
                    </div>
                  </div>
                );
              })()}
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

// ── PO SCANNER MODAL ─────────────────────────────────────────────────────────

function POScannerModal({ onClose, onPreview }) {
  const [mode, setMode]           = useState('image');
  const [file, setFile]           = useState(null);
  const [fileUrl, setFileUrl]     = useState(null);
  const [textInput, setTextInput] = useState('');
  const [scanning, setScanning]   = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [error, setError]         = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [editData, setEditData]   = useState({
    supplier_name: '', payment_terms: '', expected_date: '', notes: '', items: [],
  });
  const [suppliers, setSuppliers]   = useState([]);
  const [suppOpen, setSuppOpen]     = useState(false);
  const fileRef    = useRef(null);
  const suppRef    = useRef(null);

  useEffect(() => {
    fetch('/api/procurement/suppliers')
      .then(r => r.json())
      .then(d => setSuppliers(d.suppliers || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const close = (e) => { if (suppRef.current && !suppRef.current.contains(e.target)) setSuppOpen(false); };
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

  const pickFile = (f) => { setFile(f); setFileUrl(URL.createObjectURL(f)); setScanResult(null); setError(''); };
  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) pickFile(f); };

  const doScan = async () => {
    if (mode === 'image' && !file) return setError('Upload an image first.');
    if (mode === 'text' && !textInput.trim()) return setError('Paste product text first.');
    setScanning(true); setError(''); setScanResult(null);
    try {
      const fd = new FormData();
      if (mode === 'image' && file) fd.append('file', file);
      if (textInput.trim()) fd.append('text_input', textInput.trim());
      const res = await fetch('/api/po/scan', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) { setScanResult(data); }
      else { setError(data.error || 'Extraction failed — please try again.'); }
    } catch { setError('Network error — could not reach server.'); }
    finally { setScanning(false); }
  };

  const setE = (field) => (val) => setEditData(d => ({ ...d, [field]: val }));
  const updItem = (idx, field, val) =>
    setEditData(d => ({ ...d, items: d.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) }));
  const removeItem = (idx) =>
    setEditData(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));
  const addItem = () =>
    setEditData(d => ({ ...d, items: [...d.items, { sku_name: '', category: '', quantity: '', unit: 'Sheets', unit_price: '', specifications: '', _key: Date.now() }] }));

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
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files[0] && pickFile(e.target.files[0])} />
              </div>
              {file && <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 14 }}>{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
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
                    {scanResult.demo && <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>(demo mode)</span>}
                  </span>
                </div>
                <button onClick={() => { setScanResult(null); setError(''); }}
                  style={{ fontSize: 11, padding: '3px 9px', background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                  ↺ Re-scan
                </button>
              </div>

              {/* Editable supplier / order fields */}
              <div style={ROW3}>
                {/* ── Supplier combo-box (searchable from Procurement Intelligence) ── */}
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
                            const isPref  = s.recommendation === 'PREFERRED';
                            const isGood  = s.recommendation === 'GOOD';
                            const badgeC  = isPref ? { bg: 'var(--g3)', txt: 'var(--green)', border: 'var(--g4)' }
                                          : isGood ? { bg: 'var(--b5,#eff6ff)', txt: 'var(--b2)', border: 'var(--b4,#bfdbfe)' }
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
            <button onClick={() => onPreview(editData)} disabled={editData.items.length === 0}
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

function POPreviewModal({ scanResult, onEdit, onClose, onSuccess }) {
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState('');

  const items      = scanResult?.items || [];
  const grandTotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  const poDate     = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

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
    if (results.length > 0) { onSuccess(results); }
    else { setError('Could not create POs — please try again.'); }
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
          <button onClick={onEdit} style={BTN_GHOST} disabled={creating}>✏ Edit</button>
          <button onClick={onClose} style={BTN_GHOST} disabled={creating}>Cancel</button>
          <button onClick={handleCreate} disabled={creating || !items.length}
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

// ── PO APPROVAL MODAL ─────────────────────────────────────────────────────────

function POApproveModal({ po, action, level, onClose, onDone }) {
  // action: 'approve' | 'reject' | 'release'
  const [approverName, setApproverName] = useState('');
  const [comments, setComments]         = useState('');
  const [busy, setBusy]                 = useState(false);
  const [err, setErr]                   = useState('');

  const isRelease = action === 'release';
  const isReject  = action === 'reject';

  const levelLabel = level === 'sales' ? 'Sales' : 'Finance';
  const accentColor = isReject ? '#dc2626' : isRelease ? '#16a34a' : '#2563eb';

  const handle = async () => {
    if (!isRelease && !approverName.trim()) { setErr('Approver name is required.'); return; }
    if (isReject && !comments.trim()) { setErr('Rejection reason is required.'); return; }
    setBusy(true); setErr('');
    try {
      let url, method, body;
      if (isRelease) {
        url    = `/api/po/${po.po_number}/release`;
        method = 'POST';
        body   = null;
      } else if (isReject) {
        url    = `/api/po/${po.po_number}/reject`;
        method = 'PATCH';
        body   = JSON.stringify({ level, approver_name: approverName.trim(), reason: comments.trim() });
      } else {
        url    = `/api/po/${po.po_number}/approve`;
        method = 'PATCH';
        body   = JSON.stringify({ level, approver_name: approverName.trim(), comments: comments.trim() });
      }
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      onDone(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={MODAL_OVERLAY} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...MODAL_BOX, maxWidth: 420, marginTop: 100 }}>
        <div style={{ ...MODAL_HDR, borderLeft: `4px solid ${accentColor}` }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
              {isRelease ? '🚀 Release PO to Supplier' : isReject ? '✗ Reject Purchase Order' : `✓ Approve as ${levelLabel} Team`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontFamily: 'var(--mono)' }}>
              {po.po_number} · {po.supplier} · ₹{Number(po.total_value).toLocaleString('en-IN')}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          {isRelease ? (
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>
              Both Sales and Finance have approved this PO. Releasing it will change its status to <strong>OPEN</strong> and make it visible to the supplier. This action cannot be undone.
            </div>
          ) : (
            <>
              <div style={FIELD}>
                <label style={LABEL}>{isReject ? 'Rejected by' : 'Approved by'} <span style={{ color: 'var(--r2)' }}>*</span></label>
                <input value={approverName} onChange={e => setApproverName(e.target.value)}
                  placeholder="Enter your name" style={INPUT} />
              </div>
              <div style={FIELD}>
                <label style={LABEL}>{isReject ? 'Rejection Reason' : 'Comments'}{isReject && <span style={{ color: 'var(--r2)' }}> *</span>}</label>
                <textarea value={comments} onChange={e => setComments(e.target.value)}
                  placeholder={isReject ? 'State the reason for rejection…' : 'Optional approval remarks…'}
                  style={{ ...INPUT, resize: 'vertical', minHeight: 72 }} />
              </div>
            </>
          )}
          {err && (
            <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--r2)', marginBottom: 10 }}>
              ⚠ {err}
            </div>
          )}
        </div>
        <div style={MODAL_FTR}>
          <button onClick={onClose} style={BTN_GHOST} disabled={busy}>Cancel</button>
          <button onClick={handle} disabled={busy}
            style={{ ...BTN_PRIMARY, background: accentColor, opacity: busy ? 0.7 : 1 }}>
            {busy ? '⏳ Processing…' : isRelease ? '🚀 Release to Supplier' : isReject ? '✗ Confirm Reject' : `✓ Confirm Approval`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PO APPROVAL PANEL ─────────────────────────────────────────────────────────

const APPROVAL_STATUS_STYLES = {
  approved: { bg: '#dcfce7', color: '#15803d', icon: '✓' },
  rejected: { bg: '#fee2e2', color: '#dc2626', icon: '✗' },
  pending:  { bg: '#fef3c7', color: '#92400e', icon: '⏳' },
};
const PO_STATUS_COLORS = {
  DRAFT:            { bg: '#f3f4f6', color: '#374151' },
  PENDING_APPROVAL: { bg: '#fef3c7', color: '#92400e' },
  APPROVED:         { bg: '#dcfce7', color: '#15803d' },
  REJECTED:         { bg: '#fee2e2', color: '#dc2626' },
};

function POApprovalPanel({ pendingApprovals, loading, onRefresh, goChat }) {
  const [modal, setModal] = useState(null); // { po, action, level }

  const handleDone = () => {
    setModal(null);
    onRefresh();
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 13 }}>
      Loading pending approvals…
    </div>
  );

  if (!pendingApprovals.length) return (
    <div style={{ textAlign: 'center', padding: '48px', color: 'var(--green)', fontSize: 13 }}>
      ✓ No POs pending approval. All purchase orders are up to date.
    </div>
  );

  return (
    <>
      {modal && (
        <POApproveModal
          po={modal.po}
          action={modal.action}
          level={modal.level}
          onClose={() => setModal(null)}
          onDone={handleDone}
        />
      )}

      <div className="poa-grid">
        {pendingApprovals.map(po => {
          const salesApproval   = po.approvals?.sales   || { status: 'pending' };
          const financeApproval = po.approvals?.finance || { status: 'pending' };
          const poStatusStyle   = PO_STATUS_COLORS[po.status] || PO_STATUS_COLORS.DRAFT;
          const fullyApproved   = salesApproval.status === 'approved' && financeApproval.status === 'approved';
          const isRejected      = po.status === 'REJECTED';

          return (
            <div key={po.po_number} className="poa-card">
              {/* Card header */}
              <div className="poa-card-header">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 13, color: 'var(--b2)' }}>
                      {po.po_number}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: poStatusStyle.bg, color: poStatusStyle.color }}>
                      {po.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{po.supplier}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 2 }}>{po.sku}</div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text2)', flexWrap: 'wrap' }}>
                    <span>₹{Number(po.total_value).toLocaleString('en-IN')}</span>
                    {po.expected_date && <span>ETA: {po.expected_date}</span>}
                    {po.po_date && <span>Created: {po.po_date}</span>}
                  </div>
                </div>
                <button onClick={() => goChat(`Analyse PO ${po.po_number} from ${po.supplier} worth ₹${Number(po.total_value).toLocaleString('en-IN')} and advise if I should approve it.`)}
                  style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: 'var(--b2)', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  🤖 Ask AI
                </button>
              </div>

              {/* Approval levels */}
              <div className="poa-approval-levels">
                {[
                  { key: 'sales',   label: 'Sales Team',   data: salesApproval },
                  { key: 'finance', label: 'Finance Team', data: financeApproval },
                ].map(({ key, label, data }) => {
                  const style = APPROVAL_STATUS_STYLES[data.status] || APPROVAL_STATUS_STYLES.pending;
                  return (
                    <div key={key} className="poa-level-badge" style={{ background: style.bg, borderColor: style.color + '44' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: style.color }}>{style.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: style.color }}>{label}</div>
                        {data.status === 'approved' && data.approver && (
                          <div style={{ fontSize: 10, color: '#166534', fontFamily: 'var(--mono)' }}>
                            {data.approver}{data.approved_at ? ` · ${data.approved_at.slice(0, 10)}` : ''}
                          </div>
                        )}
                        {data.status === 'rejected' && data.comments && (
                          <div style={{ fontSize: 10, color: '#991b1b', fontStyle: 'italic' }}>{data.comments}</div>
                        )}
                        {data.status === 'pending' && (
                          <div style={{ fontSize: 10, color: '#92400e', fontFamily: 'var(--mono)' }}>Awaiting approval</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              {po.notes && (
                <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', padding: '4px 0' }}>
                  📝 {po.notes}
                </div>
              )}

              {/* Action buttons */}
              {!isRejected && (
                <div className="poa-actions">
                  {salesApproval.status === 'pending' && (
                    <button onClick={() => setModal({ po, action: 'approve', level: 'sales' })}
                      style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      ✓ Sales Approve
                    </button>
                  )}
                  {financeApproval.status === 'pending' && (
                    <button onClick={() => setModal({ po, action: 'approve', level: 'finance' })}
                      style={{ padding: '6px 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      ✓ Finance Approve
                    </button>
                  )}
                  {fullyApproved && (
                    <button onClick={() => setModal({ po, action: 'release', level: null })}
                      style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      🚀 Release to Supplier
                    </button>
                  )}
                  <button onClick={() => setModal({ po, action: 'reject', level: salesApproval.status !== 'approved' ? 'sales' : 'finance' })}
                    style={{ padding: '6px 12px', background: 'none', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    ✗ Reject
                  </button>
                </div>
              )}
              {isRejected && (
                <div style={{ fontSize: 11, color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '6px 12px', fontStyle: 'italic' }}>
                  This PO has been rejected. Create a new PO or revise and resubmit.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function POGRN({ onGoChat }) {
  const [data, setData]                     = useState(null);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [industry, setIndustry]             = useState('laminates');
  const [modal, setModal]                   = useState(null);   // null | 'po' | 'grn'
  const [success, setSuccess]               = useState(null);   // { type, result }
  const [poPreFill, setPoPreFill]           = useState(null);   // { supplier, item, rate, industry }
  const [showPOScanner, setShowPOScanner]   = useState(false);
  const [poScanResult, setPoScanResult]     = useState(null);
  const [showPOPreview, setShowPOPreview]   = useState(false);
  const [activeTab, setActiveTab]           = useState('open');
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approvalLoading, setApprovalLoading]   = useState(false);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/po-grn');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const fetchPendingApprovals = useCallback(async () => {
    setApprovalLoading(true);
    try {
      const res = await fetch('/api/po/pending-approvals');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setPendingApprovals(json.pending_approvals || []);
    } catch (e) { /* non-fatal — keep existing list */ }
    finally { setApprovalLoading(false); }
  }, []);

  useEffect(() => { fetchData(); fetchPendingApprovals(); }, [fetchData, fetchPendingApprovals]);
  useAutoRefresh(fetchData, 5 * 60_000);

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
    fetchPendingApprovals();
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

  const handleScanPreview = (result) => {
    setPoScanResult(result);
    setShowPOPreview(true);
  };

  const handleScanCreate = (results) => {
    setShowPOScanner(false);
    setShowPOPreview(false);
    setPoScanResult(null);
    if (results.length > 0) {
      const firstResult = results.length > 1
        ? { ...results[0], po_number: `${results[0].po_number} +${results.length - 1} more` }
        : results[0];
      setSuccess({ type: 'po', result: firstResult });
    }
    fetchData();
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
      {showPOScanner && (
        <POScannerModal
          onClose={() => { setShowPOScanner(false); setShowPOPreview(false); setPoScanResult(null); }}
          onPreview={handleScanPreview}
        />
      )}
      {showPOPreview && poScanResult && (
        <POPreviewModal
          scanResult={poScanResult}
          industry={industry}
          onEdit={() => setShowPOPreview(false)}
          onClose={() => { setShowPOScanner(false); setShowPOPreview(false); setPoScanResult(null); }}
          onSuccess={handleScanCreate}
        />
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
          <button onClick={() => setShowPOScanner(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
            📷 Scan to PO
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
          {
            cls: 'st', l: 'Pending Approval',
            v: String(pendingApprovals.filter(p => p.status !== 'APPROVED').length || 0),
            d: pendingApprovals.some(p => p.status === 'APPROVED') ? '▲ Ready to release' : '▲ Awaiting review',
            s: 'Sales & Finance sign-off required',
            onClick: () => setActiveTab('approvals'),
          },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`}
            onClick={k.onClick || (() => goChat(`Explain the current status of ${k.l} and what action I should take`))}
            style={{ cursor: 'pointer' }}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd wn">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 3, background: 'var(--s3)', borderRadius: 10, padding: 4, border: '1px solid var(--border)', marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { id: 'open',         label: '📋 Open POs',           count: openPOs.length },
          { id: 'approvals',    label: '⏳ Pending Approvals',   count: pendingApprovals.filter(p => p.status !== 'APPROVED' && p.status !== 'REJECTED').length },
          { id: 'discrepancies',label: '⚠ GRN Issues',          count: discrepancies.length },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, transition: 'all .15s', display: 'inline-flex', alignItems: 'center', gap: 7,
              background: activeTab === tab.id ? 'var(--surface)' : 'transparent',
              color:      activeTab === tab.id ? 'var(--b2)' : 'var(--text3)',
              boxShadow:  activeTab === tab.id ? 'var(--sh)' : 'none',
            }}>
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                background: tab.id === 'approvals' ? '#d97706' : tab.id === 'discrepancies' ? '#dc2626' : 'var(--b2)',
                color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 800,
              }}>{tab.count}</span>
            )}
          </button>
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

      {/* ── Pending Approvals Panel ─────────────────────────────────────── */}
      {activeTab === 'approvals' && (
        <div className="card">
          <div className="ch" style={{ marginBottom: 14 }}>
            <div>
              <div className="ctit">PO Approval Workflow</div>
              <div className="csub">Draft POs awaiting Sales &amp; Finance sign-off before issuing to supplier</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className={`bdg ${pendingApprovals.filter(p => p.status !== 'APPROVED' && p.status !== 'REJECTED').length > 0 ? 'ba' : 'bg'}`}>
                {pendingApprovals.filter(p => p.status !== 'APPROVED' && p.status !== 'REJECTED').length} Pending
              </span>
              {pendingApprovals.some(p => p.status === 'APPROVED') && (
                <span className="bdg bg">{pendingApprovals.filter(p => p.status === 'APPROVED').length} Ready to Release</span>
              )}
              <button onClick={() => { fetchPendingApprovals(); fetchData(); }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: 'var(--text3)', fontSize: 11, padding: '3px 9px', fontFamily: 'var(--mono)' }}>
                ↻ Refresh
              </button>
            </div>
          </div>
          {/* Workflow legend */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '10px 14px', background: 'var(--s3)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: 'var(--text2)' }}>Workflow:</span>
            <span>📋 <strong>DRAFT</strong> → PO created, awaiting review</span>
            <span>⏳ <strong>PENDING</strong> → At least one team has approved</span>
            <span>✅ <strong>APPROVED</strong> → Both approved, ready to release</span>
            <span>🚀 <strong>OPEN</strong> → Released to supplier</span>
          </div>
          <POApprovalPanel
            pendingApprovals={pendingApprovals}
            loading={approvalLoading}
            onRefresh={() => { fetchPendingApprovals(); fetchData(); }}
            goChat={goChat}
          />
        </div>
      )}

      {/* ── Open POs Table ──────────────────────────────────────────────── */}
      {activeTab === 'open' && <div className="card">
        <div className="ch" style={{ marginBottom: 12 }}>
          <div>
            <div className="ctit">Open Purchase Orders</div>
            <div className="csub">Track all open, partial, and overdue POs · Click any row to ask AI</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="bdg ba">{openPOs.length} Open</span>
            <ExportButton rows={openPOs} filename="open_purchase_orders" columns={[
              { key: 'po_number', label: 'PO #' }, { key: 'supplier', label: 'Supplier' },
              { key: 'sku', label: 'SKU' }, { key: 'qty_ordered', label: 'Qty Ordered' },
              { key: 'qty_received', label: 'Qty Received' }, { key: 'fill_pct', label: 'Fill %' },
              { key: 'value', label: 'Value' }, { key: 'eta', label: 'ETA' }, { key: 'status', label: 'Status' },
            ]} />
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
      </div>}

      {/* ── GRN Discrepancy Log ─────────────────────────────────────────── */}
      {activeTab === 'discrepancies' && <div className="card" style={{ marginTop: 12 }}>
        <div className="ch" style={{ marginBottom: 12 }}>
          <div>
            <div className="ctit">GRN Discrepancy Log — AI Flagged</div>
            <div className="csub">Mismatches between PO, invoice, and goods received · Click RCA+Fix for action plan</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`bdg ${discrepancies.length > 0 ? 'br' : 'bg'}`}>
              {discrepancies.length} {discrepancies.length === 1 ? 'Mismatch' : 'Mismatches'}
            </span>
            <ExportButton rows={discrepancies} filename="grn_discrepancies" columns={[
              { key: 'grn_number', label: 'GRN #' }, { key: 'po_number', label: 'PO #' },
              { key: 'supplier', label: 'Supplier' }, { key: 'invoice_number', label: 'Invoice' },
              { key: 'grn_value', label: 'GRN Value' }, { key: 'variance_amount', label: 'Variance' },
              { key: 'issue_type', label: 'Issue' },
            ]} />
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
              <tr><th>GRN#</th><th>PO#</th><th>Supplier</th><th>Invoice</th><th>GRN Value</th><th>Variance</th><th>Issue</th><th>Recommended Action</th><th>Actions</th></tr>
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
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button onClick={() => goChat(`Explain the GRN discrepancy ${g.grn_number} for ${g.supplier}: ${g.notes}. Give me a step-by-step action plan to resolve it.`)}
                        style={{ fontSize: 10, padding: '2px 7px', background: 'none', border: '1px solid #dc2626', borderRadius: 4, cursor: 'pointer', color: '#dc2626', fontWeight: 600 }}>
                        RCA + Fix
                      </button>
                      <button onClick={() => printCreditNote(g)}
                        style={{ fontSize: 10, padding: '2px 7px', background: 'none', border: '1px solid var(--b3)', borderRadius: 4, cursor: 'pointer', color: 'var(--b2)', fontWeight: 600 }}>
                        🖨 Credit Note
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>}

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
