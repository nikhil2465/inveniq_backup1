import React, { useMemo, useState } from 'react';

const NAV_ITEMS = [
  // ── Overview ──────────────────────────────────────────────────────────────
  { section: 'Overview' },
  {
    id: 'overview', label: 'Business Overview',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6.5" height="6.5" rx="1.5" fill="white" opacity=".9"/><rect x="8.5" y="1" width="6.5" height="6.5" rx="1.5" fill="white" opacity=".55"/><rect x="1" y="8.5" width="6.5" height="6.5" rx="1.5" fill="white" opacity=".55"/><rect x="8.5" y="8.5" width="6.5" height="6.5" rx="1.5" fill="white" opacity=".9"/></svg>,
  },
  {
    id: 'analytics', label: 'Analytics & BI', badge: 'NEW', badgeClass: 'nb-p',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="9" width="3" height="6" rx=".8" fill="white" opacity=".6"/><rect x="6" y="5" width="3" height="10" rx=".8" fill="white" opacity=".8"/><rect x="11" y="1" width="3" height="14" rx=".8" fill="white" opacity=".9"/><path d="M2.5 9L7.5 5 12.5 1" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity=".5"/></svg>,
  },

  // ── Inventory ─────────────────────────────────────────────────────────────
  { section: 'Inventory' },
  {
    id: 'inventory', label: 'Stock Intelligence', badge: '!', badgeClass: 'nb-a',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="1.5" stroke="white" strokeWidth="1.4" opacity=".9"/><path d="M4 7h8M4 10h5" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".8"/></svg>,
  },
  {
    id: 'catalog', label: 'Product Catalog', badge: 'NEW', badgeClass: 'nb-b',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" fill="white" opacity=".7"/><rect x="9" y="1" width="6" height="6" rx="1" fill="white" opacity=".5"/><rect x="1" y="9" width="6" height="6" rx="1" fill="white" opacity=".5"/><rect x="9" y="9" width="6" height="6" rx="1" fill="white" opacity=".7"/></svg>,
  },
  {
    id: 'demand', label: 'Demand Forecasting',
    icon: <svg viewBox="0 0 16 16" fill="none"><path d="M2 14L5 9l3 2 3-5 3 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/></svg>,
  },
  {
    id: 'deadstock', label: 'Dead Stock & Ageing', badge: '3', badgeClass: 'nb-r',
    icon: <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="white" strokeWidth="1.4" opacity=".85"/><path d="M8 5v4M8 11v.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity=".9"/></svg>,
  },
  {
    id: 'inward', label: 'Inward & Outward',
    icon: <svg viewBox="0 0 16 16" fill="none"><path d="M8 2v10M5 9l3 3 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/><path d="M2 14h12" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity=".6"/></svg>,
  },
  {
    id: 'damage', label: 'Damage Recording', badge: 'NEW', badgeClass: 'nb-r',
    icon: <svg viewBox="0 0 16 16" fill="none"><path d="M8 1L2 5v8h12V5L8 1z" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity=".85"/><path d="M6 8l1.5 1.5L11 6" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".0"/><path d="M7 6l2 4M7 6l2-2" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".9"/><circle cx="8" cy="10.5" r=".8" fill="white" opacity=".9"/></svg>,
  },
  {
    id: 'warehouse', label: 'Warehouse Management',
    icon: <svg viewBox="0 0 16 16" fill="none"><path d="M1 7L8 2l7 5v7H1V7z" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".85"/><rect x="5" y="9" width="6" height="5" rx=".5" stroke="white" strokeWidth="1.2" opacity=".7"/></svg>,
  },

  // ── Procurement ───────────────────────────────────────────────────────────
  { section: 'Procurement' },
  {
    id: 'landingcost', label: 'Landing Cost', badge: 'NEW', badgeClass: 'nb-b',
    icon: <svg viewBox="0 0 16 16" fill="none"><path d="M1 11l4-8 3 5 2-3 3 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/><path d="M1 14h14" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity=".5"/></svg>,
  },
  {
    id: 'procurement', label: 'Supplier & Procurement',
    icon: <svg viewBox="0 0 16 16" fill="none"><path d="M1 3h14M1 3l2 10h10L15 3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".85"/><circle cx="6" cy="14" r="1" fill="white" opacity=".7"/><circle cx="10" cy="14" r="1" fill="white" opacity=".7"/></svg>,
  },
  {
    id: 'pogrn', label: 'PO & GRN', badge: 'NEW', badgeClass: 'nb-b',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M5 5h6M5 8h4M5 11h5" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity=".75"/><path d="M11 9l1.5 1.5L15 8" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/></svg>,
  },
  {
    id: 'pr', label: 'Purchase Requisition', badge: 'NEW', badgeClass: 'nb-p',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M5 5h6M5 8h6M5 11h4" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity=".7"/><path d="M10 11h2M11 10v2" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".9"/></svg>,
  },
  {
    id: 'qc', label: 'QC Inspection', badge: 'NEW', badgeClass: 'nb-g',
    icon: <svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M5.5 7l1.5 1.5 2.5-2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/><path d="M11 11l3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity=".7"/></svg>,
  },
  {
    id: 'invoicematch', label: 'Invoice Matching', badge: 'NEW', badgeClass: 'nb-r',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="6" height="10" rx="1" stroke="white" strokeWidth="1.3" opacity=".85"/><rect x="9" y="3" width="6" height="10" rx="1" stroke="white" strokeWidth="1.3" opacity=".7"/><path d="M7 8h2M8 6v4" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".9"/></svg>,
  },

  // ── Sales & CRM ───────────────────────────────────────────────────────────
  { section: 'Sales & CRM' },
  {
    id: 'sales', label: 'Sales Performance',
    icon: <svg viewBox="0 0 16 16" fill="none"><path d="M2 12L5.5 7L9 10L12 5L14.5 7.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/></svg>,
  },
  {
    id: 'customers', label: 'Customer Intelligence',
    icon: <svg viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="white" strokeWidth="1.4" opacity=".9"/><path d="M1 13c0-2.8 2.2-5 5-5" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".7"/><circle cx="11" cy="5" r="2.5" stroke="white" strokeWidth="1.4" opacity=".7"/><path d="M11 10c2.8 0 4 2.2 4 3" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".6"/></svg>,
  },
  {
    id: 'louvers', label: 'Sales Orders', badge: 'NEW', badgeClass: 'nb-g',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="white" strokeWidth="1.4" opacity=".85"/><path d="M5 5h6M5 8h6M5 11h4" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity=".8"/><path d="M11 10.5l1.5 1.5L15 9" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/></svg>,
  },
  {
    id: 'salesreturn', label: 'Sales Return', badge: 'NEW', badgeClass: 'nb-r',
    icon: <svg viewBox="0 0 16 16" fill="none"><path d="M3 8H13M3 8L6 5M3 8L6 11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/><rect x="9" y="4" width="5" height="8" rx="1" stroke="white" strokeWidth="1.2" opacity=".6"/></svg>,
  },
  {
    id: 'orders', label: 'Orders & Fulfilment',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="white" strokeWidth="1.4" opacity=".8"/><path d="M5 5h6M5 8h6M5 11h4" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity=".7"/></svg>,
  },
  {
    id: 'freight', label: 'Freight Planning', badge: 'NEW', badgeClass: 'nb-b',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="10" height="7" rx="1" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M11 6h2.5l1.5 2v3h-4" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity=".8"/><circle cx="4.5" cy="12.5" r="1.5" stroke="white" strokeWidth="1.2" opacity=".9"/><circle cx="12" cy="12.5" r="1.5" stroke="white" strokeWidth="1.2" opacity=".9"/></svg>,
  },
  {
    id: 'pos', label: 'Counter POS', badge: 'NEW', badgeClass: 'nb-g',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="10" rx="1.5" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M5 15h6M8 11v4" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity=".7"/><path d="M4 5h8M4 7.5h5" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity=".8"/></svg>,
  },

  // ── Pricing & Promotions ──────────────────────────────────────────────────
  { section: 'Pricing & Promotions' },
  {
    id: 'quotes', label: 'Quotation Builder', badge: 'NEW', badgeClass: 'nb-p',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M5 5h6M5 8h6M5 11h3" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity=".7"/><path d="M10 10.5l1.5 1.5 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/></svg>,
  },
  {
    id: 'discounts', label: 'Discount Calculator', badge: 'NEW', badgeClass: 'nb-g',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M5 5h2M9 5h2M5 8h2M9 8h2M5 11h2M9 11h2" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity=".8"/><path d="M10.5 10l3 3M10.5 13l3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".9"/></svg>,
  },
  {
    id: 'schemes', label: 'Scheme Management', badge: 'NEW', badgeClass: 'nb-p',
    icon: <svg viewBox="0 0 16 16" fill="none"><path d="M8 1l1.8 3.8 4.2.6-3 2.9.7 4.2L8 10.4l-3.7 2.1.7-4.2-3-2.9 4.2-.6z" stroke="white" strokeWidth="1.3" strokeLinejoin="round" opacity=".9"/></svg>,
  },
  {
    id: 'claims', label: 'Claims & Rebates', badge: 'NEW', badgeClass: 'nb-g',
    icon: <svg viewBox="0 0 16 16" fill="none"><path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M8 5v6M5.5 7.5L8 5l2.5 2.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/><path d="M5 11h6" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity=".7"/></svg>,
  },

  // ── Finance & Credit ──────────────────────────────────────────────────────
  { section: 'Finance & Credit' },
  {
    id: 'finance', label: 'Profitability & Cash', badge: '!', badgeClass: 'nb-a',
    icon: <svg viewBox="0 0 16 16" fill="none"><path d="M8 1v14M4 5h6a2 2 0 010 4H6a2 2 0 010 4h6" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity=".9"/></svg>,
  },
  {
    id: 'credit', label: 'Credit Management', badge: 'NEW', badgeClass: 'nb-r',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="9" rx="1.5" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M1 7h14" stroke="white" strokeWidth="1.3" opacity=".7"/><circle cx="4.5" cy="10.5" r="1" fill="white" opacity=".8"/><path d="M8 10.5h4" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity=".7"/></svg>,
  },
  {
    id: 'invoices', label: 'Sales Invoices', badge: 'NEW', badgeClass: 'nb-g',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M5 4h6M5 7h4M5 10h3" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity=".7"/><path d="M9 10.5l1.5 1.5 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/></svg>,
  },
  {
    id: 'reports', label: 'Reports & MIS', badge: 'NEW', badgeClass: 'nb-b',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="1.5" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M4 10V13M7 7V13M10 4V13M13 1V13" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".8"/></svg>,
  },

  // ── Design Studio ─────────────────────────────────────────────────────────
  { section: 'Design Studio' },
  {
    id: 'designquote', label: 'Design Quote Studio', badge: 'NEW', badgeClass: 'nb-p',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M5 4h6M5 7h4" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity=".7"/><path d="M5 10h2M9 9.5l1.5 1.5 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/></svg>,
  },

  // ── Projects ──────────────────────────────────────────────────────────────
  { section: 'Projects' },
  {
    id: 'projects', label: 'Project Tracker', badge: 'NEW', badgeClass: 'nb-p',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="11" rx="1.5" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M1 7h14" stroke="white" strokeWidth="1.2" opacity=".5"/><path d="M5 1v4M11 1v4" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".7"/><path d="M5 10l1.5 1.5L10 9" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/></svg>,
  },

  // ── Integrations ─────────────────────────────────────────────────────────
  { section: 'Integrations' },
  {
    id: 'tally', label: 'Tally Prime Export', badge: 'NEW', badgeClass: 'nb-g',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" rx="1.5" stroke="white" strokeWidth="1.3" opacity=".85"/><path d="M5 5h6M5 8h6M5 11h4" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity=".7"/><path d="M11 9.5l1.5 1.5L15 8.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/></svg>,
  },

  // ── AI Assistant ──────────────────────────────────────────────────────────
  { section: 'AI Assistant' },
  {
    id: 'chatbot', label: 'AI Assistant',
    icon: <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="9.5" rx="2" stroke="white" strokeWidth="1.5" opacity=".9"/><path d="M4.5 13.5l1.5-2H10" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity=".7"/><circle cx="5" cy="6.75" r="1" fill="white" opacity=".8"/><circle cx="8" cy="6.75" r="1" fill="white" opacity=".8"/><circle cx="11" cy="6.75" r="1" fill="white" opacity=".8"/></svg>,
  },

  // ── Distributor Portal ────────────────────────────────────────────────────
  { section: 'Distributor' },
  {
    id: 'distributor', label: 'My Stock Portal', badge: 'NEW', badgeClass: 'nb-g',
    icon: <svg viewBox="0 0 16 16" fill="none"><path d="M1 7L8 2l7 5v7H1V7z" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".85"/><rect x="5" y="9" width="6" height="5" rx=".5" stroke="white" strokeWidth="1.2" opacity=".7"/><circle cx="8" cy="9" r="1.5" fill="white" opacity=".6"/></svg>,
  },

  // ── System ────────────────────────────────────────────────────────────────
  { section: 'System' },
  {
    id: 'about', label: 'About InvenIQ',
    icon: <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="white" strokeWidth="1.4" opacity=".85"/><path d="M8 7v5M8 5v.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity=".9"/></svg>,
  },
  {
    id: 'settings', label: 'Settings & Status',
    icon: <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="white" strokeWidth="1.4" opacity=".9"/><path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.3 3.3l.7.7M12 12l.7.7M3.3 12.7l.7-.7M12 4l.7-.7" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".7"/></svg>,
  },
];

function SidebarFooter({ dbStatus }) {
  if (!dbStatus || dbStatus.status === 'checking') {
    return (
      <div className="live-r">
        <span className="dot" style={{ background: 'rgba(255,255,255,.25)' }} />
        Checking connection…
      </div>
    );
  }

  if (dbStatus.source === 'mysql') {
    const elapsed = dbStatus.checkedAt
      ? (() => {
          const s = Math.floor((Date.now() - new Date(dbStatus.checkedAt).getTime()) / 1000);
          return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
        })()
      : null;
    return (
      <div className="live-r">
        <span className="dot dg" />
        Live MySQL · {elapsed || 'just now'}
      </div>
    );
  }

  return (
    <div className="live-r">
      <span className="dot da" />
      Demo Mode · No DB
    </div>
  );
}

export default function Sidebar({ activeView, onNavigate, dbStatus, isOpen, alerts = [], allowedModules = null, currentUser = null }) {
  const [searchQuery, setSearchQuery] = useState('');

  // Focused mode: ≤ 8 allowed modules (only the client account — all role demo
  // accounts have 13+ modules so they are never in focused mode).
  const isFocused = !!(allowedModules && allowedModules.length <= 8);
  const chipName  = currentUser?.display_name || currentUser?.username || 'Client';
  const chipRole  = currentUser?.role
    ? currentUser.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'User';
  const chipInit  = chipName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'C';

  const dynBadges = useMemo(() => {
    const critStock = alerts.filter(a => a.category === 'stock' && a.severity === 'critical').length;
    const deadItems = alerts.filter(a => a.id?.startsWith('dead') || (a.category === 'stock' && a.title?.toLowerCase().includes('dead'))).length;
    const overdue   = alerts.filter(a => a.category === 'receivables').length;
    const overduePO = alerts.filter(a => a.category === 'procurement' && a.severity === 'warning').length;
    return {
      inventory:   critStock  > 0 ? String(critStock)  : null,
      deadstock:   deadItems  > 0 ? String(deadItems)  : null,
      finance:     overdue    > 0 ? String(overdue)    : null,
      procurement: overduePO  > 0 ? String(overduePO) : null,
    };
  }, [alerts]);

  // Filter by allowedModules and search query.
  // Section headers are emitted only when at least one visible item exists in that section.
  const visibleItems = useMemo(() => {
    const allowed = allowedModules ? new Set(allowedModules) : null;
    const q = searchQuery.trim().toLowerCase();
    const result = [];
    let pendingSection = null;
    for (const item of NAV_ITEMS) {
      if (item.section) {
        pendingSection = item;
      } else {
        if (allowed && !allowed.has(item.id)) continue;
        if (q && !item.label.toLowerCase().includes(q)) continue;
        if (pendingSection) { result.push(pendingSection); pendingSection = null; }
        result.push(item);
      }
    }
    return result;
  }, [allowedModules, searchQuery]);

  return (
    <nav className={`sidebar${isOpen ? ' open' : ''}${isFocused ? ' sb-focused' : ''}`}>
      {/* Logo */}
      <div className="logo-area">
        <div className="logo-row">
          <div className="logo-mark">
            <svg viewBox="0 0 18 18" fill="none">
              <rect x="1" y="1" width="7" height="7" rx="1.5" fill="#15803d"/>
              <rect x="10" y="1" width="7" height="7" rx="1.5" fill="#16a34a"/>
              <rect x="1" y="10" width="7" height="7" rx="1.5" fill="#16a34a"/>
              <rect x="10" y="10" width="7" height="7" rx="1.5" fill="#15803d"/>
            </svg>
          </div>
          <div>
            <span className="logo-name">InvenIQ</span>
            <div className="logo-edition">Enterprise Edition</div>
          </div>
        </div>
        <div className="logo-tag">Inventory Intelligence Platform</div>
      </div>

      {/* Role chip — focused/client mode only */}
      {isFocused && (
        <div className="sb-role-chip">
          <div className="sb-role-chip-av">{chipInit}</div>
          <div className="sb-role-chip-info">
            <div className="sb-role-chip-name">{chipName}</div>
            <div className="sb-role-chip-role">{chipRole}</div>
          </div>
        </div>
      )}

      {/* Module Search — hidden in focused mode (no point searching 4–6 items) */}
      {!isFocused && (
        <div className="sb-search">
          <svg viewBox="0 0 16 16" fill="none" className="sb-search-icon">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" opacity=".6"/>
            <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".6"/>
          </svg>
          <input
            type="text"
            className="sb-search-input"
            placeholder="Search modules…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="sb-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">×</button>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="nav">
        {visibleItems.length === 0 && (
          <div className="sb-no-results">No modules found</div>
        )}
        {visibleItems.map((item, idx) => {
          if (item.section) {
            return <div key={`sec-${idx}`} className="nav-sec">{item.section}</div>;
          }
          const dynBadge = dynBadges[item.id];
          const badge    = dynBadge ?? item.badge;
          const badgeCls = dynBadge
            ? (item.id === 'inventory' || item.id === 'deadstock' || item.id === 'finance' ? 'nb-r' : 'nb-a')
            : item.badgeClass;
          return (
            <button
              key={item.id}
              className={`ni${activeView === item.id ? ' active' : ''}${item.id === 'chatbot' ? ' ai-available' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              {item.icon}
              {item.label}
              {badge && <span className={`nb ${badgeCls}`}>{badge}</span>}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="sf">
        <SidebarFooter dbStatus={dbStatus} />
        <div className="sf-version">InvenIQ v3.7 · June 2026</div>
      </div>
    </nav>
  );
}
