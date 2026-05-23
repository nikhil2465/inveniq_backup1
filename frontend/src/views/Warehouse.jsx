import React, { useState, useEffect, useCallback } from 'react';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { ExportButton } from '../utils/exportUtils';
import DataSourceBadge from '../components/DataSourceBadge';
import PageLoader from '../components/PageLoader';
import Pagination from '../components/Pagination';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtL = (n) => { const v = Number(n || 0); return v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : fmt(v); };

// ── Helpers ───────────────────────────────────────────────────────────────────
const utilColor = (pct) => pct >= 90 ? 'var(--red)' : pct >= 75 ? 'var(--amber)' : 'var(--green)';
const utilBg    = (pct) => pct >= 90 ? '#fef2f2'    : pct >= 75 ? '#fffbeb'      : '#f0fdf4';

const STOCK_COLOR = { CRITICAL: 'var(--red)', LOW: 'var(--amber)', HEALTHY: 'var(--green)', OVERSTOCK: 'var(--brand)' };
const STOCK_BG    = { CRITICAL: '#fef2f2',    LOW: '#fffbeb',      HEALTHY: '#f0fdf4',      OVERSTOCK: '#eff6ff' };

// ── Sub-components ────────────────────────────────────────────────────────────

function CapacityBar({ pct, height = 6 }) {
  const color = utilColor(pct);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height, background: 'var(--s4)', borderRadius: 99 }}>
        <div style={{ width: `${Math.min(pct || 0, 100)}%`, height: '100%', background: color, borderRadius: 99, transition: '.35s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 38, textAlign: 'right' }}>
        {(pct || 0).toFixed(1)}%
      </span>
    </div>
  );
}

function StockBadge({ status }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      color: STOCK_COLOR[status] || 'var(--text3)', background: STOCK_BG[status] || 'var(--s3)',
      textTransform: 'uppercase', letterSpacing: '.5px',
    }}>{status || '—'}</span>
  );
}

function MatchBadge({ status }) {
  const isMatch = status === 'MATCH';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      color: isMatch ? 'var(--green)' : 'var(--r2)',
      background: isMatch ? '#f0fdf4' : '#fef2f2',
    }}>{status}</span>
  );
}

function AvatarChip({ name }) {
  if (!name) return <span style={{ color: 'var(--text3)' }}>—</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: 'var(--brand)', color: '#fff',
        fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {name.charAt(0).toUpperCase()}
      </div>
      <span style={{ fontSize: 12 }}>{name}</span>
    </div>
  );
}

// ── Warehouse Detail Panel ────────────────────────────────────────────────────
function WarehouseDetail({ wh }) {
  const [section, setSection] = useState('products');

  const sectionBtnStyle = (id) => ({
    padding: '10px 16px', fontSize: 12, fontWeight: section === id ? 700 : 500,
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: section === id ? 'var(--brand)' : 'var(--text3)',
    borderBottom: section === id ? '2px solid var(--brand)' : '2px solid transparent',
    transition: 'all .15s',
  });

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', marginTop: 16, boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>
      {/* Detail header */}
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', background: 'var(--s2)', borderRadius: '12px 12px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, #15803d, #16a34a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>🏭</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{wh.godown_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              📍 {wh.location}
              {wh.manager_name && <> · 👤 {wh.manager_name}</>}
              {wh.contact_phone && <> · 📞 {wh.contact_phone}</>}
            </div>
          </div>
        </div>

        {/* 4-stat grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          {[
            { label: 'Total Capacity', value: (wh.capacity_sheets || 0).toLocaleString('en-IN'), sub: 'sheets', color: 'var(--text)' },
            { label: 'Current Stock',  value: (wh.current_stock_sheets || 0).toLocaleString('en-IN'), sub: `${wh.current_stock_value_fmt || fmtL(wh.current_stock_value)} value`, color: 'var(--brand)' },
            { label: 'Available Space', value: (wh.available_capacity_sheets || 0).toLocaleString('en-IN'), sub: 'sheets free', color: (wh.available_capacity_sheets || 0) < 100 ? 'var(--red)' : 'var(--green)' },
            { label: 'Utilisation', value: `${(wh.utilisation_pct || 0).toFixed(1)}%`, sub: 'capacity used', color: utilColor(wh.utilisation_pct || 0) },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{ background: 'var(--surface)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 5 }}>{label}</div>
              <div style={{ fontSize: 19, fontWeight: 900, color, fontFamily: 'var(--mono)' }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Capacity bar */}
        <CapacityBar pct={wh.utilisation_pct || 0} height={8} />
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 0, padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {[['products', `📦 Products (${wh.products?.length || 0})`], ['grns', `📋 Recent GRNs (${wh.recent_grns?.length || 0})`]].map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)} style={sectionBtnStyle(id)}>{label}</button>
        ))}
      </div>

      {/* Products */}
      {section === 'products' && (
        <div style={{ padding: '0 0 4px' }}>
          {!wh.products?.length ? (
            <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text3)', fontSize: 13 }}>
              No products tracked in this warehouse.
            </div>
          ) : (
            <table className="tbl" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Brand</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Qty (sheets)</th>
                  <th style={{ textAlign: 'right' }}>Buy Price</th>
                  <th style={{ textAlign: 'right' }}>Stock Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {wh.products.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.sku_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{p.sku_code}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>{p.brand}</td>
                    <td style={{ fontSize: 12 }}>{p.category}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                      {(p.quantity || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(p.buy_price)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--mono)' }}>{fmtL(p.stock_value)}</td>
                    <td><StockBadge status={p.stock_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Recent GRNs */}
      {section === 'grns' && (
        <div style={{ padding: '0 0 4px' }}>
          {!wh.recent_grns?.length ? (
            <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text3)', fontSize: 13 }}>
              No recent GRN activity for this warehouse.
            </div>
          ) : (
            <table className="tbl" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>GRN #</th>
                  <th>Supplier</th>
                  <th>Invoice #</th>
                  <th>PO #</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>GRN Value</th>
                  <th>Status</th>
                  <th>Processed By</th>
                </tr>
              </thead>
              <tbody>
                {wh.recent_grns.map((g, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>{g.grn_number}</td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{g.supplier_name}</td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{g.invoice_number || '—'}</td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{g.po_number || '—'}</td>
                    <td style={{ fontSize: 12 }}>{g.received_date}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmtL(g.grn_value)}</td>
                    <td><MatchBadge status={g.match_status} /></td>
                    <td><AvatarChip name={g.created_by} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
const blankDistForm = () => ({
  sku_name: '', sku_code: '', category: '',
  qty: '', unit: 'Pieces',
  buy_price: '', sell_price: '',
  dispatched_by: '', order_ref: '',
  dispatch_date: new Date().toISOString().split('T')[0],
});

export default function Warehouse({ onGoChat, dbStatus }) {
  const [warehouses,    setWarehouses]    = useState([]);
  const [grnLog,        setGrnLog]        = useState([]);
  const [distributors,  setDistributors]  = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [activeTab,     setActiveTab]     = useState('overview');
  const [selectedWH,    setSelectedWH]    = useState(null);
  const [dataSource,    setDataSource]    = useState('demo');
  const [grnFilter,     setGrnFilter]     = useState('');
  const [page,          setPage]          = useState(1);
  const [expandedDist,  setExpandedDist]  = useState(null); // distributor_id
  const PAGE_SIZE = 20;
  const [catalogProducts,     setCatalogProducts]     = useState([]);
  const [distDispatchForm,    setDistDispatchForm]    = useState(blankDistForm());
  const [distDispatchSubmit,  setDistDispatchSubmit]  = useState(false);
  const [distDispatchSuccess, setDistDispatchSuccess] = useState(null);
  const [distDispatchError,   setDistDispatchError]   = useState('');
  const setDDF = k => v => setDistDispatchForm(f => ({ ...f, [k]: v }));
  const [productSearch,       setProductSearch]       = useState('');

  // ── Data fetching ─────────────────────────────────────────────────────────
  const silentFetch = useCallback(() => {
    Promise.all([
      fetch('/api/warehouses').then(r => r.json()),
      fetch('/api/warehouses/grn-log').then(r => r.json()),
      fetch('/api/distributors/inventory').then(r => r.json()),
    ]).then(([wd, gd, dd]) => {
      setWarehouses(wd.warehouses || []);
      setGrnLog(gd.grn_log || []);
      setDistributors(dd.distributors || []);
      setDataSource(wd.data_source || 'demo');
    }).catch(err => { console.error('[Warehouse] silent refresh failed:', err); });
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/warehouses').then(r => r.json()),
      fetch('/api/warehouses/grn-log').then(r => r.json()),
      fetch('/api/distributors/inventory').then(r => r.json()),
    ]).then(([wd, gd, dd]) => {
      setWarehouses(wd.warehouses || []);
      setGrnLog(gd.grn_log || []);
      setDistributors(dd.distributors || []);
      setDataSource(wd.data_source || 'demo');
      setLoading(false);
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });
  }, []);

  useAutoRefresh(silentFetch, 5 * 60_000);

  // Load product catalog for SKU picker (once)
  useEffect(() => {
    fetch('/api/catalog')
      .then(r => r.json())
      .then(data => setCatalogProducts(data.products || []))
      .catch(() => {});
  }, []);

  // Reset dispatch form whenever user expands a different distributor
  useEffect(() => {
    setDistDispatchForm(blankDistForm());
    setDistDispatchSuccess(null);
    setDistDispatchError('');
  }, [expandedDist]);

  // ── Computed KPIs ─────────────────────────────────────────────────────────
  const totalCapacity = warehouses.reduce((s, w) => s + (w.capacity_sheets || 0), 0);
  const totalStock    = warehouses.reduce((s, w) => s + (w.current_stock_sheets || 0), 0);
  const totalValue    = warehouses.reduce((s, w) => s + (w.current_stock_value  || 0), 0);
  const totalAvail    = warehouses.reduce((s, w) => s + (w.available_capacity_sheets || 0), 0);
  const avgUtil       = warehouses.length
    ? warehouses.reduce((s, w) => s + (w.utilisation_pct || 0), 0) / warehouses.length : 0;

  // ── Distributor KPIs ──────────────────────────────────────────────────────
  const totalDistValue = distributors.reduce((s, d) => s + (d.total_stock_value || 0), 0);
  const totalDistSkus  = distributors.reduce((s, d) => s + (d.stock?.length || 0), 0);

  // ── GRN log filter ─────────────────────────────────────────────────────────
  const filteredGRN = grnFilter
    ? grnLog.filter(g =>
        (g.supplier_name  || '').toLowerCase().includes(grnFilter.toLowerCase()) ||
        (g.grn_number     || '').toLowerCase().includes(grnFilter.toLowerCase()) ||
        (g.godown_name    || '').toLowerCase().includes(grnFilter.toLowerCase()) ||
        (g.product_name   || '').toLowerCase().includes(grnFilter.toLowerCase()) ||
        (g.invoice_number || '').toLowerCase().includes(grnFilter.toLowerCase())
      )
    : grnLog;
  const pagedGRN = filteredGRN.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Discrepancy summary ────────────────────────────────────────────────────
  const mismatchCount    = grnLog.filter(g => g.match_status === 'MISMATCH').length;
  const totalDiscrepancy = grnLog.reduce((s, g) => s + (g.discrepancy_amt || 0), 0);

  const handleDistDispatch = async (dist) => {
    const f = distDispatchForm;
    if (!f.sku_name.trim())                        return setDistDispatchError('SKU / Product name is required.');
    if (!f.qty || Number(f.qty) <= 0)              return setDistDispatchError('Quantity must be greater than zero.');
    if (!f.buy_price || Number(f.buy_price) <= 0)  return setDistDispatchError('Buy price is required.');
    if (!f.dispatched_by.trim())                   return setDistDispatchError('Dispatched by is required.');
    setDistDispatchSubmit(true);
    setDistDispatchError('');
    setDistDispatchSuccess(null);
    try {
      const res = await fetch('/api/stock-dispatch/distributor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distributor_id:   dist.distributor_id,
          distributor_name: dist.distributor_name,
          sku_code:         f.sku_code || f.sku_name.toUpperCase().replace(/\s+/g, '-').slice(0, 20),
          sku_name:         f.sku_name,
          category:         f.category || '—',
          qty:              Number(f.qty),
          unit:             f.unit,
          buy_price:        Number(f.buy_price),
          sell_price:       f.sell_price ? Number(f.sell_price) : null,
          dispatched_by:    f.dispatched_by,
          order_ref:        f.order_ref || null,
          notes:            null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Dispatch failed.');
      if (data.success) {
        setDistDispatchSuccess(data);
        setDistDispatchForm(blankDistForm());
        silentFetch();
      } else {
        setDistDispatchError(data.detail || 'Dispatch failed.');
      }
    } catch (e) {
      setDistDispatchError(e.message || 'Network error.');
    } finally {
      setDistDispatchSubmit(false);
    }
  };

  if (loading) return <PageLoader />;

  if (error) return (
    <div className="view">
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text3)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠</div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Failed to load warehouse data</div>
        <div style={{ fontSize: 13 }}>{error}</div>
      </div>
    </div>
  );

  const selectedWarehouse = selectedWH !== null ? warehouses[selectedWH] : null;

  return (
    <div className="view">
      {/* ── Header ── */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Warehouse Management</div>
          <div className="psub">Capacity · Inventory tracking · GRN activity · Stock distribution</div>
        </div>
        <div className="ph-actions">
          <DataSourceBadge source={dataSource} />
          {onGoChat && (
            <button className="ai-banner-btn" onClick={() => onGoChat(
              'Analyse my warehouse utilisation and inventory distribution. Which warehouses are near full capacity? ' +
              'What products are concentrated in only one location creating supply risk? ' +
              'What rebalancing or procurement actions do you recommend?'
            )}>
              🤖 AI Analysis
            </button>
          )}
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="kg g4" style={{ marginBottom: 20 }}>
        <div className="kc sb">
          <div className="kt"><span className="kl">Warehouses</span></div>
          <div className="kv">{warehouses.length}</div>
          <div className="ks">active locations</div>
        </div>
        <div className="kc sg">
          <div className="kt"><span className="kl">Total Capacity</span></div>
          <div className="kv">{totalCapacity.toLocaleString('en-IN')}</div>
          <div className="ks">sheets across all WH</div>
        </div>
        <div className="kc st">
          <div className="kt"><span className="kl">Current Stock</span></div>
          <div className="kv">{totalStock.toLocaleString('en-IN')}</div>
          <div className="ks">{fmtL(totalValue)} total value</div>
        </div>
        <div className="kc" style={{
          background: utilBg(avgUtil),
          borderLeft: `3px solid ${utilColor(avgUtil)}`,
        }}>
          <div className="kt"><span className="kl">Avg Utilisation</span></div>
          <div className="kv" style={{ color: utilColor(avgUtil) }}>{avgUtil.toFixed(1)}%</div>
          <div className="ks">{totalAvail.toLocaleString('en-IN')} sheets free</div>
        </div>
      </div>

      {/* ── GRN alert banner (only if mismatches) ── */}
      {mismatchCount > 0 && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 10,
          padding: '12px 18px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>⚠</span>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--amber)' }}>GRN Discrepancy Alert — </span>
            <span>{mismatchCount} GRN{mismatchCount > 1 ? 's' : ''} have invoice vs. GRN mismatches
            totalling {fmt(totalDiscrepancy)}. </span>
            <button
              onClick={() => setActiveTab('grn-log')}
              style={{ background: 'none', border: 'none', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 13 }}>
              View GRN log →
            </button>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="stabs" style={{ marginBottom: 16 }}>
        {[
          ['overview',         '🏭 Warehouse Overview'],
          ['distributors',     `🚚 Distributor Inventory (${distributors.length})`],
          ['grn-log',          `📋 GRN Activity Log (${grnLog.length})`],
          ['stock-by-product', '📦 Stock by Product'],
        ].map(([id, label]) => (
          <button key={id} className={`stab${activeTab === id ? ' active' : ''}`} onClick={() => setActiveTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB: Overview
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {warehouses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)', fontSize: 13 }}>
              No warehouse data available.
            </div>
          ) : (
            <>
              {/* Warehouse cards grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16, marginBottom: 4 }}>
                {warehouses.map((wh, i) => (
                  <div
                    key={wh.godown_id}
                    onClick={() => setSelectedWH(selectedWH === i ? null : i)}
                    style={{
                      background: 'var(--surface)',
                      border: `2px solid ${selectedWH === i ? 'var(--brand)' : 'var(--border)'}`,
                      borderRadius: 12, padding: '18px 20px', cursor: 'pointer',
                      boxShadow: selectedWH === i
                        ? '0 0 0 3px rgba(22,163,74,.12), 0 4px 16px rgba(0,0,0,.08)'
                        : '0 2px 8px rgba(0,0,0,.04)',
                      transition: 'all .2s',
                    }}
                  >
                    {/* Card top row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{wh.godown_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>📍 {wh.location}</div>
                      </div>
                      <div style={{
                        fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                        background: utilBg(wh.utilisation_pct || 0),
                        color: utilColor(wh.utilisation_pct || 0),
                        flexShrink: 0,
                      }}>
                        {(wh.utilisation_pct || 0).toFixed(0)}% full
                      </div>
                    </div>

                    {/* Capacity bar */}
                    <CapacityBar pct={wh.utilisation_pct || 0} />

                    {/* 3-stat row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 12 }}>
                      {[
                        { label: 'In Stock', value: (wh.current_stock_sheets || 0).toLocaleString('en-IN'), color: 'var(--text)' },
                        { label: 'Available', value: (wh.available_capacity_sheets || 0).toLocaleString('en-IN'), color: (wh.available_capacity_sheets || 0) < 100 ? 'var(--red)' : 'var(--brand)' },
                        { label: 'Value', value: wh.current_stock_value_fmt || fmtL(wh.current_stock_value), color: 'var(--green)' },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color, fontFamily: 'var(--mono)' }}>{value}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Manager row */}
                    {wh.manager_name && (
                      <div style={{ marginTop: 11, fontSize: 11, color: 'var(--text2)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span>👤 {wh.manager_name}</span>
                        {wh.contact_phone && <span>📞 {wh.contact_phone}</span>}
                      </div>
                    )}

                    {/* Footer */}
                    <div style={{
                      marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--s3)',
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: 11, color: 'var(--text3)',
                    }}>
                      <span>{wh.products?.length || 0} products</span>
                      <span>{wh.recent_grns?.length || 0} recent GRNs</span>
                      <span style={{ color: 'var(--brand)', fontWeight: 600 }}>
                        {selectedWH === i ? '▲ Collapse' : '▼ Details'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Selected warehouse detail */}
              {selectedWarehouse && <WarehouseDetail wh={selectedWarehouse} />}
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: Distributor Inventory
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'distributors' && (
        <>
          {/* Distributor KPI row */}
          <div className="kg g4" style={{ marginBottom: 20 }}>
            <div className="kc sb">
              <div className="kt"><span className="kl">Active Distributors</span></div>
              <div className="kv">{distributors.length}</div>
              <div className="ks">holding consignment stock</div>
            </div>
            <div className="kc sg">
              <div className="kt"><span className="kl">Stock Value at Distributors</span></div>
              <div className="kv">{fmtL(totalDistValue)}</div>
              <div className="ks">total at distributor locations</div>
            </div>
            <div className="kc st">
              <div className="kt"><span className="kl">Total SKUs Out</span></div>
              <div className="kv">{totalDistSkus}</div>
              <div className="ks">active SKU lines dispatched</div>
            </div>
            <div className="kc sa">
              <div className="kt"><span className="kl">Avg per Distributor</span></div>
              <div className="kv">{distributors.length ? fmtL(totalDistValue / distributors.length) : '—'}</div>
              <div className="ks">average stock value held</div>
            </div>
          </div>

          {/* Summary table */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="ch">
              <div className="ctit">Distributor Stock Summary</div>
              <ExportButton
                rows={distributors.map(d => ({
                  distributor: d.distributor_name, city: d.city,
                  contact: d.contact_person, phone: d.phone,
                  skus: d.stock?.length || 0,
                  total_value: d.total_stock_value,
                  last_dispatch: d.last_dispatch_date,
                }))}
                filename="distributor_inventory"
                columns={[
                  { key: 'distributor', label: 'Distributor' }, { key: 'city', label: 'City' },
                  { key: 'contact', label: 'Contact' }, { key: 'skus', label: 'SKU Lines' },
                  { key: 'total_value', label: 'Stock Value (₹)' }, { key: 'last_dispatch', label: 'Last Dispatch' },
                ]}
              />
            </div>
            <table className="tbl" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Distributor</th>
                  <th>City</th>
                  <th>Contact</th>
                  <th style={{ textAlign: 'center' }}>SKU Lines</th>
                  <th style={{ textAlign: 'right' }}>Stock Value</th>
                  <th>Last Dispatch</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {distributors.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)' }}>
                    No distributor inventory found.
                  </td></tr>
                ) : distributors.map(dist => (
                  <tr key={dist.distributor_id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{dist.distributor_name}</div>
                      {dist.phone && dist.phone !== '—' && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>📞 {dist.phone}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{dist.city}</td>
                    <td style={{ fontSize: 12 }}>{dist.contact_person}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--mono)' }}>{dist.stock?.length || 0}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--brand)' }}>
                      {dist.total_stock_value_fmt || fmtL(dist.total_stock_value)}
                    </td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{dist.last_dispatch_date || '—'}</td>
                    <td>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        background: dist.status === 'ACTIVE' ? '#f0fdf4' : '#fef2f2',
                        color: dist.status === 'ACTIVE' ? 'var(--green)' : 'var(--r2)',
                      }}>{dist.status || 'ACTIVE'}</span>
                    </td>
                    <td>
                      <button
                        onClick={() => setExpandedDist(expandedDist === dist.distributor_id ? null : dist.distributor_id)}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--b2)', fontWeight: 600 }}
                      >
                        {expandedDist === dist.distributor_id ? '▲ Hide' : '▼ Stock'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Expanded distributor stock detail */}
          {distributors.filter(d => d.distributor_id === expandedDist).map(dist => (
            <div key={dist.distributor_id} style={{ background: 'var(--surface)', border: '2px solid var(--b4)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{dist.distributor_name} — Stock Detail</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    📍 {dist.city} · 👤 {dist.contact_person} · 📞 {dist.phone}
                    · Last dispatch: {dist.last_dispatch_date}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--brand)' }}>
                    {dist.total_stock_value_fmt || fmtL(dist.total_stock_value)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Total stock value at distributor</div>
                </div>
              </div>
              <table className="tbl" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'center' }}>Qty</th>
                    <th style={{ textAlign: 'center' }}>Unit</th>
                    <th style={{ textAlign: 'right' }}>Buy Price (₹)</th>
                    <th style={{ textAlign: 'right' }}>Stock Value (₹)</th>
                    <th>Dispatched Date</th>
                    <th>Order Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {(dist.stock || []).filter(item => (item.qty || 0) > 0).map((item, si) => (
                    <tr key={si}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{item.sku_name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{item.sku_code}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{item.category || '—'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--mono)' }}>{(item.qty || 0).toLocaleString('en-IN')}</td>
                      <td style={{ textAlign: 'center', fontSize: 12 }}>{item.unit}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(item.buy_price)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--brand)' }}>{fmtL(item.stock_value)}</td>
                      <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{item.dispatched_date || '—'}</td>
                      <td style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--b2)' }}>{item.order_ref || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--s2)' }}>
                    <td colSpan={5} style={{ fontWeight: 700, fontSize: 12, padding: '8px 12px' }}>Total</td>
                    <td style={{ textAlign: 'right', fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--brand)', padding: '8px 12px' }}>
                      {dist.total_stock_value_fmt || fmtL(dist.total_stock_value)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>

              {/* ── Quick Dispatch from Catalog ── */}
              <div style={{ marginTop: 16, padding: '16px 18px', background: 'var(--s2)', borderRadius: 10, border: '1px solid var(--b4)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📤</span> Dispatch Stock from Catalog
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      SKU / Product <span style={{ color: 'var(--r2)' }}>*</span>
                    </label>
                    <input
                      list={`dist-sku-catalog-${dist.distributor_id}`}
                      value={distDispatchForm.sku_name}
                      onChange={e => {
                        const name = e.target.value;
                        const prod = catalogProducts.find(p => p.name === name);
                        if (prod) {
                          setDistDispatchForm(f => ({
                            ...f,
                            sku_name:   prod.name,
                            sku_code:   prod.sku_code  || '',
                            category:   prod.category  || '',
                            buy_price:  prod.buy_price  != null ? String(prod.buy_price)  : '',
                            sell_price: prod.sell_price != null ? String(prod.sell_price) : '',
                            unit: prod.unit === 'sheet' ? 'Sheets' : prod.unit === 'piece' ? 'Pieces' : prod.unit || f.unit,
                          }));
                        } else {
                          setDDF('sku_name')(name);
                        }
                      }}
                      placeholder="Type or select from Product Catalog…"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
                    />
                    <datalist id={`dist-sku-catalog-${dist.distributor_id}`}>
                      {catalogProducts.map(p => (
                        <option key={p.sku_code || p.product_id} value={p.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      Qty <span style={{ color: 'var(--r2)' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input type="number" min="1" value={distDispatchForm.qty} onChange={e => setDDF('qty')(e.target.value)}
                        placeholder="0"
                        style={{ flex: 1, padding: '7px 8px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--mono)', boxSizing: 'border-box' }} />
                      <select value={distDispatchForm.unit} onChange={e => setDDF('unit')(e.target.value)}
                        style={{ padding: '7px 6px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 11, color: 'var(--text)', background: 'var(--surface)', cursor: 'pointer' }}>
                        {['Pieces', 'Sheets', 'Packs', 'Sets', 'Rolls', 'Kg', 'Running Meters'].map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      Buy Price ₹ <span style={{ color: 'var(--r2)' }}>*</span>
                    </label>
                    <input type="number" min="0" value={distDispatchForm.buy_price} onChange={e => setDDF('buy_price')(e.target.value)}
                      placeholder="0.00"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--mono)', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      Sell Price ₹
                    </label>
                    <input type="number" min="0" value={distDispatchForm.sell_price} onChange={e => setDDF('sell_price')(e.target.value)}
                      placeholder="0.00"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--mono)', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      Dispatched By <span style={{ color: 'var(--r2)' }}>*</span>
                    </label>
                    <input value={distDispatchForm.dispatched_by} onChange={e => setDDF('dispatched_by')(e.target.value)}
                      placeholder="Staff name"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      Order Ref
                    </label>
                    <input value={distDispatchForm.order_ref} onChange={e => setDDF('order_ref')(e.target.value)}
                      placeholder="SO-XXXX or PO-XXXX"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      Dispatch Date
                    </label>
                    <input type="date" value={distDispatchForm.dispatch_date} onChange={e => setDDF('dispatch_date')(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text)', background: 'var(--surface)', boxSizing: 'border-box' }} />
                  </div>
                </div>
                {distDispatchError && (
                  <div style={{ color: 'var(--r2)', fontSize: 12, marginBottom: 8, padding: '6px 10px', background: '#fef2f2', borderRadius: 6 }}>
                    ⚠ {distDispatchError}
                  </div>
                )}
                {distDispatchSuccess && (
                  <div style={{ color: 'var(--green)', fontSize: 12, marginBottom: 8, padding: '6px 10px', background: '#f0fdf4', borderRadius: 6 }}>
                    ✅ {distDispatchSuccess.qty} units of {distDispatchSuccess.sku_name} dispatched to <strong>{distDispatchSuccess.distributor_name}</strong>
                  </div>
                )}
                <button
                  onClick={() => handleDistDispatch(dist)}
                  disabled={distDispatchSubmit}
                  style={{
                    padding: '8px 20px', borderRadius: 8, border: 'none',
                    background: distDispatchSubmit ? 'var(--s4)' : 'var(--brand)',
                    color: distDispatchSubmit ? 'var(--text3)' : '#fff',
                    fontSize: 12.5, fontWeight: 700, cursor: distDispatchSubmit ? 'not-allowed' : 'pointer',
                  }}
                >
                  {distDispatchSubmit ? 'Recording…' : '📤 Record Dispatch'}
                </button>
              </div>

              {onGoChat && (
                <button
                  className="btn-secondary"
                  style={{ marginTop: 12, fontSize: 12 }}
                  onClick={() => onGoChat(`Analyse distributor inventory for ${dist.distributor_name} in ${dist.city}. They hold ${dist.stock?.length || 0} SKU lines worth ${dist.total_stock_value_fmt || fmtL(dist.total_stock_value)}. What replenishment actions or stock recovery steps do you recommend?`)}
                >
                  ✨ AI Analysis for {dist.distributor_name}
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: GRN Activity Log
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'grn-log' && (
        <>
          <div className="filter-bar">
            <input
              className="view-search"
              placeholder="🔍  Search by GRN #, supplier, product, invoice, warehouse…"
              value={grnFilter}
              onChange={e => { setGrnFilter(e.target.value); setPage(1); }}
            />
            <ExportButton
              rows={filteredGRN}
              filename="warehouse_grn_log"
              columns={[
                { key: 'grn_number',      label: 'GRN #' },
                { key: 'received_date',   label: 'Date' },
                { key: 'supplier_name',   label: 'Supplier' },
                { key: 'godown_name',     label: 'Warehouse' },
                { key: 'invoice_number',  label: 'Invoice #' },
                { key: 'po_number',       label: 'PO #' },
                { key: 'product_name',    label: 'Product' },
                { key: 'qty_received',    label: 'Qty' },
                { key: 'unit',            label: 'Unit' },
                { key: 'invoice_value',   label: 'Invoice Value (₹)' },
                { key: 'grn_value',       label: 'GRN Value (₹)' },
                { key: 'discrepancy_amt', label: 'Discrepancy (₹)' },
                { key: 'match_status',    label: 'Match Status' },
                { key: 'created_by',      label: 'Processed By' },
              ]}
            />
          </div>

          {/* Discrepancy summary strip */}
          {mismatchCount > 0 && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 14px', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--r2)' }}>⚠ {mismatchCount} MISMATCH GRNs</span>
              </div>
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 14px', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--r2)' }}>Total Discrepancy: {fmt(totalDiscrepancy)}</span>
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '8px 14px', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--green)' }}>
                  {grnLog.filter(g => g.match_status === 'MATCH').length} MATCH GRNs
                </span>
              </div>
            </div>
          )}

          <div className="card-table">
            <table className="tbl">
              <thead>
                <tr>
                  <th>GRN #</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Warehouse</th>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Invoice Value</th>
                  <th style={{ textAlign: 'right' }}>GRN Value</th>
                  <th style={{ textAlign: 'right' }}>Discrepancy</th>
                  <th>Status</th>
                  <th>Processed By</th>
                </tr>
              </thead>
              <tbody>
                {pagedGRN.length === 0 ? (
                  <tr><td colSpan={11}>
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', fontSize: 13 }}>
                      {grnFilter ? 'No GRN records match your search.' : 'No GRN activity found.'}
                    </div>
                  </td></tr>
                ) : pagedGRN.map((g, idx) => (
                  <tr key={idx} style={{ background: g.match_status === 'MISMATCH' ? 'rgba(254,242,242,.4)' : undefined }}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>{g.grn_number}</td>
                    <td style={{ fontSize: 12 }}>{g.received_date}</td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{g.supplier_name}</td>
                    <td style={{ fontSize: 12 }}>{g.godown_name || '—'}</td>
                    <td style={{ fontSize: 12 }}>{g.product_name || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {g.qty_received ? `${g.qty_received} ${g.unit || ''}`.trim() : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {g.invoice_value ? fmt(g.invoice_value) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>
                      {g.grn_value ? fmt(g.grn_value) : '—'}
                    </td>
                    <td style={{
                      textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12,
                      color: (g.discrepancy_amt || 0) > 0 ? 'var(--r2)' : 'var(--text3)',
                      fontWeight: (g.discrepancy_amt || 0) > 0 ? 700 : 400,
                    }}>
                      {(g.discrepancy_amt || 0) > 0 ? `−${fmt(g.discrepancy_amt)}` : '—'}
                    </td>
                    <td><MatchBadge status={g.match_status} /></td>
                    <td><AvatarChip name={g.created_by} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={filteredGRN.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: Stock by Product
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'stock-by-product' && (() => {
        // Build cross-location product index from already-loaded state
        const index = {};
        for (const wh of warehouses) {
          const loc = wh.godown_name || wh.name || `WH-${wh.godown_id}`;
          for (const p of (wh.products || [])) {
            const key = p.sku_name;
            if (!index[key]) index[key] = { sku_name: p.sku_name, sku_code: p.sku_code || '', category: p.category || '—', locations: [] };
            index[key].locations.push({ name: loc, type: 'Warehouse', qty: Number(p.quantity || 0), unit: 'sheets', value: p.stock_value || 0 });
          }
        }
        for (const d of distributors) {
          const loc = d.distributor_name;
          for (const s of (d.stock || [])) {
            const key = s.sku_name;
            if (!index[key]) index[key] = { sku_name: s.sku_name, sku_code: s.sku_code || '', category: s.category || '—', locations: [] };
            index[key].locations.push({ name: loc, type: 'Distributor', qty: Number(s.qty || 0), unit: s.unit || 'Pieces', value: s.stock_value || 0 });
          }
        }
        const allRows = Object.values(index).sort((a, b) => a.sku_name.localeCompare(b.sku_name));
        const filtered = productSearch
          ? allRows.filter(r =>
              r.sku_name.toLowerCase().includes(productSearch.toLowerCase()) ||
              r.category.toLowerCase().includes(productSearch.toLowerCase()) ||
              r.sku_code.toLowerCase().includes(productSearch.toLowerCase())
            )
          : allRows;

        return (
          <div className="card">
            <div className="ch" style={{ marginBottom: 12 }}>
              <div>
                <div className="ctit">📦 Stock by Product — Cross-Location View</div>
                <div className="csub">Total quantity per product across all warehouses and distributors</div>
              </div>
              <span className="bdg bs">{filtered.length} products</span>
            </div>
            {/* Search */}
            <div style={{ marginBottom: 14 }}>
              <input
                type="text"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Search by product name, SKU code, or category…"
                style={{
                  width: '100%', padding: '9px 13px', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--surface)',
                  fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>
            {allRows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', fontSize: 13 }}>
                No product stock data found. Stock appears here once warehouses or distributors have inventory assigned.
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text3)', fontSize: 13 }}>
                No products match "{productSearch}".
              </div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Product / SKU</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th>Unit</th>
                    <th style={{ textAlign: 'right' }}>Stock Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.flatMap(row =>
                    row.locations.length === 0 ? [] : row.locations.map((loc, li) => (
                      <tr key={`${row.sku_name}-${li}`}>
                        {li === 0 ? (
                          <td rowSpan={row.locations.length} style={{ verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 700, fontSize: 12.5 }}>{row.sku_name}</div>
                            {row.sku_code && <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{row.sku_code}</div>}
                          </td>
                        ) : null}
                        {li === 0 ? (
                          <td rowSpan={row.locations.length} style={{ verticalAlign: 'top', fontSize: 11.5, color: 'var(--text2)', borderRight: '1px solid var(--border)' }}>
                            {row.category}
                          </td>
                        ) : null}
                        <td style={{ fontSize: 12 }}>{loc.name}</td>
                        <td>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                            background: loc.type === 'Warehouse' ? '#dbeafe' : '#f3e8ff',
                            color: loc.type === 'Warehouse' ? '#1e40af' : '#6d28d9',
                          }}>
                            {loc.type === 'Warehouse' ? '🏭 WH' : '🚚 Dist'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', color: loc.qty === 0 ? 'var(--r2)' : 'var(--text)' }}>
                          {loc.qty.toLocaleString('en-IN')}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>{loc.unit}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                          {loc.value ? fmtL(loc.value) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        );
      })()}

      {/* ── AI CTA ── */}
      {onGoChat && (
        <div className="ai-cta-bar" style={{ marginTop: 20 }} onClick={() => onGoChat(
          'Analyse my warehouse management: utilisation rates, GRN discrepancies, stock distribution, capacity risks. ' +
          'What are the top operational issues and what actions should I take?'
        )}>
          <span>✨</span>
          <span>Ask AI: Warehouse efficiency analysis → identify capacity risks & GRN discrepancies</span>
        </div>
      )}
    </div>
  );
}
