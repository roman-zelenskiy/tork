import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DbService } from '../../core/data/db.service';
import { AppContext } from '../../core/ui/app-context.service';
import { QuickActions } from '../../core/ui/quick-actions.service';
import { isOpen } from '../../core/domain/order-math';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/states';
import { Tabs, TabItem } from '../../shared/ui/tabs';

/** Шапка розділу «Наряди» з вкладками-маршрутами */
@Component({
  selector: 'tk-orders-header',
  imports: [Icon, PageHeader, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block mb-5' },
  template: `
    <tk-page-header title="Наряди" [subtitle]="subtitle()">
      <button type="button" class="btn btn-primary" (click)="quick.newOrder()"><svg [lucideIcon]="I.plus" aria-hidden="true"></svg>Новий наряд</button>
    </tk-page-header>
    <tk-tabs [items]="tabs()" ariaLabel="Вигляд нарядів" />
  `,
})
export class OrdersHeader {
  protected readonly I = I;
  protected readonly quick = inject(QuickActions);
  private readonly db = inject(DbService);
  private readonly ctx = inject(AppContext);

  protected readonly subtitle = computed(() => {
    if (!this.db.ready()) return 'Завантаження…';
    const open = this.db.orders.items().filter((o) => o.branchId === this.ctx.branchId() && isOpen(o.status) && o.status !== 'zapys').length;
    return `${this.ctx.branch()?.name ?? ''}: ${open} у роботі зараз`;
  });

  protected readonly tabs = computed<TabItem<string>[]>(() => {
    const waiting = this.db.approvals.items().filter((a) => a.status === 'sent').length;
    return [
      { value: 'table', label: 'Таблиця', link: '/naryady' },
      { value: 'kanban', label: 'Канбан', link: '/naryady/kanban' },
      { value: 'appr', label: 'Погодження', link: '/naryady/pogodzhennia', count: this.db.ready() ? waiting : null },
    ];
  });
}
