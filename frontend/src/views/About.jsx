import React from 'react';

const Stat = ({ value, label, color }) => (
  <div style={{ textAlign:'center', padding:'20px 16px' }}>
    <div style={{ fontSize:32, fontWeight:800, color: color || 'var(--b2)', fontFamily:'var(--mono)', lineHeight:1 }}>{value}</div>
    <div style={{ fontSize:12, color:'var(--text3)', marginTop:6, fontWeight:600 }}>{label}</div>
  </div>
);

const Feature = ({ icon, title, desc, color }) => (
  <div style={{ padding:'16px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, borderTop:`3px solid ${color}` }}>
    <div style={{ fontSize:24, marginBottom:8 }}>{icon}</div>
    <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>{title}</div>
    <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.7 }}>{desc}</div>
  </div>
);

const Step = ({ n, title, desc, icon }) => (
  <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
    <div style={{ width:40, height:40, borderRadius:20, background:'var(--b2)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:18, flexShrink:0, boxShadow:'0 4px 12px var(--b2)44' }}>{n}</div>
    <div>
      <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{icon} {title}</div>
      <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.7 }}>{desc}</div>
    </div>
  </div>
);

export default function About({ onGoChat }) {
  return (
    <div className="view">
      {/* ── HERO ── */}
      <div style={{ textAlign:'center', padding:'32px 24px 24px', borderRadius:16, background:'linear-gradient(135deg, var(--b3) 0%, var(--bg2) 100%)', border:'1px solid var(--b4)', marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--b2)', letterSpacing:2, textTransform:'uppercase', marginBottom:12, fontFamily:'var(--mono)' }}>
          AI-POWERED INVENTORY INTELLIGENCE
        </div>
        <div style={{ fontSize:36, fontWeight:800, color:'var(--text)', lineHeight:1.2, marginBottom:12 }}>
          InvenIQ — Know Your Business<br />
          <span style={{ color:'var(--b2)' }}>Before the Numbers Tell You</span>
        </div>
        <div style={{ fontSize:15, color:'var(--text2)', maxWidth:560, margin:'0 auto 24px', lineHeight:1.7 }}>
          A complete AI intelligence layer for dealers and distributors. Turn raw inventory, sales, and procurement data into clear decisions — instantly.
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
          {[['22 Intelligence Modules','var(--b2)'],['AI Chat + WhatsApp Scanner','#10a37f'],['GPT-4o Powered','#8b5cf6'],['Works Without Database','#f59e0b']].map(([t,c])=>(
            <span key={t} style={{ padding:'8px 16px', borderRadius:20, fontSize:12, fontWeight:700, background:c+'22', border:`1px solid ${c}55`, color:c }}>{t}</span>
          ))}
        </div>
      </div>

      {/* ── STATS ── */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', borderBottom:'1px solid var(--border)' }}>
          <Stat value="22" label="Intelligence Modules" color="var(--b2)" />
          <Stat value="16" label="AI Data Tools" color="#10b981" />
          <Stat value="3" label="Chat Modes (Ask/Explain/Act)" color="#8b5cf6" />
          <Stat value="67+" label="API Endpoints" color="#0ea5e9" />
          <Stat value="13" label="Knowledge Base Topics" color="#f59e0b" />
          <Stat value="0" label="Setup Time (Demo Mode)" color="#10b981" />
        </div>
        <div style={{ padding:'12px 16px', textAlign:'center', fontSize:12, color:'var(--text3)' }}>
          Built for louvers, laminates & building materials dealers in India. Adaptable to any product distribution business.
        </div>
      </div>

      {/* ── PROBLEM ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
        <div style={{ padding:'20px', background:'var(--r3)', border:'1px solid var(--r4)', borderRadius:12 }}>
          <div style={{ fontSize:24, marginBottom:10 }}>😰</div>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:12, color:'var(--red)' }}>The Problem Dealers Face Every Day</div>
          {['Stock-outs costing ₹ lakhs with no early warning','"Which product is actually making me money?" — unknown',
            'Overdue payments sitting unnoticed in spreadsheets','Supplier delays discovered only after customers complain',
            'Dead stock tying up cash — no recovery plan','Demand planning done by gut feel, not data'].map(p=>(
            <div key={p} style={{ display:'flex', gap:8, marginBottom:8, fontSize:13, color:'var(--text2)', alignItems:'flex-start' }}>
              <span style={{ color:'var(--red)', fontWeight:700, flexShrink:0 }}>✗</span>{p}
            </div>
          ))}
        </div>
        <div style={{ padding:'20px', background:'var(--g3)', border:'1px solid var(--g4)', borderRadius:12 }}>
          <div style={{ fontSize:24, marginBottom:10 }}>✅</div>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:12, color:'var(--green)' }}>What InvenIQ Changes</div>
          {['AI flags stock-outs 7 days before they happen','Margin by product, grade, and customer — live',
            'Overdue receivables ranked by amount with follow-up drafts','Supplier scorecards: on-time %, lead time, GRN match rate',
            'Dead stock identified with recovery plan and ₹ value locked','30/60/90-day demand forecasts with SURGE/DEAD signals'].map(p=>(
            <div key={p} style={{ display:'flex', gap:8, marginBottom:8, fontSize:13, color:'var(--text2)', alignItems:'flex-start' }}>
              <span style={{ color:'var(--green)', fontWeight:700, flexShrink:0 }}>✓</span>{p}
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURES ── */}
      <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.8px', fontFamily:'var(--mono)', marginBottom:10 }}>
        22 Intelligence Modules
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:10, marginBottom:16 }}>
        {[
          { icon:'📊', title:'Business Overview', desc:'One-page snapshot: revenue, margin, dead stock, at-risk customers, and 12-month revenue trend chart.', color:'var(--b2)' },
          { icon:'📈', title:'Analytics & BI', desc:'12-month revenue trend, category breakdown, top products by margin, customer LTV, supplier scorecards.', color:'#10b981' },
          { icon:'📦', title:'Stock Intelligence', desc:'Every SKU ranked by health. Critical low-stock alerts. Dead vs. moving stock split. Godown-wise breakdown.', color:'#0ea5e9' },
          { icon:'💀', title:'Dead Stock & Ageing', desc:'Inventory aged >90 days. ₹ value locked. AI suggests liquidation strategy (discount, bundle, return).', color:'#dc2626' },
          { icon:'🚪', title:'Inward & Outward', desc:'Full GRN pipeline from receiving to put-away. Shrinkage detection. Dispatch velocity. QC pass rates.', color:'#10b981' },
          { icon:'🔮', title:'Demand Forecasting', desc:'AI forecasts per SKU for next 30/60/90 days. SURGE, GROWING, STABLE, DEAD signals.', color:'var(--b2)' },
          { icon:'🏭', title:'Supplier & Procurement', desc:'Supplier scorecards: on-time %, lead time, GRN match rate, price vs. market. AI recommendation.', color:'#14b8a6' },
          { icon:'📑', title:'PO & GRN', desc:'Full purchase order lifecycle. Goods receipt matching. 3-way match discrepancy log with AI RCA.', color:'#ec4899' },
          { icon:'🗂️', title:'Product Catalog', desc:'Full catalog of louvers, laminates, ACP, and operable systems with sell/buy pricing and specifications.', color:'#8b5cf6' },
          { icon:'👥', title:'Customer Intelligence', desc:'Every account: segment, outstanding, days since last order, credit risk score, and churn probability.', color:'#8b5cf6' },
          { icon:'📋', title:'Sales Orders', desc:'Full sales order lifecycle with AI delay detection, email notifications, claims, and rebate management.', color:'#6366f1' },
          { icon:'📬', title:'Orders & Fulfilment', desc:'Today\'s orders, dispatched, pending. Delay analysis. Fulfilment SLA. Order trend by week.', color:'#f59e0b' },
          { icon:'🚚', title:'Freight Planning', desc:'Lane-wise cost per sheet. Vehicle fill rates. Route optimization. Inbound vs. outbound cost.', color:'#f97316' },
          { icon:'📉', title:'Sales Performance', desc:'12-month revenue trend. Margin by SKU. Day-of-week patterns. MTD vs. target comparison.', color:'#f59e0b' },
          { icon:'🧾', title:'Claims & Rebates', desc:'Distributor claims lifecycle. Volume, accrual, and lumpsum rebate programs with real-time calculation.', color:'#22c55e' },
          { icon:'💲', title:'Discount Calculator', desc:'Margin-aware pricing with segment slabs, category overrides, and per-quote margin guardrails.', color:'#10b981' },
          { icon:'🗺️', title:'Project Tracker', desc:'Full inquiry-to-invoice pipeline with milestone tracking, stage updates, and win-rate analysis.', color:'#6366f1' },
          { icon:'📝', title:'Quotation Builder', desc:'Professional quotes with AI win-probability, margin health analysis, and WhatsApp requirement scanner.', color:'#8b5cf6' },
          { icon:'💰', title:'Profitability & Cash', desc:'Owner-level view: gross margin, cash cycle (DIO+DSO-DPO), GST summary, overdue receivables.', color:'#22c55e' },
        ].map(f => <Feature key={f.title} {...f} />)}
      </div>

      {/* ── AI ASSISTANT ── */}
      <div style={{ padding:'24px', background:'linear-gradient(135deg, #0d1117 0%, #161b22 100%)', border:'1px solid #30363d', borderRadius:16, marginBottom:16 }}>
        <div style={{ display:'flex', gap:16, alignItems:'flex-start', flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:240 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#10a37f', letterSpacing:1.5, textTransform:'uppercase', marginBottom:8 }}>AI Assistant — GPT-4o Powered</div>
            <div style={{ fontSize:20, fontWeight:700, color:'#e6edf3', marginBottom:10 }}>Ask Any Business Question in Plain English</div>
            <div style={{ fontSize:13, color:'#8b949e', lineHeight:1.7, marginBottom:16 }}>
              "Which product should I reorder urgently?" · "Why are my margins falling?" · "Draft a payment reminder for Sharma Constructions" · "What is my cash cycle?"
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {[['🔎 Ask','Quick answers'],['🔬 Explain','Deep analysis + RCA'],['⚡ Act','Step-by-step plans']].map(([m,d])=>(
                <div key={m} style={{ padding:'8px 14px', background:'#21262d', border:'1px solid #30363d', borderRadius:8 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#e6edf3' }}>{m}</div>
                  <div style={{ fontSize:10, color:'#8b949e' }}>{d}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding:'16px', background:'#21262d', border:'1px solid #30363d', borderRadius:12, minWidth:260 }}>
            <div style={{ fontSize:11, color:'#8b949e', marginBottom:12, fontWeight:600 }}>Example Questions</div>
            {['Why is 6mm BWP stock critically low?',
              'Show me all overdue payments with amounts',
              'Which supplier has the worst GRN match rate?',
              'Create a PO for 200 sheets of 18mm BWP',
              'What is the EOQ for 12mm MR plywood?',
              'Give me today\'s business briefing'].map(q=>(
              <div key={q} style={{ padding:'6px 10px', background:'#161b22', border:'1px solid #30363d', borderRadius:6, fontSize:11, color:'#c9d1d9', marginBottom:6 }}>
                💬 {q}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="ch"><div className="ctit">How It Works — 3 Simple Steps</div></div>
        <div style={{ display:'flex', flexDirection:'column', gap:20, padding:'8px 0 8px' }}>
          <Step n={1} icon="⚙️" title="Connect Your Data"
            desc="Point InvenIQ to your MySQL database or run it without any database in Demo Mode. All 22 modules show rich data immediately. No complex setup needed — just one .env file." />
          <Step n={2} icon="📊" title="See Everything at a Glance"
            desc="22 intelligence modules cover every aspect of your business: stock health, sales trends, customer risk, supplier performance, cash position, demand forecasts, quotations, and projects — all live." />
          <Step n={3} icon="🤖" title="Ask AI for Answers and Plans"
            desc="Type any question in plain language. The AI reads your live data, finds the root cause of problems, and gives you a step-by-step action plan. No reports, no spreadsheets." />
        </div>
      </div>

      {/* ── WHO IS IT FOR ── */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="ch"><div className="ctit">Who Is InvenIQ For?</div></div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:10, padding:'4px 0 8px' }}>
          {[
            { icon:'🏪', title:'Building Materials Dealers', desc:'Plywood, laminates, hardware — track every SKU and supplier.' },
            { icon:'🏭', title:'Distributors & Stockists', desc:'Multi-godown operations with complex procurement cycles.' },
            { icon:'🔧', title:'Hardware & Sanitary Dealers', desc:'High-SKU count businesses needing intelligent stock control.' },
            { icon:'🏗️', title:'Electrical & Pipes Dealers', desc:'Seasonal demand patterns and supplier lead time management.' },
          ].map(w=>(
            <div key={w.title} style={{ padding:'14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
              <div style={{ fontSize:24, marginBottom:8 }}>{w.icon}</div>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>{w.title}</div>
              <div style={{ fontSize:11, color:'var(--text2)', lineHeight:1.6 }}>{w.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TECH ── */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="ch"><div className="ctit">Built With Modern Technology</div></div>
        <div style={{ padding:'8px 0 4px', display:'flex', gap:8, flexWrap:'wrap' }}>
          {[
            ['React 18','#61DAFB','Frontend UI'],
            ['FastAPI (Python)','#009688','Backend API'],
            ['GPT-4o','#10a37f','AI Engine'],
            ['MySQL 8','#4479A1','Database'],
            ['Chart.js','#FF6384','Data Visualization'],
            ['Server-Sent Events','#f59e0b','Real-time Streaming'],
            ['aiomysql','#3776AB','Async DB Driver'],
            ['OpenAI Function Calling','#8b5cf6','Structured AI Actions'],
          ].map(([name,color,desc])=>(
            <div key={name} style={{ padding:'8px 14px', background:color+'15', border:`1px solid ${color}30`, borderRadius:8, textAlign:'center' }}>
              <div style={{ fontSize:12, fontWeight:700, color }}>{name}</div>
              <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DEMO ── */}
      <div style={{ padding:'24px', background:'var(--g3)', border:'1px solid var(--g4)', borderRadius:16, textAlign:'center', marginBottom:16 }}>
        <div style={{ fontSize:28, marginBottom:10 }}>🎯</div>
        <div style={{ fontWeight:800, fontSize:18, marginBottom:8, color:'var(--green)' }}>Try It Right Now — No Setup Needed</div>
        <div style={{ fontSize:13, color:'var(--text2)', maxWidth:480, margin:'0 auto 16px', lineHeight:1.7 }}>
          InvenIQ runs in Demo Mode out of the box. All 22 modules show realistic sample data for a Bangalore building materials dealer. Click any "Ask AI" button to try the chatbot.
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
          <a href="https://github.com/nikhil2465/ai_chatbot_inventory1" target="_blank" rel="noopener noreferrer"
            style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'10px 20px', background:'#24292e', border:'none', borderRadius:8, fontSize:13, fontWeight:700, color:'#fff', textDecoration:'none' }}>
            ⭐ Star on GitHub
          </a>
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign:'center', padding:'16px', fontSize:11, color:'var(--text3)' }}>
        InvenIQ — AI Inventory Intelligence · Built with React + FastAPI + GPT-4o ·{' '}
        <a href="https://github.com/nikhil2465/ai_chatbot_inventory1" target="_blank" rel="noopener noreferrer" style={{ color:'var(--b2)' }}>
          github.com/nikhil2465/ai_chatbot_inventory1
        </a>
      </div>

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Give me a complete business health check — revenue trends, margins, top risks, and my highest-priority actions for this week.')}>
          <span>✨</span>
          <span>Ask AI: Full business health check & weekly priorities →</span>
        </div>
      )}
    </div>
  );
}
