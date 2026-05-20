import React, { useState, useEffect, useRef, useCallback } from 'react';
import { baseOpts, createChart } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { ExportButton } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import Pagination from '../components/Pagination';

// ── Helper: AI-suggested reorder quantity (rounds to nearest 50, ~45 days cover) ─
function suggestQty(s30) {
  if (!s30 || s30 <= 0) return 100;
  const daily = s30 / 30;
  return Math.max(50, Math.ceil((daily * 45) / 50) * 50);
}

// ── Quick Create PO Modal ─────────────────────────────────────────────────────
function QuickCreatePOModal({ sku, onClose, onSuccess }) {
  const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

  const [form, setForm] = useState({
    supplier_name: sku.b || '',
    sku_name:      sku.n || '',
    quantity:      suggestQty(sku.s30),
    unit_price:    sku.buy > 0 ? sku.buy : '',
    expected_date: plusDays(7),
    notes:         '',
  });
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState('');
  const [result, setResult]   = useState(null);

  const up = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const totalVal = Number(form.quantity || 0) * Number(form.unit_price || 0);
  const daily    = sku.s30 > 0 ? (sku.s30 / 30).toFixed(1) : null;

  const handleCreate = async () => {
    if (!form.supplier_name.trim()) return setError('Supplier name is required.');
    if (!form.sku_name.trim())      return setError('SKU name is required.');
    if (Number(form.quantity) <= 0) return setError('Quantity must be greater than 0.');
    setSaving(true); setError('');
    try {
      const res  = await fetch('/api/po', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: form.supplier_name.trim(),
          sku_name:      form.sku_name.trim(),
          quantity:      Number(form.quantity),
          unit_price:    form.unit_price !== '' ? Number(form.unit_price) : null,
          expected_date: form.expected_date || undefined,
          category:      'Commercial',
          unit:          'sheet',
          notes:         form.notes.trim() || `Reorder from Stock Intelligence — ${sku.d}d cover remaining`,
        }),
      });
      const data = await res.json();
      if (data.success) { setResult(data); onSuccess(data); }
      else setError(data.error || 'Failed to create PO. Please try again.');
    } catch { setError('Network error — could not reach server.'); }
    finally { setSaving(false); }
  };

  // Shared inline styles
  const OV  = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' };
  const BOX = { background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 560, boxShadow: '0 24px 80px rgba(0,0,0,.35)', border: '1px solid var(--border)', marginTop: 8 };
  const HDR = { padding: '16px 22px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' };
  const BDY = { padding: '18px 22px', maxHeight: '72vh', overflowY: 'auto' };
  const FTR = { padding: '12px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--s3)', borderRadius: '0 0 14px 14px' };
  const LBL = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' };
  const INP = { width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none' };
  const FLD = { marginBottom: 14 };
  const G2  = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 };

  if (result) return (
    <div style={OV} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={BOX}>
        <div style={{ padding: '36px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>Purchase Order Created</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--b2)', fontFamily: 'var(--mono)', marginBottom: 12 }}>{result.po_number}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
            {result.supplier} · {result.sku_name || result.sku} · {Number(result.quantity).toLocaleString('en-IN')} sheets
          </div>
          {result.total_value > 0 && (
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)', marginBottom: 16 }}>
              Total: ₹{Number(result.total_value).toLocaleString('en-IN')}
            </div>
          )}
          {result.demo_mode && (
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 12 }}>(demo mode — connect MySQL to persist)</div>
          )}
          <button onClick={onClose}
            style={{ padding: '9px 28px', background: 'var(--b2)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={OV} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={BOX}>
        {/* Header */}
        <div style={HDR}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>📋 Raise Purchase Order</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 3 }}>
              {sku.n} · {sku.d}d cover left{daily ? ` · ${daily} sheets/day` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Body */}
        <div style={BDY}>
          {/* AI suggestion banner */}
          <div style={{ padding: '9px 13px', background: 'var(--b5,#eff6ff)', border: '1px solid var(--b4,#bfdbfe)', borderRadius: 8, marginBottom: 18, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--b2)' }}>
                AI Suggestion: Order {suggestQty(sku.s30).toLocaleString()} sheets
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                {sku.d}d stock cover · {daily ? `${daily} sheets/day · ` : ''}Covers ~45 days demand
                {sku.st === 'critical' && <span style={{ color: 'var(--r2)', fontWeight: 600, marginLeft: 6 }}>⚠ Order immediately</span>}
              </div>
            </div>
          </div>

          <div style={G2}>
            <div style={FLD}>
              <label style={LBL}>Supplier Name *</label>
              <input value={form.supplier_name} onChange={up('supplier_name')} style={INP} placeholder="e.g. Century Plyboards" autoFocus />
            </div>
            <div style={FLD}>
              <label style={LBL}>SKU / Product *</label>
              <input value={form.sku_name} onChange={up('sku_name')} style={INP} placeholder="Product name" />
            </div>
          </div>

          <div style={G2}>
            <div style={FLD}>
              <label style={LBL}>
                Quantity (sheets)
                <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--b2)', marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>AI: {suggestQty(sku.s30)}</span>
              </label>
              <input type="number" min="1" value={form.quantity} onChange={up('quantity')} style={INP} />
            </div>
            <div style={FLD}>
              <label style={LBL}>Unit Price (₹ / sheet)</label>
              <input type="number" min="0" step="0.01" value={form.unit_price} onChange={up('unit_price')} style={INP} placeholder="Buy price" />
            </div>
          </div>

          <div style={G2}>
            <div style={FLD}>
              <label style={LBL}>Expected Delivery Date</label>
              <input type="date" value={form.expected_date} onChange={up('expected_date')} style={INP} />
            </div>
            <div style={{ ...FLD, display: 'flex', alignItems: 'center' }}>
              {totalVal > 0 && (
                <div style={{ paddingTop: 22 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>PO Value</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
                    ₹{totalVal.toLocaleString('en-IN')}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={FLD}>
            <label style={LBL}>Notes (optional)</label>
            <input value={form.notes} onChange={up('notes')} style={INP} placeholder="Special instructions, grade requirements…" />
          </div>

          {error && (
            <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 7, padding: '9px 13px', fontSize: 12, color: 'var(--r2)', marginBottom: 4 }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={FTR}>
          <button onClick={onClose}
            style={{ padding: '9px 18px', background: 'var(--s3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving}
            style={{ padding: '9px 22px', background: saving ? 'var(--text3)' : 'var(--green)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving ? '⏳ Creating PO…' : '📋 Create Purchase Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

const STATIC_SKUS = [
  { n: '18mm BWP (8×4)',  b: 'Century',  stk: 140, buy: 1420, sell: 1920, d: 8,   s30: 480, st: 'critical' },
  { n: '12mm BWP (8×4)',  b: 'Century',  stk: 220, buy: 1080, sell: 1480, d: 11,  s30: 380, st: 'critical' },
  { n: '12mm MR Plain',   b: 'Greenply', stk: 380, buy: 720,  sell: 940,  d: 18,  s30: 420, st: 'ok' },
  { n: '18mm MR Plain',   b: 'Greenply', stk: 290, buy: 880,  sell: 1120, d: 22,  s30: 258, st: 'ok' },
  { n: '8mm Flexi BWP',   b: 'Gauri',   stk: 110, buy: 640,  sell: 840,  d: 28,  s30: 72,  st: 'over' },
  { n: '6mm Gurjan BWP',  b: 'National', stk: 186, buy: 960,  sell: 0,    d: 118, s30: 0,   st: 'dead' },
  { n: '4mm MR Plain',    b: 'National', stk: 240, buy: 580,  sell: 0,    d: 97,  s30: 4,   st: 'dead' },
  { n: '19mm Commercial', b: 'National', stk: 102, buy: 980,  sell: 0,    d: 91,  s30: 2,   st: 'dead' },
  { n: '10mm Flexi BWP',  b: 'Gauri',   stk: 88,  buy: 1240, sell: 1580, d: 74,  s30: 14,  st: 'over' },
  { n: 'Laminate Teak',   b: 'Supreme', stk: 165, buy: 340,  sell: 460,  d: 32,  s30: 128, st: 'ok' },
];

export default function Inventory({ onGoChat, period = 'MTD' }) {
  const [filter, setFilter]       = useState('all');
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 15;
  const [d, setD]                 = useState(null);
  const [loading, setLoading]     = useState(true);
  const [poPrefill, setPoPrefill] = useState(null);
  const mvRef = useRef(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/inventory?period=${encodeURIComponent(period)}`).then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);
  useEffect(() => { setPage(1); }, [filter, search]);

  const src = d?.data_source ?? 'demo';

  // Map API shape to internal shape
  const allSkus = (d?.skus?.length ? d.skus : STATIC_SKUS).map(s => ({
    n:   s.n ?? s.name,
    b:   s.b ?? s.brand,
    stk: s.stk ?? s.stock,
    buy: s.buy ?? 0,
    sell: s.sell ?? 0,
    d:   s.d ?? s.days_cover,
    s30: s.s30 ?? s.sales_30,
    st:  s.st ?? s.status,
  }));

  const chartData   = allSkus.slice(0, 8).map(s => s.s30 ?? 0);
  const chartLabels = allSkus.slice(0, 8).map(s => s.n ?? 'SKU');

  useEffect(() => {
    if (!d) return;
    return createChart(mvRef, {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [{ data: chartData, backgroundColor: chartData.map((v, i) => allSkus[i]?.st === 'dead' ? '#dc2626cc' : allSkus[i]?.st === 'critical' ? '#0f766ecc' : '#2563ebcc'), borderWidth: 0, borderRadius: 3 }],
      },
      options: baseOpts({ scales: { x: { grid: { color: '#e2e6ec' }, ticks: { color: '#4b5563', font: { size: 9 } } }, y: { grid: { color: '#e2e6ec' }, ticks: { color: '#9ca3af', font: { size: 9, family: 'JetBrains Mono' }, callback: v => v + ' sh' } } } }),
    });
  }, [d]);

  if (loading) return <SkeletonView />;

  const byStatus = filter === 'all' ? allSkus : allSkus.filter(s => s.st === filter);
  const q = search.trim().toLowerCase();
  const filtered = q ? byStatus.filter(s => (s.n ?? '').toLowerCase().includes(q) || (s.b ?? '').toLowerCase().includes(q)) : byStatus;
  const list = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const deadVal = d?.dead_stock_value ? (typeof d.dead_stock_value === 'number' ? `₹${d.dead_stock_value.toFixed(1)}L` : String(d.dead_stock_value)) : '₹4.2L';

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Stock Intelligence — AI-Powered Inventory View</div>
          <div className="psub">
            Live from your DMS · Reorder alerts · Overstock detection · Margin by SKU
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('What is the complete stock health report? Which items are critically low and need ordering today, and which are dead stock I should liquidate?')}>
              ✨ AI Stock Report
            </button>
          )}
        </div>
      </div>

      <div className="kg g5">
        {[
          { cls: 'sg', label: 'Total Stock Value',   val: d?.total_stock_value ?? '₹38.6L', d: '▲ From your DMS',           dc: 'up', s: '842 SKU variants tracked' },
          { cls: 'sr', label: 'Critical Low Stock',  val: `${d?.critical_count ?? 7} SKUs`, d: '▼ Below 10-day cover',       dc: 'dn', s: 'Order immediately · ₹8.2L revenue at risk' },
          { cls: 'sa', label: 'Overstock (60d+)',    val: '₹7.8L',                          d: '▲ 14 SKUs over-bought',     dc: 'wn', s: 'Cash locked in slow movers' },
          { cls: 'sr', label: 'Dead Stock (90d+)',   val: deadVal,                           d: '▼ 3 SKUs — no movement',    dc: 'dn', s: 'Discount or return to supplier' },
          { cls: 'sb', label: 'Avg Stock Cover',     val: '22 days',                         d: '▲ Healthy for most grades', dc: 'up', s: '18mm BWP only 8 days — risk' },
        ].map(k => (
          <div key={k.label} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`Tell me about ${k.label.toLowerCase()}`)}>
            <div className="kt"><div className="kl">{k.label}</div></div>
            <div className="kv">{k.val}</div>
            <div className={`kd ${k.dc}`}>{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '12px' }}>
        <div className="ch">
          <div><div className="ctit">SKU-wise Stock Health — AI Classification</div></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="chip-row">
              {['all', 'critical', 'dead', 'over', 'ok'].map(f => (
                <div key={f} className={`chip${filter === f ? ' sel' : ''}`} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All SKUs' : f === 'critical' ? 'Critical' : f === 'dead' ? 'Dead Stock' : f === 'over' ? 'Overstock' : 'Healthy'}
                </div>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search SKU or brand…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--mono)', outline: 'none', width: 180 }}
            />
            <ExportButton rows={allSkus} filename="inventory" columns={[
              { key: 'n', label: 'SKU' }, { key: 'b', label: 'Brand' },
              { key: 'stk', label: 'Stock (sheets)' }, { key: 'buy', label: 'Buy Price' },
              { key: 'sell', label: 'Sell Price' }, { key: 'd', label: 'Days Cover' },
              { key: 's30', label: '30d Sales' }, { key: 'st', label: 'Status' },
            ]} />
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>SKU / Product</th><th>Brand</th><th>In Stock</th><th>Buy Price</th><th>Sell Price</th><th>Margin</th><th>Days Cover</th><th>30d Sales</th><th>AI Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 13 }}>No SKUs match the selected filters</td></tr>
            )}
            {list.map(s => {
              const mg = s.sell > 0 ? Math.round((s.sell - s.buy) / s.sell * 100) : 0;
              const sc = s.st === 'ok' ? 'bg' : s.st === 'critical' ? 'br' : s.st === 'dead' ? 'br' : 'ba';
              const sl = s.st === 'ok' ? 'HEALTHY' : s.st === 'critical' ? 'CRITICAL' : s.st === 'dead' ? 'DEAD STOCK' : 'OVERSTOCK';
              return (
                <tr key={s.n} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(`Stock status and reorder recommendation for ${s.n}`)}>
                  <td style={{ fontWeight: 600 }}>{s.n}</td>
                  <td style={{ fontSize: '10px', color: 'var(--text2)' }}>{s.b}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{s.stk} sheets</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{s.buy > 0 ? '₹' + s.buy.toLocaleString() : '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{s.sell > 0 ? '₹' + s.sell.toLocaleString() : '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: mg > 25 ? '#16a34a' : mg > 15 ? '#d97706' : '#dc2626' }}>{mg > 0 ? mg + '%' : '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: s.d < 15 ? '#dc2626' : s.d < 30 ? '#d97706' : '#16a34a' }}>{s.d}d</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{s.s30 > 0 ? s.s30 + ' sheets' : 'None'}</td>
                  <td><span className={`bdg ${sc}`}>{sl}</span></td>
                  <td>
                    {s.st === 'critical' ? (
                      <button
                        onClick={e => { e.stopPropagation(); setPoPrefill(s); }}
                        style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font)' }}>
                        📋 Order now
                      </button>
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--text2)' }}>
                        {s.st === 'dead' ? 'Discount/Return' : s.st === 'over' ? 'Slow—hold' : 'Normal'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      <div className="gl g55">
        <div className="card">
          <div className="ch"><div><div className="ctit">Stock Movement — Fast vs Slow Movers</div><div className="csub">Sheets sold per month by SKU</div></div></div>
          <div style={{ height: '200px', position: 'relative' }}><canvas ref={mvRef}></canvas></div>
        </div>
        <div className="card">
          <div className="ch"><div className="ctit">AI Reorder Recommendations</div><span className="bdg br">{d?.critical_count ?? 7} Urgent</span></div>
          <div className="ilist">
            {[
              ['icr', '!', '18mm BWP — Order 200 sheets NOW', '8 days stock left. Daily sale: 17 sheets. Supplier lead time: 6 days.', 'CRITICAL · ORDER TODAY · ₹1.9L REVENUE AT RISK'],
              ['icr', '!', '12mm BWP — Order 150 sheets THIS WEEK', '11 days cover. Trending up +9% demand.', 'URGENT · 3-DAY WINDOW · ₹1.1L REVENUE'],
              ['ica', '↑', 'Laminates (8×4 teak) — Replenish 80 sheets', '14 days cover but demand forecast shows +22% next 30 days.', 'PLAN AHEAD · AI DEMAND SIGNAL'],
              ['icg', '✓', '6mm Gurjan — Hold. Do Not Reorder.', '90 days in stock with no sale. Clear existing stock first.', 'DEAD STOCK · CLEAR FIRST'],
            ].map(([ic, icon, t, dd, m]) => (
              <div key={t} className="ii" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                onClick={() => onGoChat?.(t)}>
                <div className={`iic ${ic}`}>{icon}</div>
                <div><div className="iti">{t}</div><div className="ide">{dd}</div><div className="imt">{m}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Calculate the EOQ and reorder point for my top 5 fast-moving SKUs. How much should I order from each supplier this week?')}>
          <span>✨</span>
          <span>Ask AI: Calculate EOQ and create this week's reorder plan →</span>
        </div>
      )}

      {poPrefill && (
        <QuickCreatePOModal
          sku={poPrefill}
          onClose={() => setPoPrefill(null)}
          onSuccess={() => setPoPrefill(null)}
        />
      )}
    </div>
  );
}
