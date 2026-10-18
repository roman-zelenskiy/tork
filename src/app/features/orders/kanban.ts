import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { DbService } from '../../core/data/db.service';
import { Order, OrderStatus } from '../../core/data/models';
import { StatsService } from '../../core/domain/stats.service';
import { STATUS_FLOW, STATUS_LABEL, canMove } from '../../core/domain/order-math';
import { AppContext } from '../../core/ui/app-context.service';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { Plate } from '../../shared/ui/display';
import { Avatar } from '../../shared/ui/display';
import { Switch } from '../../shared/ui/checkbox';
import { Tooltip } from '../../shared/ui/tooltip';
import { statusBg, statusColor } from '../../shared/ui/status';
import { fmtDateShort, fmtMoney, fmtTime, sameDay, addDays, startOfDay } from '../../shared/format';
import { OrdersHeader } from './orders-header';
import { StatusMove } from './status-move';
import { L } from '../../core/i18n';

interface Col {
  status: OrderStatus;
  label: string;
  items: Order[];
  hidden: number;
}

/**
 * Канбан нарядів активної філії. Перетягування між колонками перевіряє допустимість переходу;
 * без миші — меню «Перемістити» на картці або Alt+→ / Alt+← на картці у фокусі.
 */
@Component({
  selector: 'tk-kanban',
  imports: [RouterLink, CdkDropListGroup, CdkDropList, CdkDrag, CdkDragPlaceholder, CdkMenu, CdkMenuItem, CdkMenuTrigger, Icon, Plate, Avatar, Switch, Tooltip, OrdersHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-orders-header />
    <div class="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-2">
      <tk-switch [(checked)]="showCancelled">{{ L('Показувати скасовані', 'Show cancelled') }}</tk-switch>
      <span class="hidden items-center gap-1.5 md:inline-flex">
        <svg [lucideIcon]="I.keyboard" [size]="14" aria-hidden="true"></svg>{{ L('Перетягніть картку або натисніть', 'Drag a card or press') }} <span class="kbd">Alt</span>+<span class="kbd">→</span> {{ L('на картці у фокусі', 'on the focused card') }}
      </span>
    </div>

    @if (!db.ready()) {
      <div class="flex gap-3 overflow-hidden" aria-hidden="true">
        @for (c of [1, 2, 3, 4, 5]; track c) {
          <div class="w-[272px] flex-none rounded-xl bg-subtle p-2">
            <div class="skeleton mb-3 h-4 w-24"></div>
            @for (k of [1, 2, 3]; track k) {
              <div class="card mb-2 h-[104px] p-3"><div class="skeleton mb-2 h-3 w-16"></div><div class="skeleton h-3 w-40"></div></div>
            }
          </div>
        }
      </div>
    } @else {
      <div class="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" cdkDropListGroup>
        <div class="flex min-h-[60dvh] gap-3">
          @for (col of columns(); track col.status) {
            <section
              class="flex w-[272px] flex-none flex-col rounded-xl bg-subtle/70 transition-colors duration-150"
              [attr.aria-labelledby]="'col-' + col.status"
              cdkDropList
              [cdkDropListData]="col.status"
              [cdkDropListEnterPredicate]="canEnter"
              (cdkDropListDropped)="drop($event)"
            >
              <header class="flex items-center gap-2 px-3 pt-3 pb-2">
                <span class="size-2 rounded-full" [style.background]="color(col.status)" aria-hidden="true"></span>
                <h2 class="m-0 flex-1 text-[13px] font-semibold" [id]="'col-' + col.status">{{ col.label }}</h2>
                <span class="text-xs text-ink-3 num" [attr.aria-label]="col.items.length + L(' нарядів', ' work orders')">{{ col.items.length }}</span>
              </header>
              <div class="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2" >
                @for (o of col.items; track o.id) {
                  <article
                    cdkDrag
                    [cdkDragData]="o"
                    (cdkDragStarted)="dragging(true)"
                    (cdkDragEnded)="dragging(false)"
                    tabindex="0"
                    class="card group relative p-3 outline-offset-1 transition-shadow duration-150 hover:shadow"
                    [class.flash]="flashIds().includes(o.id)"
                    [attr.aria-label]="o.number + ', ' + client(o) + ', ' + col.label"
                    (keydown.alt.arrowright)="$event.preventDefault(); step(o, 1)"
                    (keydown.alt.arrowleft)="$event.preventDefault(); step(o, -1)"
                    (keydown.enter)="openCard($event, o)"
                  >
                    <div class="mb-1.5 flex items-center gap-2">
                      <a [routerLink]="['/naryady', o.id]" class="row-link text-[13px] mono" (mousedown)="$event.stopPropagation()">{{ o.number }}</a>
                      @if (o.start) {
                        <span class="text-xs text-ink-3 num">{{ when(o) }}</span>
                      }
                      <button
                        type="button"
                        class="btn btn-ghost btn-icon btn-sm ml-auto -mr-1 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                        [cdkMenuTriggerFor]="moveMenu"
                        [cdkMenuTriggerData]="{ $implicit: o }"
                        [attr.aria-label]="L('Змінити статус ', 'Change status of ') + o.number"
                        (mousedown)="$event.stopPropagation()"
                      >
                        <svg [lucideIcon]="I.more" aria-hidden="true"></svg>
                      </button>
                    </div>
                    @if (car(o); as c) {
                      <div class="flex items-center gap-2"><tk-plate [value]="c.plate" /><span class="truncate-1 text-[13px] font-medium">{{ c.make }} {{ c.model }}</span></div>
                    }
                    <div class="mt-1 truncate-1 text-[13px] text-ink-2" [tkTip]="worksText(o)" [tipTruncated]="true">{{ worksText(o) }}</div>
                    <div class="mt-2.5 flex items-center gap-2">
                      @if (mech(o); as m) {
                        <tk-avatar [name]="m" [size]="22" [tkTip]="m" />
                      }
                      @if (waiting(o)) {
                        <span class="badge badge-accent h-5! text-[11px]!"><svg [lucideIcon]="I.message" [size]="12" aria-hidden="true"></svg>{{ L('чекає клієнта', 'awaiting customer') }}</span>
                      }
                      <span class="ml-auto text-[13px] font-medium num">{{ money(total(o)) }}</span>
                    </div>
                    <div *cdkDragPlaceholder class="min-h-[96px] rounded-xl border-2 border-dashed border-accent bg-accent-soft"></div>
                  </article>
                } @empty {
                  <p class="m-0 rounded-lg border border-dashed border-line-strong p-4 text-center text-xs text-ink-3">{{ L('Немає нарядів', 'No work orders') }}</p>
                }
                @if (col.hidden) {
                  <a routerLink="/naryady" class="link px-1 text-xs">{{ L('Ще ' + col.hidden + ' у таблиці', col.hidden + ' more in the table') }}</a>
                }
              </div>
            </section>
          }
        </div>
      </div>
    }

    <ng-template #moveMenu let-o>
      <div class="menu w-60" cdkMenu>
        <div class="menu-label">{{ L('Перемістити', 'Move') }} {{ o.number }}</div>
        @for (s of allStatuses; track s) {
          <button type="button" class="menu-item" cdkMenuItem [cdkMenuItemDisabled]="!allowed(o, s)" (cdkMenuItemTriggered)="moveTo(o, s)">
            <span class="size-2 rounded-full" [style.background]="color(s)" aria-hidden="true"></span>{{ label(s) }}
            @if (o.status === s) {
              <svg [lucideIcon]="I.check" class="ml-auto" aria-hidden="true"></svg>
            }
          </button>
        }
      </div>
    </ng-template>
    <p class="sr-only" aria-live="polite">{{ announce() }}</p>
  `,
})
export class Kanban {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly stats = inject(StatsService);
  private readonly ctx = inject(AppContext);
  private readonly mover = inject(StatusMove);
  protected readonly showCancelled = signal(false);
  protected readonly announce = signal('');
  protected readonly money = fmtMoney;
  protected readonly allStatuses: OrderStatus[] = [...STATUS_FLOW, 'skasovano'];

  protected readonly columns = computed<Col[]>(() => {
    const b = this.ctx.branchId();
    const today = startOfDay(new Date(this.ctx.now()));
    const tomorrowEnd = addDays(today, 2).getTime();
    const statuses: OrderStatus[] = this.showCancelled() ? [...STATUS_FLOW, 'skasovano'] : STATUS_FLOW;
    const byStatus = new Map<OrderStatus, Order[]>(statuses.map((s) => [s, []]));
    const hidden = new Map<OrderStatus, number>();
    for (const o of this.db.orders.items()) {
      if (o.branchId !== b || !byStatus.has(o.status)) continue;
      const t = Date.parse(o.start ?? o.createdAt);
      // записи — на сьогодні й завтра; видані й скасовані — лише сьогоднішні
      const visible =
        o.status === 'zapys'
          ? t < tomorrowEnd
          : o.status === 'vydano'
            ? !!o.closedAt && sameDay(new Date(o.closedAt), today)
            : o.status === 'skasovano'
              ? Date.parse(o.updatedAt) >= today.getTime() - 86400000 * 3
              : true;
      if (visible) byStatus.get(o.status)!.push(o);
      else hidden.set(o.status, (hidden.get(o.status) ?? 0) + 1);
    }
    return statuses.map((s) => ({
      status: s,
      label: STATUS_LABEL[s],
      items: byStatus.get(s)!.sort((a, b2) => (a.start ?? a.createdAt).localeCompare(b2.start ?? b2.createdAt)),
      hidden: s === 'zapys' ? (hidden.get(s) ?? 0) : 0,
    }));
  });

  protected readonly flashIds = computed(() => {
    const ch = this.db.externalChange();
    if (!ch || ch.name !== 'orders') return [];
    return this.db.orders.items().filter((o) => Date.parse(o.updatedAt) > ch.at - 5000).map((o) => o.id);
  });

  protected color = statusColor;
  protected bg = statusBg;
  protected label(s: OrderStatus): string {
    return STATUS_LABEL[s];
  }
  protected allowed(o: Order, s: OrderStatus): boolean {
    return canMove(o.status, s).ok;
  }

  protected readonly canEnter = (drag: CdkDrag<Order>, drop: CdkDropList<OrderStatus>) =>
    drag.data.status === drop.data || canMove(drag.data.status, drop.data).ok;

  protected client(o: Order): string {
    return this.db.clients.get(o.clientId)?.name ?? '';
  }
  protected car(o: Order) {
    return this.db.cars.get(o.carId);
  }
  protected mech(o: Order): string | null {
    return this.db.employees.get(o.mechanicId)?.name ?? null;
  }
  protected total(o: Order): number {
    return this.stats.totals().get(o.id)?.total ?? 0;
  }
  protected waiting(o: Order): boolean {
    return !!o.approvalId && this.db.approvals.get(o.approvalId)?.status === 'sent';
  }
  protected worksText(o: Order): string {
    const w = o.works.filter((x) => x.decision !== 'declined');
    return w.length ? w.map((x) => x.name).join(', ') : o.complaint || L('Роботи не додано', 'No jobs added');
  }
  protected when(o: Order): string {
    const d = new Date(o.start!);
    const today = startOfDay(new Date());
    if (sameDay(d, today)) return fmtTime(d);
    if (sameDay(d, addDays(today, 1))) return `${L('завтра', 'tomorrow')} ${fmtTime(d)}`;
    if (sameDay(d, addDays(today, -1))) return `${L('вчора', 'yesterday')} ${fmtTime(d)}`;
    return `${fmtDateShort(d)} ${fmtTime(d)}`;
  }

  protected dragging(on: boolean): void {
    document.body.classList.toggle('is-dragging', on);
  }

  protected async drop(e: CdkDragDrop<OrderStatus, OrderStatus, Order>): Promise<void> {
    const o = e.item.data;
    if (e.container.data === o.status) return;
    await this.moveTo(o, e.container.data);
  }

  protected async moveTo(o: Order, to: OrderStatus): Promise<void> {
    if (o.status === to) return;
    const ok = await this.mover.move(o, to);
    if (ok) this.announce.set(L(`${o.number} переміщено в «${STATUS_LABEL[to]}»`, `${o.number} moved to “${STATUS_LABEL[to]}”`));
  }

  protected step(o: Order, dir: 1 | -1): void {
    const i = STATUS_FLOW.indexOf(o.status);
    const to = STATUS_FLOW[i + dir];
    if (!to) return;
    void this.moveTo(o, to).then(() =>
      // фокус повертаємо на картку в новій колонці
      setTimeout(() => (document.querySelector(`[aria-label^="${o.number},"]`) as HTMLElement | null)?.focus(), 50),
    );
  }

  protected openCard(e: Event, o: Order): void {
    if (e.target !== e.currentTarget) return;
    (e.currentTarget as HTMLElement).querySelector<HTMLAnchorElement>('a')?.click();
    void o;
  }
}
