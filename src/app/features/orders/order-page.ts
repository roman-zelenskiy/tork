import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { DbService } from '../../core/data/db.service';
import { Order, OrderPart, OrderStatus, OrderWork, WorkState } from '../../core/data/models';
import { StatsService } from '../../core/domain/stats.service';
import { OrdersService } from '../../core/domain/orders.service';
import { StockService } from '../../core/domain/stock.service';
import { STATUS_FLOW, STATUS_LABEL, canMove, partPrice, workPrice } from '../../core/domain/order-math';
import { ZONE_LABEL, DAMAGE_LABEL } from '../../core/domain/body';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { TorkTitleStrategy } from '../../core/ui/title.strategy';
import { HasUnsaved } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { EmptyState } from '../../shared/ui/states';
import { Plate, Skeleton } from '../../shared/ui/display';
import { StatusBadge, statusColor } from '../../shared/ui/status';
import { MakeLogo } from '../../shared/ui/make-logo';
import { Combobox } from '../../shared/ui/combobox';
import { Select } from '../../shared/ui/select';
import { Stepper } from '../../shared/ui/stepper';
import { TextField } from '../../shared/ui/text-field';
import { Tooltip } from '../../shared/ui/tooltip';
import { Option } from '../../shared/ui/option';
import { fmtAgo, fmtDateTime, fmtDuration, fmtHours, fmtKm, fmtMoney, fmtPhone, fmtTime } from '../../shared/format';
import { StatusMove } from './status-move';
import { PaymentDialog, PAY_LABEL } from './payment-dialog';
import { ScheduleDialog } from './schedule-dialog';
import { ApprovalPanel } from '../approvals/approval-panel';
import { L } from '../../core/i18n';

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  zapys: { to: 'pryiom', label: L('Прийняти авто', 'Accept car') },
  pryiom: { to: 'diagnostyka', label: L('Почати діагностику', 'Start diagnostics') },
  diagnostyka: { to: 'v_roboti', label: L('Передати в роботу', 'Start work') },
  pogodzhennia: { to: 'v_roboti', label: L('Передати в роботу', 'Start work') },
  v_roboti: { to: 'kontrol', label: L('На контроль якості', 'To quality check') },
  kontrol: { to: 'gotovo', label: L('Готово до видачі', 'Ready for pickup') },
  gotovo: { to: 'vydano', label: L('Видати клієнту', 'Hand over to customer') },
  skasovano: { to: 'zapys', label: L('Відновити як запис', 'Restore as booking') },
};

const STATE_LABEL: Record<WorkState, string> = L(
  { todo: 'Не почато', in_progress: 'Виконується', paused: 'Пауза', done: 'Виконано' },
  { todo: 'Not started', in_progress: 'In progress', paused: 'Paused', done: 'Done' },
);

@Component({
  selector: 'tk-order-page',
  imports: [RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger, Icon, EmptyState, Plate, Skeleton, StatusBadge, MakeLogo, Combobox, Select, Stepper, TextField, Tooltip, ApprovalPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/naryady" class="no-print mb-3 inline-flex items-center gap-1 rounded-md text-[13px] text-ink-2 hover:text-ink">
      <svg [lucideIcon]="I.arrowLeft" [size]="14" aria-hidden="true"></svg>{{ L('Наряди', 'Work orders') }}
    </a>
    @if (!db.ready()) {
      <div class="skeleton mb-3 h-7 w-72"></div>
      <div class="skeleton mb-6 h-2 w-full"></div>
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="flex flex-col gap-4"><div class="card p-4"><tk-skeleton [rows]="4" /></div><div class="card p-4"><tk-skeleton [rows]="3" /></div></div>
        <div class="card p-4"><tk-skeleton [rows]="6" [cols]="2" /></div>
      </div>
    } @else if (!order()) {
      <tk-empty art="orders" [title]="L('Наряд не знайдено', 'Work order not found')" [text]="L('Можливо, його видалили в іншій вкладці.', 'It may have been deleted in another tab.')">
        <a routerLink="/naryady" class="btn">{{ L('До нарядів', 'To work orders') }}</a>
      </tk-empty>
    } @else {
      @let o = order()!;
      @let t = totals()!;
      <header class="mb-4 flex flex-wrap items-start gap-x-4 gap-y-3">
        <div class="min-w-0 flex-1 basis-72">
          <div class="flex flex-wrap items-center gap-2.5">
            <h1 class="m-0 text-[22px] leading-tight font-semibold mono">{{ o.number }}</h1>
            <tk-status [status]="o.status" />
            @if (approvalWaiting()) {
              <span class="badge badge-accent"><svg [lucideIcon]="I.message" [size]="12" aria-hidden="true"></svg>{{ L('чекає відповіді клієнта', 'awaiting customer reply') }}</span>
            }
          </div>
          <p class="mt-1 mb-0 text-[13px] text-ink-2">
            {{ L('Створено', 'Created') }} {{ dt(o.createdAt) }}{{ o.closedAt ? L(', видано ', ', handed over ') + dt(o.closedAt) : '' }}
          </p>
        </div>
        <div class="no-print flex flex-wrap gap-2">
          @if (next(); as n) {
            <button type="button" class="btn btn-primary" (click)="move(n.to)">{{ n.label }}<svg [lucideIcon]="I.arrowRight" aria-hidden="true"></svg></button>
          }
          <button type="button" class="btn" [cdkMenuTriggerFor]="statusMenu"><svg [lucideIcon]="I.circleDot" aria-hidden="true"></svg>{{ L('Статус', 'Status') }}</button>
          <button type="button" class="btn" [cdkMenuTriggerFor]="printMenu"><svg [lucideIcon]="I.printer" aria-hidden="true"></svg>{{ L('Друк', 'Print') }}</button>
          <button type="button" class="btn btn-icon" [cdkMenuTriggerFor]="more" [attr.aria-label]="L('Інші дії', 'More actions')"><svg [lucideIcon]="I.more" aria-hidden="true"></svg></button>
        </div>
        <ng-template #statusMenu>
          <div class="menu w-56" cdkMenu>
            @for (s of allStatuses; track s) {
              <button type="button" class="menu-item" cdkMenuItem [cdkMenuItemDisabled]="!allowed(s)" (cdkMenuItemTriggered)="move(s)">
                <span class="size-2 rounded-full" [style.background]="color(s)" aria-hidden="true"></span>{{ label(s) }}
                @if (o.status === s) {
                  <svg [lucideIcon]="I.check" class="ml-auto" aria-hidden="true"></svg>
                }
              </button>
            }
          </div>
        </ng-template>
        <ng-template #printMenu>
          <div class="menu w-56" cdkMenu>
            <a class="menu-item" cdkMenuItem [routerLink]="['/naryady', o.id, 'druk']" [queryParams]="{ forma: 'naryad' }"><svg [lucideIcon]="I.file" aria-hidden="true"></svg>{{ L('Замовлення-наряд', 'Work order') }}</a>
            <a class="menu-item" cdkMenuItem [routerLink]="['/naryady', o.id, 'druk']" [queryParams]="{ forma: 'akt-pryiomu' }"><svg [lucideIcon]="I.clipboardCheck" aria-hidden="true"></svg>{{ L('Акт прийому', 'Intake report') }}</a>
            <a class="menu-item" cdkMenuItem [routerLink]="['/naryady', o.id, 'druk']" [queryParams]="{ forma: 'akt-robit' }"><svg [lucideIcon]="I.receipt" aria-hidden="true"></svg>{{ L('Акт виконаних робіт', 'Completion certificate') }}</a>
          </div>
        </ng-template>
        <ng-template #more>
          <div class="menu w-56" cdkMenu>
            <button type="button" class="menu-item" cdkMenuItem (cdkMenuItemTriggered)="editSchedule()"><svg [lucideIcon]="I.calendarClock" aria-hidden="true"></svg>{{ L('Змінити запис', 'Change booking') }}</button>
            <a class="menu-item" cdkMenuItem [routerLink]="['/naryady', o.id, 'pryiom']"><svg [lucideIcon]="I.clipboardPen" aria-hidden="true"></svg>{{ L('Акт прийому', 'Intake report') }}</a>
            <div class="menu-sep"></div>
            <button type="button" class="menu-item danger" cdkMenuItem [cdkMenuItemDisabled]="!allowed('skasovano')" (cdkMenuItemTriggered)="move('skasovano')"><svg [lucideIcon]="I.ban" aria-hidden="true"></svg>{{ L('Скасувати наряд', 'Cancel work order') }}</button>
            <button type="button" class="menu-item danger" cdkMenuItem (cdkMenuItemTriggered)="remove()"><svg [lucideIcon]="I.trash" aria-hidden="true"></svg>{{ L('Видалити наряд', 'Delete work order') }}</button>
          </div>
        </ng-template>
      </header>

      <!-- прогрес статусів -->
      @if (o.status !== 'skasovano') {
        <ol class="no-print mb-6 grid list-none grid-cols-8 gap-1 p-0" [attr.aria-label]="L('Етапи наряду', 'Work order stages')">
          @for (s of flow; track s; let i = $index) {
            <li class="min-w-0" [attr.aria-current]="s === o.status ? 'step' : null">
              <div class="h-1.5 rounded-full transition-colors duration-200" [style.background]="i <= flowIndex() ? color(o.status) : 'var(--muted)'"></div>
              <div class="mt-1.5 hidden truncate-1 text-[11px] md:block" [class.text-ink]="s === o.status" [class.font-semibold]="s === o.status" [class.text-ink-3]="s !== o.status">{{ label(s) }}</div>
            </li>
          }
        </ol>
      }

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="flex min-w-0 flex-col gap-5">
          <!-- роботи -->
          <section class="card" aria-labelledby="w-h">
            <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <h2 id="w-h" class="m-0 flex-1 text-[15px] font-semibold">{{ L('Роботи', 'Jobs') }}</h2>
              <span class="text-[13px] text-ink-2 num">{{ hours(t.hours) }}, {{ money(t.works) }}</span>
            </div>
            <div class="overflow-x-auto">
              <table class="tbl">
                <thead><tr><th>{{ L('Робота', 'Job') }}</th><th>{{ L('Механік', 'Mechanic') }}</th><th class="text-right">{{ L('Н/г', 'Hrs') }}</th><th class="text-right">{{ L('Сума', 'Amount') }}</th><th>{{ L('Стан', 'State') }}</th><th class="w-10"><span class="sr-only">{{ L('Дії', 'Actions') }}</span></th></tr></thead>
                <tbody>
                  @for (w of o.works; track w.id) {
                    <tr [class.bg-subtle]="w.decision === 'declined'">
                      <td class="whitespace-normal!">
                        <div class="min-w-[180px] text-[13px]" [class.line-through]="w.decision === 'declined'" [class.text-ink-2]="w.decision === 'declined'">{{ w.name }}</div>
                        @if (w.needsApproval) {
                          <span class="text-xs" [class]="w.decision === 'approved' ? 'text-success' : w.decision === 'declined' ? 'text-danger' : 'text-accent-ink'">
                            {{ w.decision === 'approved' ? L('Погоджено клієнтом', 'Approved by customer') : w.decision === 'declined' ? L('Клієнт відмовився', 'Customer declined') : L('Чекає погодження', 'Awaiting approval') }}
                          </span>
                        }
                      </td>
                      <td class="w-40"><tk-select class="w-40" size="sm" [options]="mechOptions()" [value]="w.mechanicId" placeholder="—" [ariaLabel]="L('Механік', 'Mechanic')" (valueChange)="setWork(w, { mechanicId: $event })" /></td>
                      <td class="w-[124px]"><tk-stepper class="w-[112px]" size="sm" [value]="w.hours" [min]="0.1" [max]="40" [step]="0.1" [decimals]="1" [ariaLabel]="L('Нормо-години', 'Standard hours')" (changed)="setWork(w, { hours: $event })" /></td>
                      <td class="text-right num"><span class="block font-medium">{{ money(wp(w)) }}</span><span class="block text-[11px] text-ink-3">× {{ money(w.rate) }}</span></td>
                      <td><span class="badge" [class]="stateClass(w.state)">{{ stateLabel(w.state) }}</span></td>
                      <td><button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="L('Прибрати ', 'Remove ') + w.name" (click)="removeLine('work', w)"><svg [lucideIcon]="I.trash" [size]="14" aria-hidden="true"></svg></button></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="6" class="py-6! text-center text-[13px] text-ink-3">{{ L('Додайте роботи з довідника нормо-годин', 'Add jobs from the standard hours directory') }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="no-print p-3">
              <tk-combobox
                [options]="workOptions()"
                [resetOnPick]="true"
                [icon]="I.plus"
                size="sm"
                [ariaLabel]="L('Додати роботу', 'Add job')"
                [placeholder]="L('Додати роботу: код або назва…', 'Add job: code or name…')"
                [createLabel]="L('Своя робота', 'Custom job')"
                (selected)="addWork($event.value)"
                (create)="addCustomWork($event)"
              />
            </div>
          </section>

          <!-- запчастини -->
          <section class="card" aria-labelledby="p-h">
            <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <h2 id="p-h" class="m-0 flex-1 text-[15px] font-semibold">{{ L('Запчастини', 'Parts') }}</h2>
              <span class="text-[13px] text-ink-2 num">{{ money(t.parts) }}</span>
            </div>
            <div class="overflow-x-auto">
              <table class="tbl">
                <thead><tr><th>{{ L('Запчастина', 'Part') }}</th><th class="text-right">{{ L('К-сть', 'Qty') }}</th><th class="text-right">{{ L('Ціна', 'Price') }}</th><th class="text-right">{{ L('Сума', 'Amount') }}</th><th>{{ L('Склад', 'Stock') }}</th><th class="w-10"><span class="sr-only">{{ L('Дії', 'Actions') }}</span></th></tr></thead>
                <tbody>
                  @for (p of o.parts; track p.id) {
                    <tr [class.bg-subtle]="p.decision === 'declined'">
                      <td class="whitespace-normal!">
                        <div class="min-w-[200px] text-[13px]" [class.line-through]="p.decision === 'declined'" [class.text-ink-2]="p.decision === 'declined'">{{ p.name }}</div>
                        <div class="text-xs text-ink-3 mono">{{ p.sku }}</div>
                      </td>
                      <td class="w-[124px]"><tk-stepper class="w-[112px]" size="sm" [value]="p.qty" [min]="1" [max]="99" [ariaLabel]="L('Кількість', 'Quantity')" [disabled]="p.issued" (changed)="setPartQty(p, $event)" /></td>
                      <td class="text-right num">{{ money(p.price) }}</td>
                      <td class="text-right font-medium num">{{ money(pp(p)) }}</td>
                      <td>
                        @if (p.issued) {
                          <span class="badge badge-success">{{ L('Видано', 'Issued') }}</span>
                        } @else if (p.reserved) {
                          <span class="badge badge-info">{{ L('Резерв', 'Reserved') }}</span>
                        } @else if (o.status === 'zapys') {
                          <span class="badge" [tkTip]="L('Запчастину буде зарезервовано, коли авто приймуть', 'The part will be reserved when the car is accepted')">{{ L('Очікує', 'Pending') }}</span>
                        } @else {
                          <span class="badge badge-danger" [tkTip]="L('Доступно: ', 'Available: ') + avail(p)">{{ L('Немає на складі', 'Out of stock') }}</span>
                        }
                      </td>
                      <td><button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="L('Прибрати ', 'Remove ') + p.name" (click)="removeLine('part', p)"><svg [lucideIcon]="I.trash" [size]="14" aria-hidden="true"></svg></button></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="6" class="py-6! text-center text-[13px] text-ink-3">{{ L('Запчастин ще немає', 'No parts yet') }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="no-print p-3">
              <tk-combobox [options]="partOptions()" [resetOnPick]="true" [icon]="I.plus" size="sm" [ariaLabel]="L('Додати запчастину', 'Add part')" [placeholder]="L('Додати запчастину: артикул, бренд, назва…', 'Add part: SKU, brand, name…')" (selected)="addPart($event.value)" />
            </div>
          </section>

          <!-- підсумок -->
          <section class="card p-4" aria-labelledby="s-h">
            <h2 id="s-h" class="m-0 mb-3 text-[15px] font-semibold">{{ L('Оплата', 'Payment') }}</h2>
            <div class="grid gap-6 md:grid-cols-2">
              <dl class="m-0 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 text-[13px]">
                <dt class="text-ink-2">{{ L('Роботи', 'Jobs') }}</dt><dd class="m-0 text-right num">{{ money(t.works) }}</dd>
                <dt class="text-ink-2">{{ L('Запчастини', 'Parts') }}</dt><dd class="m-0 text-right num">{{ money(t.parts) }}</dd>
                <dt class="flex items-center gap-2 text-ink-2">{{ L('Знижка', 'Discount') }}
                  <tk-stepper class="w-28" size="sm" [value]="o.discountPct" [min]="0" [max]="50" suffix="%" [ariaLabel]="L('Знижка, відсотків', 'Discount, percent')" (changed)="setDiscount($event)" />
                </dt>
                <dd class="m-0 text-right num">{{ t.discount ? '−' + money(t.discount) : '—' }}</dd>
                <dt class="border-t border-line pt-2 font-semibold">{{ L('До сплати', 'Total due') }}</dt><dd class="m-0 border-t border-line pt-2 text-right text-base font-semibold num">{{ money(t.total) }}</dd>
                <dt class="text-ink-2">{{ L('Сплачено', 'Paid') }}</dt><dd class="m-0 text-right num">{{ money(t.paid) }}</dd>
                <dt class="font-medium" [class.text-danger]="t.debt > 0">{{ L('Залишок', 'Balance') }}</dt><dd class="m-0 text-right font-semibold num" [class.text-danger]="t.debt > 0">{{ money(t.debt) }}</dd>
              </dl>
              <div>
                <h3 class="m-0 mb-2 text-[13px] font-medium text-ink-2">{{ L('Платежі', 'Payments') }}</h3>
                @for (p of o.payments; track p.id) {
                  <div class="flex items-center gap-2 border-t border-line py-1.5 text-[13px] first:border-0">
                    <svg [lucideIcon]="p.method === 'cash' ? I.banknote : p.method === 'card' ? I.creditCard : I.building" class="text-ink-3" aria-hidden="true"></svg>
                    <span class="flex-1">{{ payLabel(p.method) }}<span class="block text-xs text-ink-3">{{ dt(p.at) }}</span></span>
                    <span class="num">{{ money(p.amount) }}</span>
                  </div>
                } @empty {
                  <p class="m-0 text-[13px] text-ink-3">{{ L('Оплат ще не було', 'No payments yet') }}</p>
                }
                @if (t.debt > 0) {
                  <button type="button" class="btn btn-primary no-print mt-3 w-full" (click)="pay()"><svg [lucideIcon]="I.wallet" aria-hidden="true"></svg>{{ L('Прийняти оплату', 'Take payment') }}</button>
                }
              </div>
            </div>
          </section>

          <tk-approval-panel id="pogodzhennia" [order]="o" />
        </div>

        <aside class="flex min-w-0 flex-col gap-5">
          <section class="card p-4" aria-labelledby="c-h">
            <h2 id="c-h" class="sr-only">{{ L('Клієнт і авто', 'Customer and car') }}</h2>
            @if (client(); as c) {
              <a [routerLink]="['/kliyenty', c.id]" class="row-link text-[15px]">{{ c.name }}</a>
              <a [href]="'tel:' + c.phone" class="mt-0.5 block text-[13px] text-ink-2 num hover:text-ink">{{ phone(c.phone) }}</a>
            }
            @if (car(); as car) {
              <a [routerLink]="['/avto', car.id]" class="mt-3 flex items-center gap-3 rounded-lg border border-line p-2.5 hover:border-line-strong">
                <tk-make-logo [make]="car.make" [size]="34" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate-1 text-[13px] font-medium">{{ car.make }} {{ car.model }} {{ car.year }}</span>
                  <span class="mt-1 flex items-center gap-2"><tk-plate [value]="car.plate" /></span>
                </span>
              </a>
            }
            <div class="mt-3 grid grid-cols-2 gap-3 text-[13px]">
              <div><div class="text-xs text-ink-3">{{ L('Пробіг при прийомі', 'Mileage at intake') }}</div><div class="num">{{ o.mileage ? km(o.mileage) : '—' }}</div></div>
              <div><div class="text-xs text-ink-3">{{ L('Знижка клієнта', 'Customer discount') }}</div><div class="num">{{ o.discountPct }}%</div></div>
            </div>
          </section>

          <section class="card p-4" aria-labelledby="sch-h">
            <div class="mb-2 flex items-center">
              <h2 id="sch-h" class="m-0 flex-1 text-[15px] font-semibold">{{ L('Запис', 'Booking') }}</h2>
              <button type="button" class="btn btn-ghost btn-sm no-print" (click)="editSchedule()"><svg [lucideIcon]="I.edit" aria-hidden="true"></svg>{{ L('Змінити', 'Change') }}</button>
            </div>
            <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt class="text-ink-3">{{ L('Пост', 'Bay') }}</dt><dd class="m-0">{{ post()?.name ?? L('Не призначено', 'Not assigned') }}</dd>
              <dt class="text-ink-3">{{ L('Час', 'Time') }}</dt><dd class="m-0 num">{{ o.start ? dt(o.start) + '–' + time(endOf(o)) : '—' }}</dd>
              <dt class="text-ink-3">{{ L('Тривалість', 'Duration') }}</dt><dd class="m-0">{{ dur(o.durationMin) }}</dd>
              <dt class="text-ink-3">{{ L('Механік', 'Mechanic') }}</dt><dd class="m-0">{{ mechName() ?? L('Не призначено', 'Not assigned') }}</dd>
            </dl>
          </section>

          <section class="card p-4" aria-labelledby="cm-h">
            <h2 id="cm-h" class="m-0 mb-2 text-[15px] font-semibold">{{ L('Скарга й нотатки', 'Complaint and notes') }}</h2>
            <tk-text-field [multiline]="true" [rows]="2" [maxLength]="300" [ariaLabel]="L('Скарга клієнта', 'Customer complaint')" [placeholder]="L('Що турбує клієнта', 'What’s bothering the customer')" [value]="complaint()" (valueChange)="complaint.set($event)" />
            <tk-text-field class="mt-2 block" [multiline]="true" [rows]="2" [maxLength]="500" [ariaLabel]="L('Внутрішні нотатки', 'Internal notes')" [placeholder]="L('Внутрішні нотатки (клієнт не бачить)', 'Internal notes (hidden from the customer)')" [value]="notes()" (valueChange)="notes.set($event)" />
            @if (textDirty()) {
              <div class="animate-fade mt-2 flex justify-end gap-2">
                <button type="button" class="btn btn-sm" (click)="resetText()">{{ L('Скасувати', 'Cancel') }}</button>
                <button type="button" class="btn btn-sm btn-primary" (click)="saveText()">{{ L('Зберегти', 'Save') }}</button>
              </div>
            }
          </section>

          <section class="card p-4" aria-labelledby="in-h">
            <div class="mb-2 flex items-center">
              <h2 id="in-h" class="m-0 flex-1 text-[15px] font-semibold">{{ L('Акт прийому', 'Intake report') }}</h2>
              <a [routerLink]="['/naryady', o.id, 'pryiom']" class="btn btn-sm no-print">{{ o.intake ? L('Відкрити', 'Open') : L('Заповнити', 'Fill in') }}</a>
            </div>
            @if (o.intake; as a) {
              <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                <dt class="text-ink-3">{{ L('Пробіг', 'Mileage') }}</dt><dd class="m-0 num">{{ km(a.mileage) }}</dd>
                <dt class="text-ink-3">{{ L('Пальне', 'Fuel') }}</dt><dd class="m-0 num">{{ a.fuel }}%</dd>
                <dt class="text-ink-3">{{ L('Пошкодження', 'Damage') }}</dt>
                <dd class="m-0">{{ a.damages.length ? damagesText(a.damages) : L('Немає', 'None') }}</dd>
                <dt class="text-ink-3">{{ L('Підпис', 'Signature') }}</dt><dd class="m-0">{{ a.signature || a.signedAt ? L('Підписано ', 'Signed ') + dt(a.signedAt!) : L('Не підписано', 'Not signed') }}</dd>
              </dl>
            } @else {
              <p class="m-0 text-[13px] text-ink-3">{{ L('Зафіксуйте стан авто, пальне й комплектність до початку робіт.', 'Record the car’s condition, fuel and contents before work starts.') }}</p>
            }
          </section>

          <section class="card p-4" aria-labelledby="h-h">
            <h2 id="h-h" class="m-0 mb-3 text-[15px] font-semibold">{{ L('Історія', 'History') }}</h2>
            <ol class="m-0 flex list-none flex-col gap-2.5 p-0">
              @for (h of history(); track $index) {
                <li class="flex gap-2.5 text-[13px]">
                  <span class="mt-1.5 size-2 flex-none rounded-full" [style.background]="h.color" aria-hidden="true"></span>
                  <span class="min-w-0 flex-1">{{ h.text }}<span class="block text-xs text-ink-3">{{ h.who }}{{ h.who ? ', ' : '' }}{{ ago(h.at) }}</span></span>
                </li>
              }
            </ol>
          </section>
        </aside>
      </div>
    }
  `,
})
export class OrderPage implements HasUnsaved {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly statsSvc = inject(StatsService);
  private readonly orders = inject(OrdersService);
  private readonly stock = inject(StockService);
  private readonly mover = inject(StatusMove);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly titles = inject(TorkTitleStrategy);

  readonly id = input.required<string>();
  protected readonly flow = STATUS_FLOW;
  protected readonly allStatuses: OrderStatus[] = [...STATUS_FLOW, 'skasovano'];
  protected readonly money = fmtMoney;
  protected readonly hours = fmtHours;
  protected readonly km = fmtKm;
  protected readonly dt = fmtDateTime;
  protected readonly time = fmtTime;
  protected readonly dur = fmtDuration;
  protected readonly phone = fmtPhone;
  protected readonly wp = workPrice;
  protected readonly pp = partPrice;
  protected readonly color = statusColor;
  protected readonly complaint = signal('');
  protected readonly notes = signal('');

  protected readonly order = computed(() => this.db.orders.get(this.id()));
  protected readonly totals = computed(() => this.statsSvc.totals().get(this.id()));
  protected readonly client = computed(() => this.db.clients.get(this.order()?.clientId));
  protected readonly car = computed(() => this.db.cars.get(this.order()?.carId));
  protected readonly post = computed(() => this.db.posts.get(this.order()?.postId));
  protected readonly mechName = computed(() => this.db.employees.get(this.order()?.mechanicId)?.name ?? null);
  protected readonly flowIndex = computed(() => STATUS_FLOW.indexOf(this.order()?.status ?? 'zapys'));
  protected readonly approvalWaiting = computed(() => {
    const a = this.db.approvals.get(this.order()?.approvalId);
    return a?.status === 'sent';
  });
  protected readonly next = computed(() => {
    const o = this.order();
    if (!o) return null;
    if (o.status === 'diagnostyka' && o.works.some((w) => w.needsApproval && !w.decision)) return { to: 'pogodzhennia' as OrderStatus, label: L('На погодження', 'Send for approval') };
    return NEXT[o.status] ?? null;
  });

  protected readonly mechOptions = computed<Option<string>[]>(() =>
    this.db.employees
      .items()
      .filter((e) => e.role === 'mechanic' && e.branchId === this.order()?.branchId)
      .map((e) => ({ value: e.id, label: e.name })),
  );
  protected readonly workOptions = computed<Option<string>[]>(() => {
    const cats = new Map((this.db.settings()?.categories ?? []).map((c) => [c.id, c.name]));
    const make = this.car()?.make;
    return this.db.works
      .items()
      .filter((w) => !w.makes.length || (make && w.makes.includes(make)))
      .map((w) => ({ value: w.id, label: w.name, hint: `${w.code} · ${fmtHours(w.hours)}`, keywords: w.code, group: cats.get(w.categoryId) }));
  });
  protected readonly partOptions = computed<Option<string>[]>(() => {
    const o = this.order();
    const car = this.car();
    if (!o) return [];
    const model = car ? `${car.make} ${car.model}` : '';
    return this.db.parts
      .items()
      .map((p) => {
        const fits = !p.fits.length || p.fits.some((f) => model.startsWith(f));
        return { p, fits, avail: this.stock.available(p, o.branchId) };
      })
      .sort((a, b) => Number(b.fits) - Number(a.fits))
      .map(({ p, fits, avail }) => ({
        value: p.id,
        label: `${p.brand} ${p.name}`,
        hint: `${p.sku} · ${avail > 0 ? L(`є ${avail}`, `${avail} in stock`) : L('немає', 'none')} · ${fmtMoney(p.price)}`,
        keywords: `${p.sku} ${p.crossNumbers.join(' ')}`,
        group: fits ? (car ? L(`Підходить для ${car.make} ${car.model}`, `Fits ${car.make} ${car.model}`) : L('Універсальні', 'Universal')) : L('Інші', 'Other'),
      }));
  });

  protected readonly textDirty = computed(() => {
    const o = this.order();
    return !!o && (this.complaint() !== o.complaint || this.notes() !== o.notes);
  });

  protected readonly history = computed(() => {
    const o = this.order();
    if (!o) return [];
    const items = o.history.map((h) => ({
      at: h.at,
      text: h.from ? `${STATUS_LABEL[h.from]} → ${STATUS_LABEL[h.to]}` : L(`Створено: ${STATUS_LABEL[h.to]}`, `Created: ${STATUS_LABEL[h.to]}`),
      who: h.by,
      color: statusColor(h.to),
    }));
    for (const a of this.db.activity.items()) {
      if (a.entityId === o.id && a.action !== 'status' && a.action !== 'create') items.push({ at: a.createdAt, text: a.summary.replace(`${o.number}: `, ''), who: '', color: 'var(--border-strong)' });
    }
    for (const p of o.payments) items.push({ at: p.at, text: L(`Оплата ${fmtMoney(p.amount)} (${PAY_LABEL[p.method].toLowerCase()})`, `Payment ${fmtMoney(p.amount)} (${PAY_LABEL[p.method].toLowerCase()})`), who: '', color: 'var(--success)' });
    return items.sort((a, b) => b.at.localeCompare(a.at));
  });

  constructor() {
    let lastId = '';
    effect(() => {
      const o = this.order();
      if (!o) return;
      if (o.id !== lastId || !this.textDirty()) {
        this.complaint.set(o.complaint);
        this.notes.set(o.notes);
      }
      lastId = o.id;
      this.titles.set(L(`Наряд ${o.number}`, `Work order ${o.number}`));
    });
  }

  hasUnsaved(): boolean {
    return this.textDirty();
  }

  protected label(s: OrderStatus): string {
    return STATUS_LABEL[s];
  }
  protected allowed(s: OrderStatus): boolean {
    const o = this.order();
    return !!o && canMove(o.status, s).ok;
  }
  protected stateLabel(s: WorkState): string {
    return STATE_LABEL[s];
  }
  protected stateClass(s: WorkState): string {
    return s === 'done' ? 'badge-success' : s === 'in_progress' ? 'badge-info' : s === 'paused' ? 'badge-accent' : '';
  }
  protected payLabel(m: keyof typeof PAY_LABEL): string {
    return PAY_LABEL[m];
  }
  protected ago(iso: string): string {
    return fmtAgo(iso);
  }
  protected endOf(o: Order): string {
    return new Date(Date.parse(o.start!) + o.durationMin * 60000).toISOString();
  }
  protected avail(p: OrderPart): number {
    const part = this.db.parts.get(p.partId);
    return part ? this.stock.available(part, this.order()!.branchId) : 0;
  }
  protected damagesText(ds: { zone: keyof typeof ZONE_LABEL; kind: keyof typeof DAMAGE_LABEL }[]): string {
    return ds.map((d) => `${DAMAGE_LABEL[d.kind].toLowerCase()} (${ZONE_LABEL[d.zone].toLowerCase()})`).join(', ');
  }

  protected async move(to: OrderStatus): Promise<void> {
    const o = this.order();
    if (o) await this.mover.move(o, to);
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected setWork(w: OrderWork, patch: Partial<OrderWork>): void {
    const o = this.order()!;
    void this.run(() =>
      this.orders.patch(o, { works: o.works.map((x) => (x.id === w.id ? { ...x, ...patch } : x)) }, false),
    );
  }
  protected setPartQty(p: OrderPart, qty: number): void {
    const o = this.order()!;
    void this.run(async () => {
      // зміна кількості: знімаємо резерв і резервуємо заново
      const [released] = p.reserved ? await this.stock.releaseParts(o, [p], false) : [p];
      let line = { ...released, qty };
      if (o.status !== 'zapys') [line] = await this.stock.reserveParts(o, [line]);
      const cur = this.db.orders.get(o.id)!;
      await this.orders.patch(cur, { parts: cur.parts.map((x) => (x.id === p.id ? line : x)) }, false);
    });
  }
  protected setDiscount(v: number): void {
    const o = this.order()!;
    void this.run(() => this.orders.patch(o, { discountPct: v }, L(`${o.number}: знижка ${v}%`, `${o.number}: discount ${v}%`)));
  }
  protected addWork(id: string): void {
    const w = this.db.works.get(id);
    if (w) void this.run(() => this.orders.addWork(this.order()!, w));
  }
  protected addCustomWork(name: string): void {
    void this.run(() => this.orders.addCustomWork(this.order()!, name, 1));
  }
  protected addPart(id: string): void {
    const p = this.db.parts.get(id);
    if (!p) return;
    void this.run(async () => {
      await this.orders.addPart(this.order()!, p, 1);
      const avail = this.stock.available(p, this.order()!.branchId);
      if (avail < 0) this.toast.info(L(`${p.brand} ${p.sku}: на складі немає — додайте в замовлення постачальнику`, `${p.brand} ${p.sku}: out of stock — add it to a purchase order`));
    });
  }
  protected async removeLine(kind: 'work' | 'part', line: OrderWork | OrderPart): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: L(`Прибрати «${line.name}»?`, `Remove “${line.name}”?`),
      text: kind === 'part' && ('issued' in line && (line.issued || line.reserved)) ? L('Запчастина повернеться на склад.', 'The part will go back to stock.') : undefined,
      confirm: L('Прибрати', 'Remove'),
      danger: true,
    });
    if (ok) await this.run(() => this.orders.removeLine(this.order()!, kind, line.id));
  }

  protected pay(): void {
    this.dialogs.open(PaymentDialog, this.order()!, { size: 'sm', label: L('Прийняти оплату', 'Take payment') });
  }
  protected editSchedule(): void {
    this.dialogs.open(ScheduleDialog, this.order()!, { size: 'md', label: L('Змінити запис', 'Change booking') });
  }

  protected resetText(): void {
    const o = this.order()!;
    this.complaint.set(o.complaint);
    this.notes.set(o.notes);
  }
  protected async saveText(): Promise<void> {
    const o = this.order()!;
    await this.run(async () => {
      await this.orders.patch(o, { complaint: this.complaint().trim(), notes: this.notes().trim() }, L(`${o.number}: оновлено нотатки`, `${o.number}: notes updated`));
      this.toast.success(L('Збережено', 'Saved'));
    });
  }

  protected async remove(): Promise<void> {
    const o = this.order()!;
    const ok = await this.dialogs.confirm({
      title: L(`Видалити наряд ${o.number}?`, `Delete work order ${o.number}?`),
      text: L('Наряд зникне з табло, історії клієнта й аналітики. Резерви запчастин буде знято. Якщо треба лише відмінити візит — скасуйте наряд.', 'The work order will disappear from the board, the customer’s history and analytics. Part reservations will be released. To call off a visit, cancel the work order instead.'),
      confirm: L('Видалити', 'Delete'),
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      const restore = await this.orders.remove(o);
      this.resetText();
      await this.router.navigate(['/naryady']);
      this.toast.undo(L(`Наряд ${o.number} видалено`, `Work order ${o.number} deleted`), restore);
    });
  }
}
