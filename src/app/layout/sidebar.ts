import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Icon } from '../shared/ui/icon';
import { I, IconNode } from '../shared/icons';
import { Tooltip } from '../shared/ui/tooltip';
import { DbService } from '../core/data/db.service';
import { ThemeService } from '../core/ui/theme.service';
import { AppContext } from '../core/ui/app-context.service';
import { isOpen } from '../core/domain/order-math';
import { RemindersService } from '../core/domain/reminders.service';

interface NavItem {
  label: string;
  link: string;
  icon: IconNode;
  exact?: boolean;
  badge?: () => number;
  badgeTone?: 'accent' | 'danger';
}

/** Бічна навігація. Згортається до іконок (стан у tork:settings), на мобільних — висувна панель */
@Component({
  selector: 'tk-sidebar',
  imports: [RouterLink, RouterLinkActive, Icon, Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sidebar flex h-full flex-col' },
  template: `
    <div class="flex h-14 flex-none items-center gap-2.5 px-3.5">
      <a routerLink="/" class="flex min-w-0 items-center gap-2.5 rounded-md" aria-label="Торк — на головну" (click)="navigate.emit()">
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" class="flex-none">
          <rect width="32" height="32" rx="8" fill="var(--accent)" />
          <path
            d="M16 7.5l2 .3.6 2.3 1.6.7 2-1.2 1.6 1.4-1.2 2 .7 1.6 2.3.6.3 2-.3 2-2.3.6-.7 1.6 1.2 2-1.4 1.6-2-1.2-1.6.7-.6 2.3-2 .3-2-.3-.6-2.3-1.6-.7-2 1.2-1.6-1.4 1.2-2-.7-1.6-2.3-.6-.3-2 .3-2 2.3-.6.7-1.6-1.2-2 1.4-1.6 2 1.2 1.6-.7.6-2.3z"
            fill="var(--on-accent)"
          />
          <circle cx="16" cy="16" r="3.6" fill="var(--accent)" />
        </svg>
        <span class="sb-label text-[15px] font-semibold tracking-[-0.01em]">Торк</span>
      </a>
    </div>

    <nav class="flex-1 overflow-y-auto px-2 pb-2" aria-label="Розділи">
      @for (group of groups; track $index) {
        @if ($index) {
          <div class="mx-2 my-2 h-px bg-line" role="separator"></div>
        }
        <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
          @for (item of group; track item.link) {
            <li>
              <a
                [routerLink]="item.link"
                routerLinkActive="nav-active"
                [routerLinkActiveOptions]="{ exact: !!item.exact }"
                ariaCurrentWhenActive="page"
                class="nav-link"
                [tkTip]="collapsed() ? item.label : ''"
                tipSide="right"
                (click)="navigate.emit()"
              >
                <svg [lucideIcon]="item.icon" [size]="18" aria-hidden="true"></svg>
                <span class="sb-label flex-1 truncate-1">{{ item.label }}</span>
                @if (item.badge && item.badge(); as n) {
                  <span class="nav-badge num" [class.nav-badge-danger]="item.badgeTone === 'danger'" [attr.aria-label]="n + ' нових'">{{ n }}</span>
                }
              </a>
            </li>
          }
        </ul>
      }
    </nav>

    <div class="flex-none border-t border-line p-2">
      <div class="sb-label mb-1 px-2 py-1 text-xs text-ink-3">
        {{ ctx.branch()?.name ?? '' }}
      </div>
      @if (!mobile()) {
        <button type="button" class="nav-link w-full" (click)="theme.toggleSidebar()" [attr.aria-label]="collapsed() ? 'Розгорнути меню' : 'Згорнути меню'" [tkTip]="collapsed() ? 'Розгорнути меню' : ''" tipSide="right">
          <svg [lucideIcon]="collapsed() ? I.sidebarOpen : I.sidebarClose" [size]="18" aria-hidden="true"></svg>
          <span class="sb-label flex-1 text-left">Згорнути</span>
          <span class="sb-label kbd">[</span>
        </button>
      }
    </div>
  `,
})
export class Sidebar {
  protected readonly I = I;
  protected readonly theme = inject(ThemeService);
  protected readonly ctx = inject(AppContext);
  private readonly db = inject(DbService);
  readonly mobile = input(false);
  readonly navigate = output<void>();

  protected readonly collapsed = computed(() => !this.mobile() && this.theme.sidebarCollapsed());

  private readonly openOrders = computed(() => {
    const b = this.ctx.branchId();
    return this.db.orders.items().filter((o) => o.branchId === b && isOpen(o.status) && o.status !== 'zapys').length;
  });
  private readonly lowStock = computed(() => {
    const b = this.ctx.branchId();
    return b ? this.db.parts.items().filter((p) => (p.stock[b] ?? 0) - (p.reserved[b] ?? 0) <= p.minStock).length : 0;
  });
  private readonly rem = inject(RemindersService);
  /** Прострочені нагадування (правила ТО й відкладені роботи) */
  private readonly dueReminders = computed(() => (this.db.ready() ? this.rem.due().filter((d) => d.overdue).length : 0));

  protected readonly groups: NavItem[][] = [
    [
      { label: 'Огляд', link: '/', icon: I.dashboard, exact: true },
      { label: 'Табло постів', link: '/tablo', icon: I.calendarClock },
      { label: 'Наряди', link: '/naryady', icon: I.clipboardList, badge: () => this.openOrders() },
    ],
    [
      { label: 'Клієнти', link: '/kliyenty', icon: I.users },
      { label: 'Нагадування', link: '/nahaduvannia', icon: I.bellRing, badge: () => this.dueReminders() },
      { label: 'Склад', link: '/sklad', icon: I.boxes, badge: () => this.lowStock(), badgeTone: 'danger' },
      { label: 'Механіки', link: '/mekhaniky', icon: I.wrench },
    ],
    [
      { label: 'Довідники', link: '/dovidnyky', icon: I.list },
      { label: 'Налаштування', link: '/nalashtuvannia', icon: I.settings },
    ],
  ];
}
