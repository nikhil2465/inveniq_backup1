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
          ['overview',      '🏭 Warehouse Overview'],
          ['distributors',  `🚚 Distributor Inventory (${distributors.length})`],
          ['grn-log',       `📋 GRN Activity Log (${grnLog.length})`],
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
                  {(dist.stock || []).map((item, si) => (
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
