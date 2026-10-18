import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { DbService } from '../../core/data/db.service';
import { MovementType, StockMovement } from '../../core/data/models';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { Select } from '../../shared/ui/select';
import { TextField } from '../../shared/ui/text-field';
import { EmptyState } from '../../shared/ui/states';
import { Option, norm } from '../../shared/ui/option';
import { fmtDateTime } from '../../shared/format';
import { downloadFile } from '../../shared/download';
import { StockHeader } from './stock-header';
import { BRAND, L } from '../../core/i18n';

export const MV_LABEL: Record<MovementType, string> = {
  in: L('Надходження', 'Receipt'),
  out: L('Видано в наряд', 'Issued to work order'),
  transfer: L('Переміщення', 'Transfer'),
  reserve: L('Резерв', 'Reserved'),
  release: L('Знято резерв', 'Released'),
  writeoff: L('Списання', 'Write-off'),
};
const MV_TONE: Record<MovementType, string> = {
  in: 'badge-success',
  out: 'badge-info',
  transfer: 'badge-accent',
  reserve: '',
  release: '',
  writeoff: 'badge-danger',
};

/** Журнал рухів складу. Тисячі записів — віртуальна прокрутка CDK */
@Component({
  selector: 'tk-movements',
  imports: [RouterLink, ScrollingModule, Icon, Select, TextField, EmptyState, StockHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-stock-header />
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <tk-text-field class="w-full sm:w-64" size="sm" type="search" [icon]="I.search" [placeholder]="L('Артикул, наряд, коментар…', 'SKU, work order, comment…')" [ariaLabel]="L('Пошук у журналі', 'Search the log')" [clearable]="true" [(value)]="query" />
      <tk-select class="w-[calc(50%-4px)] sm:w-48" size="sm" [multiple]="true" [options]="typeOptions" [placeholder]="L('Операція', 'Operation')" [ariaLabel]="L('Тип операції', 'Operation type')" [(values)]="types" />
      <tk-select class="w-[calc(50%-4px)] sm:w-48" size="sm" [options]="branchOptions()" [placeholder]="L('Усі філії', 'All branches')" [ariaLabel]="L('Філія', 'Branch')" [clearable]="true" [(value)]="branch" />
      <button type="button" class="btn btn-sm btn-icon ml-auto" [attr.aria-label]="L('Експорт у CSV', 'Export to CSV')" [disabled]="!rows().length" (click)="csv()"><svg [lucideIcon]="I.download" aria-hidden="true"></svg></button>
    </div>

    <div class="card overflow-hidden" role="table" [attr.aria-label]="L('Журнал рухів складу', 'Stock movement log')" [attr.aria-rowcount]="rows().length">
      <div class="hidden grid-cols-[150px_150px_minmax(0,1fr)_80px_140px_minmax(0,1fr)] gap-3 border-b border-line bg-subtle px-4 py-2.5 text-xs font-medium text-ink-2 md:grid" role="row">
        <span role="columnheader">{{ L('Дата', 'Date') }}</span><span role="columnheader">{{ L('Операція', 'Operation') }}</span><span role="columnheader">{{ L('Запчастина', 'Part') }}</span><span role="columnheader" class="text-right">{{ L('К-сть', 'Qty') }}</span><span role="columnheader">{{ L('Філія', 'Branch') }}</span><span role="columnheader">{{ L('Підстава', 'Reference') }}</span>
      </div>
      @if (!db.ready()) {
        @for (i of [1, 2, 3, 4, 5, 6]; track i) {
          <div class="flex h-12 items-center gap-4 border-b border-line px-4"><div class="skeleton h-3 w-28"></div><div class="skeleton h-3 flex-1"></div></div>
        }
      } @else if (!rows().length) {
        <tk-empty art="stock" [title]="L('Рухів не знайдено', 'No movements found')" [text]="L('Змініть фільтри або пошуковий запит.', 'Change the filters or search.')" />
      } @else {
        <cdk-virtual-scroll-viewport itemSize="52" class="h-[min(640px,calc(100dvh-280px))]" tabindex="0" role="rowgroup" [attr.aria-label]="L('Записи журналу рухів', 'Movement log entries')">
          <div
            *cdkVirtualFor="let m of rows(); trackBy: trackId"
            role="row"
            class="grid h-[52px] grid-cols-[1fr_auto] items-center gap-x-3 border-b border-line px-4 text-[13px] md:grid-cols-[150px_150px_minmax(0,1fr)_80px_140px_minmax(0,1fr)]"
          >
            <span role="cell" class="hidden text-ink-2 num md:block">{{ dt(m.createdAt) }}</span>
            <span role="cell" class="hidden md:block"><span class="badge" [class]="tone(m.type)">{{ label(m.type) }}</span></span>
            <span role="cell" class="min-w-0">
              <span class="block truncate-1"><span class="mono font-medium">{{ part(m.partId)?.sku ?? '—' }}</span> {{ part(m.partId)?.name }}</span>
              <span class="block truncate-1 text-[11px] text-ink-3 md:hidden">{{ label(m.type) }}, {{ dt(m.createdAt) }}</span>
            </span>
            <span role="cell" class="text-right font-medium num" [class.text-success]="sign(m) > 0" [class.text-danger]="sign(m) < 0">{{ sign(m) > 0 ? '+' : sign(m) < 0 ? '−' : '' }}{{ m.qty }}</span>
            <span role="cell" class="hidden truncate-1 text-ink-2 md:block">{{ branchName(m.branchId) }}{{ m.toBranchId ? ' → ' + branchName(m.toBranchId) : '' }}</span>
            <span role="cell" class="hidden truncate-1 md:block">
              @if (m.orderId && db.orders.get(m.orderId); as o) {
                <a [routerLink]="['/naryady', o.id]" class="link">{{ m.note }}</a>
              } @else {
                <span class="text-ink-2">{{ m.note }}</span>
              }
            </span>
          </div>
        </cdk-virtual-scroll-viewport>
      }
    </div>
    <p class="mt-2 text-xs text-ink-3 num">{{ rows().length }} {{ L('записів', 'entries') }}</p>
  `,
})
export class Movements {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly db = inject(DbService);
  protected readonly dt = fmtDateTime;
  protected readonly query = signal('');
  protected readonly types = signal<MovementType[]>([]);
  protected readonly branch = signal<string | null>(null);
  protected readonly typeOptions: Option<MovementType>[] = (Object.keys(MV_LABEL) as MovementType[]).map((t) => ({ value: t, label: MV_LABEL[t] }));
  protected readonly branchOptions = computed<Option<string>[]>(() => this.db.branches.items().map((b) => ({ value: b.id, label: b.name })));
  protected readonly trackId = (_: number, m: StockMovement) => m.id;

  protected readonly rows = computed(() => {
    const q = norm(this.query().trim());
    const types = this.types();
    const b = this.branch();
    return [...this.db.movements.items()]
      .filter((m) => (!types.length || types.includes(m.type)) && (!b || m.branchId === b || m.toBranchId === b))
      .filter((m) => {
        if (!q) return true;
        const p = this.db.parts.get(m.partId);
        return norm(`${p?.sku} ${p?.brand} ${p?.name} ${m.note}`).includes(q);
      })
      .sort((a, c) => c.createdAt.localeCompare(a.createdAt));
  });

  protected part(id: string) {
    return this.db.parts.get(id);
  }
  protected branchName(id: string): string {
    return this.db.branches.get(id)?.name.replace(`${BRAND} `, '') ?? '—';
  }
  protected label(t: MovementType): string {
    return MV_LABEL[t];
  }
  protected tone(t: MovementType): string {
    return MV_TONE[t];
  }
  protected sign(m: StockMovement): number {
    return m.type === 'in' ? 1 : m.type === 'out' || m.type === 'writeoff' ? -1 : 0;
  }
  protected csv(): void {
    const lines = [L('Дата;Операція;Артикул;Назва;Кількість;Філія;Підстава', 'Date;Operation;SKU;Name;Quantity;Branch;Reference')];
    for (const m of this.rows()) {
      const p = this.part(m.partId);
      lines.push([m.createdAt.slice(0, 16).replace('T', ' '), MV_LABEL[m.type], p?.sku ?? '', `"${p?.name ?? ''}"`, this.sign(m) * m.qty || m.qty, this.branchName(m.branchId), `"${m.note}"`].join(';'));
    }
    downloadFile(`rukh-skladu-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }
}
