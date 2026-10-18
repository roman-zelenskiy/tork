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
import { formatPlate } from '../../core/data/plates';
import { Switch } from '../../shared/ui/checkbox';
import { Tooltip } from '../../shared/ui/tooltip';
import { fmtDate, fmtDateTime, fmtKm, fmtMoney, fmtPhone, plural } from '../../shared/format';
import { MailingDialog } from './mailing-dialog';
import { RuleForm } from './rule-form';
import { L } from '../../core/i18n';

type Tab = 'due' | 'rules' | 'mailings';

/** Нагадування: кому пора (правила ТО + відкладені роботи), правила, історія розсилок */
@Component({
  selector: 'tk-reminders',
  imports: [RouterLink, Icon, PageHeader, EmptyState, Tabs, DataTable, CellDef, BulkDef, Plate, Switch, Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-page-header [title]="L('Нагадування', 'Reminders')" [subtitle]="subtitle()">
      @if (tab() === 'rules') {
        <button type="button" class="btn btn-primary" (click)="editRule(null)"><svg [lucideIcon]="I.plus" aria-hidden="true"></svg>{{ L('Нове правило', 'New rule') }}</button>
      }
    </tk-page-header>
    <tk-tabs class="mb-5" [items]="tabs()" [(value)]="tab" [ariaLabel]="L('Розділи нагадувань', 'Reminder sections')" panelId="rem-panel" />

    <div id="rem-panel" role="tabpanel">
      @switch (tab()) {
        @case ('due') {
          <tk-data-table
            tableId="reminders"
            csvName="nahaduvannia"
            [ariaLabel]="L('Кому пора на сервіс', 'Who’s due for service')"
            [searchPlaceholder]="L('Клієнт, номер, робота…', 'Customer, plate, job…')"
            [rows]="due()"
            [columns]="columns"
            [filters]="filters()"
            [rowId]="rowId"
            [loading]="!db.ready()"
            [selectable]="true"
            [defaultSort]="{ key: 'due', dir: 'asc' }"
            [searchText]="searchText"
            emptyArt="done"
            [emptyTitle]="L('Нікому не пора', 'Nobody is due')"
            [emptyText]="L('Усі клієнти пройшли ТО вчасно. Нагадування з’являться, коли наблизиться пробіг або дата.', 'Every customer is up to date. Reminders appear as the mileage or date approaches.')"
          >
            <ng-template tkCell="client" let-r>
              <a [routerLink]="['/kliyenty', r.client.id]" class="row-link">{{ r.client.name }}</a>
              <span class="block text-xs text-ink-3 num">{{ phone(r.client.phone) }}</span>
            </ng-template>
            <ng-template tkCell="car" let-r><span class="flex items-center gap-2"><tk-plate [value]="r.car.plate" /><span class="text-ink-2">{{ r.car.make }} {{ r.car.model }}</span></span></ng-template>
            <ng-template tkCell="title" let-r>
              <span class="flex items-center gap-1.5">
                <span class="badge" [class]="r.kind === 'deferred' ? 'badge-accent' : 'badge-info'">{{ r.kind === 'deferred' ? L('відкладено', 'deferred') : L('ТО', 'service') }}</span>{{ r.title }}
              </span>
              <span class="block text-xs text-ink-3">{{ r.reason }}</span>
            </ng-template>
            <ng-template tkCell="due" let-r>
              <span [class.text-danger]="r.overdue" [class.font-medium]="r.overdue">{{ r.dueDate ? date(r.dueDate) : '—' }}</span>
              @if (r.overdue) {
                <span class="block text-xs text-danger">{{ L('прострочено', 'overdue') }}</span>
              }
            </ng-template>
            <ng-template tkCell="consent" let-r>
              @if (r.client.allowMessages) {
                <svg [lucideIcon]="I.check" class="text-success" [attr.aria-label]="L('Є згода', 'Consent given')" role="img"></svg>
              } @else {
                <span class="text-xs text-ink-3" [tkTip]="L('Клієнт не давав згоди на розсилки', 'The customer hasn’t agreed to mailings')">{{ L('немає', 'none') }}</span>
              }
            </ng-template>
            <ng-template tkCell="actions" let-r>
              <span class="flex justify-end gap-1">
                <button type="button" class="btn btn-sm" (click)="book(r)">{{ L('Записати', 'Book') }}</button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="L('Не нагадувати: ', 'Don’t remind: ') + r.title" [tkTip]="L('Не нагадувати', 'Don’t remind')" (click)="dismiss([r])"><svg [lucideIcon]="I.x" [size]="14" aria-hidden="true"></svg></button>
              </span>
            </ng-template>
            <ng-template tkBulk let-rows>
              <button type="button" class="btn btn-sm btn-primary" (click)="mail(rows)"><svg [lucideIcon]="I.send" aria-hidden="true"></svg>{{ L('Розсилка', 'Mailing') }}</button>
              <button type="button" class="btn btn-sm" (click)="dismiss(rows)">{{ L('Не нагадувати', 'Don’t remind') }}</button>
            </ng-template>
          </tk-data-table>
        }
        @case ('rules') {
          @if (!db.ready()) {
            <div class="grid gap-3 md:grid-cols-2">@for (i of [1, 2, 3, 4]; track i) {<div class="skeleton h-28"></div>}</div>
          } @else if (!db.rules.items().length) {
            <div class="card"><tk-empty art="bell" [title]="L('Правил ще немає', 'No rules yet')" [text]="L('Створіть правило: наприклад, заміна оливи кожні 10 000 км або 12 місяців.', 'Create a rule: for example, an oil change every 10,000 km or 12 months.')"><button type="button" class="btn btn-primary" (click)="editRule(null)">{{ L('Нове правило', 'New rule') }}</button></tk-empty></div>
          } @else {
            <div class="grid gap-3 md:grid-cols-2">
              @for (r of db.rules.items(); track r.id) {
                <article class="card flex flex-col gap-2 p-4" [class.opacity-60]="!r.active">
                  <div class="flex items-start gap-2">
                    <div class="min-w-0 flex-1">
                      <h3 class="m-0 text-[15px] font-semibold">{{ r.name }}</h3>
                      <p class="m-0 text-[13px] text-ink-2">{{ ruleText(r) }}</p>
                    </div>
                    <tk-switch [checked]="r.active" [ariaLabel]="L('Активне: ', 'Active: ') + r.name" (changed)="toggleRule(r, $event)" />
                  </div>
                  <p class="m-0 text-xs text-ink-3">{{ L('Робота', 'Job') }}: <span class="mono">{{ r.workCode }}</span>{{ tplName(r) ? L(', шаблон «' + tplName(r) + '»', ', template “' + tplName(r) + '”') : '' }}</p>
                  <div class="mt-auto flex items-center gap-2 pt-1">
                    <span class="text-xs text-ink-2">{{ L('Зараз пора', 'Due now') }}: <b class="num">{{ dueByRule(r.id) }}</b></span>
                    <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="editRule(r)"><svg [lucideIcon]="I.edit" aria-hidden="true"></svg>{{ L('Змінити', 'Edit') }}</button>
                    <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger" [attr.aria-label]="L('Видалити правило ', 'Delete rule ') + r.name" (click)="removeRule(r)"><svg [lucideIcon]="I.trash" [size]="14" aria-hidden="true"></svg></button>
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
            <div class="card"><tk-empty art="inbox" [title]="L('Розсилок ще не було', 'No mailings yet')" [text]="L('Оберіть клієнтів на вкладці «Кому пора» й натисніть «Розсилка».', 'Choose customers on the “Due” tab and press “Mailing”.')" /></div>
          } @else {
            <div class="card divide-y divide-line">
              @for (m of mailings(); track m.id) {
                <details class="group">
                  <summary class="flex list-none items-center gap-3 px-4 py-3 hover:bg-subtle/60 [&::-webkit-details-marker]:hidden">
                    <span class="grid size-8 flex-none place-items-center rounded-lg" [class]="m.channel === 'viber' ? 'bg-[#efeaf8] text-[#6046a3] dark:bg-[rgb(160_135_225/0.16)] dark:text-[#c7b6f0]' : 'bg-info-soft text-info'"><svg [lucideIcon]="m.channel === 'viber' ? I.message : I.smartphone" aria-hidden="true"></svg></span>
                    <span class="min-w-0 flex-1"><span class="block truncate-1 font-medium">{{ m.title }}</span><span class="block text-xs text-ink-3">{{ dt(m.createdAt) }}, {{ m.channel === 'viber' ? 'Viber' : 'SMS' }}</span></span>
                    <span class="text-[13px] text-ink-2 num">{{ m.recipients.length }} {{ plural(m.recipients.length, ['отримувач', 'отримувачі', 'отримувачів'], ['recipient', 'recipients']) }}</span>
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
  protected readonly L = L;
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
    if (!this.db.ready()) return L('Завантаження…', 'Loading…');
    const d = this.due();
    const over = d.filter((x) => x.overdue).length;
    return `${d.length} ${plural(d.length, ['нагадування', 'нагадування', 'нагадувань'], ['reminder', 'reminders'])}${over ? `, ${over} ${L('прострочено', 'overdue')}` : ''}`;
  });
  protected readonly tabs = computed<TabItem<Tab>[]>(() => [
    { value: 'due', label: L('Кому пора', 'Due'), count: this.db.ready() ? this.due().length : null },
    { value: 'rules', label: L('Правила ТО', 'Service rules'), count: this.db.ready() ? this.db.rules.items().length : null },
    { value: 'mailings', label: L('Розсилки', 'Mailings'), count: this.db.ready() ? this.db.mailings.items().length : null },
  ]);

  protected readonly columns: Column<DueItem>[] = [
    { key: 'client', label: L('Клієнт', 'Customer'), value: (r) => r.client.name, required: true },
    { key: 'car', label: L('Авто', 'Car'), value: (r) => `${formatPlate(r.car.plate)} ${r.car.make} ${r.car.model}`, sortable: false },
    { key: 'title', label: L('Що зробити', 'To do'), value: (r) => r.title },
    { key: 'due', label: L('Коли', 'When'), value: (r) => r.dueDate, format: (r) => fmtDate(r.dueDate) },
    { key: 'km', label: L('Пробіг (прогноз)', 'Mileage (forecast)'), value: (r) => r.forecastKm, format: (r) => fmtKm(r.forecastKm), align: 'right' },
    { key: 'amount', label: L('Сума', 'Amount'), value: (r) => r.amount, format: (r) => (r.amount ? fmtMoney(r.amount) : '—'), align: 'right' },
    { key: 'consent', label: L('Згода', 'Consent'), value: (r) => (r.client.allowMessages ? L('так', 'yes') : L('ні', 'no')), align: 'center', sortable: false },
    { key: 'actions', label: '', value: () => '', sortable: false, csv: () => '' },
  ];
  protected readonly filters = computed<FilterDef<DueItem>[]>(() => [
    {
      key: 'kind',
      label: L('Джерело', 'Source'),
      options: [
        { value: 'rule', label: L('Правила ТО', 'Service rules') },
        { value: 'deferred', label: L('Відкладені роботи', 'Deferred work') },
      ],
      match: (r, v) => v.includes(r.kind),
    },
    { key: 'rule', label: L('Правило', 'Rule'), options: this.db.rules.items().map((r) => ({ value: r.id, label: r.name })), match: (r, v) => !!r.ruleId && v.includes(r.ruleId) },
    {
      key: 'when',
      label: L('Термін', 'Due'),
      options: [
        { value: 'over', label: L('Прострочені', 'Overdue') },
        { value: 'soon', label: L('Найближчі 3 тижні', 'Next 3 weeks') },
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
    return this.db.clients.get(id)?.name ?? L('Видалений клієнт', 'Deleted customer');
  }

  protected mail(rows: DueItem[]): void {
    if (!rows.some((r) => r.client.allowMessages)) return void this.toast.info(L('Жоден з обраних клієнтів не давав згоди на розсилки', 'None of the selected customers agreed to mailings'));
    this.dialogs.open(MailingDialog, rows, { size: 'lg', label: L('Розсилка', 'Mailing') });
  }
  protected async book(r: DueItem): Promise<void> {
    await this.rem.mark(r, 'booked');
    await this.quick.newOrder({ clientId: r.client.id, carId: r.car.id });
  }
  protected async dismiss(rows: DueItem[]): Promise<void> {
    for (const r of rows) await this.rem.mark(r, 'dismissed');
    this.toast.success(rows.length === 1 ? L('Більше не нагадуватимемо', 'We won’t remind again') : L(`Приховано ${rows.length}`, `${rows.length} hidden`));
  }
  protected editRule(r: ReminderRule | null): void {
    this.dialogs.open(RuleForm, { id: r?.id }, { drawer: true, label: L('Правило ТО', 'Service rule') });
  }
  protected async toggleRule(r: ReminderRule, active: boolean): Promise<void> {
    await this.db.rules.update(r.id, { active }, { log: active ? L(`Правило «${r.name}» увімкнено`, `Rule “${r.name}” turned on`) : L(`Правило «${r.name}» вимкнено`, `Rule “${r.name}” turned off`) });
  }
  protected async removeRule(r: ReminderRule): Promise<void> {
    const ok = await this.dialogs.confirm({ title: L(`Видалити правило «${r.name}»?`, `Delete rule “${r.name}”?`), text: L('Нагадування за ним більше не формуватимуться.', 'It will no longer create reminders.'), confirm: L('Видалити', 'Delete'), danger: true });
    if (!ok) return;
    const removed = await this.db.rules.remove(r.id, { log: L(`Видалено правило «${r.name}»`, `Rule “${r.name}” deleted`) });
    if (removed) this.toast.undo(L('Правило видалено', 'Rule deleted'), () => this.db.rules.restore(removed));
  }
}
