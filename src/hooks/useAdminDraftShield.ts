import { useEffect } from 'react';

type DraftStore = Record<string, string | boolean>;

function isSupportedField(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    return false;
  }
  if ((el as HTMLElement).dataset.draftIgnore === 'true') return false;
  if (el instanceof HTMLInputElement) {
    if (el.type === 'hidden' || el.type === 'file' || el.type === 'password') return false;
  }
  return true;
}

function elementPath(el: Element, root: HTMLElement): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== root) {
    const parent = current.parentElement;
    if (!parent) break;
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter((x) => x.tagName === current!.tagName);
    const idx = Math.max(0, siblings.indexOf(current));
    parts.push(`${tag}:${idx}`);
    current = parent;
  }
  return parts.reverse().join('>');
}

function keyForElement(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, root: HTMLElement): string {
  if (el.dataset.draftKey) return `data:${el.dataset.draftKey}`;
  if (el.name) return `name:${el.name}`;
  if (el.id) return `id:${el.id}`;
  return `path:${elementPath(el, root)}`;
}

function readValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string | boolean {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    return el.checked;
  }
  return el.value;
}

function writeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string | boolean): void {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    el.checked = Boolean(value);
  } else {
    el.value = String(value ?? '');
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function useAdminDraftShield(scopeKey: string, rootRef: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const adminRoot = rootRef.current;
    if (!adminRoot) return;
    const portalRoot = document.body;

    const storageKey = `admin:draft:${scopeKey}`;
    let draft: DraftStore = {};

    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as DraftStore;
        if (parsed && typeof parsed === 'object') draft = parsed;
      }
    } catch {
      draft = {};
    }

    let saveTimer: number | null = null;
    const flush = () => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        // ignore quota or serialization issues
      }
    };
    const scheduleFlush = () => {
      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(flush, 160);
    };

    const persistFromTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      if (!isSupportedField(target)) return;
      const scopeRoot = adminRoot.contains(target) ? adminRoot : portalRoot.contains(target) ? portalRoot : null;
      if (!scopeRoot) return;
      const key = `${scopeRoot === adminRoot ? 'admin' : 'body'}:${keyForElement(target, scopeRoot)}`;
      draft[key] = readValue(target);
      scheduleFlush();
    };

    const restoreOnce = () => {
      const restoreFrom = (scopeRoot: HTMLElement, scopeLabel: 'admin' | 'body') => {
        const fields = scopeRoot.querySelectorAll('input, textarea, select');
        fields.forEach((field) => {
          if (!isSupportedField(field)) return;
          const key = `${scopeLabel}:${keyForElement(field, scopeRoot)}`;
          if (!(key in draft)) return;
          writeValue(field, draft[key]);
        });
      };
      restoreFrom(adminRoot, 'admin');
      restoreFrom(portalRoot, 'body');
    };

    const onInput = (e: Event) => persistFromTarget(e.target);
    const onChange = (e: Event) => persistFromTarget(e.target);
    const onPageHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onChange, true);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);

    const observer = new MutationObserver(() => {
      restoreOnce();
    });
    observer.observe(portalRoot, { childList: true, subtree: true });

    const rafId = window.requestAnimationFrame(() => restoreOnce());
    const lateTimer = window.setTimeout(() => restoreOnce(), 220);

    return () => {
      if (saveTimer) window.clearTimeout(saveTimer);
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(lateTimer);
      observer.disconnect();
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('change', onChange, true);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [scopeKey, rootRef]);
}

