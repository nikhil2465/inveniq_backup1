import React, { useState, useEffect, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import { exportToCsv } from '../utils/exportUtils';
import { getUser } from '../utils/authUtils';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtL = (n) => { const v = Number(n || 0); return v >= 100000 ? `₹${(v / 100000).toFixed(2)}L` : fmt(v); };

// ── Category styling ──────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  'Hardware Fittings':    { bg: '#eff6ff', color: '#1d4ed8' },
  'Sanitary CP Fittings': { bg: '#f0fdf4', color: '#15803d' },
  'Kitchen Systems':      { bg: '#fefce8', color: '#a16207' },
  'Door Hardware':        { bg: '#fdf4ff', color: '#7e22ce' },
  'High Pressure Laminate': { bg: '#fff7ed', color: '#c2410c' },
  'PVC & WPC':            { bg: '#f0f9ff', color: '#0369a1' },
};

function CategoryBadge({ category }) {
  const s = CATEGORY_COLORS[category] || { bg: 'var(--s3)', color: 'var(--text3)' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {category}
    </span>
  );
}

function StockIndicator({ qty }) {
  const color = qty <= 0 ? 'var(--r2)' : qty <= 30 ? 'var(--amber)' : 'var(--g2)';
  const label = qty <= 0 ? 'OUT' : qty <= 30 ? 'LOW' : 'OK';
  const bg    = qty <= 0 ? '#fef2f2' : qty <= 30 ? '#fffbeb' : '#f0fdf4';
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, color, background: bg }}>
      {label}
    </span>
  );
}

// ── My Stock tab ──────────────────────────────────────────────────────────────
function MyStockTab({ onGoChat }) {
  const user          = getUser();
  const distributorId = user?.distributor_id ?? null;
  const displayName   = user?.display_name || 'Distributor';

  const [distributor, setDistributor] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [src, setSrc]                 = useState('demo');
  const [search, setSearch]           = useState('');
  const [catFilter, setCatFilter]     = useState('ALL');
  const [error, setError]             = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/distributor/my-stock')
      .then(r => r.json())
      .then(data => {
        if (data?.distributor) {
          setDistributor(data.distributor);
          setSrc(data.data_source || 'demo');
        } else {
          setError('No stock allocated yet. Contact your supplier for an update.');
        }
      })
      .catch(() => {
        setError('Unable to load stock. Please try again later.');
      })
      .finally(() => setLoading(false));
  }, [distributorId]);

  const allStock      = distributor?.stock || [];
  const categories    = ['ALL', ...Array.from(new Set(allStock.map(s => s.category).filter(Boolean)))];
  const filteredStock = allStock.filter(s => {
    const matchCat  = catFilter === 'ALL' || s.category === catFilter;
    const matchSrch = !search || s.sku_name?.toLowerCase().includes(search.toLowerCase()) || s.sku_code?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSrch;
  });

  const totalValue    = allStock.reduce((s, i) => s + (i.stock_value || 0), 0);
  const totalItems    = allStock.reduce((s, i) => s + (i.qty || 0), 0);
  const lowStockCount = allStock.filter(i => i.qty <= 10).length;
  const skuCount      = allStock.length;

  const EXPORT_COLS = [
    { key: 'sku_code',      label: 'SKU Code' },
    { key: 'sku_name',      label: 'Product Name' },
    { key: 'category',      label: 'Category' },
    { key: 'qty',           label: 'Qty' },
    { key: 'unit',          label: 'Unit' },
    { key: 'stock_value',   label: 'Stock Value (₹)' },
    { key: 'dispatch_date', label: 'Last Dispatch Date' },
    { key: 'order_ref',     label: 'Order Ref' },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1.5s linear infinite' }}>⟳</div>
          <div>Loading your stock…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid var(--r3)', borderRadius: 12, padding: 32, textAlign: 'center', marginTop: 20 }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>📦</div>
        <div style={{ color: 'var(--r2)', fontWeight: 600 }}>{error}</div>
      </div>
    );
  }

  return (
    <>
      {/* Action buttons + source badge */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <DataSourceBadge source={src} />
        <div style={{ flex: 1 }} />
        {onGoChat && (
          <button className="btn-secondary" style={{ fontSize: 12 }}
            onClick={() => onGoChat(`Analyse stock health for distributor ${distributor?.distributor_name || displayName}: total stock value ₹${totalValue.toLocaleString('en-IN')}, ${skuCount} SKUs, ${totalItems} units. ${lowStockCount > 0 ? `${lowStockCount} items are LOW stock: ${allStock.filter(i => i.qty <= 10).map(i => `${i.sku_name} (${i.qty} ${i.unit})`).join(', ')}.` : 'All stock levels are healthy.'} What should I reorder immediately?`)}>
            ✨ Reorder Analysis
          </button>
        )}
        <button className="btn-secondary" onClick={() => exportToCsv(filteredStock, EXPORT_COLS, 'my-stock')}>
          Export CSV
        </button>
      </div>

      {/* Distributor info card */}
      {distributor && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #15803d, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🏪</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{distributor.distributor_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {distributor.contact_person && <><span>👤 {distributor.contact_person}</span> · </>}
              {distributor.phone && <><span>📞 {distributor.phone}</span> · </>}
              {distributor.city && <span>📍 {distributor.city}</span>}
            </div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
            background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
            {distributor.status}
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card sg">
          <div className="kl">Total Stock Value</div>
          <div className="kv">{fmtL(totalValue)}</div>
          <div className="ks">All SKUs combined</div>
        </div>
        <div className="kpi-card sb">
          <div className="kl">Total Items</div>
          <div className="kv">{totalItems.toLocaleString('en-IN')}</div>
          <div className="ks">Units in stock</div>
        </div>
        <div className="kpi-card sp">
          <div className="kl">SKU Count</div>
          <div className="kv">{skuCount}</div>
          <div className="ks">Product lines allocated</div>
        </div>
        <div className={`kpi-card ${lowStockCount > 0 ? 'sr' : 'sg'}`}>
          <div className="kl">Low Stock SKUs</div>
          <div className="kv">{lowStockCount}</div>
          <div className="ks">{lowStockCount > 0 ? 'Action required' : 'All levels healthy'}</div>
        </div>
      </div>

      {/* Low stock nudge */}
      {onGoChat && lowStockCount > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid var(--r3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--r2)' }}>{lowStockCount} SKU{lowStockCount > 1 ? 's are' : ' is'} running LOW</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {allStock.filter(i => i.qty <= 10).map(i => i.sku_name).join(' · ')}
            </div>
          </div>
          <button className="btn-primary" style={{ fontSize: 12, background: 'var(--r2)', borderColor: 'var(--r2)' }}
            onClick={() => onGoChat(`URGENT: ${allStock.filter(i => i.qty <= 10).map(i => `${i.sku_name} — only ${i.qty} ${i.unit} left`).join(', ')}. Recommended reorder qty and lead time?`)}>
            ✨ Emergency Reorder
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <svg viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, opacity: .5 }}>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
            style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 9, paddingBottom: 9, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${catFilter === c ? 'var(--brand)' : 'var(--border)'}`,
                background: catFilter === c ? 'var(--brand)' : 'transparent', color: catFilter === c ? '#fff' : 'var(--text2)',
                fontSize: 12, fontWeight: catFilter === c ? 700 : 400, cursor: 'pointer', transition: '.15s' }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Stock table */}
      <div className="card" style={{ padding: 0 }}>
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>SKU Code</th>
              <th>Product Name</th>
              <th>Category</th>
              <th style={{ textAlign: 'right' }}>Quantity</th>
              <th>Unit</th>
              <th style={{ textAlign: 'right' }}>Stock Value</th>
              <th>Stock Level</th>
              <th>Last Dispatch</th>
              <th>Order Ref</th>
            </tr>
          </thead>
          <tbody>
            {filteredStock.map((item, idx) => (
              <tr key={`${item.sku_code}-${idx}`}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>{item.sku_code}</td>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{item.sku_name}</td>
                <td><CategoryBadge category={item.category} /></td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15,
                  color: item.qty <= 10 ? 'var(--r2)' : item.qty <= 30 ? 'var(--amber)' : 'var(--g2)' }}>
                  {(item.qty || 0).toLocaleString('en-IN')}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text3)' }}>{item.unit}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(item.stock_value)}</td>
                <td><StockIndicator qty={item.qty} /></td>
                <td style={{ fontSize: 12, color: 'var(--text3)' }}>{item.dispatch_date || '—'}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--brand)' }}>{item.order_ref || '—'}</td>
              </tr>
            ))}
            {filteredStock.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
                  {search || catFilter !== 'ALL' ? 'No products match your filter' : 'No stock allocated yet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filteredStock.length > 0 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Showing {filteredStock.length} of {allStock.length} products</span>
            <span style={{ fontWeight: 700, color: 'var(--text2)' }}>
              Total value: <span style={{ color: 'var(--brand)', fontFamily: 'var(--mono)' }}>{fmtL(filteredStock.reduce((s, i) => s + (i.stock_value || 0), 0))}</span>
            </span>
          </div>
        )}
      </div>

      {/* Category summary */}
      {categories.length > 1 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text2)' }}>Category Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {categories.filter(c => c !== 'ALL').map(cat => {
              const catItems = allStock.filter(i => i.category === cat);
              const catValue = catItems.reduce((s, i) => s + (i.stock_value || 0), 0);
              const catQty   = catItems.reduce((s, i) => s + (i.qty || 0), 0);
              const cs       = CATEGORY_COLORS[cat] || { bg: 'var(--s3)', color: 'var(--text3)' };
              return (
                <div key={cat} className="card" style={{ padding: '16px 18px', borderTop: `3px solid ${cs.color}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: cs.color, marginBottom: 8 }}>{cat}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 18, marginBottom: 2 }}>{fmtL(catValue)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{catItems.length} SKUs · {catQty.toLocaleString('en-IN')} units</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ── Browse Inventory tab ──────────────────────────────────────────────────────
function BrowseInventoryTab({ onGoChat }) {
  const [items, setItems]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [src, setSrc]             = useState('demo');
  const [search, setSearch]       = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [error, setError]         = useState('');

  const fetchInventory = useCallback(() => {
    setLoading(true);
    fetch('/api/distributor/inventory')
      .then(r => r.json())
      .then(data => {
        setItems(data.items || []);
        setCategories(['ALL', ...(data.categories || [])]);
        setSrc(data.data_source || 'demo');
      })
      .catch(() => setError('Unable to load catalog. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  const filtered = items.filter(i => {
    const matchCat  = catFilter === 'ALL' || i.category === catFilter;
    const matchSrch = !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.sku_code?.toLowerCase().includes(search.toLowerCase());
    const matchStock = !inStockOnly || (i.stock_qty || 0) > 0;
    return matchCat && matchSrch && matchStock;
  });

  const inStockCount  = items.filter(i => (i.stock_qty || 0) > 0).length;
  const lowStockCount = items.filter(i => { const q = i.stock_qty || 0; return q > 0 && q <= 30; }).length;
  const outOfStock    = items.filter(i => (i.stock_qty || 0) === 0).length;

  const STOCK_STATUS_STYLE = {
    in_stock:    { bg: '#f0fdf4', color: '#15803d', label: 'In Stock' },
    low_stock:   { bg: '#fffbeb', color: '#d97706', label: 'Low Stock' },
    out_of_stock:{ bg: '#fef2f2', color: '#dc2626', label: 'Out of Stock' },
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1.5s linear infinite' }}>⟳</div>
          <div>Loading catalog…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid var(--r3)', borderRadius: 12, padding: 32, textAlign: 'center', marginTop: 20 }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: 'var(--r2)', fontWeight: 600, marginBottom: 12 }}>{error}</div>
        <button className="btn-primary" onClick={fetchInventory}>Retry</button>
      </div>
    );
  }

  return (
    <>
      {/* Status bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <DataSourceBadge source={src} />
        <div style={{ flex: 1 }} />
        {onGoChat && (
          <button className="btn-secondary" style={{ fontSize: 12 }}
            onClick={() => onGoChat(`Show me the supplier's full inventory: ${items.length} products available. Out of stock: ${outOfStock}. Low stock: ${lowStockCount}. Top available categories: ${categories.filter(c => c !== 'ALL').slice(0, 4).join(', ')}. What should I order to stock up and prepare for peak season?`)}>
            ✨ Order Recommendations
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card sb">
          <div className="kl">Total Products</div>
          <div className="kv">{items.length}</div>
          <div className="ks">In supplier catalog</div>
        </div>
        <div className="kpi-card sg">
          <div className="kl">In Stock</div>
          <div className="kv">{inStockCount}</div>
          <div className="ks">Available to order</div>
        </div>
        <div className="kpi-card sa">
          <div className="kl">Low Stock</div>
          <div className="kv">{lowStockCount}</div>
          <div className="ks">Order soon</div>
        </div>
        <div className="kpi-card sr">
          <div className="kl">Out of Stock</div>
          <div className="kv">{outOfStock}</div>
          <div className="ks">Currently unavailable</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, opacity: .5 }}>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or SKU…"
            style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 9, paddingBottom: 9, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} style={{ width: 14, height: 14 }} />
          In-stock only
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${catFilter === c ? 'var(--brand)' : 'var(--border)'}`,
                background: catFilter === c ? 'var(--brand)' : 'transparent', color: catFilter === c ? '#fff' : 'var(--text2)',
                fontSize: 12, fontWeight: catFilter === c ? 700 : 400, cursor: 'pointer', transition: '.15s' }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Product grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {filtered.map(item => {
          const ss = STOCK_STATUS_STYLE[item.stock_status] || STOCK_STATUS_STYLE.in_stock;
          const cs = CATEGORY_COLORS[item.category] || { bg: 'var(--s3)', color: 'var(--text3)' };
          return (
            <div key={item.product_id} className="card"
              style={{ padding: '14px 16px', borderTop: `3px solid ${cs.color}`, transition: '.15s',
                opacity: item.stock_status === 'out_of_stock' ? 0.65 : 1 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, marginBottom: 4 }}>{item.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>{item.sku_code}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
                  background: ss.bg, color: ss.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {ss.label}
                </span>
              </div>
              {/* Meta */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                <CategoryBadge category={item.category} />
                {item.brand && (
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--s3)', color: 'var(--text3)', fontWeight: 600 }}>
                    {item.brand}
                  </span>
                )}
              </div>
              {/* Features */}
              {item.features && item.features.length > 0 && (
                <ul style={{ margin: '0 0 10px', padding: '0 0 0 14px', fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
                  {item.features.slice(0, 3).map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
              {/* Pricing row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 1 }}>Sell Price (excl. GST)</div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 16, color: 'var(--brand)' }}>{fmt(item.sell_price)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>per {item.unit} · GST {item.gst_rate}%</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 1 }}>Stock Available</div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 16,
                    color: item.stock_status === 'in_stock' ? 'var(--g2)' : item.stock_status === 'low_stock' ? 'var(--amber)' : 'var(--r2)' }}>
                    {(item.stock_qty || 0).toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{item.unit}s</div>
                </div>
              </div>
              {item.lead_time && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: 'var(--brand)' }}>⏱</span> Lead time: {item.lead_time}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
            {search || catFilter !== 'ALL' || inStockOnly ? 'No products match your filters' : 'No products in catalog'}
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text3)', textAlign: 'right' }}>
          Showing {filtered.length} of {items.length} products
        </div>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DistributorPortal({ dbStatus, onGoChat }) {
  const user        = getUser();
  const displayName = user?.display_name || 'Distributor';
  const [activeTab, setActiveTab] = useState('my-stock');

  const TABS = [
    { id: 'my-stock',         label: '📦 My Stock',           desc: 'Inventory allocated to you' },
    { id: 'browse-inventory', label: '🏷 Browse Catalog',     desc: 'Full supplier product catalog' },
  ];

  return (
    <div className="view">
      {/* Page header */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Distributor Portal — {displayName}</div>
          <div className="psub">View your allocated stock and browse the full supplier catalog</div>
        </div>
      </div>

      {/* Tab strip */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--s3)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.desc}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500,
              background: activeTab === tab.id ? 'var(--surface)' : 'transparent',
              color: activeTab === tab.id ? 'var(--brand)' : 'var(--text3)',
              boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
              transition: '.15s',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'my-stock'         && <MyStockTab onGoChat={onGoChat} />}
      {activeTab === 'browse-inventory' && <BrowseInventoryTab onGoChat={onGoChat} />}
      {onGoChat && (
        <div className="ai-cta-bar" style={{ marginTop: 20 }} onClick={() => onGoChat(
          'Analyse my distributor portal stock levels — which products are running low and need immediate replenishment? ' +
          'Which items are overstocked? What should I order this week to maintain healthy availability?'
        )}>
          <span>✨</span>
          <span>Ask AI: Distributor stock analysis — replenishment priorities and slow-moving inventory</span>
        </div>
      )}
    </div>
  );
}
