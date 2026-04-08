import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';

type DraftPayload = {
  v: 1;
  at: number;
  url: string;
  scrollY: number;
  fields: Record<string, unknown>;
};

const STORAGE_PREFIX = 'vibe:draft:';
const MAX_FIELDS = 120;
const SAVE_DEBOUNCE_MS = 250;

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function fieldKey(el: Element): string | null {
  if (!(el instanceof HTMLElement)) return null;
  const id = el.getAttribute('id') || '';
  const name = el.getAttribute('name') || '';
  const aria = el.getAttribute('aria-label') || '';
  const dataKey = el.getAttribute('data-draft-key') || '';
  const key = dataKey || id || name || aria;
  if (!key) return null;
  // Make keys stable & short.
  return key.slice(0, 160);
}

function isSensitiveInput(el: HTMLInputElement): boolean {
  const t = (el.type || '').toLowerCase();
  if (t === 'password') return true;
  if (t === 'file') return true;
  return false;
}

function collectDraft(root: Document, url: string): DraftPayload {
  const fields: Record<string, unknown> = {};
  const elems = Array.from(root.querySelectorAll('input, textarea, select'));

  for (const el of elems) {
    const k = fieldKey(el);
    if (!k) continue;
    if (Object.keys(fields).length >= MAX_FIELDS) break;

    if (el instanceof HTMLInputElement) {
      if (isSensitiveInput(el)) continue;
      const type = (el.type || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') fields[k] = Boolean(el.checked);
      else fields[k] = el.value;
      continue;
    }
    if (el instanceof HTMLTextAreaElement) {
      fields[k] = el.value;
      continue;
    }
    if (el instanceof HTMLSelectElement) {
      fields[k] = el.value;
    }
  }

  return {
    v: 1,
    at: Date.now(),
    url,
    scrollY: typeof window !== 'undefined' ? window.scrollY || 0 : 0,
    fields,
  };
}

function applyDraft(root: Document, draft: DraftPayload) {
  // Restore scroll first (after a tick so layout is ready).
  window.setTimeout(() => {
    try {
      window.scrollTo({ top: Math.max(0, draft.scrollY || 0), behavior: 'instant' as ScrollBehavior });
    } catch {
      window.scrollTo(0, Math.max(0, draft.scrollY || 0));
    }
  }, 0);

  for (const [k, v] of Object.entries(draft.fields || {})) {
    const selector = `[data-draft-key="${CSS.escape(k)}"], #${CSS.escape(k)}, [name="${CSS.escape(k)}"], [aria-label="${CSS.escape(k)}"]`;
    const el = root.querySelector(selector);
    if (!el) continue;

    if (el instanceof HTMLInputElement) {
      if (isSensitiveInput(el)) continue;
      const type = (el.type || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        if (typeof v === 'boolean') el.checked = v;
      } else if (typeof v === 'string') {
        el.value = v;
      }
      continue;
    }
    if (el instanceof HTMLTextAreaElement) {
      if (typeof v === 'string') el.value = v;
      continue;
    }
    if (el instanceof HTMLSelectElement) {
      if (typeof v === 'string') el.value = v;
    }
  }
}

/**
 * Best-effort draft persistence across real reloads / tab discards.
 * Saves inputs when the tab is hidden and restores on mount.
 */
export function PageDraftBridge() {
  const location = useLocation();
  const url = useMemo(() => `${location.pathname}${location.search}${location.hash}`, [location]);
  const storageKey = useMemo(() => `${STORAGE_PREFIX}${url}`, [url]);
  const lastSavedUrlRef = useRef<string>('');
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Restore draft for this exact URL.
    const draft = safeJsonParse<DraftPayload>(sessionStorage.getItem(storageKey));
    if (draft?.v === 1 && draft.url === url) {
      applyDraft(document, draft);
    }
  }, [storageKey, url]);

  useEffect(() => {
    const scheduleSave = () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        try {
          const payload = collectDraft(document, url);
          sessionStorage.setItem(storageKey, JSON.stringify(payload));
          lastSavedUrlRef.current = url;
        } catch {
          // ignore
        }
      }, SAVE_DEBOUNCE_MS);
    };

    const passiveOpts: AddEventListenerOptions = { passive: true };

    const onVisibility = () => {
      if (document.hidden) scheduleSave();
    };

    const onPageHide = () => scheduleSave();

    // Capture frequent changes with low overhead.
    const onInput = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (!t.closest('input, textarea, select')) return;
      scheduleSave();
    };

    document.addEventListener('visibilitychange', onVisibility, passiveOpts);
    window.addEventListener('pagehide', onPageHide, passiveOpts);
    document.addEventListener('input', onInput, passiveOpts);
    document.addEventListener('change', onInput, passiveOpts);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility, passiveOpts);
      window.removeEventListener('pagehide', onPageHide, passiveOpts);
      document.removeEventListener('input', onInput, passiveOpts);
      document.removeEventListener('change', onInput, passiveOpts);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

      // If user navigated away inside SPA, don't let previous page drafts pollute current page.
      if (lastSavedUrlRef.current && lastSavedUrlRef.current !== url) {
        // noop (we keep drafts per-url)
      }
    };
  }, [storageKey, url]);

  return null;
}

