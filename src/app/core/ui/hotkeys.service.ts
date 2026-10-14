import { DOCUMENT, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface Hotkey {
  /** «mod+k», «n», «shift+?», «g d» не підтримуємо — лише одиночні комбінації */
  combo: string;
  description: string;
  handler: (e: KeyboardEvent) => void;
  /** Спрацьовує і під час введення в полі (для mod+k, Escape) */
  allowInInput?: boolean;
}

/** Глобальні гарячі клавіші. Реєстрація повертає функцію зняття (для DestroyRef.onDestroy) */
@Injectable({ providedIn: 'root' })
export class HotkeysService {
  private readonly doc = inject(DOCUMENT);
  private readonly list: Hotkey[] = [];
  readonly isMac = isPlatformBrowser(inject(PLATFORM_ID)) && /Mac|iPhone|iPad/.test(navigator.platform);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.doc.addEventListener('keydown', (e) => this.onKey(e));
  }

  register(h: Hotkey): () => void {
    this.list.push(h);
    return () => {
      const i = this.list.indexOf(h);
      if (i >= 0) this.list.splice(i, 1);
    };
  }

  get all(): readonly Hotkey[] {
    return this.list;
  }

  /** Підпис для інтерфейсу: «⌘K» або «Ctrl K» */
  label(combo: string): string {
    return combo
      .split('+')
      .map((p) => (p === 'mod' ? (this.isMac ? '⌘' : 'Ctrl') : p === 'shift' ? '⇧' : p.length === 1 ? p.toUpperCase() : p))
      .join(this.isMac ? '' : ' ');
  }

  private onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.isComposing) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    // відкритий діалог перехоплює все, крім mod-комбінацій
    const inDialog = !!this.doc.querySelector('.cdk-overlay-container .cdk-dialog-container');
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      if (!this.match(h.combo, e)) continue;
      if (typing && !h.allowInInput) continue;
      if (inDialog && !h.combo.includes('mod')) continue;
      e.preventDefault();
      h.handler(e);
      return;
    }
  }

  private match(combo: string, e: KeyboardEvent): boolean {
    const parts = combo.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const mod = parts.includes('mod');
    const shift = parts.includes('shift');
    if (mod !== (this.isMac ? e.metaKey : e.ctrlKey)) return false;
    if (!mod && (e.metaKey || e.ctrlKey || e.altKey)) return false;
    if (shift !== e.shiftKey && key.length > 1) return false;
    // e.code — щоб працювало й на українській розкладці
    const code = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.code.startsWith('Digit') ? e.code.slice(5) : null;
    return e.key.toLowerCase() === key || code === key || (key === '?' && e.key === '?');
  }
}
