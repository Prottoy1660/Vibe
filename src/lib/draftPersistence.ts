type PersistedDraft =
  | { kind: 'value'; value: string; at: number }
  | { kind: 'checked'; checked: boolean; at: number };

const STORAGE_PREFIX = 'vibe:draft:v1:';
const MAX_VALUE_LEN = 50_000;

function safeSessionStorageGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionStorageSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore quota/private mode issues
  }
}

function safeSessionStorageRemove(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function getPagePrefix(pageId: string) {
  return `${STORAGE_PREFIX}${pageId}::`;
}

function isTextLikeInput(el: HTMLInputElement) {
  const t = (el.type || 'text').toLowerCase();
  return (
    t === 'text' ||
    t === 'search' ||
    t === 'email' ||
    t === 'tel' ||
    t === 'url' ||
    t === 'number' ||
    t === 'date' ||
    t === 'datetime-local' ||
    t === 'month' ||
    t === 'time' ||
    t === 'week'
  );
}

function shouldPersistElement(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute('data-draft-persist') && el.getAttribute('data-draft-persist') === 'false') return false;

  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;

  const t = (el.type || 'text').toLowerCase();
  if (t === 'password' || t === 'file' || t === 'hidden') return false;
  if (t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return false;
  if (t === 'radio') return false;
  if (t === 'checkbox') return true;
  return isTextLikeInput(el);
}

function elementKey(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  if (el.id) return `id:${el.id}`;
  const name = (el as any).name as string | undefined;
  if (name) return `name:${name}`;
  const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
  if (aria) return `aria:${aria}`;
  const placeholder = (el as any).placeholder as string | undefined;
  if (placeholder) return `ph:${placeholder}`;

  const tag = el.tagName.toLowerCase();
  const type = el instanceof HTMLInputElement ? (el.type || 'text').toLowerCase() : '';
  const selector =
    tag === 'input' ? `input[type="${CSS.escape(type || 'text')}"]` : tag;
  const all = Array.from(document.querySelectorAll(selector)).filter((n) => n instanceof HTMLElement);
  const idx = all.indexOf(el as any);
  return `fallback:${tag}:${type}:${idx}`;
}

function readDraft(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): PersistedDraft | null {
  if (el instanceof HTMLInputElement && (el.type || '').toLowerCase() === 'checkbox') {
    return { kind: 'checked', checked: el.checked, at: Date.now() };
  }
  return { kind: 'value', value: (el as any).value ?? '', at: Date.now() };
}

function applyDraft(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, draft: PersistedDraft) {
  if (draft.kind === 'checked') {
    if (el instanceof HTMLInputElement && (el.type || '').toLowerCase() === 'checkbox') {
      el.checked = Boolean(draft.checked);
    }
  } else {
    (el as any).value = draft.value ?? '';
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function parseDraft(raw: string): PersistedDraft | null {
  try {
    const d = JSON.parse(raw) as PersistedDraft;
    if (!d || typeof d !== 'object') return null;
    if ((d as any).kind === 'value' && typeof (d as any).value === 'string') return d;
    if ((d as any).kind === 'checked' && typeof (d as any).checked === 'boolean') return d;
    return null;
  } catch {
    return null;
  }
}

export function restoreDraftsForPage(pageId: string) {
  if (typeof window === 'undefined') return;
  const prefix = getPagePrefix(pageId);
  let keys: string[] = [];
  try {
    keys = Object.keys(window.sessionStorage).filter((k) => k.startsWith(prefix));
  } catch {
    return;
  }

  for (const storageKey of keys) {
    const raw = safeSessionStorageGet(storageKey);
    if (!raw) continue;
    const draft = parseDraft(raw);
    if (!draft) {
      safeSessionStorageRemove(storageKey);
      continue;
    }

    const fieldKey = storageKey.slice(prefix.length);
    let el: Element | null = null;

    if (fieldKey.startsWith('id:')) {
      const id = fieldKey.slice('id:'.length);
      el = document.getElementById(id);
    } else if (fieldKey.startsWith('name:')) {
      const name = fieldKey.slice('name:'.length);
      el = document.querySelector(`[name="${CSS.escape(name)}"]`);
    }

    if (!el) continue;
    if (!shouldPersistElement(el)) continue;
    applyDraft(el, draft);
  }
}

export function enableDraftPersistence(pageId: string) {
  if (typeof window === 'undefined') return () => {};
  const pagePrefix = getPagePrefix(pageId);

  const onAnyInput = (evt: Event) => {
    const t = evt.target;
    if (!(t instanceof Element)) return;
    if (!shouldPersistElement(t)) return;

    const draft = readDraft(t);
    if (draft.kind === 'value') {
      if ((draft.value || '').length === 0) {
        safeSessionStorageRemove(pagePrefix + elementKey(t));
        return;
      }
      if ((draft.value || '').length > MAX_VALUE_LEN) return;
    }

    safeSessionStorageSet(pagePrefix + elementKey(t), JSON.stringify(draft));
  };

  // capture=true so we catch updates even if components stopPropagation
  document.addEventListener('input', onAnyInput, true);
  document.addEventListener('change', onAnyInput, true);

  // restore after mount/route paint
  const t = window.setTimeout(() => restoreDraftsForPage(pageId), 0);

  return () => {
    window.clearTimeout(t);
    document.removeEventListener('input', onAnyInput, true);
    document.removeEventListener('change', onAnyInput, true);
  };
}

