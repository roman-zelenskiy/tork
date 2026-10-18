import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { BRAND, L } from '../i18n';

/**
 * Заголовок вкладки «Розділ — Торк» і robots: індексується лише головна,
 * решта застосунку — noindex (робочі екрани CRM не мають бути в пошуку).
 */
@Injectable({ providedIn: 'root' })
export class TorkTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  override updateTitle(state: RouterStateSnapshot): void {
    const t = this.buildTitle(state);
    this.title.setTitle(t ? `${t} — ${BRAND}` : L('Торк — CRM для мережі СТО', 'Tork — CRM for a car service chain'));
    const path = state.url.split(/[?#]/)[0];
    if (path === '/' || path === '') this.meta.removeTag('name="robots"');
    else this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
  }

  /** Динамічний заголовок (наряд №, ім’я клієнта) після завантаження даних */
  set(text: string): void {
    this.title.setTitle(`${text} — ${BRAND}`);
  }
}
