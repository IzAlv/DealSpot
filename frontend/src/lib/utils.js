import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Istanbul timezone formatter (UTC+3)
export function toIstanbulTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  const opts = { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
  const formatted = d.toLocaleString('en-GB', opts);
  const h = parseInt(formatted.split(', ')[1]?.split(':')[0] || '0');
  return `${formatted} ${h >= 12 ? 'PM' : 'AM'}`;
}
