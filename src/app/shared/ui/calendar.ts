import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { Icon } from './icon';
import { I } from '../icons';
import { ymd } from '../format';
import { L, locale } from '../../core/i18n';

const MONTHS = L(
  ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'],
  ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
);
const WD = L(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'], ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
const parse = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));

/**
 * Місячний календар (сітка role=grid). Стрілки — день/тиждень, PageUp/PageDown — місяць, Enter — вибір.
 * Режим діапазону: start/end підсвічуються, hover показує майбутній діапазон.
 */
@Component({
  selector: 'tk-calendar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-[260px] select-none">
      <div class="mb-2 flex items-center justify-between">
        <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="L('Попередній місяць', 'Previous month')" (click)="shift(-1)">
          <svg [lucideIcon]="I.chevronLeft" aria-hidden="true"></svg>
        </button>
        <div class="text-[13px] font-semibold" aria-live="polite">{{ title() }}</div>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="L('Наступний місяць', 'Next month')" (click)="shift(1)">
          <svg [lucideIcon]="I.chevronRight" aria-hidden="true"></svg>
        </button>
      </div>
      <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -- стрілки обробляються на сітці, фокус — на кнопці дня (roving tabindex) -->
      <div role="grid" [attr.aria-label]="title()" (keydown)="onKey($event)">
        <div role="row" class="grid grid-cols-7">
          @for (w of wd; track w) {
            <div role="columnheader" class="py-1 text-center text-[11px] font-medium text-ink-3">{{ w }}</div>
          }
        </div>
        @for (row of weeks(); track $index) {
          <div role="row" class="grid grid-cols-7">
            @for (c of row; track c.key) {
              <div role="gridcell" [attr.aria-selected]="c.selected" class="p-px">
                <button
                  type="button"
                  class="relative h-8 w-full rounded-md text-[13px] num transition-colors duration-100"
                  [class]="cellClass(c)"
                  [attr.tabindex]="c.key === focus() ? 0 : -1"
                  [attr.data-key]="c.key"
                  [attr.aria-label]="c.label"
                  [attr.aria-current]="c.today ? 'date' : null"
                  [disabled]="c.disabled"
                  (click)="choose(c.key)"
                  (mouseenter)="hover.set(c.key)"
                >
                  {{ c.day }}
                  @if (c.today) {
                    <span class="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current" aria-hidden="true"></span>
                  }
                </button>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class Calendar {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly wd = WD;
  readonly value = input<string | null>(null);
  readonly rangeStart = input<string | null>(null);
  readonly rangeEnd = input<string | null>(null);
  readonly range = input(false);
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  readonly picked = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly hover = signal<string | null>(null);
  protected readonly focus = signal(ymd(new Date()));
  protected readonly view = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  private readonly today = ymd(new Date());

  constructor() {
    effect(() => {
      const v = this.value() ?? this.rangeStart();
      if (v) {
        const d = parse(v);
        this.view.set(new Date(d.getFullYear(), d.getMonth(), 1));
        this.focus.set(v);
      }
    });
  }

  protected readonly title = computed(() => `${MONTHS[this.view().getMonth()]} ${this.view().getFullYear()}`);

  protected readonly weeks = computed(() => {
    const v = this.view();
    const first = new Date(v.getFullYear(), v.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    const [rs, re] = this.effRange();
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const rows = [];
    for (let w = 0; w < 6; w++) {
      const row = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
        const key = ymd(date);
        row.push({
          key,
          day: date.getDate(),
          label: fmt.format(date),
          outside: date.getMonth() !== v.getMonth(),
          today: key === this.today,
          selected: this.range() ? key === rs || key === re : key === this.value(),
          inRange: !!rs && !!re && key > rs && key < re,
          disabled: (!!this.min() && key < this.min()!) || (!!this.max() && key > this.max()!),
        });
      }
      rows.push(row);
    }
    return rows;
  });

  /** Діапазон з урахуванням наведення, коли обрано лише початок */
  private readonly effRange = computed<[string | null, string | null]>(() => {
    const s = this.rangeStart();
    const e = this.rangeEnd();
    const h = this.hover();
    if (this.range() && s && !e && h) return h < s ? [h, s] : [s, h];
    return [s, e];
  });

  protected cellClass(c: { outside: boolean; selected: boolean; inRange: boolean; today: boolean }): string {
    if (c.selected) return 'bg-accent text-on-accent font-semibold';
    if (c.inRange) return 'bg-accent-soft text-accent-ink rounded-none';
    return (c.outside ? 'text-ink-3 ' : 'text-ink ') + (c.today ? 'font-semibold text-accent-ink ' : '') + 'hover:bg-subtle';
  }

  protected shift(n: number): void {
    const v = this.view();
    this.view.set(new Date(v.getFullYear(), v.getMonth() + n, 1));
  }

  protected choose(key: string): void {
    this.focus.set(key);
    this.picked.emit(key);
  }

  /** Фокус на поточну дату при відкритті */
  focusCurrent(): void {
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-key="${this.focus()}"]`)?.focus());
  }

  protected onKey(e: KeyboardEvent): void {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const d = parse(this.focus());
    let next: Date | null = null;
    if (e.key in step) next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step[e.key]);
    else if (e.key === 'PageUp') next = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate());
    else if (e.key === 'PageDown') next = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
    else if (e.key === 'Home') next = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    else if (e.key === 'End') next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (6 - ((d.getDay() + 6) % 7)));
    if (!next) return;
    e.preventDefault();
    const key = ymd(next);
    this.focus.set(key);
    this.hover.set(key);
    if (next.getMonth() !== this.view().getMonth() || next.getFullYear() !== this.view().getFullYear())
      this.view.set(new Date(next.getFullYear(), next.getMonth(), 1));
    this.focusCurrent();
  }
}
