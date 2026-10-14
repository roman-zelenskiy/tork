import { DOCUMENT, Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DbService } from '../data/db.service';
import { Settings } from '../data/models';

export type ThemeMode = Settings['theme'];

/**
 * Тема й стан сайдбару. Атрибути на <html> виставляє ще інлайн-скрипт в index.html (до відмальовки),
 * сервіс підхоплює їх і далі зберігає вибір у tork:settings.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly db = inject(DbService);
  private readonly doc = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly systemDark = signal(false);

  /** Вибір до завантаження даних — з атрибута, який поставив інлайн-скрипт */
  private readonly fallbackMode = signal<ThemeMode>('system');
  readonly mode = computed<ThemeMode>(() => this.db.settings()?.theme ?? this.fallbackMode());
  readonly resolved = computed<'light' | 'dark'>(() => {
    const m = this.mode();
    return m === 'system' ? (this.systemDark() ? 'dark' : 'light') : m;
  });

  private readonly localCollapsed = signal(false);
  readonly sidebarCollapsed = computed(() => this.db.settings()?.sidebarCollapsed ?? this.localCollapsed());

  constructor() {
    if (!this.browser) return;
    const html = this.doc.documentElement;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    this.systemDark.set(mq.matches);
    mq.addEventListener('change', (e) => this.systemDark.set(e.matches));
    this.localCollapsed.set(html.getAttribute('data-sidebar') === 'collapsed');

    effect(() => {
      const t = this.resolved();
      if (html.getAttribute('data-theme') === t) return;
      // без анімацій кольорів у момент перемикання
      html.classList.add('theme-switching');
      html.setAttribute('data-theme', t);
      requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('theme-switching')));
    });
    effect(() => {
      if (this.sidebarCollapsed()) html.setAttribute('data-sidebar', 'collapsed');
      else html.removeAttribute('data-sidebar');
    });
  }

  async setMode(mode: ThemeMode): Promise<void> {
    this.fallbackMode.set(mode);
    await this.patchSettings({ theme: mode });
  }

  toggle(): Promise<void> {
    return this.setMode(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  async toggleSidebar(): Promise<void> {
    const next = !this.sidebarCollapsed();
    this.localCollapsed.set(next);
    await this.patchSettings({ sidebarCollapsed: next });
  }

  private async patchSettings(patch: Partial<Settings>): Promise<void> {
    const s = this.db.settings();
    if (!s) return;
    try {
      await this.db.settingsRepo.update(s.id, patch, { log: false });
    } catch {
      /* не критично: тема лишиться до перезавантаження */
    }
  }
}
