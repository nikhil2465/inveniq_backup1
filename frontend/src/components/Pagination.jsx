import React from 'react';

export default function Pagination({ page, total, pageSize, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const pages = [];
  const delta = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }

  const start = (page - 1) * pageSize + 1;
  const end   = Math.min(page * pageSize, total);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px 2px', flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
        {start}–{end} of {total} records
      </span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          style={btnStyle(page === 1)}
        >
          ‹ Prev
        </button>
        {pages.map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--text3)', fontSize: 12 }}>…</span>
            : <button
                key={p}
                onClick={() => onChange(p)}
                style={btnStyle(false, p === page)}
              >
                {p}
              </button>
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          style={btnStyle(page === totalPages)}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

function btnStyle(disabled, active) {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    border: active ? '1px solid var(--green)' : '1px solid var(--border)',
    background: active ? 'var(--g4)' : 'var(--surface2)',
    color: active ? 'var(--green)' : disabled ? 'var(--text3)' : 'var(--text)',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    fontWeight: active ? 700 : 400,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background .12s',
  };
}
