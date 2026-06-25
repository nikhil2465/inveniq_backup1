import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import PageLoader from '../components/PageLoader';
import ErrorState from '../components/ErrorState';
import DiscountAIPanel from '../components/DiscountAIPanel';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { ExportButton } from '../utils/exportUtils';
import Pagination from '../components/Pagination';

// ── Constants ─────────────────────────────────────────────────────────────────

const SEGMENTS = ['Contractor', 'Interior Firm', 'Retailer', 'Carpenter'];

const SEG_META = {
  'Contractor':    { icon: '🏗️', colorClass: 'dc-seg-c', badgeClass: 'bb' },
  'Interior Firm': { icon: '🏠', colorClass: 'dc-seg-t', badgeClass: 'bt' },
  'Retailer':      { icon: '🏪', colorClass: 'dc-seg-p', badgeClass: 'bp' },
  'Carpenter':     { icon: '🪚', colorClass: 'dc-seg-o', badgeClass: 'bo' },
};

const STATUS_META = {
  DRAFT:    { label: 'Draft',    cls: 'ba' },
  SENT:     { label: 'Sent',     cls: 'bb' },
  ACCEPTED: { label: 'Accepted', cls: 'bg' },
  REJECTED: { label: 'Rejected', cls: 'br' },
  EXPIRED:  { label: 'Expired',  cls: 'bsl' },
};

const fmt    = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtL   = (n) => { const v = Number(n); return v >= 100000 ? `₹${(v / 100000).toFixed(2)}L` : fmt(v); };
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;

// ── Client-side calculation (instant, no API round-trip) ─────────────────────

function computeDiscount(rules, product, segment, quantity, overridePct) {
  if (!product || !quantity || quantity <= 0) return null;
  const qty = parseInt(quantity, 10);
  let best = null, bestScore = -1;

  for (const r of rules) {
    if (!r.is_active) continue;
    if (r.segment  !== null && r.segment  !== segment)          continue;
    if (r.category !== null && r.category !== product.category) continue;
    if (r.min_qty > qty)                                         continue;
    if (r.max_qty !== null && r.max_qty < qty)                   continue;
    const score = (r.category !== null ? 10 : 0) + r.discount_pct;
    if (score > bestScore) { bestScore = score; best = r; }
  }

  const discPct   = overridePct !== '' && overridePct !== null
    ? parseFloat(overridePct)
    : (best ? best.discount_pct : 0);
  const minMargin = best ? best.min_margin_pct : 15;
  const sell      = product.sell_price;
  const buy       = product.buy_price;
  const discUnit  = +(sell * discPct / 100).toFixed(2);
  const final     = +(sell - discUnit).toFixed(2);
  const gross     = +(sell * qty).toFixed(2);
  const totalDisc = +(discUnit * qty).toFixed(2);
  const net       = +(final * qty).toFixed(2);
  const mUnit     = +(final - buy).toFixed(2);
  const mAmt      = +(mUnit * qty).toFixed(2);
  const mPct      = final > 0 ? +((mUnit / final) * 100).toFixed(2) : 0;
  const mStatus   = mPct < 10 ? 'DANGER' : mPct < minMargin ? 'WARNING' : mPct < 20 ? 'OK' : 'EXCELLENT';

  return {
    product_name: product.sku_name, category: product.category,
    buy_price: buy, sell_price: sell,
    quantity: qty, segment,
    discount_pct: discPct, discount_per_unit: discUnit, final_price: final,
    total_gross: gross, total_discount: totalDisc, total_net: net,
    margin_per_unit: mUnit, margin_amount: mAmt, margin_pct: mPct,
    min_margin_pct: minMargin,
    rule_applied: best ? best.rule_name : (overridePct ? 'Manual Override' : 'No Rule — 0%'),
    rule_id: best?.rule_id,
    margin_status: mStatus,
    guardrail_ok: mPct >= minMargin,
    is_override: overridePct !== '' && overridePct !== null,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MarginGauge({ pct, minPct, status }) {
  const fillColor = status === 'DANGER'    ? 'var(--r2)'
                  : status === 'WARNING'   ? 'var(--a2)'
                  : status === 'EXCELLENT' ? 'var(--green)'
                  : 'var(--g2)';
  const barW = Math.min((pct / 35) * 100, 100);

  return (
    <div className="dc-margin-wrap">
      <div className="dc-margin-row">
        <span className="dc-margin-lbl">Gross Margin</span>
        <span className="dc-margin-pct" style={{ color: fillColor }}>{fmtPct(pct)}</span>
      </div>
      <div className="dc-margin-bar">
        <div className="dc-margin-fill" style={{ width: `${barW}%`, background: fillColor }} />
      </div>
      <div className="dc-guard" style={{ color: status === 'DANGER' || status === 'WARNING' ? fillColor : 'var(--text3)' }}>
        {status === 'DANGER'    && '⛔ Below critical threshold — do not proceed without approval'}
        {status === 'WARNING'   && `⚠ Below ${fmtPct(minPct)} floor — needs manager sign-off`}
        {status === 'OK'        && `✓ Within policy (floor ${fmtPct(minPct)})`}
        {status === 'EXCELLENT' && `✓ Excellent margin — well above ${fmtPct(minPct)} floor`}
      </div>
    </div>
  );
}

function PriceBreakdown({ r }) {
  return (
    <div className="dc-bkd">
      <div className="dc-bkd-row">
        <span className="dc-bkd-lbl">Base Price (MRP/unit)</span>
        <span className="dc-bkd-val">{fmt(r.sell_price)}</span>
      </div>
      <div className="dc-bkd-row">
        <span className="dc-bkd-lbl">Quantity</span>
        <span className="dc-bkd-val">{r.quantity.toLocaleString('en-IN')} units</span>
      </div>
      <div className="dc-bkd-row">
        <span className="dc-bkd-lbl">Gross Value</span>
        <span className="dc-bkd-val">{fmt(r.total_gross)}</span>
      </div>
      <div className="dc-bkd-row">
        <span className="dc-bkd-lbl">
          Discount ({fmtPct(r.discount_pct)}/unit = {fmt(r.discount_per_unit)})
        </span>
        <span className="dc-bkd-val disc">− {fmt(r.total_discount)}</span>
      </div>
      <div className="dc-bkd-row total">
        <span className="dc-bkd-lbl" style={{ color: 'var(--green)', fontWeight: 700 }}>
          Net Payable ({fmt(r.final_price)}/unit)
        </span>
        <span className="dc-bkd-val total-v">{fmt(r.total_net)}</span>
      </div>
      <div className="dc-bkd-row margin" style={{ marginTop: 8 }}>
        <span className="dc-bkd-lbl">Your Cost Basis ({fmt(r.buy_price)}/unit)</span>
        <span className="dc-bkd-val" style={{ color: 'var(--text3)' }}>− {fmt(r.buy_price * r.quantity)}</span>
      </div>
      <div className="dc-bkd-row margin">
        <span className="dc-bkd-lbl" style={{ fontWeight: 700, color: 'var(--text)' }}>Gross Profit</span>
        <span className="dc-bkd-val" style={{ color: r.guardrail_ok ? 'var(--g2)' : 'var(--r2)', fontWeight: 700 }}>
          {fmt(r.margin_amount)}
        </span>
      </div>
    </div>
  );
}

function RulesMatrix({ rules, segment, activeRuleId }) {
  const filtered = rules.filter(r => r.segment === segment && r.category === null && r.is_active);
  const maxDisc  = Math.max(...filtered.map(r => r.discount_pct), 1);

  if (!filtered.length) return <div className="dc-empty"><div className="dc-empty-ico">📋</div>No rules for this segment</div>;

  return (
    <div className="dc-matrix">
      {filtered.map(r => {
        const isActive = r.rule_id === activeRuleId;
        const qty      = r.max_qty ? `${r.min_qty}–${r.max_qty}` : `${r.min_qty}+`;
        return (
          <div key={r.rule_id} className={`dc-rule-row${isActive ? ' active-rule' : ''}`}>
            <span className="dc-rule-qty">{qty} units</span>
            <span className="dc-rule-pct">{fmtPct(r.discount_pct)}</span>
            <div className="dc-rule-bar-wrap">
              <div
                className="dc-rule-bar-fill"
                style={{
                  width: `${(r.discount_pct / maxDisc) * 100}%`,
                  background: isActive ? 'var(--g2)' : 'var(--border2)',
                }}
              />
            </div>
            <span className="dc-rule-floor">floor {fmtPct(r.min_margin_pct)}</span>
          </div>
        );
      })}
    </div>
  );
}

function CategoryOverrides({ rules, activeRuleId }) {
  const catRules = rules.filter(r => r.category !== null && r.is_active);
  if (!catRules.length) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="dc-sec-lbl">Category Overrides</div>
      <div className="dc-matrix">
        {catRules.map(r => (
          <div key={r.rule_id} className={`dc-rule-row${r.rule_id === activeRuleId ? ' active-rule' : ''}`}>
            <span className="dc-rule-qty" style={{ width: 110 }}>{r.category?.split(' ')[0]}</span>
            <span className="dc-rule-pct">{fmtPct(r.discount_pct)}</span>
            <div className="dc-rule-bar-wrap">
              <div className="dc-rule-bar-fill" style={{ width: `${(r.discount_pct / 12) * 100}%`, background: 'var(--t2)' }} />
            </div>
            <span className="dc-rule-floor">floor {fmtPct(r.min_margin_pct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SegmentSummaryCards({ summary, onAI }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>30-Day Performance</span>
        <button
          className="dap-trigger-btn sm"
          onClick={() => {
            const lines = summary.map(s =>
              `${s.segment}: avg ${fmtPct(s.avg_discount)} discount, ${s.quote_count} quotes, ${fmtL(s.total_value)} value`
            ).join('; ');
            onAI(`Compare segment discount performance: ${lines}. Which segment has the best margin efficiency and why? What should I do differently for underperforming segments?`);
          }}
        >✨ Compare segments</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {summary.map(s => {
          const m = SEG_META[s.segment] || SEG_META['Contractor'];
          return (
            <div
              key={s.segment}
              className="dc-seg-summary-card"
              style={{ cursor: 'pointer' }}
              title="Click to ask AI about this segment"
              onClick={() => onAI(
                `Analyse the ${s.segment} segment: avg discount ${fmtPct(s.avg_discount)}, ` +
                `${s.quote_count} quotes in 30 days, total value ${fmtL(s.total_value)}. ` +
                `Is this segment profitable? What discount strategy should I use for ${s.segment} customers?`
              )}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>{m.icon}</span>
                <span className="dc-seg-summary-name">{s.segment}</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text3)' }}>✨</span>
              </div>
              <div className="dc-seg-summary-row">
                <span className="dc-seg-summary-lbl">Avg Discount</span>
                <span className="dc-seg-summary-val">{fmtPct(s.avg_discount)}</span>
              </div>
              <div className="dc-seg-summary-row">
                <span className="dc-seg-summary-lbl">Quotes (30d)</span>
                <span className="dc-seg-summary-val">{s.quote_count}</span>
              </div>
              <div className="dc-seg-summary-row">
                <span className="dc-seg-summary-lbl">Value</span>
                <span className="dc-seg-summary-val">{fmtL(s.total_value)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DistributorDiscount({ onGoChat, dbStatus }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // Calculator inputs
  const [segment,     setSegment]     = useState('Contractor');
  const [productId,   setProductId]   = useState('');
  const [quantity,    setQuantity]    = useState(100);
  const [useOverride, setUseOverride] = useState(false);
  const [overridePct, setOverridePct] = useState('');

  // Quote save state
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [quoteNotes,   setQuoteNotes]   = useState('');
  const [saving,       setSaving]       = useState(false);
  const [savedQuote,   setSavedQuote]   = useState(null);

  // Quote history filter
  const [quoteFilter,  setQuoteFilter]  = useState('ALL');
  const [rulesSegTab,  setRulesSegTab]  = useState('Contractor');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // AI panel
  const [aiOpen,    setAiOpen]    = useState(false);
  const [aiMessage, setAiMessage] = useState('');

  const openAI = useCallback((msg) => {
    setAiMessage(msg);
    setAiOpen(true);
  }, []);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/discounts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      if (json.products?.length) setProductId(String(json.products[0].product_id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 10 * 60_000);

  const result = useMemo(() => {
    if (!data?.products || !productId) return null;
    const product = data.products.find(p => String(p.product_id) === String(productId));
    return computeDiscount(data.rules, product, segment, quantity, useOverride ? overridePct : null);
  }, [data, segment, productId, quantity, useOverride, overridePct]);

  useEffect(() => { setRulesSegTab(segment); }, [segment]);

  const handleSaveQuote = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const product = data.products.find(p => String(p.product_id) === String(productId));
      const payload = {
        customer_name:   customerName || null,
        segment,
        product_id:      product?.product_id || null,
        product_name:    result.product_name,
        category:        result.category,
        quantity:        result.quantity,
        buy_price:       result.buy_price,
        sell_price:      result.sell_price,
        discount_pct:    result.discount_pct,
        discount_amount: result.total_discount,
        final_price:     result.final_price,
        total_gross:     result.total_gross,
        total_net:       result.total_net,
        margin_pct:      result.margin_pct,
        margin_amount:   result.margin_amount,
        rule_applied:    result.rule_applied,
        notes:           quoteNotes || null,
      };
      const res  = await fetch('/api/discounts/quotes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const json = await res.json();
      setSavedQuote(json);
      setShowSaveForm(false);
      setCustomerName('');
      setQuoteNotes('');
      fetchData();
    } catch (e) {
      console.error('Save quote failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (quoteId, newStatus) => {
    try {
      await fetch(`/api/discounts/quotes/${quoteId}/status`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      });
      fetchData();
    } catch (e) { console.error('Status update failed:', e); }
  };

  const filteredQuotes = useMemo(() => {
    if (!data?.quotes) return [];
    if (quoteFilter === 'ALL') return data.quotes;
    return data.quotes.filter(q => q.status === quoteFilter);
  }, [data, quoteFilter]);
  useEffect(() => { setPage(1); }, [quoteFilter]);
  const pagedQuotes = filteredQuotes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const productsByCategory = useMemo(() => {
    if (!data?.products) return {};
    return data.products.reduce((acc, p) => {
      (acc[p.category] = acc[p.category] || []).push(p);
      return acc;
    }, {});
  }, [data?.products]);

  if (loading) return <PageLoader />;
  if (error)   return <ErrorState message={error} onRetry={fetchData} />;

  const kpis  = data?.kpis  || {};
  const rules = data?.rules || [];

  return (
    <div className="view">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="dc-page-header">
        <div>
          <div className="kl" style={{ color: 'var(--text3)', marginBottom: 2 }}>DISTRIBUTOR MANAGEMENT</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px', marginBottom: 2 }}>
            Discount Calculator
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            Smart discount engine with segment rules, volume slabs &amp; margin guardrails
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="dap-trigger-btn"
            style={{ fontSize: 11, padding: '6px 14px' }}
            onClick={() => openAI(
              `Give me a full discount strategy briefing for today: ` +
              `avg discount ${fmtPct(kpis.avg_discount_pct ?? 0)}, ` +
              `${kpis.quotes_this_month ?? 0} quotes this month worth ${fmtL(kpis.total_quoted_value ?? 0)}, ` +
              `acceptance rate ${fmtPct(kpis.acceptance_rate ?? 0)}, avg margin ${fmtPct(kpis.avg_margin_pct ?? 0)}. ` +
              `What should I focus on today to improve margins and quote conversion?`
            )}
          >✨ AI Briefing</button>
          <DataSourceBadge source={data?.data_source} updatedAt={dbStatus?.checkedAt} />
        </div>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────────────────────── */}
      <div className="kg g4" style={{ marginBottom: 6 }}>
        <div
          className="kc sg"
          title="Click to ask AI about average discount"
          style={{ cursor: 'pointer' }}
          onClick={() => openAI(
            `My average discount this month is ${fmtPct(kpis.avg_discount_pct ?? 0)}, which is below the 8% policy threshold. ` +
            `Is this good or concerning? What does a healthy avg discount look like for a plywood distributor in India?`
          )}
        >
          <div className="kt"><span className="kl">Avg Discount (MTD)</span><span className="kconf">30d</span></div>
          <div className="kv">{fmtPct(kpis.avg_discount_pct ?? 0)}</div>
          <div className="kd up">↓ Below 8% policy threshold</div>
          <div className="ks">Healthy — protect margins <span style={{ opacity: .5, fontSize: 9 }}>✨</span></div>
        </div>
        <div
          className="kc sb"
          title="Click to ask AI about quote volume"
          style={{ cursor: 'pointer' }}
          onClick={() => openAI(
            `I have ${kpis.quotes_this_month ?? 0} quotes this month with an acceptance rate of ${fmtPct(kpis.acceptance_rate ?? 0)}. ` +
            `Is this acceptance rate healthy? What can I do to improve quote conversion for plywood distributors?`
          )}
        >
          <div className="kt"><span className="kl">Quotes This Month</span><span className="kconf">MTD</span></div>
          <div className="kv">{kpis.quotes_this_month ?? 0}</div>
          <div className="kd fl">Active discount negotiations</div>
          <div className="ks">Acceptance rate {fmtPct(kpis.acceptance_rate ?? 0)} <span style={{ opacity: .5, fontSize: 9 }}>✨</span></div>
        </div>
        <div
          className="kc st"
          title="Click to ask AI about quoted value"
          style={{ cursor: 'pointer' }}
          onClick={() => openAI(
            `My total quoted value this month is ${fmtL(kpis.total_quoted_value ?? 0)} across all segments. ` +
            `How does this translate to expected revenue? What percentage typically converts and what's the margin risk?`
          )}
        >
          <div className="kt"><span className="kl">Quoted Value (MTD)</span><span className="kconf">gross</span></div>
          <div className="kv">{fmtL(kpis.total_quoted_value ?? 0)}</div>
          <div className="kd up">↑ vs last month</div>
          <div className="ks">Across all segments <span style={{ opacity: .5, fontSize: 9 }}>✨</span></div>
        </div>
        <div
          className="kc sp"
          title="Click to ask AI about margin"
          style={{ cursor: 'pointer' }}
          onClick={() => openAI(
            `My average margin held this month is ${fmtPct(kpis.avg_margin_pct ?? 0)}, above the 15% policy floor. ` +
            `What margin targets should a plywood distributor aim for? How do I protect margin when customers push for bigger discounts?`
          )}
        >
          <div className="kt"><span className="kl">Avg Margin Held</span><span className="kconf">MTD</span></div>
          <div className="kv">{fmtPct(kpis.avg_margin_pct ?? 0)}</div>
          <div className="kd up">✓ Above 15% policy floor</div>
          <div className="ks">Policy minimum: 15.0% <span style={{ opacity: .5, fontSize: 9 }}>✨</span></div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          className="dap-trigger-btn sm"
          onClick={() => openAI(
            `Analyse all my discount KPIs together: avg discount ${fmtPct(kpis.avg_discount_pct ?? 0)}, ` +
            `${kpis.quotes_this_month ?? 0} quotes, total value ${fmtL(kpis.total_quoted_value ?? 0)}, ` +
            `acceptance rate ${fmtPct(kpis.acceptance_rate ?? 0)}, avg margin ${fmtPct(kpis.avg_margin_pct ?? 0)}. ` +
            `Give me a scorecard with red/yellow/green rating for each KPI and one priority action.`
          )}
        >✨ Analyse all KPIs</button>
      </div>

      {/* ── AI Opportunity Strip ─────────────────────────────────────────────── */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '💸', text: `Avg discount ${fmtPct(kpis.avg_discount_pct ?? 0)} — find over-discounting by segment`,
              q: `My average discount this month is ${fmtPct(kpis.avg_discount_pct ?? 0)}. Which customer segments or specific customers are getting discounts above the 8% policy? Show me where discount leakage is happening and the revenue impact of plugging it.` },
            { icon: '📉', text: `Acceptance rate ${fmtPct(kpis.acceptance_rate ?? 0)} — improve quote conversion tactics`,
              q: `My quote acceptance rate is ${fmtPct(kpis.acceptance_rate ?? 0)}. What are the main reasons quotes get rejected in the plywood and hardware trade? What discount structure and value-adds would improve conversion for contractors vs interior firms vs retailers?` },
            { icon: '⚠️', text: 'Margin floor violations — quotes below 15% minimum margin',
              q: `Which recent discount quotes have breached the 15% minimum margin guardrail? Was it a manual override or rule gap? Give me a margin compliance report and what corrective action is needed for each violation.` },
            { icon: '🏷️', text: 'Volume slab review — are quantity thresholds driving right order sizes',
              q: `Review my discount volume slabs — the quantity thresholds that unlock higher discounts. Are these slabs incentivizing the right order sizes? What changes to the slab structure would drive larger average order values while protecting margins?` },
            { icon: '🎯', text: `Pipeline ${fmtL(kpis.total_quoted_value ?? 0)} — which open quotes to follow up on today`,
              q: `I have ${kpis.quotes_this_month ?? 0} quotes worth ${fmtL(kpis.total_quoted_value ?? 0)} this month at ${fmtPct(kpis.acceptance_rate ?? 0)} acceptance rate. Which open quotes are most likely to close? Give me a follow-up priority list with the right script for each customer type.` },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Main two-column grid ─────────────────────────────────────────────── */}
      <div className="gl g75" style={{ marginBottom: 14 }}>

        {/* LEFT: Calculator */}
        <div className="card">
          <div className="ch">
            <div>
              <div className="ctit">Discount Calculator</div>
              <div className="csub">Select customer type, product and quantity for instant pricing</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {savedQuote && (
                <span className="bdg bg" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  ✓ {savedQuote.quote_number} saved
                </span>
              )}
              <button
                className="dap-trigger-btn sm"
                onClick={() => openAI(
                  `Explain how to use the discount calculator effectively. I'm selecting ${segment} as customer type. ` +
                  `What factors should I consider when setting discounts for ${segment} customers?`
                )}
              >✨ How to use</button>
            </div>
          </div>

          {/* 1. Customer Segment */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div className="dc-lbl">Customer Type</div>
              <button
                className="dap-trigger-btn sm"
                onClick={() => openAI(
                  `I've selected ${segment} as customer type. ` +
                  `What discount strategy works best for ${segment} customers? ` +
                  `What are their typical buying patterns and price sensitivity?`
                )}
              >✨ {segment} strategy</button>
            </div>
            <div className="dc-seg-row">
              {SEGMENTS.map(s => {
                const m = SEG_META[s];
                const isActive = segment === s;
                return (
                  <button
                    key={s}
                    className={`dc-seg-btn${isActive ? ` ${m.colorClass}` : ''}`}
                    onClick={() => setSegment(s)}
                  >
                    <span className="dc-seg-icon">{m.icon}</span>
                    <span>{s}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Product + Quantity */}
          <div className="dc-form-row" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div className="dc-lbl">Product / SKU</div>
              <select
                className="dc-inp"
                value={productId}
                onChange={e => setProductId(e.target.value)}
              >
                {Object.entries(productsByCategory).map(([cat, prods]) => (
                  <optgroup key={cat} label={cat}>
                    {prods.map(p => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.sku_name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <div className="dc-lbl">Quantity (units)</div>
              <input
                type="number"
                className="dc-inp"
                min={1}
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>
          </div>

          {/* 3. Manual Override Toggle */}
          <div className={`dc-override${useOverride ? ' active' : ''}`}>
            <input
              id="override-toggle"
              type="checkbox"
              checked={useOverride}
              onChange={e => { setUseOverride(e.target.checked); if (!e.target.checked) setOverridePct(''); }}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="override-toggle">Manual override</label>
            {useOverride && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <input
                  type="number"
                  className="dc-inp"
                  style={{ width: 70, padding: '4px 8px', fontSize: 12 }}
                  min={0} max={30} step={0.5}
                  placeholder="0.0"
                  value={overridePct}
                  onChange={e => setOverridePct(e.target.value)}
                />
                <span style={{ fontSize: 11, color: 'var(--amber)', fontFamily: 'var(--mono)', fontWeight: 700 }}>%</span>
                <button
                  className="dap-trigger-btn sm"
                  onClick={() => openAI(
                    `I'm manually overriding the discount to ${overridePct}% for ${segment} customer buying ` +
                    `${quantity} units. Is this justified? What are the margin implications and when is a manual override appropriate?`
                  )}
                >✨ Is this justified?</button>
              </div>
            )}
            {!useOverride && (
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                Uses best rule automatically
              </span>
            )}
          </div>

          {/* 4. Result Card */}
          {result ? (
            <div className="dc-result-card">
              <div className="dc-rule-tag">
                {result.is_override ? '✎ Manual Override' : `📋 ${result.rule_applied}`}
                {!result.guardrail_ok && (
                  <span style={{ marginLeft: 6, color: 'var(--r2)', fontWeight: 800 }}>⚠ BELOW FLOOR</span>
                )}
                <button
                  className="dap-trigger-btn sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => openAI(
                    `Explain the rule "${result.rule_applied}" that triggered for my current calculation. ` +
                    `Why does this rule exist and what business goal does it serve?`
                  )}
                >✨ Why this rule?</button>
              </div>

              <div style={{ marginTop: 12 }}>
                <PriceBreakdown r={result} />
              </div>

              <MarginGauge pct={result.margin_pct} minPct={result.min_margin_pct} status={result.margin_status} />

              {/* Margin-specific AI trigger */}
              {(result.margin_status === 'DANGER' || result.margin_status === 'WARNING') && (
                <div style={{ marginTop: 8 }}>
                  <button
                    className="dap-trigger-btn"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => openAI(
                      `My margin is ${fmtPct(result.margin_pct)}, which is ${result.margin_status === 'DANGER' ? 'CRITICALLY BELOW' : 'BELOW'} ` +
                      `the ${fmtPct(result.min_margin_pct)} floor. ` +
                      `Product: ${result.product_name}, ${result.quantity} units, ${result.segment} segment, ${fmtPct(result.discount_pct)} discount. ` +
                      `What should I do? Can I still close this deal profitably?`
                    )}
                  >⛔ My margin is below floor — what should I do?</button>
                </div>
              )}

              {showSaveForm ? (
                <div className="dc-save-form">
                  <div className="dc-save-form-title">Save as Quote</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <div className="dc-lbl">Customer Name (optional)</div>
                      <input
                        className="dc-inp"
                        placeholder="e.g. Ramesh Constructions"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                      />
                    </div>
                    <div>
                      <div className="dc-lbl">Notes (optional)</div>
                      <input
                        className="dc-inp"
                        placeholder="e.g. 6-floor project"
                        value={quoteNotes}
                        onChange={e => setQuoteNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="dc-save-btn" onClick={handleSaveQuote} disabled={saving}>
                      {saving ? 'Saving…' : '✓ Confirm & Save Quote'}
                    </button>
                    <button className="dc-ai-btn" onClick={() => setShowSaveForm(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="dc-actions">
                  <button
                    className="dc-save-btn"
                    onClick={() => { setShowSaveForm(true); setSavedQuote(null); }}
                  >
                    💾 Save Quote
                  </button>
                  <button
                    className="dap-trigger-btn"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => openAI(
                      `Analyse this discount quote: ${result.quantity} units of ${result.product_name} ` +
                      `for ${result.segment} customer, ${fmtPct(result.discount_pct)} discount, ` +
                      `net value ${fmtL(result.total_net)}, gross profit ${fmtL(result.margin_amount)} (${fmtPct(result.margin_pct)} margin). ` +
                      `Rule applied: ${result.rule_applied}. ` +
                      `Should I proceed? Is this a good deal? Any risk I should flag to my manager?`
                    )}
                  >
                    ✨ Analyse this quote
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="dc-no-result">
              <div className="dc-no-result-ico">🧮</div>
              <div className="dc-no-result-txt">Select a product and quantity to calculate</div>
              <div className="dc-no-result-sub">Discount and margin will appear instantly</div>
              <button
                className="dap-trigger-btn"
                style={{ marginTop: 12 }}
                onClick={() => openAI(
                  `Explain how the discount calculator works for a plywood distributor. ` +
                  `How are volume slabs structured and how do segment rules interact with category overrides?`
                )}
              >✨ How does this work?</button>
            </div>
          )}
        </div>

        {/* RIGHT: Rules Matrix */}
        <div className="card">
          <div className="ch" style={{ marginBottom: 10 }}>
            <div>
              <div className="ctit">Discount Rules Matrix</div>
              <div className="csub">Segment × volume slab schedules</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="bdg bg">{rules.filter(r => r.is_active).length} Active Rules</span>
              <button
                className="dap-trigger-btn sm"
                onClick={() => openAI(
                  `Explain the discount rules matrix. I have ${rules.filter(r => r.is_active).length} active rules ` +
                  `across ${SEGMENTS.length} customer segments (${SEGMENTS.join(', ')}). ` +
                  `How should I think about optimising these rules for maximum revenue and margin protection?`
                )}
              >✨ Explain rules</button>
            </div>
          </div>

          {/* Segment summary mini-cards */}
          <SegmentSummaryCards summary={data?.segment_summary || []} onAI={openAI} />

          {/* Segment tabs */}
          <div className="dc-seg-tab-row">
            {SEGMENTS.map(s => (
              <button
                key={s}
                className={`dc-seg-tab${rulesSegTab === s ? ' active' : ''}`}
                onClick={() => setRulesSegTab(s)}
              >
                {SEG_META[s].icon} {s}
              </button>
            ))}
          </div>

          {/* Rules for selected segment + AI trigger */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button
              className="dap-trigger-btn sm"
              onClick={() => {
                const segRules = rules.filter(r => r.segment === rulesSegTab && r.category === null && r.is_active);
                const ruleText = segRules.map(r =>
                  `${r.min_qty}${r.max_qty ? `–${r.max_qty}` : '+'} units → ${fmtPct(r.discount_pct)} (floor ${fmtPct(r.min_margin_pct)})`
                ).join(', ');
                openAI(
                  `Explain the ${rulesSegTab} discount rules: ${ruleText}. ` +
                  `Are these slabs competitive for Indian plywood market? Should any thresholds be revised?`
                );
              }}
            >✨ Explain {rulesSegTab} rules</button>
          </div>

          <RulesMatrix rules={rules} segment={rulesSegTab} activeRuleId={result?.rule_id} />

          {/* Category overrides section */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 4 }}>
            <div className="dc-sec-lbl" style={{ margin: 0 }}>Category Overrides</div>
            <button
              className="dap-trigger-btn sm"
              onClick={() => {
                const catRules = rules.filter(r => r.category !== null && r.is_active);
                const catText  = catRules.map(r => `${r.category}: ${fmtPct(r.discount_pct)}`).join(', ');
                openAI(
                  `Explain category-specific discount overrides. Current overrides: ${catText || 'none'}. ` +
                  `When do category rules override segment rules? What are the business risks of category exceptions?`
                );
              }}
            >✨ Why overrides?</button>
          </div>
          <CategoryOverrides rules={rules} activeRuleId={result?.rule_id} />

          {/* Policy note */}
          <div style={{
            marginTop: 14, padding: '10px 12px',
            background: 'var(--a3)', border: '1px solid var(--a4)',
            borderRadius: 8, fontSize: 11, color: 'var(--amber)', lineHeight: 1.5,
          }}>
            <strong>Policy:</strong> Any discount beyond the floor margin requires manager approval.
            Category-specific rules override segment rules when both apply.
            <button
              className="dap-trigger-btn sm"
              style={{ marginLeft: 10, verticalAlign: 'middle' }}
              onClick={() => openAI(
                `When does a discount require manager approval at a plywood distributor? ` +
                `What approval workflow is best practice? How do I document override justifications?`
              )}
            >✨ Approval guide</button>
          </div>
        </div>
      </div>

      {/* ── Quote History ──────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="ch">
          <div>
            <div className="ctit">Quote History</div>
            <div className="csub">{filteredQuotes.length} quotes · click row to update status</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="dap-trigger-btn sm"
              onClick={() => {
                const all      = data?.quotes || [];
                const accepted = all.filter(q => q.status === 'ACCEPTED').length;
                const rejected = all.filter(q => q.status === 'REJECTED').length;
                const pending  = all.filter(q => q.status === 'SENT').length;
                const avgDisc  = all.length ? (all.reduce((a, q) => a + (q.discount_pct || 0), 0) / all.length) : 0;
                const avgMgn   = all.length ? (all.reduce((a, q) => a + (q.margin_pct   || 0), 0) / all.length) : 0;
                openAI(
                  `Analyse my full quote history: ${all.length} total, ${accepted} accepted, ${rejected} rejected, ${pending} pending. ` +
                  `Average discount offered: ${fmtPct(avgDisc)}, average margin: ${fmtPct(avgMgn)}. ` +
                  `What patterns do you see? How can I improve acceptance rate and margin simultaneously?`
                );
              }}
            >✨ Analyse history</button>
            {['ALL', 'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'].map(f => (
              <button
                key={f}
                className={`dc-filter-btn${quoteFilter === f ? ' active' : ''}`}
                onClick={() => setQuoteFilter(f)}
              >
                {f}
              </button>
            ))}
            <ExportButton rows={filteredQuotes} filename="discount_quotes" columns={[
              { key: 'quote_number', label: 'Quote #' }, { key: 'customer', label: 'Customer' },
              { key: 'segment', label: 'Segment' }, { key: 'product', label: 'Product' },
              { key: 'quantity', label: 'Qty' }, { key: 'discount_pct', label: 'Discount %' },
              { key: 'net_value', label: 'Net Value (₹)' }, { key: 'margin_pct', label: 'Margin %' },
              { key: 'valid_till', label: 'Valid Till' }, { key: 'status', label: 'Status' },
            ]} />
          </div>
        </div>

        {filteredQuotes.length === 0 ? (
          <div className="dc-empty" style={{ paddingTop: 30 }}>
            <div className="dc-empty-ico">📭</div>
            <div>No quotes for this filter</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl tbl-striped">
              <thead>
                <tr>
                  <th>Quote #</th>
                  <th>Customer</th>
                  <th>Segment</th>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Discount</th>
                  <th style={{ textAlign: 'right' }}>Net Value</th>
                  <th style={{ textAlign: 'right' }}>Margin</th>
                  <th>Valid Till</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedQuotes.map(q => {
                  const sm       = STATUS_META[q.status] || STATUS_META.DRAFT;
                  const segM     = SEG_META[q.segment]   || SEG_META['Contractor'];
                  const isExpired = q.valid_till && new Date(q.valid_till) < new Date();
                  const marginRisk = q.margin_pct < 14;
                  return (
                    <tr
                      key={q.quote_id}
                      style={{ cursor: 'pointer' }}
                      title="Click row to ask AI about this quote"
                      onClick={() => openAI(
                        `Analyse quote ${q.quote_number} for ${q.customer_name || 'unnamed customer'} ` +
                        `(${q.segment} segment): ${q.quantity?.toLocaleString('en-IN')} units of ${q.product_name}, ` +
                        `${fmtPct(q.discount_pct)} discount, net ${fmtL(q.total_net)}, ` +
                        `margin ${fmtPct(q.margin_pct)}, status ${q.status}. ` +
                        `${marginRisk ? 'Margin looks risky — ' : ''}Is this a good deal? What should I do next?`
                      )}
                    >
                      <td>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>
                          {q.quote_number}
                        </span>
                      </td>
                      <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q.customer_name || <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td>
                        <span className={`bdg ${segM.badgeClass}`}>{segM.icon} {q.segment}</span>
                      </td>
                      <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                        {q.product_name}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                        {q.quantity?.toLocaleString('en-IN')}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--r2)', fontSize: 12 }}>
                        {fmtPct(q.discount_pct)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12 }}>
                        {fmtL(q.total_net)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span
                          className="dc-margin-pill"
                          style={{ color: q.margin_pct >= 18 ? 'var(--green)' : q.margin_pct >= 14 ? 'var(--a2)' : 'var(--r2)' }}
                        >
                          {fmtPct(q.margin_pct)}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: isExpired ? 'var(--r2)' : 'var(--text3)' }}>
                        {q.valid_till || '—'}
                      </td>
                      <td>
                        <span className={`bdg ${sm.cls}`}>{sm.label}</span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {q.status === 'DRAFT' && (
                            <button className="dc-act-btn" onClick={() => handleStatusUpdate(q.quote_id, 'SENT')} title="Mark as sent">
                              Send →
                            </button>
                          )}
                          {q.status === 'SENT' && (
                            <>
                              <button className="dc-act-btn dc-act-green" onClick={() => handleStatusUpdate(q.quote_id, 'ACCEPTED')}>✓</button>
                              <button className="dc-act-btn dc-act-red"   onClick={() => handleStatusUpdate(q.quote_id, 'REJECTED')}>✗</button>
                            </>
                          )}
                          <button
                            className="dap-trigger-btn sm"
                            title="Ask AI about this quote"
                            onClick={() => openAI(
                              `Analyse quote ${q.quote_number}: ${q.quantity?.toLocaleString('en-IN')} units of ` +
                              `${q.product_name} for ${q.customer_name || 'unnamed'} (${q.segment}), ` +
                              `${fmtPct(q.discount_pct)} discount, margin ${fmtPct(q.margin_pct)}, status ${q.status}. ` +
                              `What's the best next action for this quote?`
                            )}
                          >✨</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={filteredQuotes.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {/* ── AI Panel ──────────────────────────────────────────────────────────── */}
      <DiscountAIPanel
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        initialMessage={aiMessage}
      />

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Analyze my discount policy — where am I over-discounting? Show discount leakage, margin floors being breached, and which customer segments need repricing.')}>
          <span>✨</span>
          <span>Ask AI: Discount leakage, margin analysis & pricing optimisation →</span>
        </div>
      )}
    </div>
  );
}
