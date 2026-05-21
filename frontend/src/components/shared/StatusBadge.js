import { TRADE_STATUS_CONFIG } from '../../lib/constants';

export function StatusBadge({ status }) {
  const config = TRADE_STATUS_CONFIG[status] || { label: status, bg: '#e2e8f0', fg: '#0f172a' };
  return (
    <span
      data-testid={`status-badge-${status}`}
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: config.bg, color: config.fg }}
    >
      {config.label}
    </span>
  );
}
