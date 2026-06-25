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
  company:          'Company Bears',
  customer:         'Customer Bears',
  vendor:           'Vendor Bears',
  third_party:      '3PL Bears',
  included_in_price:'Incl. in Price',
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

const EXPORT_COLS = [
  { key: 'sheet_id',            label: 'Sheet ID' },
  { key: 'ref_type',            label: 'Type' },
  { key: 'ref_number',          label: 'Ref#' },
  { key: 'date',                label: 'Date' },
  { key: 'operation_label',     label: 'Operation' },
  { key: 'landed_cost',         label: 'Landed Cost (₹)' },
  { key: 'landed_cost_per_unit',label: 'Per Unit (₹)' },
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
  const [submitting, setSubmitting]   = useState(false);
  const [submitMsg, setSubmitMsg]     = useState('');
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    fetch('/api/landing-cost/sheets').then(r => r.json()).then(d => {
      if (d?.sheets?.length) { setSheets(d.sheets); setSrc(d.data_source || 'demo'); }
    }).catch(() => {});
  }, [period]);

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
  const baseCostNum   = parseFloat(basePrice || 0) * parseFloat(qty || 0);
  const companyTotal  = CHARGE_HEADS.reduce((s, h) => {
    const c = charges[h.key];
    if (c?.applicable && c?.who_bears === 'company') s += parseFloat(c.amount || 0);
    return s;
  }, 0);
  const landedCost    = baseCostNum + companyTotal;
  const qtyNum        = parseFloat(qty || 0);
  const landedPerUnit = qtyNum > 0 ? landedCost / qtyNum : 0;
  const overheadPct   = baseCostNum > 0 ? (companyTotal / baseCostNum * 100) : 0;

  const totalLanded = sheets.reduce((s, sh) => s + (sh.landed_cost || 0), 0);
  const canSave     = !submitting && refNumber && skuName && qty && basePrice;

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
      setRefNumber(''); setSkuName(''); setSkuCode(''); setQty(''); setUnit(''); setBasePrice('');
      setCharges(initCharges(opType));
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

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

      {/* AI Opportunity Chips */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '💰', text: `Avg overhead ${sheets.length ? (sheets.reduce((s,sh) => s+(sh.margin_impact_pct||0),0)/sheets.length).toFixed(1) : 0}% of base cost — what's the benchmark?`, q: `My average landing cost overhead is ${sheets.length ? (sheets.reduce((s,sh) => s+(sh.margin_impact_pct||0),0)/sheets.length).toFixed(1) : 0}% of base cost. In the hardware and building materials distribution industry in India, what is the expected landing cost overhead percentage? Which charge heads — labour, duty, freight, unloading — are typically the biggest and how do I negotiate each down?` },
            { icon: '🚛', text: 'Freight charges analysis — which routes are overpriced per kg?', q: 'Analyse my landing cost sheets by operation type and supplier location. Which inbound freight routes have the highest cost per kg or per unit? What minimum order quantity would justify hiring a full truck vs LCL? How do I benchmark my freight rates against market rates for this month?' },
            { icon: '📦', text: 'Consolidate inbound shipments — reduce landing cost by 15–25%', q: 'Looking at my purchase orders and landing cost sheets, which suppliers could I consolidate into combined shipments? What is the saving from combining 2-3 small orders into one full truck load? What coordination is needed with suppliers and transporters to make consolidation work in practice?' },
            { icon: '🏭', text: 'Unloading and labour charges — are we overpaying per unit?', q: 'My landing cost sheets include labour and unloading charges. What is the typical unloading cost per unit for hardware fittings, sanitary ware, and plywood in a warehouse operation? How do I compare our current rates against market rates? What changes — shift optimisation, equipment hire, vendor renegotiation — will reduce unloading cost?' },
            { icon: '📊', text: 'True cost per unit after landing — are all products still profitable?', q: 'Using my landing cost sheets, what is the true landed cost per unit for my key product categories after all charges? Compared to our sell price, are there any products where the margin after landed cost is below 10%? Which products need sell price adjustment or supplier renegotiation to remain profitable?' },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="lc-tabs">
        {['Sheets', 'New Sheet'].map(t => (
          <button key={t} className={`lc-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
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
                    <td><span className={`lc-badge lc-badge-${s.ref_type === 'PO' ? 'po' : 'so'}`}>{s.ref_type}</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.ref_number}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{s.date}</td>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{s.product?.sku_name}</td>
                    <td style={{ fontSize: 12 }}>{s.product?.qty} {s.product?.unit}</td>
                    <td style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 160 }}>{s.operation_label}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(s.product?.base_total ?? s.base_cost)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--amber)' }}>{fmt(s.total_charges)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>{fmt(s.landed_cost)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{fmt(s.landed_cost_per_unit)}</td>
                    <td className={s.margin_impact_pct > 10 ? 'lc-overhead-hi' : 'lc-overhead-ok'} style={{ fontSize: 12 }}>{fmtP(s.margin_impact_pct)}</td>
                    <td style={{ color: 'var(--brand)', fontSize: 11 }}>{selected?.sheet_id === s.sheet_id ? '▲' : '▼'}</td>
                  </tr>
                  {selected?.sheet_id === s.sheet_id && s.charges && (
                    <tr>
                      <td colSpan={13} style={{ padding: 0 }}>
                        <div className="lc-expand-panel">
                          <div className="lc-expand-hd">Charge Breakdown</div>
                          <div className="lc-charge-grid">
                            {CHARGE_HEADS.map(h => {
                              const c = s.charges?.[h.key];
                              if (!c?.applicable || !c?.amount) return null;
                              const isCo = c.who_bears === 'company';
                              return (
                                <div key={h.key} className="lc-charge-item">
                                  <div className="lc-charge-lbl">{h.label}</div>
                                  <div className="lc-charge-val">{fmt(c.amount)}</div>
                                  <div className={`lc-charge-who${isCo ? ' lc-charge-who-co' : ''}`}>
                                    {WHO_LABELS[c.who_bears] || c.who_bears}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {onGoChat && (
                            <div className="lc-expand-cta">
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
        <div className="lc-ns-grid">
          {/* Form */}
          <div>
            {/* Document type */}
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Document Type</div>
              <div className="lc-ns-doc-row">
                {['PO', 'SO'].map(dt => (
                  <button key={dt} className={`lc-ns-doc-btn${docType === dt ? ' active' : ''}`} onClick={() => handleDocType(dt)}>
                    {dt === 'PO' ? '📦 Purchase Order' : '🚚 Sales Order'}
                  </button>
                ))}
              </div>
            </div>

            {/* Operation type */}
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Operation Type</div>
              <div className="lc-op-grid">
                {OP_TYPES[docType].map(op => (
                  <button key={op.id} className={`lc-op-btn${opType === op.id ? ' active' : ''}`} onClick={() => handleOpType(op.id)}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>{op.label}</div>
                    <div style={{ fontSize: 11, opacity: .8 }}>{op.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Product + reference */}
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Product & Reference</div>
              <div className="lc-prod-grid">
                <div>
                  <label className="lc-label">{docType} Reference # *</label>
                  <input className="lc-input" value={refNumber} onChange={e => setRefNumber(e.target.value)}
                    placeholder={docType === 'PO' ? 'PO-7750' : 'SO-2026-0145'} />
                </div>
                <div>
                  <label className="lc-label">SKU Code</label>
                  <input className="lc-input" value={skuCode} onChange={e => setSkuCode(e.target.value)} placeholder="e.g. EBCO-SCH-35" />
                </div>
                <div className="lc-prod-full">
                  <label className="lc-label">Product Name *</label>
                  <input className="lc-input" value={skuName} onChange={e => setSkuName(e.target.value)}
                    placeholder="e.g. Ebco Soft-Close Hinge 35mm Pk-10" />
                </div>
                <div>
                  <label className="lc-label">Quantity *</label>
                  <input className="lc-input" type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="500" min="1" />
                </div>
                <div>
                  <label className="lc-label">Unit</label>
                  <input className="lc-input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="packs / pcs / kg" />
                </div>
                <div className="lc-prod-full">
                  <label className="lc-label">Base Price per Unit ({docType === 'PO' ? 'Buy Price' : 'Sell Price'}) *</label>
                  <input className="lc-input" type="number" value={basePrice} onChange={e => setBasePrice(e.target.value)}
                    placeholder="380.00" min="0.01" step="0.01" />
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
                const rowClass = `lc-comp-row${c.applicable ? (c.who_bears === 'company' ? ' on-co' : ' on') : ' off'}`;
                return (
                  <div key={h.key} className={rowClass}>
                    <input type="checkbox" checked={c.applicable || false}
                      onChange={e => updateCharge(h.key, 'applicable', e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    <div>
                      <div className="lc-comp-name">{h.label}</div>
                      <div className="lc-comp-desc">{h.description}</div>
                    </div>
                    <select className="lc-who-select" value={c.who_bears || 'company'}
                      onChange={e => updateCharge(h.key, 'who_bears', e.target.value)}
                      disabled={!c.applicable}>
                      {Object.entries(WHO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <div className="lc-amount-wrap">
                      <span className="lc-amount-sym">₹</span>
                      <input className="lc-amount-input" type="number" value={c.amount}
                        onChange={e => updateCharge(h.key, 'amount', e.target.value)}
                        disabled={!c.applicable} placeholder="0" min="0" step="0.01" />
                    </div>
                  </div>
                );
              })}

              {submitMsg   && <div className="lc-msg-ok">✓ {submitMsg}</div>}
              {submitError && <div className="lc-msg-err">✗ {submitError}</div>}

              <button onClick={handleSubmit} disabled={!canSave}
                className={`lc-save-btn${canSave ? ' ready' : ' disabled'}`}>
                {submitting ? 'Saving…' : 'Save Landing Cost Sheet'}
              </button>
            </div>
          </div>

          {/* Live calculation panel */}
          <div className="lc-ns-sticky">
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Live Calculation</div>
              {baseCostNum > 0 ? (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <div className="lc-calc-row">
                      <span className="lc-calc-lbl">Base Cost</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{fmt(baseCostNum)}</span>
                    </div>
                    <div className="lc-calc-row">
                      <span className="lc-calc-lbl">Company-Borne Charges</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{fmt(companyTotal)}</span>
                    </div>
                    <div className="lc-calc-row">
                      <span className="lc-calc-lbl">Overhead %</span>
                      <span className={overheadPct > 10 ? 'lc-overhead-hi' : 'lc-overhead-ok'}>{fmtP(overheadPct)}</span>
                    </div>
                    <div className="lc-calc-sep" />
                    <div className="lc-calc-total">
                      <span>Total Landed Cost</span>
                      <span className="lc-calc-total-val">{fmt(landedCost)}</span>
                    </div>
                    <div className="lc-calc-unit">
                      <span>Per Unit</span>
                      <span className="lc-calc-unit-val">{fmt(landedPerUnit)}/{unit || 'unit'}</span>
                    </div>
                  </div>

                  <div className="lc-calc-breakdown">
                    <div className="lc-calc-bk-hd">Charge Breakdown</div>
                    {CHARGE_HEADS.map(h => {
                      const c = charges[h.key];
                      const amt = parseFloat(c?.amount || 0);
                      if (!c?.applicable || amt <= 0) return null;
                      const isCo = c.who_bears === 'company';
                      return (
                        <div key={h.key} className="lc-calc-bk-row">
                          <span className="lc-calc-bk-lbl">{h.label}</span>
                          <span className={isCo ? 'lc-calc-bk-val-co' : 'lc-calc-bk-val-other'}>{fmt(amt)}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="lc-empty">
                  <div className="lc-empty-icon">🧮</div>
                  <div className="lc-empty-txt">Enter product details to see live landed cost calculation</div>
                </div>
              )}
            </div>

            {/* Operation type charge defaults */}
            <div className="card" style={{ padding: 20, marginTop: 16 }}>
              <div className="lc-defaults-hd">Charge Defaults</div>
              {CHARGE_HEADS.map(h => {
                const c = charges[h.key];
                const isCo = c?.who_bears === 'company';
                return (
                  <div key={h.key} className="lc-defaults-row" style={{ opacity: c?.applicable ? 1 : 0.4 }}>
                    <span className="lc-defaults-lbl">{h.label}</span>
                    <span className={`lc-who-badge${isCo ? ' lc-who-badge-co' : ' lc-who-badge-other'}`}>
                      {WHO_LABELS[c?.who_bears] || '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {onGoChat && (
        <div className="ai-cta-bar" style={{ marginTop: 20 }} onClick={() => onGoChat(
          'Analyse my landing cost data — which operation types and suppliers carry the highest overhead percentage? ' +
          'What practical steps can I take to reduce freight, insurance, and handling charges per unit?'
        )}>
          <span>✨</span>
          <span>Ask AI: Landing cost optimisation — identify highest overhead routes and cost-reduction opportunities</span>
        </div>
      )}
    </div>
  );
}
