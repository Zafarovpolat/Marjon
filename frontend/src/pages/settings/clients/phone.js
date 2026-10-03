// Uzbek phone input assistance for counterparty forms (clients-only).
// Pure formatting: no backend uniqueness claims, no validation authority.
// The server stores a free-form string; we send a normalized value or null.
import { formatLocalUZ } from "../../staff/staffPhone";

export function phoneDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function hasPlus(raw) {
  return String(raw || "").trim().startsWith("+");
}

// Value kept in form state while typing: digits, preserving a leading "+"
// marker so international numbers are never corrupted into Uzbek ones.
export function parsePhoneInput(raw) {
  const digits = phoneDigits(raw);
  if (!digits) return "";
  return hasPlus(raw) ? `+${digits}` : digits;
}

// Canonical payload value: blank -> null; 9 local digits -> +998...;
// 12-digit 998... -> +...; explicit "+" kept; anything else passes through.
export function normalizePhoneForPayload(stored) {
  const value = String(stored || "").trim();
  if (!value) return null;
  if (value.startsWith("+")) return value;
  if (/^\d{9}$/.test(value)) return `+998${value}`;
  if (/^998\d{9}$/.test(value)) return `+${value}`;
  return value;
}

// Display value: "+998 XX XXX XX XX" for canonical Uzbek numbers,
// everything else untouched.
export function formatPhoneDisplay(stored) {
  const value = String(stored || "");
  const match = value.match(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/);
  if (match) return `+998 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
  return value;
}

// MAIN-TABLE display only: canonical Uzbek "+998XXXXXXXXX" renders as
// "+998 (XX) XXX-XX-XX" using the Staff local mask. Anything else passes
// through byte-identical — legacy/international values are never forced
// into Uzbek shape. NEVER used for form state, payloads, or search:
// the table search and the edit form always see the raw canonical value.
export function formatTablePhone(stored) {
  const text = String(stored || "");
  if (!text) return text;
  const digits = text.replace(/\D/g, "");
  if (!/^998\d{9}$/.test(digits)) return text;
  return `+998 ${formatLocalUZ(digits.slice(3))}`;
}
