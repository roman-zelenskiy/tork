import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DbService } from '../../core/data/db.service';
import { Employee, EntityKey, Post, ReminderRule, WorkCategory } from '../../core/data/models';
import { normPhone } from '../../shared/format';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { TorkTitleStrategy } from '../../core/ui/title.strategy';
import { RemindersService } from '../../core/domain/reminders.service';
import { I, IconNode } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/states';
import { CellDef, Column, DataTable } from '../../shared/ui/data-table';
import { Stepper } from '../../shared/ui/stepper';
import { Option } from '../../shared/ui/option';
import { CUR, fmtHours, fmtMoney, fmtPhone } from '../../shared/format';
import { KNOWN_MAKES } from '../clients/car-form';
import { EntityForm, EntityFormData, FieldDef } from './entity-form';
import { RuleForm } from '../reminders/rule-form';
import { L } from '../../core/i18n';

type Row = { id: string } & Record<string, unknown>;

interface Section {
  slug: string;
  title: string;
  icon: IconNode;
  entity: EntityKey;
  noun: string;
  rows: () => Row[];
  columns: Column<Row>[];
  fields: () => FieldDef[];
  defaults: () => Record<string, unknown>;
  /** Причина, чому не можна видалити, або null */
  blocked?: (r: Row) => string | null;
  label: (r: Row) => string;
}

const ROLE: Record<Employee['role'], string> = L(
  { mechanic: 'Механік', receptionist: 'Майстер-приймальник', manager: 'Керівник', storekeeper: 'Комірник' },
  { mechanic: 'Mechanic', receptionist: 'Service advisor', manager: 'Manager', storekeeper: 'Storekeeper' },
);
const KIND: Record<Post['kind'], string> = L(
  { lift: 'Підйомник', diag: 'Діагностика', tire: 'Шиномонтаж', body: 'Кузовний', express: 'Експрес' },
  { lift: 'Lift', diag: 'Diagnostics', tire: 'Tyre fitting', body: 'Body', express: 'Express' },
);
const DAYS = L(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
const opts = <T extends string>(m: Record<T, string>): Option<T>[] => (Object.keys(m) as T[]).map((k) => ({ value: k, label: m[k] }));

/** Довідники: філії, пости, співробітники, нормо-години й категорії, постачальники, шаблони, правила ТО */
@Component({
  selector: 'tk-directories-page',
  imports: [RouterLink, RouterLinkActive, Icon, PageHeader, DataTable, CellDef, Stepper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-page-header [title]="L('Довідники', 'Directories')" [subtitle]="L('Дані, з якими працюють усі розділи', 'Data shared by every section')">
      @if (sec(); as s) {
        <button type="button" class="btn btn-primary" (click)="edit(null)"><svg [lucideIcon]="I.plus" aria-hidden="true"></svg>{{ s.slug === 'pravyla-to' ? L('Нове правило', 'New rule') : L('Додати', 'Add') }}</button>
      }
    </tk-page-header>
    <div class="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav [attr.aria-label]="L('Довідники', 'Directories')" class="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <ul class="m-0 flex list-none gap-1 p-0 lg:flex-col">
          @for (s of sections; track s.slug) {
            <li>
              <a [routerLink]="['/dovidnyky', s.slug]" routerLinkActive="nav-active" ariaCurrentWhenActive="page" class="nav-link whitespace-nowrap">
                <svg [lucideIcon]="s.icon" [size]="16" aria-hidden="true"></svg><span class="flex-1">{{ s.title }}</span>
                @if (db.ready()) {
                  <span class="nav-badge num">{{ s.rows().length }}</span>
                }
              </a>
            </li>
          }
        </ul>
      </nav>
      <div class="min-w-0">
        @if (sec(); as s) {
          @if (s.slug === 'normo-hodyny') {
            <section class="card mb-5 p-4" aria-labelledby="cat-h">
              <h2 id="cat-h" class="m-0 mb-1 text-[15px] font-semibold">{{ L('Категорії й ставки нормо-години', 'Categories and standard-hour rates') }}</h2>
              <p class="m-0 mb-3 text-xs text-ink-3">{{ L('Вартість роботи = нормо-години × ставка категорії. Пост зі своєю ставкою (наприклад, діагностичний) має пріоритет.', 'Labour cost = standard hours × category rate. A bay with its own rate (such as diagnostics) takes priority.') }}</p>
              <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                @for (c of categories(); track c.id) {
                  <div class="flex flex-col gap-1.5 rounded-lg border border-line p-2.5">
                    <span class="text-[13px]">{{ c.name }}</span>
                    <tk-stepper size="sm" [value]="c.rate" [min]="100" [max]="5000" [step]="50" [suffix]="cur" [ariaLabel]="L('Ставка: ', 'Rate: ') + c.name" (changed)="setRate(c, $event)" />
                  </div>
                }
              </div>
            </section>
          }
          <tk-data-table
            [tableId]="'dir-' + s.slug"
            [csvName]="s.slug"
            [ariaLabel]="s.title"
            [rows]="s.rows()"
            [columns]="s.columns"
            [rowId]="rowId"
            [loading]="!db.ready()"
            [rowClickable]="true"
            emptyArt="inbox"
            [emptyTitle]="L('Тут поки порожньо', 'Nothing here yet')"
            [emptyText]="L('Додайте перший запис кнопкою «Додати».', 'Add the first record with the “Add” button.')"
            (rowClick)="edit($event)"
          >
            <ng-template tkCell="actions" let-r>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="L('Видалити ', 'Delete ') + s.label(r)" (click)="remove(r)"><svg [lucideIcon]="I.trash" [size]="14" aria-hidden="true"></svg></button>
            </ng-template>
            <ng-template tkCell="active" let-r>
              <span class="badge" [class.badge-success]="r['active']">{{ r['active'] ? L('активний', 'active') : L('вимкнено', 'off') }}</span>
            </ng-template>
          </tk-data-table>
        }
      </div>
    </div>
  `,
})
export class DirectoriesPage {
  protected readonly L = L;
  protected readonly cur = CUR;
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);
  private readonly titles = inject(TorkTitleStrategy);
  private readonly rem = inject(RemindersService);
  readonly section = input<string>('filii');
  protected readonly rowId = (r: Row) => r.id;

  protected readonly categories = computed(() => this.db.settings()?.categories ?? []);
  private readonly branchOpts = computed<Option<unknown>[]>(() => this.db.branches.items().map((b) => ({ value: b.id, label: b.name })));
  private readonly catOpts = computed<Option<unknown>[]>(() => this.categories().map((c) => ({ value: c.id, label: c.name })));
  private readonly actions: Column<Row> = { key: 'actions', label: '', value: () => '', sortable: false, csv: () => '', width: '48px' };
  private readonly cell = (k: string) => (r: Row) => (r[k] as string | number | null) ?? '';

  protected readonly sections: Section[] = [
    {
      slug: 'filii',
      title: L('Філії', 'Branches'),
      icon: I.building,
      entity: 'branches',
      noun: L('філію', 'branch'),
      rows: () => this.db.branches.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'name', label: L('Назва', 'Name'), value: this.cell('name'), required: true },
        { key: 'address', label: L('Адреса', 'Address'), value: this.cell('address') },
        { key: 'phone', label: L('Телефон', 'Phone'), value: this.cell('phone'), format: (r) => fmtPhone(String(r['phone'])) },
        { key: 'hours', label: L('Графік', 'Hours'), value: (r) => `${r['opensAt']}–${r['closesAt']}`, format: (r) => `${(r['workDays'] as number[]).map((d) => DAYS[d - 1]).join(', ')}, ${r['opensAt']}–${r['closesAt']}`, sortable: false },
        this.actions,
      ],
      fields: () => [
        { key: 'name', label: L('Назва', 'Name'), type: 'text', required: true, placeholder: L('Торк Лівий берег', 'Tork Left Bank') },
        { key: 'address', label: L('Адреса', 'Address'), type: 'text', required: true, placeholder: L('Київ, вул. …', 'Kyiv, … St') },
        { key: 'phone', label: L('Телефон', 'Phone'), type: 'mask', mask: 'phone', required: true, validate: (v) => (v && !normPhone(String(v)) ? L('Номер неповний', 'Incomplete number') : null) },
        { key: 'opensAt', label: L('Відкриття', 'Opens'), type: 'time', required: true, half: true },
        { key: 'closesAt', label: L('Закриття', 'Closes'), type: 'time', required: true, half: true, validate: (v, m) => (v && m['opensAt'] && String(v) <= String(m['opensAt']) ? L('Закриття має бути пізніше', 'Closing must be later') : null) },
        { key: 'workDays', label: L('Робочі дні', 'Working days'), type: 'multiselect', required: true, options: DAYS.map((d, i) => ({ value: i + 1, label: d })) },
      ],
      defaults: () => ({ name: '', address: '', phone: '', opensAt: '08:00', closesAt: '20:00', workDays: [1, 2, 3, 4, 5, 6] }),
      blocked: (r) => {
        if (this.db.branches.items().length === 1) return L('Це єдина філія — без неї застосунок не працюватиме.', 'This is the only branch — the app can’t work without it.');
        const n = this.db.orders.items().filter((o) => o.branchId === r.id).length;
        return n ? L(`У філії ${n} нарядів. Філію з історією видалити не можна.`, `The branch has ${n} work orders. A branch with history can’t be deleted.`) : null;
      },
    },
    {
      slug: 'posty',
      title: L('Пости', 'Bays'),
      icon: I.grid,
      entity: 'posts',
      noun: L('пост', 'bay'),
      rows: () => this.db.posts.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'name', label: L('Пост', 'Bay'), value: this.cell('name'), required: true },
        { key: 'branch', label: L('Філія', 'Branch'), value: (r) => this.db.branches.get(r['branchId'] as string)?.name ?? '' },
        { key: 'kind', label: L('Тип', 'Type'), value: (r) => KIND[r['kind'] as Post['kind']] },
        { key: 'rate', label: L('Своя ставка', 'Own rate'), value: (r) => (r['rate'] as number) ?? 0, format: (r) => (r['rate'] ? fmtMoney(r['rate'] as number) : L('за категорією', 'by category')), align: 'right' },
        { key: 'active', label: L('Стан', 'State'), value: (r) => (r['active'] ? 1 : 0) },
        this.actions,
      ],
      fields: () => [
        { key: 'name', label: L('Назва', 'Name'), type: 'text', required: true, placeholder: L('Підйомник 4', 'Lift 4') },
        { key: 'branchId', label: L('Філія', 'Branch'), type: 'select', required: true, options: this.branchOpts(), half: true },
        { key: 'kind', label: L('Тип', 'Type'), type: 'select', required: true, options: opts(KIND), half: true },
        { key: 'rate', label: L('Ставка нормо-години поста', 'Bay standard-hour rate'), type: 'mask', mask: 'money', suffix: CUR, hint: L('Порожньо — ставка категорії роботи', 'Empty — the job category rate') },
        { key: 'active', label: L('Пост активний (показується на табло)', 'Bay is active (shown on the board)'), type: 'switch' },
      ],
      defaults: () => ({ name: '', branchId: this.db.branches.items()[0]?.id ?? null, kind: 'lift', rate: null, active: true }),
      blocked: (r) => {
        const n = this.db.orders.items().filter((o) => o.postId === r.id && o.start && Date.parse(o.start) > Date.now() && o.status !== 'skasovano').length;
        return n ? L(`На пост є ${n} майбутніх записів. Перенесіть їх або вимкніть пост.`, `The bay has ${n} upcoming bookings. Move them or turn the bay off.`) : null;
      },
    },
    {
      slug: 'spivrobitnyky',
      title: L('Співробітники', 'Employees'),
      icon: I.users,
      entity: 'employees',
      noun: L('співробітника', 'employee'),
      rows: () => this.db.employees.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'name', label: L('Ім’я', 'Name'), value: this.cell('name'), required: true },
        { key: 'role', label: L('Роль', 'Role'), value: (r) => ROLE[r['role'] as Employee['role']] },
        { key: 'branch', label: L('Філія', 'Branch'), value: (r) => this.db.branches.get(r['branchId'] as string)?.name ?? '' },
        { key: 'phone', label: L('Телефон', 'Phone'), value: this.cell('phone'), format: (r) => fmtPhone(String(r['phone'])) },
        { key: 'pay', label: L('Оплата', 'Pay'), value: (r) => r['payPercent'] as number, format: (r) => `${r['payPercent'] ? r['payPercent'] + '% + ' : ''}${fmtMoney(r['baseSalary'] as number)}`, align: 'right' },
        { key: 'active', label: L('Стан', 'State'), value: (r) => (r['active'] ? 1 : 0) },
        this.actions,
      ],
      fields: () => [
        { key: 'name', label: L('Ім’я та прізвище', 'Full name'), type: 'text', required: true },
        { key: 'role', label: L('Роль', 'Role'), type: 'select', required: true, options: opts(ROLE), half: true },
        { key: 'branchId', label: L('Філія', 'Branch'), type: 'select', required: true, options: this.branchOpts(), half: true },
        { key: 'phone', label: L('Телефон', 'Phone'), type: 'mask', mask: 'phone', validate: (v) => (v && !normPhone(String(v)) ? L('Номер неповний', 'Incomplete number') : null) },
        { key: 'skills', label: L('Категорії робіт (для механіків)', 'Job categories (for mechanics)'), type: 'multiselect', options: this.catOpts() },
        { key: 'payPercent', label: L('Відсоток від робіт', 'Labour commission'), type: 'number', max: 60, suffix: '%', half: true },
        { key: 'baseSalary', label: L('Оклад на місяць', 'Monthly base salary'), type: 'mask', mask: 'money', suffix: CUR, half: true },
        { key: 'active', label: L('Працює', 'Employed'), type: 'switch' },
      ],
      defaults: () => ({ name: '', role: 'mechanic', branchId: this.db.branches.items()[0]?.id ?? null, phone: '', skills: [], payPercent: 30, baseSalary: 8000, active: true }),
      blocked: (r) => {
        const n = this.db.orders.items().filter((o) => o.mechanicId === r.id && !['vydano', 'skasovano'].includes(o.status)).length;
        return n ? L(`На співробітника призначено ${n} відкритих нарядів. Перепризначте їх або позначте «Не працює».`, `${n} open work orders are assigned to this employee. Reassign them or mark them as no longer employed.`) : null;
      },
    },
    {
      slug: 'normo-hodyny',
      title: L('Нормо-години', 'Standard hours'),
      icon: I.timer,
      entity: 'works',
      noun: L('роботу', 'job'),
      rows: () => this.db.works.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'code', label: L('Код', 'Code'), value: this.cell('code'), mono: true, required: true },
        { key: 'name', label: L('Робота', 'Job'), value: this.cell('name') },
        { key: 'cat', label: L('Категорія', 'Category'), value: (r) => this.categories().find((c) => c.id === r['categoryId'])?.name ?? '' },
        { key: 'hours', label: L('Норматив', 'Standard'), value: (r) => r['hours'] as number, format: (r) => fmtHours(r['hours'] as number), align: 'right' },
        { key: 'price', label: L('Вартість', 'Cost'), value: (r) => this.price(r), format: (r) => fmtMoney(this.price(r)), align: 'right' },
        { key: 'makes', label: L('Марки', 'Makes'), value: (r) => (r['makes'] as string[]).join(', ') || L('усі', 'all'), hidden: true },
        this.actions,
      ],
      fields: () => [
        { key: 'code', label: L('Код', 'Code'), type: 'text', required: true, half: true, placeholder: L('ТО-10', 'SV-10'), validate: (v, m) => (this.db.works.items().some((w) => w.code === String(v).trim() && w.id !== m['id']) ? L('Такий код уже є', 'This code already exists') : null) },
        { key: 'hours', label: L('Норматив, год', 'Standard, hours'), type: 'number', min: 0.1, max: 40, step: 0.1, decimals: 1, half: true },
        { key: 'name', label: L('Назва роботи', 'Job name'), type: 'text', required: true },
        { key: 'categoryId', label: L('Категорія', 'Category'), type: 'select', required: true, options: this.catOpts() },
        { key: 'makes', label: L('Лише для марок', 'Only for makes'), type: 'multiselect', options: KNOWN_MAKES.map((m) => ({ value: m, label: m })), hint: L('Порожньо — для всіх', 'Empty — for all') },
      ],
      defaults: () => ({ code: '', name: '', categoryId: this.categories()[0]?.id ?? null, hours: 1, makes: [] }),
    },
    {
      slug: 'postachalnyky',
      title: L('Постачальники', 'Suppliers'),
      icon: I.truck,
      entity: 'suppliers',
      noun: L('постачальника', 'supplier'),
      rows: () => this.db.suppliers.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'name', label: L('Назва', 'Name'), value: this.cell('name'), required: true },
        { key: 'phone', label: L('Телефон', 'Phone'), value: this.cell('phone'), format: (r) => fmtPhone(String(r['phone'])) },
        { key: 'email', label: 'Email', value: this.cell('email') },
        { key: 'delivery', label: L('Доставка', 'Delivery'), value: (r) => r['deliveryDays'] as number, format: (r) => L(`${r['deliveryDays']} дн.`, `${r['deliveryDays']} d`), align: 'right' },
        { key: 'parts', label: L('Позицій', 'Items'), value: (r) => this.db.parts.items().filter((p) => p.supplierId === r.id).length, align: 'right' },
        this.actions,
      ],
      fields: () => [
        { key: 'name', label: L('Назва', 'Name'), type: 'text', required: true },
        { key: 'phone', label: L('Телефон', 'Phone'), type: 'mask', mask: 'phone', half: true },
        { key: 'deliveryDays', label: L('Доставка, днів', 'Delivery, days'), type: 'number', min: 0, max: 30, half: true },
        { key: 'email', label: L('Email для замовлень', 'Email for orders'), type: 'text', validate: (v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v)) ? L('Перевірте email', 'Check the email') : null) },
        { key: 'notes', label: L('Примітки', 'Notes'), type: 'textarea' },
      ],
      defaults: () => ({ name: '', phone: '', email: '', deliveryDays: 1, notes: '' }),
    },
    {
      slug: 'shablony',
      title: L('Шаблони', 'Templates'),
      icon: I.message,
      entity: 'templates',
      noun: L('шаблон', 'template'),
      rows: () => this.db.templates.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'name', label: L('Назва', 'Name'), value: this.cell('name'), required: true },
        { key: 'channel', label: L('Канал', 'Channel'), value: (r) => (r['channel'] === 'sms' ? 'SMS' : 'Viber') },
        { key: 'text', label: L('Текст', 'Text'), value: this.cell('text'), sortable: false },
        this.actions,
      ],
      fields: () => [
        { key: 'name', label: L('Назва', 'Name'), type: 'text', required: true },
        { key: 'channel', label: L('Канал', 'Channel'), type: 'radio', options: [{ value: 'viber', label: 'Viber' }, { value: 'sms', label: 'SMS' }] },
        { key: 'text', label: L('Текст', 'Text'), type: 'template', required: true, hint: L('Змінні підставляються для кожного клієнта', 'Variables are filled in for each customer') },
      ],
      defaults: () => ({ name: '', channel: 'viber', text: '' }),
      blocked: (r) => (this.db.rules.items().some((x) => x.templateId === r.id) ? L('Шаблон використовує правило ТО — спершу змініть правило.', 'A service rule uses this template — change the rule first.') : null),
    },
    {
      slug: 'pravyla-to',
      title: L('Правила ТО', 'Service rules'),
      icon: I.bellRing,
      entity: 'rules',
      noun: L('правило', 'rule'),
      rows: () => this.db.rules.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'name', label: L('Правило', 'Rule'), value: this.cell('name'), required: true },
        { key: 'cond', label: L('Умова', 'Condition'), value: (r) => this.rem.ruleText(r as unknown as ReminderRule), sortable: false },
        { key: 'code', label: L('Робота', 'Job'), value: this.cell('workCode'), mono: true },
        { key: 'active', label: L('Стан', 'State'), value: (r) => (r['active'] ? 1 : 0) },
        this.actions,
      ],
      fields: () => [],
      defaults: () => ({}),
    },
  ];

  protected readonly sec = computed(() => this.sections.find((s) => s.slug === this.section()) ?? this.sections[0]);

  protected price(r: Row): number {
    const c = this.categories().find((x) => x.id === r['categoryId']);
    return Math.round((r['hours'] as number) * (c?.rate ?? 0));
  }

  protected edit(r: Row | null): void {
    const s = this.sec();
    this.titles.set(s.title);
    if (s.slug === 'pravyla-to') {
      this.dialogs.open(RuleForm, { id: r?.id }, { drawer: true, label: L('Правило ТО', 'Service rule') });
      return;
    }
    const repo = this.db.repo(s.entity);
    const data: EntityFormData = {
      title: r ? s.label(r) : `${L('Додати', 'Add')} ${s.noun}`,
      fields: s.fields(),
      value: r ? { ...r } : s.defaults(),
      submitLabel: r ? L('Зберегти', 'Save') : L('Додати', 'Add'),
      save: async (v) => {
        const { id, ...rest } = v;
        const payload = Object.fromEntries(Object.entries(rest).filter(([k]) => k !== 'createdAt' && k !== 'updatedAt'));
        if (id) await repo.update(String(id), payload as never, { log: L(`${s.title}: змінено «${payload['name'] ?? payload['code']}»`, `${s.title}: changed “${payload['name'] ?? payload['code']}”`) });
        else await repo.create(payload as never, { log: L(`${s.title}: додано «${payload['name'] ?? payload['code']}»`, `${s.title}: added “${payload['name'] ?? payload['code']}”`) });
      },
    };
    this.dialogs.open(EntityForm, data, { drawer: true, label: data.title });
  }

  protected async remove(r: Row): Promise<void> {
    const s = this.sec();
    const why = s.blocked?.(r);
    if (why) return void this.toast.error(why);
    const ok = await this.dialogs.confirm({ title: L(`Видалити «${s.label(r)}»?`, `Delete “${s.label(r)}”?`), text: L('Запис зникне з довідника. Історичні наряди не зміняться.', 'The record will disappear from the directory. Past work orders won’t change.'), confirm: L('Видалити', 'Delete'), danger: true });
    if (!ok) return;
    const repo = this.db.repo(s.entity);
    const removed = await repo.remove(r.id, { log: L(`${s.title}: видалено «${s.label(r)}»`, `${s.title}: deleted “${s.label(r)}”`) });
    if (s.entity === 'suppliers') await this.db.parts.updateMany(this.db.parts.items().filter((p) => p.supplierId === r.id).map((p) => p.id), () => ({ supplierId: null }));
    if (removed) this.toast.undo(L('Видалено', 'Deleted'), () => repo.restore(removed as never));
  }

  protected async setRate(c: WorkCategory, rate: number): Promise<void> {
    const st = this.db.settings();
    if (!st) return;
    await this.db.settingsRepo.update(st.id, { categories: st.categories.map((x) => (x.id === c.id ? { ...x, rate } : x)) }, { log: L(`Ставка «${c.name}»: ${rate} ₴`, `Rate “${c.name}”: ${rate} UAH`) });
  }
}
