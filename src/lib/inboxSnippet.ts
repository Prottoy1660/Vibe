/**
 * Normalize Adobe / IMAP plain-text bodies for inbox preview (strip rule lines, ADOBE banners, etc.).
 */

function isJunkLine(t: string): boolean {
  if (!t.trim()) return true;
  if (t.length >= 8 && /^[\s\-_=.*─═~·•…]+$/u.test(t)) return true;
  if (/^ADOBE\s*[,.\-─═_\s…]+$/i.test(t)) return true;
  if (/^ADOBE$/i.test(t)) return true;
  const alnum = (t.match(/[a-zA-Z0-9]/g) || []).length;
  if (t.length > 20 && alnum / t.length < 0.12) return true;
  return false;
}

/** First contiguous 6-digit code, or 6 digits separated by spaces/newlines. */
export function extractAdobeVerificationCode(text: string): string | null {
  if (!text) return null;
  const direct = text.match(/\b\d{6}\b/);
  if (direct) return direct[0];
  const spaced = text.match(/(?<!\d)(?:\d[\s\u00a0]*){5}\d(?!\d)/);
  if (spaced) return spaced[0].replace(/\D/g, '');
  return null;
}

export function buildInboxSnippetFromBody(text: string, maxLen = 220, stripSixDigitCode?: string | null): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const good: string[] = [];
  for (const t of lines) {
    if (isJunkLine(t)) continue;
    good.push(t);
  }
  let s = good.join(' ').replace(/\s+/g, ' ').trim();
  if (stripSixDigitCode && /^\d{6}$/.test(stripSixDigitCode)) {
    s = s
      .replace(new RegExp(`\\b${stripSixDigitCode}\\b`, 'g'), ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (!s) return '';
  if (s.length > maxLen) {
    s = s.slice(0, maxLen - 1).trimEnd();
    const lastSpace = s.lastIndexOf(' ');
    if (lastSpace > maxLen * 0.55) s = s.slice(0, lastSpace);
    return `${s}…`;
  }
  return s;
}
