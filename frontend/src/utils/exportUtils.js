/**
 * Export Utilities — CSV download + future Excel support
 * Usage: exportToCsv(rows, columns, 'filename')
 *
 * columns: [{ key: 'sku', label: 'SKU' }, { key: 'value', label: 'Value' }, ...]
 * rows: array of objects matching column keys
 */

function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCsv(rows, columns, filename = 'export') {
  const header = columns.map(c => escapeCsvCell(c.label)).join(',');
  const body = rows.map(row =>
    columns.map(c => escapeCsvCell(row[c.key])).join(',')
  ).join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ExportButton({ rows, columns, filename, label = 'Export CSV', className = '' }) {
  if (!rows?.length) return null;
  return (
    <button
      className={`btn-export ${className}`}
      onClick={() => exportToCsv(rows, columns, filename)}
      title="Download as CSV"
    >
      <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
        <path d="M8 2v9M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      {label}
    </button>
  );
}
