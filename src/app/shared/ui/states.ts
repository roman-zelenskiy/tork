import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from './icon';
import { I } from '../icons';

export type EmptyArt = 'orders' | 'clients' | 'search' | 'stock' | 'inbox' | 'car' | 'calendar' | 'chart' | 'bell' | 'done';

/**
 * Порожній стан: SVG-ілюстрація в лініях теми + пояснення + дія.
 * Ілюстрації намальовані однією товщиною лінії, акцент — бурштинова пляма.
 */
@Component({
  selector: 'tk-empty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center justify-center px-4 py-10 text-center', role: 'status' },
  template: `
    <svg [attr.width]="compact() ? 96 : 132" viewBox="0 0 132 96" fill="none" aria-hidden="true" class="mb-4 text-ink-3">
      <ellipse cx="66" cy="88" rx="46" ry="5" fill="var(--subtle)" />
      @switch (art()) {
        @case ('orders') {
          <rect x="38" y="14" width="56" height="70" rx="7" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
          <rect x="52" y="9" width="28" height="11" rx="4" fill="var(--accent-soft)" stroke="currentColor" stroke-width="2" />
          <path d="M49 36h34M49 47h26M49 58h30" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <circle cx="88" cy="70" r="13" fill="var(--accent)" opacity=".9" />
          <path d="m83 70 4 4 7-8" stroke="var(--on-accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        }
        @case ('clients') {
          <circle cx="54" cy="36" r="13" fill="var(--accent-soft)" stroke="currentColor" stroke-width="2" />
          <path d="M30 80c2-14 12-22 24-22s22 8 24 22" fill="var(--surface)" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <circle cx="85" cy="40" r="10" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
          <path d="M74 64c3-4 7-6 11-6 9 0 16 7 17 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        }
        @case ('search') {
          <path d="M22 66l6-14c1-3 4-5 7-5h34c3 0 6 2 7 5l6 14v12H22z" fill="var(--surface)" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
          <circle cx="36" cy="78" r="6" fill="var(--bg)" stroke="currentColor" stroke-width="2" />
          <circle cx="70" cy="78" r="6" fill="var(--bg)" stroke="currentColor" stroke-width="2" />
          <circle cx="92" cy="38" r="16" fill="var(--accent-soft)" stroke="currentColor" stroke-width="2" />
          <path d="m104 50 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
          <path d="M86 38h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        }
        @case ('stock') {
          <path d="M26 84V30m80 54V30M26 58h80M26 30h80" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <rect x="34" y="40" width="20" height="18" rx="2" fill="var(--accent-soft)" stroke="currentColor" stroke-width="2" />
          <rect x="58" y="44" width="16" height="14" rx="2" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
          <rect x="80" y="66" width="18" height="18" rx="2" fill="var(--surface)" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" />
        }
        @case ('car') {
          <path d="M18 66l8-16c2-4 6-6 10-6h44c5 0 9 2 12 6l12 16v14H18z" fill="var(--surface)" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
          <path d="M38 50h46l8 14H32z" fill="var(--accent-soft)" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
          <circle cx="38" cy="80" r="8" fill="var(--bg)" stroke="currentColor" stroke-width="2" />
          <circle cx="92" cy="80" r="8" fill="var(--bg)" stroke="currentColor" stroke-width="2" />
        }
        @case ('calendar') {
          <rect x="30" y="18" width="72" height="64" rx="8" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
          <path d="M30 34h72M48 12v12M84 12v12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <rect x="42" y="44" width="14" height="10" rx="2" fill="var(--subtle)" />
          <rect x="60" y="44" width="14" height="10" rx="2" fill="var(--accent)" opacity=".85" />
          <rect x="78" y="44" width="14" height="10" rx="2" fill="var(--subtle)" />
          <rect x="42" y="60" width="14" height="10" rx="2" fill="var(--subtle)" />
          <rect x="60" y="60" width="14" height="10" rx="2" fill="var(--subtle)" />
        }
        @case ('chart') {
          <path d="M26 82h84M26 82V20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <rect x="38" y="58" width="12" height="22" rx="2" fill="var(--subtle)" stroke="currentColor" stroke-width="2" />
          <rect x="58" y="44" width="12" height="36" rx="2" fill="var(--accent-soft)" stroke="currentColor" stroke-width="2" />
          <rect x="78" y="30" width="12" height="50" rx="2" fill="var(--accent)" opacity=".85" />
        }
        @case ('bell') {
          <path d="M48 64V46a18 18 0 0 1 36 0v18l6 8H42z" fill="var(--surface)" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
          <path d="M60 78a6 6 0 0 0 12 0" stroke="currentColor" stroke-width="2" />
          <circle cx="86" cy="32" r="8" fill="var(--accent)" opacity=".9" />
        }
        @case ('done') {
          <circle cx="66" cy="48" r="30" fill="var(--success-soft)" stroke="currentColor" stroke-width="2" />
          <path d="m53 48 9 9 18-19" stroke="var(--success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        }
        @default {
          <path d="M28 52l10-30h56l10 30v26a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6z" fill="var(--surface)" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
          <path d="M28 52h22l4 9h24l4-9h22" fill="var(--accent-soft)" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        }
      }
    </svg>
    <h2 class="m-0 text-[15px] font-semibold text-ink">{{ title() }}</h2>
    @if (text()) {
      <p class="mx-auto mt-1 mb-0 max-w-[44ch] text-[13px] text-ink-2">{{ text() }}</p>
    }
    <div class="mt-4 flex flex-wrap justify-center gap-2 empty:hidden"><ng-content /></div>
  `,
})
export class EmptyState {
  readonly art = input<EmptyArt>('inbox');
  readonly title = input.required<string>();
  readonly text = input<string | null>(null);
  readonly compact = input(false);
}

/** Стан помилки з кнопкою повтору */
@Component({
  selector: 'tk-error',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center justify-center px-4 py-10 text-center', role: 'alert' },
  template: `
    <span class="mb-3 grid size-11 place-items-center rounded-full bg-danger-soft text-danger">
      <svg [lucideIcon]="I.circleAlert" [size]="22" aria-hidden="true"></svg>
    </span>
    <h2 class="m-0 text-[15px] font-semibold">{{ title() }}</h2>
    <p class="mx-auto mt-1 mb-0 max-w-[48ch] text-[13px] text-ink-2">{{ text() }}</p>
    <button type="button" class="btn mt-4" (click)="retry.emit()">
      <svg [lucideIcon]="I.undo" aria-hidden="true"></svg>Спробувати ще раз
    </button>
  `,
})
export class ErrorState {
  protected readonly I = I;
  readonly title = input('Не вдалося завантажити дані');
  readonly text = input('Сховище браузера не відповіло. Перевірте, чи не вимкнено збереження даних для сайту.');
  readonly retry = output<void>();
}

/** Заголовок сторінки: назва, опис, дії праворуч */
@Component({
  selector: 'tk-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap items-end gap-x-4 gap-y-3 mb-5' },
  template: `
    <div class="min-w-0 flex-1 basis-60">
      <ng-content select="[crumbs]" />
      <h1 class="m-0 text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink">{{ title() }}</h1>
      @if (subtitle()) {
        <p class="mt-1 mb-0 text-[13px] text-ink-2">{{ subtitle() }}</p>
      }
    </div>
    <div class="flex flex-wrap items-center gap-2 empty:hidden"><ng-content /></div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
}
