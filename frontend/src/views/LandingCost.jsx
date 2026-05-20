import React, { useState, useEffect, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import { exportToCsv } from '../utils/exportUtils';

// ── Constants ─────────────────────────────────────────────────────────────────
const CHARGE_HEADS = [
  { key: 'labour',         label: 'Labour Charges',               description: 'Loading / unloading labour at origin or destination' },
  { key: 'custom_duty',    label: 'Custom Duty',                   description: 'Import duty levied by customs on inbound goods' },
  { key: 'taxes',          label: 'Taxes (GST on freight)',         description: 'GST applicable on freight and third-party service bills' },
  { key: 'insurance',      label: 'Insurance',                     description: 'Transit insurance premium for goods in transit' },
  { key: 'freight_charge', label: 'Freight Charge',                description: 'Main long-haul / inter-city freight cost' },
  { key: 'service_charge', label: 'Service Charge (3PL)',           description: '3PL handling / service fee' },
  { key: 'local_freight',  label: 'Local Freight Charge',          description: 'Last-mile delivery within city' },
  { key: 'unloading',      label: 'Unloading Charges',             description: 'Labour / equipment for unloading at destination' },
];

const WHO_LABELS = {
  company: 'Company Bears',
  customer: 'Customer Bears',
  vendor: 'Vendor Bears',
  third_party: '3PL Bears',
  included_in_price: 'Incl. in Price',
};

// Default applicability matrix per operation type
const DEFAULTS_MATRIX = {
  po_customer:    { labour: { a: true,  w: 'company' }, custom_duty: { a: true,  w: 'company' }, taxes: { a: true,  w: 'company' }, insurance: { a: true,  w: 'company' }, freight_charge: { a: true,  w: 'company' }, service_charge: { a: false, w: 'company' }, local_freight: { a: true,  w: 'company' }, unloading: { a: true,  w: 'company' } },
  po_third_party: { labour: { a: false, w: 'third_party' }, custom_duty: { a: true,  w: 'company' }, taxes: { a: true,  w: 'company' }, insurance: { a: true,  w: 'company' }, freight_charge: { a: true,  w: 'company' }, service_charge: { a: true,  w: 'company' }, local_freight: { a: true,  w: 'company' }, unloading: { a: true,  w: 'company' } },
  po_vendor:      { labour: { a: false, w: 'vendor' }, custom_duty: { a: true,  w: 'company' }, taxes: { a: false, w: 'included_in_price' }, insurance: { a: false, w: 'vendor' }, freight_charge: { a: false, w: 'included_in_price' }, service_charge: { a: false, w: 'vendor' }, local_freight: { a: false, w: 'included_in_price' }, unloading: { a: true,  w: 'company' } },
  so_own:         { labour: { a: true,  w: 'company' }, custom_duty: { a: false, w: 'company' }, taxes: { a: true,  w: 'company' }, insurance: { a: true,  w: 'company' }, freight_charge: { a: true,  w: 'company' }, service_charge: { a: false, w: 'company' }, local_freight: { a: true,  w: 'company' }, unloading: { a: true,  w: 'customer' } },
  so_customer:    { labour: { a: false, w: 'customer' }, custom_duty: { a: false, w: 'customer' }, taxes: { a: false, w: 'customer' }, insurance: { a: false, w: 'customer' }, freight_charge: { a: false, w: 'customer' }, service_charge: { a: false, w: 'customer' }, local_freight: { a: false, w: 'customer' }, unloading: { a: false, w: 'customer' } },
  so_third_party: { labour: { a: false, w: 'third_party' }, custom_duty: { a: false, w: 'company' }, taxes: { a: true,  w: 'company' }, insurance: { a: true,  w: 'company' }, freight_charge: { a: true,  w: 'company' }, service_charge: { a: true,  w: 'company' }, local_freight: { a: true,  w: 'company' }, unloading: { a: true,  w: 'third_party' } },
  so_vendor:      { labour: { a: false, w: 'vendor' }, custom_duty: { a: false, w: 'vendor' }, taxes: { a: true,  w: 'company' }, insurance: { a: false, w: 'vendor' }, freight_charge: { a: true,  w: 'company' }, service_charge: { a: false, w: 'vendor' }, local_freight: { a: false, w: 'included_in_price' }, unloading: { a: false, w: 'customer' } },
};

const OP_TYPES = {
  PO: [
    { id: 'po_customer',    label: 'Customer (Buyer) Operated', desc: 'Buyer sends own vehicle to collect from supplier' },
    { id: 'po_third_party', label: 'Third Party Operated',      desc: '3PL logistics company handles transport' },
    { id: 'po_vendor',      label: 'Vendor Operated',           desc: 'Supplier delivers (CIF / DDP terms)' },
  ],
  SO: [
    { id: 'so_own',         label: 'Own Operated',              desc: 'Company delivers using its own vehicle' },
    { id: 'so_customer',    label: 'Customer Operated',         desc: 'Customer collects from warehouse (ex-works)' },
    { id: 'so_third_party', label: 'Third Party Operated',      desc: '3PL delivers to customer' },
    { id: 'so_vendor',      label: 'Vendor Operated',           desc: 'Supplier delivers direct to customer (drop-ship)' },
  ],
};

const MOCK_SHEETS = [
  { sheet_id: 'LC-2026-0012', ref_type: 'PO', ref_number: 'PO-7742', operation_type: 'po_third_party', operation_label: 'Purchase Order — Third Party Operated', date: '2026-05-15', product: { sku_name: 'Ebco Soft-Close Hinge 35mm Pk-10', qty: 500, unit: 'packs', base_price: 380, base_total: 190000 }, total_charges: 22370, landed_cost: 212370, landed_cost_per_unit: 424.74, margin_impact_pct: 11.8, status: 'FINALISED' },
  { sheet_id: 'LC-2026-0011', ref_type: 'SO', ref_number: 'SO-2026-0138', operation_type: 'so_own', operation_label: 'Sales Order — Own Operated', date: '2026-05-10', product: { sku_name: 'Hafele Zinc D-Handle 128mm', qty: 300, unit: 'pcs', base_price: 320, base_total: 96000 }, total_charges: 7736, landed_cost: 103736, landed_cost_per_unit: 345.79, margin_impact_pct: 8.06, status: 'FINALISED' },
];

const fmt  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtP = (n) => `${Number(n || 0).toFixed(2)}%`;

function initCharges(opType) {
  const dflt = DEFAULTS_MATRIX[opType] || {};
  const out  = {};
  CHARGE_HEADS.forEach(h => {
    const d = dflt[h.key] || { a: false, w: 'company' };
    out[h.key] = { amount: '', applicable: d.a, who_bears: d.w };
  });
  return out;
}

export default function LandingCost({ dbStatus, period, onGoChat }) {
  const [tab, setTab]           = useState('Sheets');
  const [sheets, setSheets]     = useState(MOCK_SHEETS);
  const [src, setSrc]           = useState('demo');
  const [selected, setSelected] = useState(null);

  // ── New Sheet form state ─────────────────────────────────────────────────
  const [docType, setDocType]     = useState('PO');
  const [opType, setOpType]       = useState('po_third_party');
  const [refNumber, setRefNumber] = useState('');
  const [skuName, setSkuName]     = useState('');
  const [skuCode, setSkuCode]     = useState('');
  const [qty, setQty]             = useState('');
  const [unit, setUnit]           = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [charges, setCharges]     = useState(() => initCharges('po_third_party'));
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg]   = useState('');
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    fetch('/api/landing-cost/sheets').then(r => r.json()).then(d => {
      if (d?.sheets?.length) { setSheets(d.sheets); setSrc(d.data_source || 'demo'); }
    }).catch(() => {});
  }, [period]);

  // When docType changes, reset op type to first available
  const handleDocType = useCallback((dt) => {
    setDocType(dt);
    const firstOp = OP_TYPES[dt][0].id;
    setOpType(firstOp);
    setCharges(initCharges(firstOp));
  }, []);

  const handleOpType = useCallback((ot) => {
    setOpType(ot);
    setCharges(initCharges(ot));
  }, []);

  const updateCharge = useCallback((key, field, value) => {
    setCharges(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }, []);

  // Live calculation
  const baseCostNum = parseFloat(basePrice || 0) * parseFloat(qty || 0);
  const companyTotal = CHARGE_HEADS.reduce((s, h) => {
    const c = charges[h.key];
    if (c?.applicable && c?.who_bears === 'company') s += parseFloat(c.amount || 0);
    return s;
  }, 0);
  const allChargesTotal = CHARGE_HEADS.reduce((s, h) => s + parseFloat(charges[h.key]?.amount || 0), 0);
  const landedCost      = baseCostNum + companyTotal;
  const qtyNum          = parseFloat(qty || 0);
  const landedPerUnit   = qtyNum > 0 ? landedCost / qtyNum : 0;
  const overheadPct     = baseCostNum > 0 ? (companyTotal / baseCostNum * 100) : 0;

  const handleSubmit = async () => {
    if (!refNumber || !skuName || !qty || !basePrice) { setSubmitError('Fill all required fields.'); return; }
    setSubmitting(true); setSubmitMsg(''); setSubmitError('');
    try {
      const chargesPayload = {};
      CHARGE_HEADS.forEach(h => {
        const c = charges[h.key];
        chargesPayload[h.key] = { amount: parseFloat(c.amount || 0), applicable: c.applicable, who_bears: c.who_bears };
      });
      const body = {
        ref_type: docType, ref_number: refNumber, operation_type: opType,
        product: { sku_name: skuName, sku_code: skuCode, qty: parseFloat(qty), unit, base_price: parseFloat(basePrice) },
        charges: chargesPayload,
      };
      const res  = await fetch('/api/landing-cost/sheets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed');
      setSubmitMsg(data.message);
      setSheets(prev => [data.sheet, ...prev]);
      // Reset
      setRefNumber(''); setSkuName(''); setSkuCode(''); setQty(''); setUnit(''); setBasePrice('');
      setCharges(initCharges(opType));
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const tabStyle = (id) => ({
    padding: '8px 18px', fontSize: 13, fontWeight: tab === id ? 700 : 500,
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: tab === id ? 'var(--brand)' : 'var(--text3)',
    borderBottom: tab === id ? '2px solid var(--brand)' : '2px solid transparent',
    transition: 'all .15s',
  });

  const opBtnStyle = (id) => ({
    padding: '10px 14px', borderRadius: 8, border: `2px solid ${opType === id ? 'var(--brand)' : 'var(--border)'}`,
    background: opType === id ? 'var(--g2)' : 'transparent', color: opType === id ? '#fff' : 'var(--text2)',
    cursor: 'pointer', fontSize: 12, fontWeight: opType === id ? 700 : 500, transition: '.15s', textAlign: 'left',
  });

  const totalLanded = sheets.reduce((s, sh) => s + (sh.landed_cost || 0), 0);

  const EXPORT_COLS = [
    { key: 'sheet_id', label: 'Sheet ID' }, { key: 'ref_type', label: 'Type' },
    { key: 'ref_number', label: 'Ref#' }, { key: 'date', label: 'Date' },
    { key: 'operation_label', label: 'Operation' }, { key: 'landed_cost', label: 'Landed Cost (₹)' },
    { key: 'landed_cost_per_unit', label: 'Per Unit (₹)' },
  ];

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Landing Cost — Labour · Duty · Freight · Unloading</div>
          <div className="psub">
            Compute true inward cost per unit across all charge heads and operation types
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-secondary" onClick={() => onGoChat('Which operation types in our landing cost sheets carry the highest overhead percentage? Give practical steps to reduce charges for PO and SO deliveries.')}>
              ✨ Optimisation Tips
            </button>
          )}
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Analyse our landing cost data and identify which suppliers or operation types are adding the most overhead cost per unit.')}>
              ✨ AI Analysis
            </button>
          )}
          <button className="btn-secondary" onClick={() => exportToCsv(sheets, EXPORT_COLS, 'landing-cost')}>
            Export CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card sg"><div className="kl">Total Sheets</div><div className="kv">{sheets.length}</div><div className="ks">Landing cost records</div></div>
        <div className="kpi-card sa"><div className="kl">Total Landed Cost</div><div className="kv">{fmt(totalLanded)}</div><div className="ks">Sum of all sheets</div></div>
        <div className="kpi-card sb"><div className="kl">Avg Overhead</div><div className="kv">{sheets.length ? fmtP(sheets.reduce((s, sh) => s + (sh.margin_impact_pct || 0), 0) / sheets.length) : '—'}</div><div className="ks">Charges as % of base cost</div></div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {['Sheets', 'New Sheet'].map(t => <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {/* ── Sheets list ───────────────────────────────────────────────────── */}
      {tab === 'Sheets' && (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Sheet ID</th><th>Type</th><th>Ref #</th><th>Date</th>
                <th>Product</th><th>Qty</th><th>Operation</th>
                <th>Base Cost</th><th>Charges</th><th>Landed Cost</th><th>Per Unit</th><th>Overhead</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sheets.map(s => (
                <React.Fragment key={s.sheet_id}>
                  <tr onClick={() => setSelected(selected?.sheet_id === s.sheet_id ? null : s)}
                    style={{ cursor: 'pointer', background: selected?.sheet_id === s.sheet_id ? 'var(--s2)' : 'transparent' }}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--brand)' }}>{s.sheet_id}</td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: s.ref_type === 'PO' ? '#eff6ff' : '#f0fdf4',
                        color: s.ref_type === 'PO' ? '#1d4ed8' : '#15803d' }}>
                        {s.ref_type}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.ref_number}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{s.date}</td>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{s.product?.sku_name}</td>
                    <td style={{ fontSize: 12 }}>{s.product?.qty} {s.product?.unit}</td>
                    <td style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 160 }}>{s.operation_label}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(s.product?.base_total || s.base_cost)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--amber)' }}>{fmt(s.total_charges)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>{fmt(s.landed_cost)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{fmt(s.landed_cost_per_unit)}</td>
                    <td style={{ fontSize: 12, color: s.margin_impact_pct > 10 ? 'var(--r2)' : 'var(--g2)', fontWeight: 700 }}>{fmtP(s.margin_impact_pct)}</td>
                    <td style={{ color: 'var(--brand)', fontSize: 11 }}>{selected?.sheet_id === s.sheet_id ? '▲' : '▼'}</td>
                  </tr>
                  {selected?.sheet_id === s.sheet_id && s.charges && (
                    <tr>
                      <td colSpan={13} style={{ padding: 0 }}>
                        <div style={{ background: 'var(--s2)', padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Charge Breakdown</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                            {CHARGE_HEADS.map(h => {
                              const c = s.charges?.[h.key];
                              if (!c?.applicable || !c?.amount) return null;
                              return (
                                <div key={h.key} style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}>
                                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{h.label}</div>
                                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14 }}>{fmt(c.amount)}</div>
                                  <div style={{ fontSize: 10, color: WHO_LABELS[c.who_bears] === 'Company Bears' ? 'var(--brand)' : 'var(--text3)', marginTop: 3 }}>
                                    {WHO_LABELS[c.who_bears] || c.who_bears}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {onGoChat && (
                            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                              <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }}
                                onClick={() => onGoChat(`Analyse landing cost sheet ${s.sheet_id} for product "${s.product?.sku_name}" (${s.operation_label}): base cost ₹${(s.product?.base_total || 0).toLocaleString('en-IN')}, total charges ₹${(s.total_charges || 0).toLocaleString('en-IN')}, landed cost ₹${(s.landed_cost || 0).toLocaleString('en-IN')}, overhead ${fmtP(s.margin_impact_pct)}. What are actionable ways to reduce the landed cost for this operation type?`)}>
                                ✨ Ask AI — Reduce These Costs
                              </button>
                              <button className="btn-secondary" style={{ fontSize: 12, padding: '7px 14px' }}
                                onClick={() => onGoChat(`For ${s.ref_type} reference ${s.ref_number} (${s.operation_label}): overhead is ${fmtP(s.margin_impact_pct)} of base cost. Benchmark this against industry standards and tell me if we are overpaying on any charge head. Suggest which party should ideally bear each cost.`)}>
                                ✨ Benchmark & Negotiate
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {sheets.length === 0 && (
                <tr><td colSpan={13} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No landing cost sheets found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── New Sheet ─────────────────────────────────────────────────────── */}
      {tab === 'New Sheet' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          {/* Form */}
          <div>
            {/* Document type */}
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Document Type</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {['PO', 'SO'].map(dt => (
                  <button key={dt} onClick={() => handleDocType(dt)}
                    style={{ flex: 1, padding: '12px', borderRadius: 8, border: `2px solid ${docType === dt ? 'var(--brand)' : 'var(--border)'}`,
                      background: docType === dt ? 'var(--brand)' : 'transparent', color: docType === dt ? '#fff' : 'var(--text2)',
                      fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: '.15s' }}>
                    {dt === 'PO' ? '📦 Purchase Order' : '🚚 Sales Order'}
                  </button>
                ))}
              </div>
            </div>

            {/* Operation type */}
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Operation Type</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {OP_TYPES[docType].map(op => (
                  <button key={op.id} onClick={() => handleOpType(op.id)} style={opBtnStyle(op.id)}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>{op.label}</div>
                    <div style={{ fontSize: 11, opacity: .8 }}>{op.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Product + reference */}
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Product & Reference</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>{docType} Reference # *</label>
                  <input value={refNumber} onChange={e => setRefNumber(e.target.value)} placeholder={docType === 'PO' ? 'PO-7750' : 'SO-2026-0145'}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>SKU Code</label>
                  <input value={skuCode} onChange={e => setSkuCode(e.target.value)} placeholder="e.g. EBCO-SCH-35"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Product Name *</label>
                  <input value={skuName} onChange={e => setSkuName(e.target.value)} placeholder="e.g. Ebco Soft-Close Hinge 35mm Pk-10"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Quantity *</label>
                  <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="500" min="1"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Unit</label>
                  <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="packs / pcs / kg"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>
                    Base Price per Unit ({docType === 'PO' ? 'Buy Price' : 'Sell Price'}) *
                  </label>
                  <input type="number" value={basePrice} onChange={e => setBasePrice(e.target.value)} placeholder="380.00" min="0.01" step="0.01"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            {/* Charge heads */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Charge Components</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
                Pre-filled based on operation type. Toggle applicable charges and enter amounts.
                Only <strong>Company Bears</strong> charges are added to the landed cost.
              </div>
              {CHARGE_HEADS.map(h => {
                const c = charges[h.key] || {};
                return (
                  <div key={h.key} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 200px 180px', gap: 10, alignItems: 'center',
                    marginBottom: 10, opacity: c.applicable ? 1 : 0.5, padding: '10px 12px',
                    background: c.applicable && c.who_bears === 'company' ? 'var(--s2)' : 'transparent',
                    borderRadius: 8, border: `1px solid ${c.applicable ? 'var(--border)' : 'transparent'}` }}>
                    <input type="checkbox" checked={c.applicable || false} onChange={e => updateCharge(h.key, 'applicable', e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{h.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{h.description}</div>
                    </div>
                    <select value={c.who_bears || 'company'} onChange={e => updateCharge(h.key, 'who_bears', e.target.value)}
                      disabled={!c.applicable}
                      style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)', color: 'var(--text1)' }}>
                      {Object.entries(WHO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: 13, pointerEvents: 'none' }}>₹</span>
                      <input type="number" value={c.amount} onChange={e => updateCharge(h.key, 'amount', e.target.value)}
                        disabled={!c.applicable} placeholder="0" min="0" step="0.01"
                        style={{ width: '100%', padding: '7px 10px 7px 24px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                );
              })}

              {submitMsg && <div style={{ color: 'var(--g2)', fontSize: 13, background: '#f0fdf4', padding: '10px 14px', borderRadius: 8, margin: '12px 0' }}>✓ {submitMsg}</div>}
              {submitError && <div style={{ color: 'var(--r2)', fontSize: 13, background: '#fef2f2', padding: '10px 14px', borderRadius: 8, margin: '12px 0' }}>✗ {submitError}</div>}

              <button onClick={handleSubmit} disabled={submitting || !refNumber || !skuName || !qty || !basePrice}
                style={{ width: '100%', marginTop: 16, padding: '11px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  background: (!refNumber || !skuName || !qty || !basePrice || submitting) ? 'var(--s4)' : 'var(--brand)',
                  color: (!refNumber || !skuName || !qty || !basePrice || submitting) ? 'var(--text3)' : '#fff', transition: '.15s' }}>
                {submitting ? 'Saving…' : 'Save Landing Cost Sheet'}
              </button>
            </div>
          </div>

          {/* Live calculation panel */}
          <div style={{ position: 'sticky', top: 80 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Live Calculation</div>
              {baseCostNum > 0 ? (
                <>
                  <div style={{ marginBottom: 14 }}>
                    {[
                      { label: 'Base Cost', value: fmt(baseCostNum), highlight: false },
                      { label: 'Company-Borne Charges', value: fmt(companyTotal), highlight: true, color: 'var(--amber)' },
                      { label: 'Overhead %', value: fmtP(overheadPct), highlight: false, color: overheadPct > 10 ? 'var(--r2)' : 'var(--g2)' },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                        <span style={{ color: 'var(--text3)' }}>{row.label}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: row.highlight ? 700 : 500, color: row.color || 'inherit' }}>{row.value}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: '2px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, marginBottom: 8 }}>
                        <span>Total Landed Cost</span>
                        <span style={{ color: 'var(--brand)', fontFamily: 'var(--mono)' }}>{fmt(landedCost)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)', fontWeight: 700 }}>
                        <span>Per Unit</span>
                        <span style={{ fontFamily: 'var(--mono)' }}>{fmt(landedPerUnit)}/{unit || 'unit'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Individual charge breakdown */}
                  <div style={{ background: 'var(--s2)', borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Charge Breakdown</div>
                    {CHARGE_HEADS.map(h => {
                      const c = charges[h.key];
                      const amt = parseFloat(c?.amount || 0);
                      if (!c?.applicable || amt <= 0) return null;
                      const isCo = c.who_bears === 'company';
                      return (
                        <div key={h.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                          <span style={{ color: 'var(--text3)', fontSize: 11 }}>{h.label}</span>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: isCo ? 700 : 400, color: isCo ? 'var(--brand)' : 'var(--text3)' }}>{fmt(amt)}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 20 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🧮</div>
                  <div style={{ fontSize: 12 }}>Enter product details to see live landed cost calculation</div>
                </div>
              )}
            </div>

            {/* Operation type summary */}
            <div className="card" style={{ padding: 20, marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Charge Defaults</div>
              {CHARGE_HEADS.map(h => {
                const c = charges[h.key];
                return (
                  <div key={h.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6, opacity: c?.applicable ? 1 : 0.4 }}>
                    <span style={{ color: 'var(--text3)' }}>{h.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                      background: c?.who_bears === 'company' ? 'var(--g2)' : 'var(--s3)',
                      color: c?.who_bears === 'company' ? '#fff' : 'var(--text3)' }}>
                      {WHO_LABELS[c?.who_bears] || '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
