import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../../core/data/db.service';
import { Mailing, ReminderRule } from '../../core/data/models';
import { DueItem, RemindersService } from '../../core/domain/reminders.service';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { QuickActions } from '../../core/ui/quick-actions.service';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { PageHeader, EmptyState } from '../../shared/ui/states';
import { Tabs, TabItem } from '../../shared/ui/tabs';
import { BulkDef, CellDef, Column, DataTable, FilterDef } from '../../shared/ui/data-table';
import { Plate } from '../../shared/ui/display';
import { Switch } from '../../shared/ui/checkbox';
import { Tooltip } from '../../shared/ui/tooltip';
import { fmtDate, fmtDateTime, fmtKm, fmtMoney, fmtPhone, plural } from '../../shared/format';
import { MailingDialog } from './mailing-dialog';
import { RuleForm } from './rule-form';

type Tab = 'due' | 'rules' | 'mailings';

/** Нагадування: кому пора (правила ТО + відкладені роботи), правила, історія розсилок */
@Component({
  selector: 'tk-reminders',
  imports: [RouterLink, Icon, PageHeader, EmptyState, Tabs, DataTable, CellDef, BulkDef, Plate, Switch, Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-page-header title="Нагадування" [subtitle]="subtitle()">
      @if (tab() === 'rules') {
        <button type="button" class="btn btn-primary" (click)="editRule(null)"><svg [lucideIcon]="I.plus" aria-hidden="true"></svg>Нове правило</button>
      }
    </tk-page-header>
    <tk-tabs class="mb-5" [items]="tabs()" [(value)]="tab" ariaLabel="Розділи нагадувань" panelId="rem-panel" />

    <div id="rem-panel" role="tabpanel">
      @switch (tab()) {
        @case ('due') {
          <tk-data-table
            tableId="reminders"
            csvName="nahaduvannia"
            ariaLabel="Кому пора на сервіс"
            searchPlaceholder="Клієнт, номер, робота…"
            [rows]="due()"
            [columns]="columns"
            [filters]="filters()"
            [rowId]="rowId"
            [loading]="!db.ready()"
            [selectable]="true"
            [defaultSort]="{ key: 'due', dir: 'asc' }"
            [searchText]="searchText"
            emptyArt="done"
            emptyTitle="Нікому не пора"
            emptyText="Усі клієнти пройшли ТО вчасно. Нагадування з’являться, коли наблизиться пробіг або дата."
          >
            <ng-template tkCell="client" let-r>
              <a [routerLink]="['/kliyenty', r.client.id]" class="row-link">{{ r.client.name }}</a>
              <span class="block text-xs text-ink-3 num">{{ phone(r.client.phone) }}</span>
            </ng-template>
            <ng-template tkCell="car" let-r><span class="flex items-center gap-2"><tk-plate [value]="r.car.plate" /><span class="text-ink-2">{{ r.car.make }} {{ r.car.model }}</span></span></ng-template>
            <ng-template tkCell="title" let-r>
              <span class="flex items-center gap-1.5">
                <span class="badge" [class]="r.kind === 'deferred' ? 'badge-accent' : 'badge-info'">{{ r.kind === 'deferred' ? 'відкладено' : 'ТО' }}</span>{{ r.title }}
              </span>
              <span class="block text-xs text-ink-3">{{ r.reason }}</span>
            </ng-template>
            <ng-template tkCell="due" let-r>
              <span [class.text-danger]="r.overdue" [class.font-medium]="r.overdue">{{ r.dueDate ? date(r.dueDate) : '—' }}</span>
              @if (r.overdue) {
                <span class="block text-xs text-danger">прострочено</span>
              }
            </ng-template>
            <ng-template tkCell="consent" let-r>
              @if (r.client.allowMessages) {
                <svg [lucideIcon]="I.check" class="text-success" aria-label="Є згода" role="img"></svg>
              } @else {
                <span class="text-xs text-ink-3" tkTip="Клієнт не давав згоди на розсилки">немає</span>
              }
            </ng-template>
            <ng-template tkCell="actions" let-r>
              <span class="flex justify-end gap-1">
                <button type="button" class="btn btn-sm" (click)="book(r)">Записати</button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Не нагадувати: ' + r.title" tkTip="Не нагадувати" (click)="dismiss([r])"><svg [lucideIcon]="I.x" [size]="14" aria-hidden="true"></svg></button>
              </span>
            </ng-template>
            <ng-template tkBulk let-rows>
              <button type="button" class="btn btn-sm btn-primary" (click)="mail(rows)"><svg [lucideIcon]="I.send" aria-hidden="true"></svg>Розсилка</button>
              <button type="button" class="btn btn-sm" (click)="dismiss(rows)">Не нагадувати</button>
            </ng-template>
          </tk-data-table>
        }
        @case ('rules') {
          @if (!db.ready()) {
            <div class="grid gap-3 md:grid-cols-2">@for (i of [1, 2, 3, 4]; track i) {<div class="skeleton h-28"></div>}</div>
          } @else if (!db.rules.items().length) {
            <div class="card"><tk-empty art="bell" title="Правил ще немає" text="Створіть правило: наприклад, заміна оливи кожні 10 000 км або 12 місяців."><button type="button" class="btn btn-primary" (click)="editRule(null)">Нове правило</button></tk-empty></div>
          } @else {
            <div class="grid gap-3 md:grid-cols-2">
              @for (r of db.rules.items(); track r.id) {
                <article class="card flex flex-col gap-2 p-4" [class.opacity-60]="!r.active">
                  <div class="flex items-start gap-2">
                    <div class="min-w-0 flex-1">
                      <h3 class="m-0 text-[15px] font-semibold">{{ r.name }}</h3>
                      <p class="m-0 text-[13px] text-ink-2">{{ ruleText(r) }}</p>
                    </div>
                    <tk-switch [checked]="r.active" [ariaLabel]="'Активне: ' + r.name" (changed)="toggleRule(r, $event)" />
                  </div>
                  <p class="m-0 text-xs text-ink-3">Робота: <span class="mono">{{ r.workCode }}</span>{{ tplName(r) ? ', шаблон «' + tplName(r) + '»' : '' }}</p>
                  <div class="mt-auto flex items-center gap-2 pt-1">
                    <span class="text-xs text-ink-2">Зараз пора: <b class="num">{{ dueByRule(r.id) }}</b></span>
                    <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="editRule(r)"><svg [lucideIcon]="I.edit" aria-hidden="true"></svg>Змінити</button>
                    <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger" [attr.aria-label]="'Видалити правило ' + r.name" (click)="removeRule(r)"><svg [lucideIcon]="I.trash" [size]="14" aria-hidden="true"></svg></button>
                  </div>
                </article>
              }
            </div>
          }
        }
        @case ('mailings') {
          @if (!db.ready()) {
            <div class="skeleton h-64"></div>
          } @else if (!mailings().length) {
            <div class="card"><tk-empty art="inbox" title="Розсилок ще не було" text="Оберіть клієнтів на вкладці «Кому пора» й натисніть «Розсилка»." /></div>
          } @else {
            <div class="card divide-y divide-line">
              @for (m of mailings(); track m.id) {
                <details class="group">
                  <summary class="flex list-none items-center gap-3 px-4 py-3 hover:bg-subtle/60 [&::-webkit-details-marker]:hidden">
                    <span class="grid size-8 flex-none place-items-center rounded-lg" [class]="m.channel === 'viber' ? 'bg-[#efeaf8] text-[#6046a3] dark:bg-[rgb(160_135_225/0.16)] dark:text-[#c7b6f0]' : 'bg-info-soft text-info'"><svg [lucideIcon]="m.channel === 'viber' ? I.message : I.smartphone" aria-hidden="true"></svg></span>
                    <span class="min-w-0 flex-1"><span class="block truncate-1 font-medium">{{ m.title }}</span><span class="block text-xs text-ink-3">{{ dt(m.createdAt) }}, {{ m.channel === 'viber' ? 'Viber' : 'SMS' }}</span></span>
                    <span class="text-[13px] text-ink-2 num">{{ m.recipients.length }} {{ plural(m.recipients.length, ['отримувач', 'отримувачі', 'отримувачів']) }}</span>
                    <svg [lucideIcon]="I.chevronDown" class="text-ink-3 transition-transform duration-150 group-open:rotate-180" aria-hidden="true"></svg>
                  </summary>
                  <ul class="m-0 max-h-72 list-none overflow-y-auto border-t border-line bg-subtle/40 p-0">
                    @for (x of m.recipients; track $index) {
                      <li class="border-b border-line px-4 py-2 text-[13px] last:border-0">
                        <span class="font-medium">{{ clientName(x.clientId) }}</span> <span class="text-xs text-ink-3 num">{{ phone(x.phone) }}</span>
                        <span class="block text-ink-2">{{ x.text }}</span>
                      </li>
                    }
                  </ul>
                </details>
              }
            </div>
          }
        }
      }
    </div>
  `,
})
export class Reminders {
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly rem = inject(RemindersService);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);
  private readonly quick = inject(QuickActions);
  protected readonly tab = signal<Tab | null>('due');
  protected readonly date = fmtDate;
  protected readonly dt = fmtDateTime;
  protected readonly phone = fmtPhone;
  protected readonly plural = plural;
  protected readonly rowId = (r: DueItem) => r.key;
  protected readonly searchText = (r: DueItem) => `${r.client.name} ${r.client.phone} ${r.car.plate} ${r.car.make} ${r.car.model}`;

  protected readonly due = computed(() => (this.db.ready() ? this.rem.due() : []));
  protected readonly mailings = computed<Mailing[]>(() => [...this.db.mailings.items()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  protected readonly subtitle = computed(() => {
    if (!this.db.ready()) return 'Завантаження…';
    const d = this.due();
    const over = d.filter((x) => x.overdue).length;
    return `${d.length} ${plural(d.length, ['нагадування', 'нагадування', 'нагадувань'])}${over ? `, ${over} прострочено` : ''}`;
  });
  protected readonly tabs = computed<TabItem<Tab>[]>(() => [
    { value: 'due', label: 'Кому пора', count: this.db.ready() ? this.due().length : null },
    { value: 'rules', label: 'Правила ТО', count: this.db.ready() ? this.db.rules.items().length : null },
    { value: 'mailings', label: 'Розсилки', count: this.db.ready() ? this.db.mailings.items().length : null },
  ]);

  protected readonly columns: Column<DueItem>[] = [
    { key: 'client', label: 'Клієнт', value: (r) => r.client.name, required: true },
    { key: 'car', label: 'Авто', value: (r) => `${r.car.plate} ${r.car.make} ${r.car.model}`, sortable: false },
    { key: 'title', label: 'Що зробити', value: (r) => r.title },
    { key: 'due', label: 'Коли', value: (r) => r.dueDate, format: (r) => fmtDate(r.dueDate) },
    { key: 'km', label: 'Пробіг (прогноз)', value: (r) => r.forecastKm, format: (r) => fmtKm(r.forecastKm), align: 'right' },
    { key: 'amount', label: 'Сума', value: (r) => r.amount, format: (r) => (r.amount ? fmtMoney(r.amount) : '—'), align: 'right' },
    { key: 'consent', label: 'Згода', value: (r) => (r.client.allowMessages ? 'так' : 'ні'), align: 'center', sortable: false },
    { key: 'actions', label: '', value: () => '', sortable: false, csv: () => '' },
  ];
  protected readonly filters = computed<FilterDef<DueItem>[]>(() => [
    {
      key: 'kind',
      label: 'Джерело',
      options: [
        { value: 'rule', label: 'Правила ТО' },
        { value: 'deferred', label: 'Відкладені роботи' },
      ],
      match: (r, v) => v.includes(r.kind),
    },
    { key: 'rule', label: 'Правило', options: this.db.rules.items().map((r) => ({ value: r.id, label: r.name })), match: (r, v) => !!r.ruleId && v.includes(r.ruleId) },
    {
      key: 'when',
      label: 'Термін',
      options: [
        { value: 'over', label: 'Прострочені' },
        { value: 'soon', label: 'Найближчі 3 тижні' },
      ],
      match: (r, v) => v.includes(r.overdue ? 'over' : 'soon'),
    },
  ]);

  protected ruleText(r: ReminderRule): string {
    return this.rem.ruleText(r);
  }
  protected tplName(r: ReminderRule): string {
    return this.db.templates.get(r.templateId)?.name ?? '';
  }
  protected dueByRule(id: string): number {
    return this.due().filter((d) => d.ruleId === id).length;
  }
  protected clientName(id: string): string {
    return this.db.clients.get(id)?.name ?? 'Видалений клієнт';
  }

  protected mail(rows: DueItem[]): void {
    if (!rows.some((r) => r.client.allowMessages)) return void this.toast.info('Жоден з обраних клієнтів не давав згоди на розсилки');
    this.dialogs.open(MailingDialog, rows, { size: 'lg', label: 'Розсилка' });
  }
  protected async book(r: DueItem): Promise<void> {
    await this.rem.mark(r, 'booked');
    await this.quick.newOrder({ clientId: r.client.id, carId: r.car.id });
  }
  protected async dismiss(rows: DueItem[]): Promise<void> {
    for (const r of rows) await this.rem.mark(r, 'dismissed');
    this.toast.success(rows.length === 1 ? 'Більше не нагадуватимемо' : `Приховано ${rows.length}`);
  }
  protected editRule(r: ReminderRule | null): void {
    this.dialogs.open(RuleForm, { id: r?.id }, { drawer: true, label: 'Правило ТО' });
  }
  protected async toggleRule(r: ReminderRule, active: boolean): Promise<void> {
    await this.db.rules.update(r.id, { active }, { log: `Правило «${r.name}» ${active ? 'увімкнено' : 'вимкнено'}` });
  }
  protected async removeRule(r: ReminderRule): Promise<void> {
    const ok = await this.dialogs.confirm({ title: `Видалити правило «${r.name}»?`, text: 'Нагадування за ним більше не формуватимуться.', confirm: 'Видалити', danger: true });
    if (!ok) return;
    const removed = await this.db.rules.remove(r.id, { log: `Видалено правило «${r.name}»` });
    if (removed) this.toast.undo('Правило видалено', () => this.db.rules.restore(removed));
  }
}
