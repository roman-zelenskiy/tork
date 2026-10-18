import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DbService } from '../../core/data/db.service';
import { Approval } from '../../core/data/models';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { CellDef, Column, DataTable, FilterDef } from '../../shared/ui/data-table';
import { Plate } from '../../shared/ui/display';
import { fmtDateTime, fmtMoney, fmtPct } from '../../shared/format';
import { OrdersHeader } from '../orders/orders-header';
import { L } from '../../core/i18n';

type Row = Approval & { r: { number: string; client: string; plate: string; total: number; approved: number; pct: number | null } };
const STATUS: Record<Approval['status'], string> = L(
  { sent: 'Чекає відповіді', answered: 'Відповів', cancelled: 'Скасовано' },
  { sent: 'Awaiting reply', answered: 'Replied', cancelled: 'Cancelled' },
);

/** Усі погодження: хто ще не відповів, конверсія у погоджені роботи */
@Component({
  selector: 'tk-approvals-list',
  imports: [RouterLink, Icon, DataTable, CellDef, Plate, OrdersHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-orders-header />
    @if (db.ready()) {
      <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4" [attr.aria-label]="L('Підсумок погоджень', 'Approvals summary')">
        <div class="card p-3.5"><div class="text-xs text-ink-2">{{ L('Чекають відповіді', 'Awaiting reply') }}</div><div class="mt-0.5 text-lg font-semibold num">{{ stats().waiting }}</div></div>
        <div class="card p-3.5"><div class="text-xs text-ink-2">{{ L('Конверсія за 30 днів', '30-day approval rate') }}</div><div class="mt-0.5 text-lg font-semibold num">{{ stats().conv }}</div></div>
        <div class="card p-3.5"><div class="text-xs text-ink-2">{{ L('Погоджено на суму', 'Approved amount') }}</div><div class="mt-0.5 text-lg font-semibold num">{{ money(stats().approved) }}</div></div>
        <div class="card p-3.5"><div class="text-xs text-ink-2">{{ L('Відкладено клієнтами', 'Deferred by customers') }}</div><div class="mt-0.5 text-lg font-semibold num">{{ money(stats().declined) }}</div></div>
      </div>
    }
    <tk-data-table
      tableId="approvals"
      csvName="pogodzhennia"
      [ariaLabel]="L('Погодження', 'Approvals')"
      [searchPlaceholder]="L('Наряд, клієнт, номер авто…', 'Work order, customer, number plate…')"
      [rows]="rows()"
      [columns]="columns"
      [filters]="filters"
      [rowId]="rowId"
      [loading]="!db.ready()"
      [rowClickable]="true"
      [defaultSort]="{ key: 'sent', dir: 'desc' }"
      [flashIds]="flash()"
      emptyArt="inbox"
      [emptyTitle]="L('Погоджень ще не було', 'No approvals yet')"
      [emptyText]="L('Додайте рекомендації в наряді після діагностики й надішліть клієнту.', 'Add recommendations in a work order after diagnostics and send them to the customer.')"
      (rowClick)="open($event)"
    >
      <ng-template tkCell="number" let-r><a [routerLink]="['/naryady', r.orderId]" fragment="pogodzhennia" class="row-link mono">{{ r.r.number }}</a></ng-template>
      <ng-template tkCell="plate" let-r>@if (r.r.plate) {<tk-plate [value]="r.r.plate" />}</ng-template>
      <ng-template tkCell="status" let-r>
        <span class="badge" [class]="r.status === 'sent' ? 'badge-accent' : r.status === 'answered' ? 'badge-success' : ''">
          @if (r.status === 'sent') {
            <svg [lucideIcon]="I.clock" [size]="12" aria-hidden="true"></svg>
          }
          {{ label(r.status) }}
        </span>
      </ng-template>
      <ng-template tkCell="link" let-r>
        @if (r.status === 'sent') {
          <a class="btn btn-ghost btn-sm" [href]="'pogodzhennia/' + r.token" target="_blank" rel="noopener"><svg [lucideIcon]="I.external" aria-hidden="true"></svg>{{ L('Як клієнт', 'Customer view') }}</a>
        }
      </ng-template>
    </tk-data-table>
  `,
})
export class ApprovalsList {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly router = inject(Router);
  protected readonly money = fmtMoney;
  protected readonly rowId = (r: Row) => r.id;

  protected readonly rows = computed<Row[]>(() =>
    this.db.approvals.items().map((a) => {
      const o = this.db.orders.get(a.orderId);
      const total = a.items.reduce((s, i) => s + i.price, 0);
      const approved = a.items.filter((i) => i.decision === 'approved').reduce((s, i) => s + i.price, 0);
      return {
        ...a,
        r: {
          number: o?.number ?? '—',
          client: this.db.clients.get(o?.clientId)?.name ?? '—',
          plate: this.db.cars.get(o?.carId)?.plate ?? '',
          total,
          approved,
          pct: a.status === 'answered' && total ? Math.round((approved / total) * 100) : null,
        },
      };
    }),
  );

  protected readonly stats = computed(() => {
    const since = Date.now() - 30 * 86400000;
    const recent = this.rows().filter((r) => r.status === 'answered' && Date.parse(r.sentAt) >= since);
    const total = recent.reduce((s, r) => s + r.r.total, 0);
    const approved = recent.reduce((s, r) => s + r.r.approved, 0);
    return {
      waiting: this.rows().filter((r) => r.status === 'sent').length,
      conv: total ? fmtPct((approved / total) * 100) : '—',
      approved,
      declined: total - approved,
    };
  });

  protected readonly flash = computed(() => {
    const ch = this.db.externalChange();
    if (!ch || ch.name !== 'approvals') return [];
    return this.db.approvals.items().filter((a) => Date.parse(a.updatedAt) > ch.at - 5000).map((a) => a.id);
  });

  protected readonly columns: Column<Row>[] = [
    { key: 'number', label: L('Наряд', 'Work order'), value: (r) => r.r.number, required: true },
    { key: 'client', label: L('Клієнт', 'Customer'), value: (r) => r.r.client },
    { key: 'plate', label: L('Авто', 'Car'), value: (r) => r.r.plate, sortable: false },
    { key: 'sent', label: L('Надіслано', 'Sent'), value: (r) => r.sentAt, format: (r) => fmtDateTime(r.sentAt) },
    { key: 'status', label: L('Статус', 'Status'), value: (r) => STATUS[r.status] },
    { key: 'items', label: L('Позицій', 'Items'), value: (r) => r.items.length, align: 'right' },
    { key: 'total', label: L('Запропоновано', 'Proposed'), value: (r) => r.r.total, format: (r) => fmtMoney(r.r.total), align: 'right' },
    { key: 'approved', label: L('Погоджено', 'Approved'), value: (r) => r.r.approved, format: (r) => (r.status === 'answered' ? `${fmtMoney(r.r.approved)} (${r.r.pct}%)` : '—'), align: 'right' },
    { key: 'answered', label: L('Відповідь', 'Replied'), value: (r) => r.answeredAt, format: (r) => fmtDateTime(r.answeredAt), hidden: true },
    { key: 'link', label: '', value: () => '', sortable: false, csv: (r) => `/pogodzhennia/${r.token}` },
  ];

  protected readonly filters: FilterDef<Row>[] = [
    {
      key: 'status',
      label: L('Статус', 'Status'),
      options: (['sent', 'answered', 'cancelled'] as const).map((s) => ({ value: s, label: STATUS[s] })),
      match: (r, v) => v.includes(r.status),
    },
  ];

  protected label(s: Approval['status']): string {
    return STATUS[s];
  }
  protected open(r: Row): void {
    void this.router.navigate(['/naryady', r.orderId], { fragment: 'pogodzhennia' });
  }
}
