import React from 'react';

export function SkeletonLine({ className = '', style = {} }) {
  return <div className={`skeleton skeleton-line ${className}`} style={style} />;
}

export function SkeletonKpiGrid({ count = 4 }) {
  return (
    <div className="skeleton-kpi-grid kg" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="kc" style={{ padding: 16, minHeight: 90 }}>
          <SkeletonLine className="sm" style={{ marginBottom: 12, width: '55%' }} />
          <SkeletonLine className="xl" style={{ width: '70%', height: 24, marginBottom: 8 }} />
          <SkeletonLine className="xs" style={{ width: '80%' }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--s3)', display: 'flex', gap: 16 }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="skeleton skeleton-line" style={{ height: 10, flex: i === 0 ? 2 : 1, margin: 0 }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, background: i % 2 === 0 ? 'var(--surface)' : 'var(--s2)' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="skeleton skeleton-line" style={{ height: 10, flex: j === 0 ? 2 : 1, margin: 0 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <SkeletonLine className="lg" style={{ marginBottom: 14 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} className="md" style={{ width: `${85 - i * 10}%`, marginBottom: 8 }} />
      ))}
    </div>
  );
}

export default function SkeletonView({ type = 'full' }) {
  if (type === 'table') return <SkeletonTable />;
  if (type === 'card') return <SkeletonCard />;

  return (
    <div className="view">
      <div className="ph" style={{ marginBottom: 16 }}>
        <div>
          <SkeletonLine className="xl" style={{ width: 240, marginBottom: 8 }} />
          <SkeletonLine className="sm" style={{ width: 320 }} />
        </div>
      </div>
      <SkeletonKpiGrid count={4} />
      <div className="gl g57" style={{ marginTop: 14 }}>
        <SkeletonTable rows={6} cols={5} />
        <SkeletonCard lines={5} />
      </div>
    </div>
  );
}
