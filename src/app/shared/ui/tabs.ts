import { ChangeDetectionStrategy, Component, ElementRef, input, model, viewChildren } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface TabItem<T = string> {
  value: T;
  label: string;
  count?: number | null;
  /** Для вкладок-маршрутів */
  link?: string | unknown[];
  exact?: boolean;
}

/**
 * Вкладки. З link — навігація маршрутами (nav + aria-current), без link — tablist зі стрілками.
 * Горизонтальна прокрутка на вузьких екранах, без переносу рядка.
 */
@Component({
  selector: 'tk-tabs',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-b border-line' },
  template: `
    @if (routed()) {
      <nav class="-mb-px flex gap-1 overflow-x-auto" [attr.aria-label]="ariaLabel()">
        @for (t of items(); track $index) {
          <a
            [routerLink]="t.link"
            routerLinkActive="tab-active"
            [routerLinkActiveOptions]="{ exact: t.exact ?? true }"
            ariaCurrentWhenActive="page"
            class="tab"
          >
            {{ t.label }}
            @if (t.count !== null && t.count !== undefined) {
              <span class="tab-count num">{{ t.count }}</span>
            }
          </a>
        }
      </nav>
    } @else {
      <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -- стрілки на списку вкладок, фокус — на активній вкладці -->
      <div role="tablist" class="-mb-px flex gap-1 overflow-x-auto" [attr.aria-label]="ariaLabel()" (keydown)="onKey($event)">
        @for (t of items(); track $index) {
          <button
            #tab
            type="button"
            role="tab"
            class="tab"
            [class.tab-active]="t.value === value()"
            [attr.aria-selected]="t.value === value()"
            [attr.aria-controls]="panelId()"
            [attr.tabindex]="t.value === value() ? 0 : -1"
            (click)="value.set(t.value)"
          >
            {{ t.label }}
            @if (t.count !== null && t.count !== undefined) {
              <span class="tab-count num">{{ t.count }}</span>
            }
          </button>
        }
      </div>
    }
  `,
})
export class Tabs<T> {
  readonly items = input.required<TabItem<T>[]>();
  readonly value = model<T | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly panelId = input<string | null>(null);
  private readonly tabs = viewChildren<ElementRef<HTMLButtonElement>>('tab');

  protected routed(): boolean {
    return this.items().some((t) => t.link);
  }

  protected onKey(e: KeyboardEvent): void {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const items = this.items();
    const i = (items.findIndex((t) => t.value === this.value()) + dir + items.length) % items.length;
    this.value.set(items[i].value);
    this.tabs()[i]?.nativeElement.focus();
  }
}
