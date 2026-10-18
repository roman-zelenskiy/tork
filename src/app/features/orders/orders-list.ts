import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DbService } from '../../core/data/db.service';
import { Order, ORDER_STATUSES } from '../../core/data/models';
import { formatPlate } from '../../core/data/plates';
import { StatsService } from '../../core/domain/stats.service';
import { OrdersService } from '../../core/domain/orders.service';
import { STATUS_LABEL, canMove } from '../../core/domain/order-math';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { BulkDef, CellDef, Column, DataTable, FilterDef } from '../../shared/ui/data-table';
import { Plate } from '../../shared/ui/display';
import { StatusBadge, statusColor } from '../../shared/ui/status';
import { Tooltip } from '../../shared/ui/tooltip';
import { fmtDateTime, fmtMoney, fmtNum, plural } from '../../shared/format';
import { OrdersHeader } from './orders-header';
import { L } from '../../core/i18n';

type Row = Order & { r: { client: string; car: string; plate: string; mech: string; post: string; total: number; debt: number; when: string } };

@Component({
  selector: 'tk-orders-list',
  imports: [RouterLink, Icon, DataTable, CellDef, BulkDef, Plate, StatusBadge, Tooltip, OrdersHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-orders-header />
    <tk-data-table
      tableId="orders"
      csvName="naryady"
      [ariaLabel]="L('Наряди', 'Work orders')"
      [searchPlaceholder]="L('Номер, клієнт, номер авто…', 'Number, customer, number plate…')"
      [rows]="rows()"
      [columns]="columns"
      [filters]="filters()"
      [rowId]="rowId"
      [loading]="!db.ready()"
      [selectable]="true"
      [rowClickable]="true"
      [defaultSort]="{ key: 'when', dir: 'desc' }"
      [flashIds]="flash()"
      emptyArt="orders"
      [emptyTitle]="L('Нарядів ще немає', 'No work orders yet')"
      [emptyText]="L('Створіть перший наряд — кнопка вгорі або клавіша N.', 'Create your first work order — use the button above or press N.')"
      (rowClick)="open($event)"
    >
      <ng-template tkCell="number" let-r>
        <a [routerLink]="['/naryady', r.id]" class="row-link mono">{{ r.number }}</a>
      </ng-template>
      <ng-template tkCell="client" let-r>
        <a [routerLink]="['/kliyenty', r.clientId]" class="row-link font-normal! block truncate-1 max-w-[22ch]" [tkTip]="r.r.client" [tipTruncated]="true">{{ r.r.client }}</a>
      </ng-template>
      <ng-template tkCell="car" let-r>
        <span class="flex items-center gap-2">
          @if (r.r.plate) {
            <tk-plate [value]="r.r.plate" />
          }
          <span class="truncate-1 max-w-[18ch] text-ink-2" [tkTip]="r.r.car" [tipTruncated]="true">{{ r.r.car }}</span>
        </span>
      </ng-template>
      <ng-template tkCell="status" let-r><tk-status [status]="r.status" /></ng-template>
      <ng-template tkCell="debt" let-r>
        @if (r.r.debt > 0 && r.status === 'vydano') {
          <span class="font-medium text-danger">{{ money(r.r.debt) }}</span>
        } @else {
          <span class="text-ink-3">—</span>
        }
      </ng-template>
      <ng-template tkBulk let-rows>
        <button type="button" class="btn btn-sm btn-danger" (click)="cancel(rows)"><svg [lucideIcon]="I.ban" aria-hidden="true"></svg>{{ L('Скасувати наряди', 'Cancel work orders') }}</button>
      </ng-template>
    </tk-data-table>
  `,
})
export class OrdersList {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly stats = inject(StatsService);
  private readonly ordersSvc = inject(OrdersService);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly money = fmtMoney;
  protected readonly rowId = (r: Row) => r.id;

  protected readonly rows = computed<Row[]>(() => {
    const totals = this.stats.totals();
    return this.db.orders.items().map((o) => {
      const car = this.db.cars.get(o.carId);
      const t = totals.get(o.id)!;
      return {
        ...o,
        r: {
          client: this.db.clients.get(o.clientId)?.name ?? L('Видалений клієнт', 'Deleted customer'),
          car: car ? `${car.make} ${car.model}` : '—',
          plate: car?.plate ?? '',
          mech: this.db.employees.get(o.mechanicId)?.name ?? '',
          post: this.db.posts.get(o.postId)?.name ?? '',
          total: t.total,
          debt: t.debt,
          when: o.start ?? o.createdAt,
        },
      };
    });
  });

  protected readonly flash = computed(() => {
    const ch = this.db.externalChange();
    if (!ch || ch.name !== 'orders') return [];
    return this.db.orders.items().filter((o) => Date.parse(o.updatedAt) > ch.at - 5000).map((o) => o.id);
  });

  protected readonly columns: Column<Row>[] = [
    { key: 'number', label: L('Наряд', 'Work order'), value: (r) => Number(r.number.replace(/\D/g, '')), csv: (r) => r.number, required: true },
    { key: 'when', label: L('Дата', 'Date'), value: (r) => r.r.when, format: (r) => fmtDateTime(r.r.when) },
    { key: 'client', label: L('Клієнт', 'Customer'), value: (r) => r.r.client },
    { key: 'car', label: L('Авто', 'Car'), value: (r) => `${formatPlate(r.r.plate)} ${r.r.car}`, sortable: false },
    { key: 'status', label: L('Статус', 'Status'), value: (r) => ORDER_STATUSES.indexOf(r.status), csv: (r) => STATUS_LABEL[r.status] },
    { key: 'mech', label: L('Механік', 'Mechanic'), value: (r) => r.r.mech },
    { key: 'post', label: L('Пост', 'Bay'), value: (r) => r.r.post, hidden: true },
    { key: 'total', label: L('Сума', 'Total'), value: (r) => r.r.total, format: (r) => fmtMoney(r.r.total), csv: (r) => r.r.total, align: 'right' },
    { key: 'debt', label: L('Борг', 'Debt'), value: (r) => (r.status === 'vydano' ? r.r.debt : 0), csv: (r) => r.r.debt, align: 'right' },
    { key: 'complaint', label: L('Скарга', 'Complaint'), value: (r) => r.complaint, hidden: true, sortable: false },
  ];

  protected readonly filters = computed<FilterDef<Row>[]>(() => [
    {
      key: 'status',
      label: L('Статус', 'Status'),
      options: ORDER_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], dot: statusColor(s) })),
      match: (r, v) => v.includes(r.status),
    },
    {
      key: 'branch',
      label: L('Філія', 'Branch'),
      options: this.db.branches.items().map((b) => ({ value: b.id, label: b.name })),
      match: (r, v) => v.includes(r.branchId),
    },
    {
      key: 'mech',
      label: L('Механік', 'Mechanic'),
      options: this.db.employees
        .items()
        .filter((e) => e.role === 'mechanic')
        .map((e) => ({ value: e.id, label: e.name })),
      match: (r, v) => !!r.mechanicId && v.includes(r.mechanicId),
    },
    {
      key: 'pay',
      label: L('Оплата', 'Payment'),
      options: [
        { value: 'debt', label: L('З боргом', 'With debt') },
        { value: 'paid', label: L('Сплачені', 'Paid') },
      ],
      match: (r, v) => v.includes(r.status === 'vydano' && r.r.debt > 0 ? 'debt' : r.r.debt === 0 ? 'paid' : ''),
    },
  ]);

  protected open(r: Row): void {
    void this.router.navigate(['/naryady', r.id]);
  }

  protected async cancel(rows: Row[]): Promise<void> {
    const ok = rows.filter((r) => canMove(r.status, 'skasovano').ok);
    if (!ok.length) return void this.toast.info(L('Видані й уже скасовані наряди змінити не можна', 'Handed-over and already cancelled work orders can’t be changed'));
    const confirmed = await this.dialogs.confirm({
      title: `${L('Скасувати', 'Cancel')} ${ok.length} ${plural(ok.length, ['наряд', 'наряди', 'нарядів'], ['work order', 'work orders'])}?`,
      text:
        L('Резерви запчастин буде знято, видані запчастини повернуться на склад.', 'Part reservations will be released and issued parts will go back to stock.') +
        (ok.length < rows.length ? L(` ${rows.length - ok.length} наряди пропущено — їх не можна скасувати.`, ` ${rows.length - ok.length} skipped — they can’t be cancelled.`) : ''),
      confirm: L('Скасувати наряди', 'Cancel work orders'),
      cancel: L('Не скасовувати', 'Keep'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      for (const r of ok) await this.ordersSvc.setStatus(this.db.orders.get(r.id)!, 'skasovano');
      this.toast.success(`${L('Скасовано', 'Cancelled')} ${fmtNum(ok.length)} ${plural(ok.length, ['наряд', 'наряди', 'нарядів'], ['work order', 'work orders'])}`);
    } catch (e) {
      this.toast.error(e);
    }
  }
}
