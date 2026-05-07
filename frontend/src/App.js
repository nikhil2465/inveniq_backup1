import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import PageLoader from './components/PageLoader';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/Toast';

// Lazy-loaded views — each chunk only loads when first navigated to,
// reducing the initial JS bundle from ~2 MB to ~200 KB.
const Overview          = lazy(() => import('./views/Overview'));
const Inventory         = lazy(() => import('./views/Inventory'));
const DeadStock         = lazy(() => import('./views/DeadStock'));
const Inward            = lazy(() => import('./views/Inward'));
const Sales             = lazy(() => import('./views/Sales'));
const Customers         = lazy(() => import('./views/Customers'));
const Orders            = lazy(() => import('./views/Orders'));
const Procurement       = lazy(() => import('./views/Procurement'));
const POGRN             = lazy(() => import('./views/POGRN'));
const Freight           = lazy(() => import('./views/Freight'));
const Finance           = lazy(() => import('./views/Finance'));
const Demand            = lazy(() => import('./views/Demand'));
const AIAssistant       = lazy(() => import('./views/AIAssistant'));
const DistributorDiscount = lazy(() => import('./views/DistributorDiscount'));
const SalesOrders       = lazy(() => import('./views/SalesOrders'));
const CustomerClaims    = lazy(() => import('./views/CustomerClaims'));
const Analytics         = lazy(() => import('./views/Analytics'));
const ProductCatalog    = lazy(() => import('./views/ProductCatalog'));
const ProjectTracker    = lazy(() => import('./views/ProjectTracker'));
const QuoteBuilder      = lazy(() => import('./views/QuoteBuilder'));
const About             = lazy(() => import('./views/About'));
const Settings          = lazy(() => import('./views/Settings'));
const CreditManagement  = lazy(() => import('./views/CreditManagement'));
const CounterPOS        = lazy(() => import('./views/CounterPOS'));
const SchemeManagement  = lazy(() => import('./views/SchemeManagement'));

const VIEW_TITLES = {
  credit:      'Credit Management — Limits · Overdue · PDC Tracking',
  pos:         'Counter POS — Walk-In Sales & Fast Billing',
  overview:    'Business Overview — AI Intelligence Dashboard',
  inventory:   'Stock Intelligence — AI Inventory Analysis',
  deadstock:   'Dead Stock & Ageing — Cash Recovery Plan',
  inward:      'Inward & Outward — Stock Movement Intelligence',
  sales:       'Sales Performance — Revenue & Margin Intelligence',
  customers:   'Customer Intelligence — Know Every Account',
  orders:      'Orders & Fulfilment Intelligence',
  claims:      'Customer Claims & Rebate Management — Volume · Accrual · Lumpsum',
  procurement: 'Supplier & Procurement Intelligence',
  pogrn:       'PO & GRN — End-to-End Procurement Lifecycle',
  freight:     'Freight Planning — AI-Optimized Logistics',
  finance:     'Profitability & Cash Intelligence — Owner View',
  demand:      'Demand Forecasting — What Will Sell Next?',
  chatbot:     'InvenIQ AI — Ask Anything About Your Business',
  discounts:   'Distributor Discount Calculator — Smart Pricing with Margin Guardrails',
  louvers:     'Sales Orders — Orders, Claims & Rebates Management',
  analytics:   'Analytics & Business Intelligence — Full Business View',
  catalog:     'Product Catalog — Louvers · Laminates · ACP · Cladding',
  projects:    'Project Tracker — Full Pipeline from Inquiry to Invoice',
  quotes:      'Quotation Builder — AI-Powered Professional Quotes',
  about:       'About InvenIQ — AI Inventory Intelligence Platform',
  settings:    'Settings & System Status — Configuration · Health · Module Registry',
  schemes:     'Scheme Management — Promotions · Targets · Accruals',
};

export default function App() {
  const [activeView, setActiveView]             = useState('overview');
  const [period, setPeriod]                     = useState('Today');
  const [pendingChatQuery, setPendingChatQuery] = useState('');
  const [dbStatus, setDbStatus]                 = useState({ status: 'checking', source: null, checkedAt: null });
  const [alerts, setAlerts]                     = useState([]);
  const [sidebarOpen, setSidebarOpen]           = useState(false);

  // Restore saved theme preference on load
  useEffect(() => {
    const saved = localStorage.getItem('inviq-theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark-mode');
    } else if (saved === 'light') {
      document.documentElement.classList.add('light-mode');
    }
  }, []);

  // Poll /api/health every 60 s to know if MySQL is live or demo mode
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8_000);
      try {
        const res = await fetch('/api/health', { signal: ctrl.signal });
        if (!res.ok) throw new Error('non-2xx');
        const data = await res.json();
        if (!cancelled) {
          setDbStatus({
            status: data.mysql_connected ? 'live' : 'demo',
            source: data.data_source || 'mock',
            checkedAt: new Date().toISOString(),
          });
        }
      } catch {
        if (!cancelled) {
          setDbStatus({ status: 'demo', source: 'mock', checkedAt: new Date().toISOString() });
        }
      } finally {
        clearTimeout(timer);
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Poll /api/alerts every 5 min for notification bell
  useEffect(() => {
    let cancelled = false;
    const fetchAlerts = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8_000);
      try {
        const res = await fetch('/api/alerts', { signal: ctrl.signal });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setAlerts(data.alerts || []);
        }
      } catch { /* non-fatal */ } finally {
        clearTimeout(timer);
      }
    };
    fetchAlerts();
    const id = setInterval(fetchAlerts, 5 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Scroll main content back to top whenever the user navigates to a new view
  useEffect(() => {
    const el = document.querySelector('.main');
    if (el) el.scrollTop = 0;
  }, [activeView]);

  const goChat = useCallback((query) => {
    setPendingChatQuery(query);
    setActiveView('chatbot');
  }, []);

  const clearPendingQuery = useCallback(() => setPendingChatQuery(''), []);

  return (
    <div>
      {/* Mobile sidebar backdrop */}
      <div
        className={`sidebar-overlay${sidebarOpen ? ' visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar
        activeView={activeView}
        onNavigate={(v) => { setActiveView(v); setSidebarOpen(false); }}
        dbStatus={dbStatus}
        isOpen={sidebarOpen}
      />
      <Topbar
        title={VIEW_TITLES[activeView] || 'InvenIQ — Enterprise Inventory Intelligence'}
        period={period}
        onPeriodChange={setPeriod}
        alerts={alerts}
        onGoChat={goChat}
        onNavigate={setActiveView}
        dbStatus={dbStatus}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
      />
      <ToastContainer />
      <main className="main">
        <Suspense fallback={<PageLoader />}>
          <ErrorBoundary key={activeView} onReset={() => setActiveView('overview')}>
            {activeView === 'overview'    && <Overview     onGoChat={goChat} dbStatus={dbStatus} onNavigate={setActiveView} period={period} />}
            {activeView === 'inventory'   && <Inventory    onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'deadstock'   && <DeadStock    onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'inward'      && <Inward       onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'sales'       && <Sales        onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'customers'   && <Customers    onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'orders'      && <Orders       onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'claims'      && <CustomerClaims onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'procurement' && <Procurement  onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'pogrn'       && <POGRN        onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'freight'     && <Freight      onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'finance'     && <Finance      onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'demand'      && <Demand       onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'chatbot'     && (
              <AIAssistant
                pendingQuery={pendingChatQuery}
                onPendingQueryConsumed={clearPendingQuery}
                dbStatus={dbStatus}
              />
            )}
            {activeView === 'discounts'   && <DistributorDiscount onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'louvers'     && <SalesOrders         onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'analytics'   && <Analytics           onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'catalog'     && <ProductCatalog      onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'projects'    && <ProjectTracker      onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'quotes'      && <QuoteBuilder        onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'credit'      && <CreditManagement  onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'pos'         && <CounterPOS        onGoChat={goChat} dbStatus={dbStatus} />}
            {activeView === 'schemes'     && <SchemeManagement  onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'about'       && <About onGoChat={goChat} />}
            {activeView === 'settings'    && <Settings onNavigate={setActiveView} dbStatus={dbStatus} />}
          </ErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}
