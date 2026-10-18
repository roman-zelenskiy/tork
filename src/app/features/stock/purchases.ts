import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DbService } from '../../core/data/db.service';
import { PurchaseOrder } from '../../core/data/models';
import { StockService } from '../../core/domain/stock.service';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { EmptyState } from '../../shared/ui/states';
import { Stepper } from '../../shared/ui/stepper';
import { Combobox } from '../../shared/ui/combobox';
import { Option } from '../../shared/ui/option';
import { fmtDate, fmtMoney } from '../../shared/format';
import { StockHeader } from './stock-header';
import { BRAND, L } from '../../core/i18n';

const ST: Record<PurchaseOrder['status'], { label: string; tone: string }> = {
  draft: { label: L('Чернетка', 'Draft'), tone: '' },
  sent: { label: L('Надіслано', 'Sent'), tone: 'badge-accent' },
  received: { label: L('Отримано', 'Received'), tone: 'badge-success' },
};

/** Замовлення постачальникам: чернетки (зокрема автоматичні за мінімальним залишком) → надіслано → отримано */
@Component({
  selector: 'tk-purchases',
  imports: [Icon, EmptyState, Stepper, Combobox, StockHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-stock-header />
    @if (!db.ready()) {
      <div class="grid gap-4 lg:grid-cols-2">@for (i of [1, 2]; track i) {<div class="skeleton h-64"></div>}</div>
    } @else if (!list().length) {
      <div class="card"><tk-empty art="stock" [title]="L('Замовлень немає', 'No purchase orders')" [text]="L('Чернетки з’являться автоматично, коли запчастина опуститься до мінімального залишку.', 'Drafts appear automatically when a part drops to its minimum stock.')" /></div>
    } @else {
      <div class="grid gap-4 xl:grid-cols-2">
        @for (po of list(); track po.id) {
          <section class="card flex flex-col" [attr.aria-labelledby]="'po-' + po.id">
            <header class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <h2 [id]="'po-' + po.id" class="m-0 text-[15px] font-semibold mono">{{ po.number }}</h2>
              <span class="badge" [class]="st(po).tone">{{ st(po).label }}</span>
              @if (po.auto) {
                <span class="badge badge-info">{{ L('авто', 'auto') }}</span>
              }
              <span class="ml-auto text-[13px] text-ink-2">{{ supplier(po) }}, {{ branch(po) }}</span>
            </header>
            <ul class="m-0 flex-1 list-none p-0">
              @for (l of po.lines; track l.partId; let i = $index) {
                <li class="flex items-center gap-3 border-b border-line px-4 py-2 text-[13px] last:border-0">
                  <span class="min-w-0 flex-1"><span class="mono font-medium">{{ part(l.partId)?.sku }}</span> <span class="ml-1.5 text-ink-2">{{ part(l.partId)?.name }}</span></span>
                  @if (po.status === 'draft') {
                    <tk-stepper class="w-28" size="sm" [value]="l.qty" [min]="1" [max]="999" [ariaLabel]="L('Кількість', 'Quantity')" (changed)="setQty(po, i, $event)" />
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="L('Прибрати рядок', 'Remove line')" (click)="removeLine(po, i)"><svg [lucideIcon]="I.x" [size]="14" aria-hidden="true"></svg></button>
                  } @else {
                    <span class="num">× {{ l.qty }}</span>
                  }
                  <span class="w-24 text-right num">{{ money(l.qty * l.cost) }}</span>
                </li>
              }
            </ul>
            @if (po.status === 'draft') {
              <div class="px-4 pt-2"><tk-combobox size="sm" [options]="partOptions()" [resetOnPick]="true" [icon]="I.plus" [placeholder]="L('Додати позицію…', 'Add item…')" [ariaLabel]="L('Додати позицію', 'Add item')" (selected)="addLine(po, $event.value)" /></div>
            }
            <footer class="flex flex-wrap items-center gap-2 px-4 py-3">
              <span class="text-[13px] text-ink-2">{{ fmtDate(po.createdAt) }}</span>
              <span class="ml-2 font-semibold num">{{ money(sum(po)) }}</span>
              <span class="ml-auto flex gap-2">
                @if (po.status === 'draft') {
                  <button type="button" class="btn btn-sm btn-danger" (click)="remove(po)">{{ L('Видалити', 'Delete') }}</button>
                  <button type="button" class="btn btn-sm btn-primary" [disabled]="!po.lines.length" (click)="send(po)"><svg [lucideIcon]="I.send" aria-hidden="true"></svg>{{ L('Надіслати постачальнику', 'Send to supplier') }}</button>
                } @else if (po.status === 'sent') {
                  <button type="button" class="btn btn-sm btn-primary" (click)="receive(po)"><svg [lucideIcon]="I.packagePlus" aria-hidden="true"></svg>{{ L('Оприбуткувати', 'Receive') }}</button>
                }
              </span>
            </footer>
          </section>
        }
      </div>
    }
  `,
})
export class Purchases {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly stock = inject(StockService);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);
  protected readonly money = fmtMoney;
  protected readonly fmtDate = fmtDate;

  protected readonly list = computed(() => {
    const rank = { draft: 0, sent: 1, received: 2 };
    return [...this.db.purchases.items()].sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt));
  });
  protected readonly partOptions = computed<Option<string>[]>(() => this.db.parts.items().map((p) => ({ value: p.id, label: `${p.brand} ${p.name}`, hint: p.sku, keywords: p.sku })));

  protected st(po: PurchaseOrder) {
    return ST[po.status];
  }
  protected part(id: string) {
    return this.db.parts.get(id);
  }
  protected supplier(po: PurchaseOrder): string {
    return this.db.suppliers.get(po.supplierId)?.name ?? '—';
  }
  protected branch(po: PurchaseOrder): string {
    return this.db.branches.get(po.branchId)?.name.replace(`${BRAND} `, '') ?? '';
  }
  protected sum(po: PurchaseOrder): number {
    return po.lines.reduce((s, l) => s + l.qty * l.cost, 0);
  }

  private async patch(po: PurchaseOrder, lines: PurchaseOrder['lines']): Promise<void> {
    try {
      await this.db.purchases.update(po.id, { lines }, { log: false });
    } catch (e) {
      this.toast.error(e);
    }
  }
  protected setQty(po: PurchaseOrder, i: number, qty: number): void {
    void this.patch(po, po.lines.map((l, j) => (j === i ? { ...l, qty } : l)));
  }
  protected removeLine(po: PurchaseOrder, i: number): void {
    void this.patch(po, po.lines.filter((_, j) => j !== i));
  }
  protected addLine(po: PurchaseOrder, partId: string): void {
    const p = this.db.parts.get(partId);
    if (!p || po.lines.some((l) => l.partId === partId)) return;
    void this.patch(po, [...po.lines, { partId, qty: Math.max(1, p.minStock), cost: p.cost }]);
  }

  protected async send(po: PurchaseOrder): Promise<void> {
    await this.db.purchases.update(po.id, { status: 'sent' }, { log: L(`${po.number} надіслано постачальнику`, `${po.number} sent to supplier`) });
    this.toast.success(L(`${po.number} надіслано: ${this.supplier(po)} (імітація email)`, `${po.number} sent to ${this.supplier(po)} (simulated email)`));
  }

  protected async receive(po: PurchaseOrder): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: L(`Оприбуткувати ${po.number}?`, `Receive ${po.number}?`),
      text: L(`${po.lines.length} позицій буде додано на склад філії ${this.branch(po)}.`, `${po.lines.length} items will be added to ${this.branch(po)} stock.`),
      confirm: L('Оприбуткувати', 'Receive'),
    });
    if (!ok) return;
    try {
      for (const l of po.lines) {
        const p = this.db.parts.get(l.partId);
        if (p) await this.stock.move(p, 'in', l.qty, po.branchId, L(`Надходження за ${po.number}`, `Received on ${po.number}`));
      }
      await this.db.purchases.update(po.id, { status: 'received' }, { log: L(`${po.number} оприбутковано`, `${po.number} received`) });
      this.toast.success(L(`${po.number} оприбутковано`, `${po.number} received`));
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected async remove(po: PurchaseOrder): Promise<void> {
    const ok = await this.dialogs.confirm({ title: L(`Видалити чернетку ${po.number}?`, `Delete draft ${po.number}?`), confirm: L('Видалити', 'Delete'), danger: true });
    if (!ok) return;
    const r = await this.db.purchases.remove(po.id, { log: L(`Видалено чернетку ${po.number}`, `Draft ${po.number} deleted`) });
    if (r) this.toast.undo(L('Чернетку видалено', 'Draft deleted'), () => this.db.purchases.restore(r));
  }
}
