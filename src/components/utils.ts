import clsx from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: any[]) {
  return twMerge(clsx(...inputs));
}

// Format a Date (or date-like) to 12-hour clock with minutes, e.g. 3:05 PM
export function formatTime12h(value: Date | string | number | null | undefined) {
  if (value == null) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Format phone number to (XXX) XXX-XXXX as user types (US/Canada NANP). Non-digits removed.
export function formatPhone(raw: string | null | undefined) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '').slice(0,10);
  const len = digits.length;
  if (len === 0) return '';
  if (len < 4) return `(${digits}`;
  if (len < 7) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}
