import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, baseOpts, gradientFill, axisColors } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { ExportButton } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';

const MONTHS_SHORT = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const STATIC_SEASONAL = [88, 84, 90, 96, 100, 92, 76, 72, 94, 112, 128, 118];

const STATIC_FDATA = [
  { sku: '18mm BWP',  curr: 480, f30: 596, f60: 680, f90: 712, signal: 'SURGE +24%',    action: 'Pre-order 300 extra sheets NOW' },
  { sku: '12mm MR',   curr: 420, f30: 448, f60: 436, f90: 380, signal: 'STABLE +6.7%',  action: 'Normal ordering cycle' },
  { sku: '12mm BWP',  curr: 380, f30: 432, f60: 498, f90: 524, signal: 'GROWING +13.7%',action: 'Increase stock by 25%' },
  { sku: 'Laminates', curr: 320, f30: 298, f60: 274, f90: 250, signal: 'DECLINING -6.9%',action: 'Reduce next order quantity' },
  { sku: '18mm MR',   curr: 258, f30: 262, f60: 248, f90: 210, signal: 'STABLE',        action: 'Normal — monitor monsoon dip' },
  { sku: '8mm Flexi', curr: 72,  f30: 88,  f60: 102, f90: 118, signal: 'GROWING',       action: 'Fix supplier reliability first' },
  { sku: 'Commercial',curr: 24,  f30: 20,  f60: 16,  f90: 12,  signal: 'FALLING',       action: 'Do not reorder dead stock grade' },
];

const COLORS = { '18mm BWP': '#0f766e', '12mm MR': '#2563eb', '12mm BWP': '#0f766e', 'Laminates': '#9333ea', '18mm MR': '#d97706', '8mm Flexi': '#ea580c', 'Commercial': '#9ca3af' };
const SIG_SC = sig => {
  const s = String(sig).toUpperCase();
  if (s.includes('SURGE'))    return 'br';
  if (s.includes('GROWING'))  return 'bg';
  if (s.includes('DECLINING') || s.includes('FALLING') || s.includes('DEAD')) return 'ba';
  return 'bb';
};
const canPreorder = sig => {
  const s = String(sig).toUpperCase();
  return s.includes('SURGE') || s.includes('GROWING');
};

// ── Quick Pre-order Modal ────────────────────────────────────────────────────

const SUPPLIER_FALLBACK = [
  'Century Plyboards', 'Greenply Industries', 'Kitply Industries',
  'Greenlam Industries', 'Merino Industries', 'Action Tesa', 'Hettich India',
  'Ebco India Pvt. Ltd.',
];

function QuickPreorderModal({ item, onClose }) {
  const [suppliers, setSuppliers] = useState(SUPPLIER_FALLBACK);
  const [form, setForm] = useState({
    supplier_name: '',
    sku_name: item.sku,
    quantity: item.f30 || item.curr || 100,
    unit: 'Sheets',
    unit_price: '',
    expected_date: (() => {
      const d = new Date(); d.setDate(d.getDate() + 7);
      return d.toISOString().split('T')[0];
    })(),
    notes: `Pre-order raised from demand forecast — ${item.signal}`,
    operation_type: 'Regular Purchase',
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [existingPO, setExistingPO] = useState(null);
  const [checkingPO, setCheckingPO] = useState(true);

  useEffect(() => {
    // Load suppliers
    fetch('/api/procurement/suppliers')
      .then(r => r.json())
      .then(data => {
        const names = (data?.suppliers || []).map(s => s.name).filter(Boolean);
        if (names.length) setSuppliers(names);
      })
      .catch(() => {});

    // Check for existing open PO for this SKU
    fetch('/api/po-grn/open-pos')
      .then(r => r.json())
      .then(data => {
        const skuLower = (item.sku || '').toLowerCase();
        const match = (data?.open_pos || []).find(po =>
          (po.sku || '').toLowerCase().includes(skuLower) ||
          skuLower.includes((po.sku || '').toLowerCase().split(/[\s,]+/)[0])
        );
        setExistingPO(match || null);
      })
      .catch(() => {})
      .finally(() => setCheckingPO(false));
  }, [item.sku]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.supplier_name.trim()) { setError('Please select a supplier.'); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { setError('Quantity must be greater than 0.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: form.supplier_name.trim(),
          sku_name: form.sku_name.trim(),
          quantity: Number(form.quantity),
          unit: form.unit,
          unit_price: form.unit_price ? Number(form.unit_price) : null,
          expected_date: form.expected_date || null,
          notes: form.notes,
          operation_type: form.operation_type,
        }),
      });
      const data = await res.json();
      if (data.success || data.po_number) {
        setResult(data);
      } else {
        setError(data.detail || data.error || 'Failed to create PO.');
      }
    } catch {
      setError('Network error — could not create PO.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>Pre-order from Demand Forecast</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {result ? (
          <div style={{ padding: '24px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--green)', marginBottom: 4 }}>
              Purchase Order Created
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
              <strong>{result.po_number}</strong> — DRAFT, pending approval
            </div>
            <div style={{ background: 'var(--b3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', marginBottom: 16, textAlign: 'left' }}>
              <div><b>SKU:</b> {result.sku_name || result.sku}</div>
              <div><b>Supplier:</b> {result.supplier}</div>
              <div><b>Qty:</b> {result.quantity} {form.unit}</div>
              {result.total_value > 0 && <div><b>Value:</b> ₹{Number(result.total_value).toLocaleString('en-IN')}</div>}
              <div style={{ marginTop: 6, color: 'var(--amber)', fontSize: 11 }}>
                This PO is in DRAFT status and requires Sales &amp; Finance approval before being issued to the supplier.
              </div>
            </div>
            <button className="btn-primary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--a5)', border: '1px solid var(--a4)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--a2)' }}>
                <strong>AI Signal:</strong> {item.signal} — {item.action}
              </div>

              {checkingPO ? (
                <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '4px 0' }}>
                  Checking for existing open POs…
                </div>
              ) : existingPO ? (
                <div style={{ background: 'var(--o3)', border: '1px solid var(--o4)', borderRadius: 7, padding: '10px 13px', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: 'var(--o2)', marginBottom: 4 }}>
                    ⚠ Existing Open PO Found — {existingPO.po_number}
                  </div>
                  <div style={{ color: 'var(--a2)', lineHeight: 1.6 }}>
                    <span><strong>Supplier:</strong> {existingPO.supplier}</span>
                    {' · '}
                    <span><strong>Status:</strong> {existingPO.status}</span>
                    {' · '}
                    <span><strong>Fill:</strong> {existingPO.fill_pct}%</span>
                    {' · '}
                    <span><strong>ETA:</strong> {existingPO.eta}</span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text2)' }}>
                    A PO for this SKU is already in progress. Consider whether a new PO is necessary or if the existing one covers your demand.
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--g5)', border: '1px solid var(--g4)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--g2)' }}>
                  ✓ No existing open PO for this SKU — safe to proceed.
                </div>
              )}

              <div className="fg">
                <label className="fl">SKU / Item Name</label>
                <input className="fi" value={form.sku_name} onChange={e => set('sku_name', e.target.value)} required />
              </div>

              <div className="fg">
                <label className="fl">Preferred Supplier *</label>
                <input
                  className="fi"
                  list="preorder-supplier-list"
                  value={form.supplier_name}
                  onChange={e => set('supplier_name', e.target.value)}
                  placeholder="Type or select supplier..."
                  required
                />
                <datalist id="preorder-supplier-list">
                  {suppliers.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="fg">
                  <label className="fl">Quantity *</label>
                  <input className="fi" type="number" min="1" value={form.quantity}
                    onChange={e => set('quantity', e.target.value)} required />
                </div>
                <div className="fg">
                  <label className="fl">Unit</label>
                  <select className="fi" value={form.unit} onChange={e => set('unit', e.target.value)}>
                    {['Sheets', 'Pcs', 'RM', 'Kg', 'Boxes', 'Sets'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="fg">
                  <label className="fl">Est. Unit Price (₹)</label>
                  <input className="fi" type="number" min="0" step="0.01" value={form.unit_price}
                    onChange={e => set('unit_price', e.target.value)} placeholder="Optional" />
                </div>
                <div className="fg">
                  <label className="fl">Expected Delivery</label>
                  <input className="fi" type="date" value={form.expected_date}
                    onChange={e => set('expected_date', e.target.value)} />
                </div>
              </div>

              <div className="fg">
                <label className="fl">Notes</label>
                <input className="fi" value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>

              {error && <div style={{ color: 'var(--r2)', fontSize: 12, padding: '6px 10px', background: 'var(--r5)', borderRadius: 6 }}>{error}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Creating PO…' : 'Create Draft PO'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Demand({ onGoChat, period = 'MTD' }) {
  const [d, setD]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [preorderItem, setPreorderItem] = useState(null);
  const sRef = useRef(null);

  const fetchData = useCallback(() => {
    fetch(`/api/demand?period=${encodeURIComponent(period)}`).then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);

  const src        = d?.data_source ?? 'demo';
  const fdata      = d?.forecast?.length ? d.forecast : STATIC_FDATA;
  const seasonal   = d?.seasonal_index ?? STATIC_SEASONAL;
  const seasonText = d?.seasonal_insight ?? 'Oct–Dec is historically your strongest quarter (+28%). Start stocking up in September to avoid stockouts during the festive construction rush. Plan extra 400 sheets of BWP grades.';

  useEffect(() => {
    if (!d) return;
    const c = axisColors();
    return createChart(sRef, {
      type: 'line',
      data: {
        labels: MONTHS_SHORT,
        datasets: [{
          data: seasonal,
          borderColor: '#0f766e', backgroundColor: gradientFill('#0f766e'), borderWidth: 2.5, tension: .4,
          pointRadius: 3, pointBackgroundColor: '#0f766e', fill: true, label: 'Index (100=avg)',
        }],
      },
      options: baseOpts({ scales: { x: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9 } } }, y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' } } } } }),
    });
  }, [d]);

  if (loading) return <SkeletonView />;

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Demand Forecasting — What Will Sell Next?</div>
          <div className="psub">
            AI-powered demand signals · 30/60/90-day forecast · Seasonal patterns · Pre-order alerts
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Which products show SURGE demand in the next 90 days? How much stock should I pre-order right now to avoid stockouts during the peak period?')}>
              ✨ AI Demand Forecast
            </button>
          )}
        </div>
      </div>

      {/* ── AI Demand Opportunity Chips ── */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '🚀', text: '18mm BWP SURGE +24% — pre-order 300 sheets before stockout',       q: '18mm BWP shows a SURGE signal with 24% demand increase forecast for next 30 days. I currently have only 140 sheets (8 days cover). How many sheets should I pre-order, from which supplier, at what price, and when? Calculate the EOQ and give me the PO details.' },
            { icon: '📈', text: '12mm BWP GROWING +13.7% — increase stock by 25% this month',       q: '12mm BWP is forecasting GROWING demand at +13.7% over the next 90 days. I currently order at my current rate. How should I revise my next order quantity, supplier allocation, and safety stock to capture this growing demand without overstocking?' },
            { icon: '📉', text: 'Laminates DECLINING -6.9% — reduce next order to avoid dead stock', q: 'Laminate demand is forecast to decline -6.9% over the next 90 days. How should I adjust my order quantities, run a promotional push to current customers, or negotiate return terms with supplier before I get stuck with slow stock?' },
            { icon: '🎄', text: 'Oct–Dec peak +28% seasonal — start building buffer stock in Sep',   q: 'My sales peak in Oct–Dec at +28% above average. I need to start building buffer stock in September. Create a month-by-month pre-stocking plan for my top 5 SKUs — how much to order in Aug, Sep, and Oct to avoid stockouts during the peak.' },
            { icon: '🤖', text: 'AI detected 7 demand signals — act on top 3 within 48 hours',      q: 'I have multiple AI demand signals — SURGE on 18mm BWP, GROWING on 12mm BWP and 8mm Flexi, DECLINING on Laminates and Commercial. Prioritize the top 3 actions I should take in the next 48 hours to maximize profit and avoid both stockouts and overstock.' },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: '12px' }}>
        <div className="ch">
          <div><div className="ctit">30/60/90-Day Demand Forecast by SKU</div><div className="csub">AI prediction · Sheets/month</div></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="bdg bg">AI FORECAST</span>
            <ExportButton rows={fdata} filename="demand_forecast" columns={[
              { key: 'sku', label: 'SKU' }, { key: 'curr', label: 'Current (sheets)' },
              { key: 'f30', label: '30-Day Forecast' }, { key: 'f60', label: '60-Day Forecast' },
              { key: 'f90', label: '90-Day Forecast' }, { key: 'signal', label: 'AI Signal' },
              { key: 'action', label: 'Recommended Action' },
            ]} />
          </div>
        </div>
        <table className="tbl tbl-striped">
          <thead>
            <tr>
              <th>SKU</th><th>Current Month</th><th>30-Day Forecast</th>
              <th>60-Day</th><th>90-Day</th><th>AI Signal</th><th>Recommended Action</th><th>Pre-order</th>
            </tr>
          </thead>
          <tbody>
            {fdata.map(row => {
              const g30 = row.curr > 0 ? Math.round((row.f30 - row.curr) / row.curr * 100) : 0;
              const sc   = SIG_SC(row.signal);
              const bg30 = row.f30 > row.curr ? '#0f766e' : row.f30 < row.curr ? '#dc2626' : '#2563eb';
              return (
                <tr key={row.sku} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(`Demand forecast for ${row.sku}`)}>
                  <td style={{ fontWeight: 600 }}>{row.sku}</td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{row.curr} sheets</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ background: bg30, borderRadius: '4px', padding: '5px 8px', color: '#fff', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, display: 'inline-block' }}>
                      {row.f30} ({g30 >= 0 ? '+' : ''}{g30}%)
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: row.f60 > row.curr ? '#0f766e' : '#dc2626' }}>{row.f60}</td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: row.f90 > row.curr ? '#0f766e' : '#dc2626' }}>{row.f90}</td>
                  <td style={{ textAlign: 'center' }}><span className={`bdg ${sc}`}>{row.signal}</span></td>
                  <td style={{ fontSize: '11px', color: 'var(--text2)' }}>{row.action ?? row.ac}</td>
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    {canPreorder(row.signal) ? (
                      <button
                        className="btn-primary"
                        style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
                        onClick={() => setPreorderItem(row)}
                      >
                        Pre-order
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="gl g55">
        <div className="card">
          <div className="ch"><div><div className="ctit">30/60/90-Day Demand by SKU</div><div className="csub">Visual bars</div></div></div>
          {fdata.slice(0, 6).map(row => {
            const c  = COLORS[row.sku] || '#9ca3af';
            const mx = Math.max(row.curr, row.f30, row.f60, row.f90);
            return (
              <div key={row.sku} className="fc-row">
                <span className="fc-lbl">{row.sku}</span>
                <div className="fc-bs">
                  {[{ v: row.curr, o: '99' }, { v: row.f30, o: 'cc' }, { v: row.f60, o: 'bb' }, { v: row.f90, o: '99' }].map((b, i) => (
                    <div key={i} className="fc-b" style={{ height: `${Math.round(b.v / mx * 100)}%`, background: `${c}${b.o}` }}>{b.v}</div>
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: '3px', marginLeft: '100px', marginTop: '3px' }}>
            {['Now', '30d', '60d', '90d'].map(l => <div key={l} className="fc-pl">{l}</div>)}
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ctit">Seasonal Pattern — AI Detected</div><div className="csub">Based on historical sales data</div></div>
          <div style={{ height: '180px', position: 'relative' }}><canvas ref={sRef}></canvas></div>
          <div style={{ padding: '10px 12px', background: 'var(--b3)', border: '1px solid var(--b4)', borderRadius: '7px', marginTop: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--b2)', fontFamily: 'var(--mono)', marginBottom: '3px' }}>AI SEASONAL INSIGHT</div>
            <div style={{ fontSize: '12px', color: 'var(--blue)' }}>{seasonText}</div>
          </div>
        </div>
      </div>

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Based on the demand forecast and seasonal patterns, create a complete pre-order plan for the next 60 days — which products, how many sheets, from which suppliers, and when to order.')}>
          <span>✨</span>
          <span>Ask AI: Build 60-day pre-order plan based on demand forecast and seasonal data →</span>
        </div>
      )}

      {preorderItem && (
        <QuickPreorderModal item={preorderItem} onClose={() => setPreorderItem(null)} />
      )}
    </div>
  );
}
