import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DbService } from '../../core/data/db.service';
import { StockService } from '../../core/domain/stock.service';
import { AppContext } from '../../core/ui/app-context.service';
import { PageHeader } from '../../shared/ui/states';
import { Tabs, TabItem } from '../../shared/ui/tabs';

@Component({
  selector: 'tk-stock-header',
  imports: [PageHeader, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block mb-5' },
  template: `
    <tk-page-header title="Склад" [subtitle]="subtitle()"><ng-content /></tk-page-header>
    <tk-tabs [items]="tabs()" ariaLabel="Розділи складу" />
  `,
})
export class StockHeader {
  private readonly db = inject(DbService);
  private readonly ctx = inject(AppContext);
  private readonly stock = inject(StockService);
  protected readonly subtitle = computed(() => (this.db.ready() ? `${this.ctx.branch()?.name}: ${this.db.parts.items().length} позицій` : 'Завантаження…'));
  protected readonly tabs = computed<TabItem<string>[]>(() => {
    const b = this.ctx.branchId() ?? '';
    const low = this.db.parts.items().filter((p) => this.stock.isLow(p, b)).length;
    const drafts = this.db.purchases.items().filter((p) => p.status !== 'received').length;
    return [
      { value: 'parts', label: 'Запчастини', link: '/sklad', count: this.db.ready() && low ? low : null },
      { value: 'moves', label: 'Рух', link: '/sklad/rukh' },
      { value: 'po', label: 'Закупівлі', link: '/sklad/zakupivli', count: this.db.ready() && drafts ? drafts : null },
    ];
  });
}
