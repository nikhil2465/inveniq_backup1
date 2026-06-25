import React from 'react';

/**
 * DataSourceBadge — shows LIVE DATA indicator when MySQL is connected.
 * In demo/sample mode returns null (no badge shown — clean UI).
 * Props:
 *   source   : "mysql" | "live" | "mock" | "demo"  (default "mock")
 *   updatedAt: ISO string or null — shows "Updated Xs ago" when live
 */
export default function DataSourceBadge({ source = 'mock', updatedAt = null }) {
  const isLive = source === 'mysql' || source === 'live';

  const elapsed = React.useMemo(() => {
    if (!updatedAt || !isLive) return null;
    const diff = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }, [updatedAt, isLive]);

  if (!isLive) return null;

  return (
    <span className="dsb dsb-live">
      <span className="dsb-dot" />
      Live Data
      {elapsed && <span className="dsb-ts">{elapsed}</span>}
    </span>
  );
}
