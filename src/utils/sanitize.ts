/**
 * Input sanitization: strip dangerous control characters, enforce lengths,
 * and escape HTML for non-React outputs (e.g. email templates).
 */

export const LIMITS = {
  title: 200,
  description: 8000,
  search: 500,
  chatMessage: 4000,
  displayName: 100,
  phone: 32,
  bio: 2000,
  notificationTitle: 200,
  notificationMessage: 4000,
  reporterName: 100,
  aiTag: 80,
  firestoreDocId: 128,
  imageUrl: 12_000_000,
} as const;

/** C0/C1 controls excluding Tab, LF, CR when multiline is true */
const CTRL_SINGLELINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const CTRL_MULTILINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function stripNullBytes(value: string): string {
  return value.replace(/\u0000/g, '');
}

function stripControlChars(value: string, multiline: boolean): string {
  return value.replace(multiline ? CTRL_MULTILINE : CTRL_SINGLELINE, '');
}

/**
 * Sanitize plain text for storage. Trims by default.
 */
export function sanitizePlainText(
  value: string,
  maxLength: number,
  options: { multiline?: boolean; trim?: boolean } = {}
): string {
  const multiline = options.multiline ?? false;
  const trim = options.trim ?? true;
  let s = stripControlChars(stripNullBytes(String(value ?? '')), multiline);
  if (trim) s = s.trim();
  if (s.length > maxLength) s = s.slice(0, maxLength);
  return s;
}

/** Search bar / header query: single-line, cap length; trim optional for live typing */
export function sanitizeSearchInput(value: string, trim = false): string {
  let s = stripControlChars(stripNullBytes(String(value ?? '')), false);
  if (trim) s = s.trim();
  if (s.length > LIMITS.search) s = s.slice(0, LIMITS.search);
  return s;
}

/** Firestore document id pasted into chat "item id" field */
export function sanitizeFirestoreDocId(value: string): string {
  let s = stripNullBytes(String(value ?? '')).replace(/\//g, '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  s = s.trim();
  if (s.length > LIMITS.firestoreDocId) s = s.slice(0, LIMITS.firestoreDocId);
  return s;
}

export function sanitizePhoneInput(value: string): string {
  let s = stripControlChars(stripNullBytes(String(value ?? '')), false);
  if (s.length > LIMITS.phone) s = s.slice(0, LIMITS.phone);
  return s.trim();
}

export function sanitizeEmailInput(value: string): string {
  let s = stripControlChars(stripNullBytes(String(value ?? '')), false).trim();
  if (s.length > 254) s = s.slice(0, 254);
  return s;
}

/** Large data URLs / URLs stored on items: only remove nulls and cap size */
export function sanitizeImageUrlField(value: string): string {
  return stripNullBytes(String(value ?? '')).slice(0, LIMITS.imageUrl);
}

/** Escape text embedded in HTML email bodies */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
