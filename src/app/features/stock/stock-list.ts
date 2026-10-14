import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { DbService } from '../../core/data/db.service';
import { Part } from '../../core/data/models';
import { StockService } from '../../core/domain/stock.service';
import { AppContext } from '../../core/ui/app-context.service';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { BulkDef, CellDef, Column, DataTable, FilterDef } from '../../shared/ui/data-table';
import { Tooltip } from '../../shared/ui/tooltip';
import { fmtMoney, plural } from '../../shared/format';
import { StockHeader } from './stock-header';
import { PartForm } from './part-form';
import { MoveDialog, MoveKind } from './move-dialog';

type Row = Part & { s: { stock: number; reserved: number; avail: number; low: boolean; supplier: string } };

@Component({
  selector: 'tk-stock-list',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger, Icon, DataTable, CellDef, BulkDef, Tooltip, StockHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-stock-header>
      <button type="button" class="btn btn-primary" (click)="edit(null)"><svg [lucideIcon]="I.packagePlus" aria-hidden="true"></svg>Нова запчастина</button>
    </tk-stock-header>

    @if (db.ready() && lowCount()) {
      <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-danger-soft px-4 py-2.5 text-[13px] text-danger" role="status">
        <svg [lucideIcon]="I.alert" aria-hidden="true"></svg>
        <span class="flex-1">{{ lowCount() }} {{ plural(lowCount(), ['позиція', 'позиції', 'позицій']) }} на мінімумі або нижче — замовте до того, як закінчаться.</span>
        <button type="button" class="btn btn-sm" (click)="orderLow()"><svg [lucideIcon]="I.truck" aria-hidden="true"></svg>Сформувати замовлення</button>
      </div>
    }

    <tk-data-table
      tableId="parts"
      csvName="zapchastyny"
      ariaLabel="Запчастини"
      searchPlaceholder="Артикул, кросс-номер, бренд, авто…"
      [rows]="rows()"
      [columns]="columns"
      [filters]="filters()"
      [rowId]="rowId"
      [loading]="!db.ready()"
      [selectable]="true"
      [rowClickable]="true"
      [initialQuery]="q() ?? null"
      [searchText]="searchText"
      [defaultSort]="{ key: 'avail', dir: 'asc' }"
      emptyArt="stock"
      emptyTitle="Каталог порожній"
      emptyText="Додайте запчастини й оформіть надходження."
      (rowClick)="edit($event)"
    >
      <ng-template tkCell="sku" let-r>
        <span class="font-medium mono">{{ r.sku }}</span>
        @if (r.crossNumbers.length) {
          <span class="block text-[11px] text-ink-3 mono" [tkTip]="'Аналоги: ' + r.crossNumbers.join(', ')">= {{ r.crossNumbers[0] }}{{ r.crossNumbers.length > 1 ? ' +' + (r.crossNumbers.length - 1) : '' }}</span>
        }
      </ng-template>
      <ng-template tkCell="name" let-r>
        <span class="block truncate-1 max-w-[30ch]" [tkTip]="r.name" [tipTruncated]="true">{{ r.name }}</span>
        <span class="block truncate-1 max-w-[30ch] text-[11px] text-ink-3">{{ r.fits.length ? r.fits.join(', ') : 'універсальна' }}</span>
      </ng-template>
      <ng-template tkCell="avail" let-r>
        <span class="inline-flex items-center gap-1.5" [class.text-danger]="r.s.low" [class.font-semibold]="r.s.low">
          @if (r.s.low) {
            <svg [lucideIcon]="I.alert" [size]="13" aria-hidden="true"></svg>
          }
          {{ r.s.avail }} {{ r.unit }}
        </span>
      </ng-template>
      <ng-template tkCell="actions" let-r>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" [cdkMenuTriggerFor]="menu" [cdkMenuTriggerData]="{ $implicit: r }" [attr.aria-label]="'Операції: ' + r.sku"><svg [lucideIcon]="I.more" aria-hidden="true"></svg></button>
      </ng-template>
      <ng-template tkBulk let-rows>
        <button type="button" class="btn btn-sm" (click)="toPurchase(rows)"><svg [lucideIcon]="I.truck" aria-hidden="true"></svg>У замовлення</button>
        <button type="button" class="btn btn-sm btn-danger" (click)="remove(rows)"><svg [lucideIcon]="I.trash" aria-hidden="true"></svg>Видалити</button>
      </ng-template>
    </tk-data-table>

    <ng-template #menu let-r>
      <div class="menu w-52" cdkMenu>
        <button type="button" class="menu-item" cdkMenuItem (cdkMenuItemTriggered)="move(r, 'in')"><svg [lucideIcon]="I.arrowDown" aria-hidden="true"></svg>Надходження</button>
        <button type="button" class="menu-item" cdkMenuItem (cdkMenuItemTriggered)="move(r, 'writeoff')"><svg [lucideIcon]="I.minus" aria-hidden="true"></svg>Списання</button>
        <button type="button" class="menu-item" cdkMenuItem (cdkMenuItemTriggered)="move(r, 'transfer')"><svg [lucideIcon]="I.transfer" aria-hidden="true"></svg>Переміщення</button>
        <div class="menu-sep"></div>
        <button type="button" class="menu-item" cdkMenuItem (cdkMenuItemTriggered)="edit(r)"><svg [lucideIcon]="I.edit" aria-hidden="true"></svg>Редагувати</button>
      </div>
    </ng-template>
  `,
})
export class StockList {
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly stock = inject(StockService);
  private readonly ctx = inject(AppContext);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly q = input<string>();
  protected readonly plural = plural;
  protected readonly rowId = (r: Row) => r.id;
  protected readonly searchText = (r: Row) => `${r.crossNumbers.join(' ')} ${r.fits.join(' ')}`;

  protected readonly rows = computed<Row[]>(() => {
    const b = this.ctx.branchId() ?? '';
    return this.db.parts.items().map((p) => {
      const stock = p.stock[b] ?? 0;
      const reserved = p.reserved[b] ?? 0;
      return { ...p, s: { stock, reserved, avail: stock - reserved, low: stock - reserved <= p.minStock, supplier: this.db.suppliers.get(p.supplierId)?.name ?? '' } };
    });
  });
  protected readonly lowCount = computed(() => this.rows().filter((r) => r.s.low).length);

  protected readonly columns: Column<Row>[] = [
    { key: 'sku', label: 'Артикул', value: (r) => r.sku, required: true },
    { key: 'brand', label: 'Бренд', value: (r) => r.brand },
    { key: 'name', label: 'Назва й застосовність', value: (r) => r.name },
    { key: 'stock', label: 'Залишок', value: (r) => r.s.stock, align: 'right' },
    { key: 'reserved', label: 'Резерв', value: (r) => r.s.reserved, align: 'right' },
    { key: 'avail', label: 'Доступно', value: (r) => r.s.avail, align: 'right' },
    { key: 'min', label: 'Мін.', value: (r) => r.minStock, align: 'right' },
    { key: 'price', label: 'Ціна', value: (r) => r.price, format: (r) => fmtMoney(r.price), align: 'right' },
    { key: 'cost', label: 'Закупівля', value: (r) => r.cost, format: (r) => fmtMoney(r.cost), align: 'right', hidden: true },
    { key: 'supplier', label: 'Постачальник', value: (r) => r.s.supplier, hidden: true },
    { key: 'actions', label: '', value: () => '', sortable: false, csv: () => '' },
  ];

  protected readonly filters = computed<FilterDef<Row>[]>(() => [
    { key: 'brand', label: 'Бренд', options: [...new Set(this.db.parts.items().map((p) => p.brand))].sort().map((b) => ({ value: b, label: b })), match: (r, v) => v.includes(r.brand) },
    { key: 'sup', label: 'Постачальник', options: this.db.suppliers.items().map((s) => ({ value: s.id, label: s.name })), match: (r, v) => !!r.supplierId && v.includes(r.supplierId) },
    {
      key: 'state',
      label: 'Наявність',
      options: [
        { value: 'low', label: 'Закінчуються' },
        { value: 'out', label: 'Немає' },
        { value: 'ok', label: 'В достатку' },
      ],
      match: (r, v) => v.includes(r.s.avail <= 0 ? 'out' : r.s.low ? 'low' : 'ok') || (v.includes('low') && r.s.avail <= 0),
    },
  ]);

  protected edit(p: Part | null): void {
    this.dialogs.open(PartForm, { id: p?.id }, { drawer: true, label: p ? 'Запчастина' : 'Нова запчастина' });
  }
  protected move(p: Part, kind: MoveKind): void {
    this.dialogs.open(MoveDialog, { part: p, kind }, { size: 'md', label: 'Операція складу' });
  }

  protected async orderLow(): Promise<void> {
    const b = this.ctx.branchId()!;
    const low = this.db.parts.items().filter((p) => this.stock.isLow(p, b));
    await this.stock.checkLow(low, b);
    this.toast.success('Чернетки замовлень оновлено', { label: 'Відкрити', run: () => void this.router.navigate(['/sklad/zakupivli']) });
  }

  protected async toPurchase(rows: Row[]): Promise<void> {
    const b = this.ctx.branchId()!;
    const bySup = new Map<string, Row[]>();
    for (const r of rows) {
      const s = r.supplierId ?? this.db.suppliers.items()[0]?.id;
      if (s) bySup.set(s, [...(bySup.get(s) ?? []), r]);
    }
    for (const [sup, list] of bySup) {
      const n = this.db.purchases.items().reduce((m, x) => Math.max(m, Number(x.number.replace(/\D/g, '')) || 0), 100) + 1;
      await this.db.purchases.create(
        { number: `ЗАМ-${n}`, supplierId: sup, branchId: b, status: 'draft', auto: false, lines: list.map((r) => ({ partId: r.id, qty: Math.max(1, r.minStock * 2 - r.s.avail), cost: r.cost })) },
        { log: `Чернетка замовлення ЗАМ-${n}` },
      );
    }
    this.toast.success(`Створено ${bySup.size} ${plural(bySup.size, ['чернетку', 'чернетки', 'чернеток'])} замовлень`);
  }

  protected async remove(rows: Row[]): Promise<void> {
    const used = new Set(this.db.orders.items().filter((o) => o.status !== 'vydano' && o.status !== 'skasovano').flatMap((o) => o.parts.map((p) => p.partId)));
    const blocked = rows.filter((r) => used.has(r.id));
    const ok = await this.dialogs.confirm({
      title: `Видалити ${rows.length} ${plural(rows.length, ['позицію', 'позиції', 'позицій'])} з каталогу?`,
      text: blocked.length
        ? `${blocked.length} з них є у відкритих нарядах — вони лишаться в нарядах як текст, але зникнуть зі складу.`
        : 'Історія рухів збережеться.',
      confirm: 'Видалити',
      danger: true,
    });
    if (!ok) return;
    const removed = await this.db.parts.removeMany(rows.map((r) => r.id), { log: `Видалено запчастин: ${rows.length}` });
    this.toast.undo(`Видалено ${rows.length}`, () => this.db.parts.restoreMany(removed));
  }
}
