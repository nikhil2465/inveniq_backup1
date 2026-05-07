import React, { useState, useEffect, useMemo } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import PageLoader from '../components/PageLoader';

const fmt    = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;

const STOCK_LABELS = { in_stock: 'In Stock', on_order: 'On Order', out_of_stock: 'Out of Stock' };
const STOCK_COLORS = { in_stock: 'bg', on_order: 'bt', out_of_stock: 'br' };

const CATEGORY_ICONS = {
  'High Pressure Laminate':    '🏷',
  'Compact Laminate':          '🔲',
  'Acrylic Laminate':          '✨',
  'PVC Laminate':              '📋',
  'Aluminium Louvers':         '🔧',
  'PVC Louvers':               '🌬',
  'Operable Louvre System':    '⚙️',
  'Exterior Cladding':         '🏗',
  'Aluminium Composite Panel': '🔷',
};

const ALL_CATS = [
  'All', 'Aluminium Louvers', 'PVC Louvers', 'Operable Louvre System',
  'High Pressure Laminate', 'Compact Laminate', 'Acrylic Laminate',
  'PVC Laminate', 'Exterior Cladding', 'Aluminium Composite Panel',
];

// ── Product Card ───────────────────────────────────────────────────────────────
function ProductCard({ product, onView, onGoChat }) {
  const icon = CATEGORY_ICONS[product.category] || '📦';
  const marginColor = product.margin_pct >= 25 ? 'var(--green)' : product.margin_pct >= 18 ? 'var(--amber)' : 'var(--red)';

  return (
    <div className="pc-card" onClick={() => onView(product)}>
      <div className="pc-card-header">
        <div className="pc-cat-badge">
          <span>{icon}</span>
          <span>{product.category}</span>
        </div>
        <span className={`bdg ${STOCK_COLORS[product.stock_status] || 'ba'}`}>
          {STOCK_LABELS[product.stock_status] || product.stock_status}
        </span>
      </div>

      <div className="pc-card-body">
        <div className="pc-prod-name">{product.name}</div>
        <div className="pc-prod-brand">{product.brand}</div>

        <div className="pc-spec-row">
          {product.thickness && <span className="pc-spec-pill">📏 {product.thickness}</span>}
          {product.size      && <span className="pc-spec-pill">📐 {product.size}</span>}
          {product.finish    && <span className="pc-spec-pill">✨ {product.finish}</span>}
        </div>

        <div className="pc-apps">
          {(product.applications || []).slice(0, 3).map((a, i) => (
            <span key={i} className="pc-app-tag">• {a}</span>
          ))}
          {(product.applications || []).length > 3 && (
            <span className="pc-app-tag pc-more">+{product.applications.length - 3} more</span>
          )}
        </div>
      </div>

      <div className="pc-card-footer">
        <div className="pc-pricing">
          <div className="pc-price">
            <span className="pc-price-label">List</span>
            <span className="pc-price-val">{fmt(product.sell_price)}/{product.unit}</span>
          </div>
          <div className="pc-margin" style={{ color: marginColor }}>
            {fmtPct(product.margin_pct)} margin
          </div>
        </div>
        <div className="pc-card-actions">
          <button className="pc-view-btn" onClick={e => { e.stopPropagation(); onView(product); }}>
            View Specs
          </button>
          {onGoChat && (
            <button className="pc-ai-btn" onClick={e => {
              e.stopPropagation();
              onGoChat(`Tell me about ${product.name} — applications, pricing, specifications and which customers should I target?`);
            }}>✨ AI</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Product Detail Modal ───────────────────────────────────────────────────────
function ProductDetail({ product, onClose, onGoChat }) {
  const icon = CATEGORY_ICONS[product.category] || '📦';

  return (
    <div className="pc-modal-overlay" onClick={onClose}>
      <div className="pc-modal" onClick={e => e.stopPropagation()}>
        <div className="pc-modal-header">
          <div>
            <div className="pc-modal-cat">{icon} {product.category} · {product.sub_category}</div>
            <div className="pc-modal-name">{product.name}</div>
            <div className="pc-modal-brand">{product.brand}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span className={`bdg ${STOCK_COLORS[product.stock_status] || 'ba'}`}>
              {STOCK_LABELS[product.stock_status]}
            </span>
            <button className="qb-close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="pc-modal-body">
          {/* Left column */}
          <div className="pc-modal-left">
            {/* Pricing */}
            <div className="pc-detail-section">
              <div className="pc-detail-sec-title">Pricing</div>
              <div className="pc-pricing-grid">
                <div className="pc-pricing-cell">
                  <div className="pc-pricing-cell-label">Buy Price</div>
                  <div className="pc-pricing-cell-val">{fmt(product.buy_price)}</div>
                  <div className="pc-pricing-cell-unit">per {product.unit}</div>
                </div>
                <div className="pc-pricing-cell">
                  <div className="pc-pricing-cell-label">Sell Price</div>
                  <div className="pc-pricing-cell-val pc-sell">{fmt(product.sell_price)}</div>
                  <div className="pc-pricing-cell-unit">per {product.unit}</div>
                </div>
                <div className="pc-pricing-cell">
                  <div className="pc-pricing-cell-label">Gross Margin</div>
                  <div className="pc-pricing-cell-val" style={{ color: product.margin_pct >= 20 ? 'var(--green)' : 'var(--amber)' }}>
                    {fmtPct(product.margin_pct)}
                  </div>
                  <div className="pc-pricing-cell-unit">before freight</div>
                </div>
              </div>
              <div className="pc-hsn-row">
                <span>HSN Code: <strong>{product.hsn_code}</strong></span>
                <span>GST: <strong>{product.gst_rate}%</strong></span>
                <span>MOQ: <strong>{product.moq} {product.unit}s</strong></span>
                <span>Lead Time: <strong>{product.lead_time}</strong></span>
              </div>
            </div>

            {/* Specifications */}
            <div className="pc-detail-section">
              <div className="pc-detail-sec-title">Specifications</div>
              <div className="pc-spec-table">
                {product.size      && <div className="pc-spec-item"><span>Size</span><strong>{product.size}</strong></div>}
                {product.thickness && <div className="pc-spec-item"><span>Thickness</span><strong>{product.thickness}</strong></div>}
                {product.finish    && <div className="pc-spec-item"><span>Finish</span><strong>{product.finish}</strong></div>}
                {product.weight_kg && <div className="pc-spec-item"><span>Weight</span><strong>{product.weight_kg} kg/sheet</strong></div>}
                {product.colors    && <div className="pc-spec-item"><span>Colours</span><strong>{product.colors}</strong></div>}
              </div>
            </div>

            {/* Features */}
            {(product.features || []).length > 0 && (
              <div className="pc-detail-section">
                <div className="pc-detail-sec-title">Key Features</div>
                <ul className="pc-feat-list">
                  {product.features.map((f, i) => <li key={i}>✓ {f}</li>)}
                </ul>
              </div>
            )}

            {/* Installation */}
            {product.installation_tips && (
              <div className="pc-detail-section">
                <div className="pc-detail-sec-title">Installation Tips</div>
                <div className="pc-install-note">{product.installation_tips}</div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="pc-modal-right">
            {/* Applications */}
            <div className="pc-detail-section">
              <div className="pc-detail-sec-title">Applications</div>
              <div className="pc-app-list">
                {(product.applications || []).map((a, i) => (
                  <div key={i} className="pc-app-item">
                    <span className="pc-app-dot" />
                    {a}
                  </div>
                ))}
              </div>
            </div>

            {/* Certifications */}
            {(product.certifications || []).length > 0 && (
              <div className="pc-detail-section">
                <div className="pc-detail-sec-title">Certifications & Standards</div>
                <div className="pc-cert-list">
                  {product.certifications.map((c, i) => (
                    <div key={i} className="pc-cert-item">🏆 {c}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Suppliers */}
            {(product.suppliers || []).length > 0 && (
              <div className="pc-detail-section">
                <div className="pc-detail-sec-title">Approved Suppliers</div>
                {product.suppliers.map((s, i) => (
                  <div key={i} className="pc-sup-item">🏭 {s}</div>
                ))}
              </div>
            )}

            {/* Competitors */}
            {(product.competitors || []).length > 0 && (
              <div className="pc-detail-section">
                <div className="pc-detail-sec-title">Competing Brands</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {product.competitors.map((c, i) => (
                    <span key={i} style={{ background: 'var(--s3)', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* AI CTA */}
            {onGoChat && (
              <div className="pc-ai-cta-box" onClick={() => {
                onClose();
                onGoChat(`I'm selling ${product.name}. Give me a competitive sales pitch, ideal customer profiles, and pricing strategy for Bangalore market.`);
              }}>
                <div className="pc-ai-cta-icon">✨</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Ask AI about this product</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Sales pitch, pricing strategy, target customers</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 18, color: 'var(--text3)' }}>→</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ProductCatalog View ───────────────────────────────────────────────────
export default function ProductCatalog({ onGoChat, dbStatus }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [search, setSearch]   = useState('');
  const [view, setView]       = useState('grid');
  const [selected, setSelected] = useState(null);
  const [inStockOnly, setInStockOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('/api/catalog').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const products = useMemo(() => {
    let list = data?.products || [];
    if (category !== 'All') list = list.filter(p => p.category === category);
    if (inStockOnly)        list = list.filter(p => p.stock_status === 'in_stock');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
        || (p.tags || []).join(' ').includes(q)
        || (p.applications || []).some(a => a.toLowerCase().includes(q))
      );
    }
    return list;
  }, [data, category, search, inStockOnly]);

  const catCounts = useMemo(() => {
    const counts = {};
    (data?.products || []).forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
    return counts;
  }, [data]);

  if (loading) return <PageLoader />;

  return (
    <div className="view">
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Product Catalog</div>
          <div className="psub">Louvers · Laminates · ACP · Cladding — with full specs, pricing & applications</div>
        </div>
        <div className="ph-actions">
          <DataSourceBadge source="catalog" />
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Which products in our catalog have the highest margin and best market demand in Bangalore?')}>
              ✨ AI Product Intelligence
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="kg g4">
        <div className="kc sb" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`I have ${data?.products?.length || 0} products across ${data?.categories?.length || 0} categories. Which product lines should I prioritise stocking and which have the best sales velocity?`)}>
          <div className="kt"><span className="kl">Total Products</span></div>
          <div className="kv">{data?.products?.length || 0}</div>
          <div className="ks">in catalog</div>
        </div>
        <div className="kc st" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`I carry ${data?.categories?.length || 0} product categories including Louvers, Laminates, ACP and Cladding. Which categories have the best margin and demand in my market?`)}>
          <div className="kt"><span className="kl">Categories</span></div>
          <div className="kv">{data?.categories?.length || 0}</div>
          <div className="ks">product lines</div>
        </div>
        <div className="kc sg" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`${(data?.products || []).filter(p => p.stock_status === 'in_stock').length} of my ${data?.products?.length || 0} products are in stock. Which out-of-stock items should I prioritise restocking based on demand and margin?`)}>
          <div className="kt"><span className="kl">In Stock</span></div>
          <div className="kv">{(data?.products || []).filter(p => p.stock_status === 'in_stock').length}</div>
          <div className="ks">available now</div>
        </div>
        <div className="kc sg" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`My average catalog margin is ${fmtPct((data?.products || []).reduce((s,p) => s+p.margin_pct, 0) / Math.max((data?.products||[]).length,1))}. Which products have the highest margins and how can I shift my sales mix towards them?`)}>
          <div className="kt"><span className="kl">Avg Margin</span></div>
          <div className="kv">{fmtPct((data?.products || []).reduce((s,p) => s+p.margin_pct, 0) / Math.max((data?.products||[]).length,1))}</div>
          <div className="ks">across catalog</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <input className="view-search" placeholder="🔍  Search products, applications, tags…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}>
          <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} />
          In-stock only
        </label>
        <div className="vswitch">
          <button className={`vswitch-btn${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}>⊞ Grid</button>
          <button className={`vswitch-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>☰ List</button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="stabs" style={{ marginBottom: 16 }}>
        {ALL_CATS.map(cat => (
          <button key={cat} className={`stab${category === cat ? ' active' : ''}`}
            onClick={() => setCategory(cat)}>
            {cat !== 'All' && CATEGORY_ICONS[cat] && <span>{CATEGORY_ICONS[cat]} </span>}
            {cat}
            {cat !== 'All' && catCounts[cat] ? <span className="stab-cnt">{catCounts[cat]}</span> : null}
          </button>
        ))}
      </div>

      {/* Products */}
      {view === 'grid' ? (
        <div className="pc-grid">
          {products.map(p => (
            <ProductCard key={p.product_id} product={p} onView={setSelected} onGoChat={onGoChat} />
          ))}
        </div>
      ) : (
        <div className="card-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Size / Thickness</th>
                <th>Buy Price</th>
                <th>Sell Price</th>
                <th>Margin</th>
                <th>Lead Time</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.product_id} style={{ cursor: 'pointer' }} onClick={() => setSelected(p)}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.brand}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{CATEGORY_ICONS[p.category]} {p.category}</td>
                  <td style={{ fontSize: 12 }}>{p.thickness || '—'} · {p.size?.split('(')[0]?.trim() || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(p.buy_price)}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>{fmt(p.sell_price)}/{p.unit}</td>
                  <td>
                    <span style={{ color: p.margin_pct >= 20 ? 'var(--green)' : p.margin_pct >= 14 ? 'var(--amber)' : 'var(--red)', fontWeight: 600, fontSize: 12 }}>
                      {fmtPct(p.margin_pct)}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>{p.lead_time}</td>
                  <td><span className={`bdg ${STOCK_COLORS[p.stock_status]}`}>{STOCK_LABELS[p.stock_status]}</span></td>
                  <td>
                    <button className="qb-view-btn" onClick={e => { e.stopPropagation(); setSelected(p); }}>View →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No products match your filters.</div>
          )}
        </div>
      )}

      {products.length === 0 && view === 'grid' && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
          No products match your filters. Try a different category or search term.
        </div>
      )}

      {/* Product detail modal */}
      {selected && (
        <ProductDetail product={selected} onClose={() => setSelected(null)} onGoChat={onGoChat ? (q) => { setSelected(null); onGoChat(q); } : null} />
      )}

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Which products have the highest margin? Show me pricing recommendations, slow movers, and which SKUs to push this month.')}>
          <span>✨</span>
          <span>Ask AI: Best-margin products, pricing strategy & SKU recommendations →</span>
        </div>
      )}
    </div>
  );
}
