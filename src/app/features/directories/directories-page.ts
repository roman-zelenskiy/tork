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
import { fmtHours, fmtMoney, fmtPhone } from '../../shared/format';
import { KNOWN_MAKES } from '../clients/car-form';
import { EntityForm, EntityFormData, FieldDef } from './entity-form';
import { RuleForm } from '../reminders/rule-form';

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

const ROLE: Record<Employee['role'], string> = { mechanic: 'Механік', receptionist: 'Майстер-приймальник', manager: 'Керівник', storekeeper: 'Комірник' };
const KIND: Record<Post['kind'], string> = { lift: 'Підйомник', diag: 'Діагностика', tire: 'Шиномонтаж', body: 'Кузовний', express: 'Експрес' };
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const opts = <T extends string>(m: Record<T, string>): Option<T>[] => (Object.keys(m) as T[]).map((k) => ({ value: k, label: m[k] }));

/** Довідники: філії, пости, співробітники, нормо-години й категорії, постачальники, шаблони, правила ТО */
@Component({
  selector: 'tk-directories-page',
  imports: [RouterLink, RouterLinkActive, Icon, PageHeader, DataTable, CellDef, Stepper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-page-header title="Довідники" subtitle="Дані, з якими працюють усі розділи">
      @if (sec(); as s) {
        <button type="button" class="btn btn-primary" (click)="edit(null)"><svg [lucideIcon]="I.plus" aria-hidden="true"></svg>{{ s.slug === 'pravyla-to' ? 'Нове правило' : 'Додати' }}</button>
      }
    </tk-page-header>
    <div class="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Довідники" class="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
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
              <h2 id="cat-h" class="m-0 mb-1 text-[15px] font-semibold">Категорії й ставки нормо-години</h2>
              <p class="m-0 mb-3 text-xs text-ink-3">Вартість роботи = нормо-години × ставка категорії. Пост зі своєю ставкою (наприклад, діагностичний) має пріоритет.</p>
              <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                @for (c of categories(); track c.id) {
                  <div class="flex flex-col gap-1.5 rounded-lg border border-line p-2.5">
                    <span class="text-[13px]">{{ c.name }}</span>
                    <tk-stepper size="sm" [value]="c.rate" [min]="100" [max]="5000" [step]="50" suffix="₴" [ariaLabel]="'Ставка: ' + c.name" (changed)="setRate(c, $event)" />
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
            [emptyTitle]="'Тут поки порожньо'"
            [emptyText]="'Додайте перший запис кнопкою «Додати».'"
            (rowClick)="edit($event)"
          >
            <ng-template tkCell="actions" let-r>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Видалити ' + s.label(r)" (click)="remove(r)"><svg [lucideIcon]="I.trash" [size]="14" aria-hidden="true"></svg></button>
            </ng-template>
            <ng-template tkCell="active" let-r>
              <span class="badge" [class.badge-success]="r['active']">{{ r['active'] ? 'активний' : 'вимкнено' }}</span>
            </ng-template>
          </tk-data-table>
        }
      </div>
    </div>
  `,
})
export class DirectoriesPage {
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
      title: 'Філії',
      icon: I.building,
      entity: 'branches',
      noun: 'філію',
      rows: () => this.db.branches.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'name', label: 'Назва', value: this.cell('name'), required: true },
        { key: 'address', label: 'Адреса', value: this.cell('address') },
        { key: 'phone', label: 'Телефон', value: this.cell('phone'), format: (r) => fmtPhone(String(r['phone'])) },
        { key: 'hours', label: 'Графік', value: (r) => `${r['opensAt']}–${r['closesAt']}`, format: (r) => `${(r['workDays'] as number[]).map((d) => DAYS[d - 1]).join(', ')}, ${r['opensAt']}–${r['closesAt']}`, sortable: false },
        this.actions,
      ],
      fields: () => [
        { key: 'name', label: 'Назва', type: 'text', required: true, placeholder: 'Торк Лівий берег' },
        { key: 'address', label: 'Адреса', type: 'text', required: true, placeholder: 'Київ, вул. …' },
        { key: 'phone', label: 'Телефон', type: 'mask', mask: 'phone', required: true, validate: (v) => (v && !normPhone(String(v)) ? 'Номер неповний' : null) },
        { key: 'opensAt', label: 'Відкриття', type: 'time', required: true, half: true },
        { key: 'closesAt', label: 'Закриття', type: 'time', required: true, half: true, validate: (v, m) => (v && m['opensAt'] && String(v) <= String(m['opensAt']) ? 'Закриття має бути пізніше' : null) },
        { key: 'workDays', label: 'Робочі дні', type: 'multiselect', required: true, options: DAYS.map((d, i) => ({ value: i + 1, label: d })) },
      ],
      defaults: () => ({ name: '', address: '', phone: '', opensAt: '08:00', closesAt: '20:00', workDays: [1, 2, 3, 4, 5, 6] }),
      blocked: (r) => {
        if (this.db.branches.items().length === 1) return 'Це єдина філія — без неї застосунок не працюватиме.';
        const n = this.db.orders.items().filter((o) => o.branchId === r.id).length;
        return n ? `У філії ${n} нарядів. Філію з історією видалити не можна.` : null;
      },
    },
    {
      slug: 'posty',
      title: 'Пости',
      icon: I.grid,
      entity: 'posts',
      noun: 'пост',
      rows: () => this.db.posts.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'name', label: 'Пост', value: this.cell('name'), required: true },
        { key: 'branch', label: 'Філія', value: (r) => this.db.branches.get(r['branchId'] as string)?.name ?? '' },
        { key: 'kind', label: 'Тип', value: (r) => KIND[r['kind'] as Post['kind']] },
        { key: 'rate', label: 'Своя ставка', value: (r) => (r['rate'] as number) ?? 0, format: (r) => (r['rate'] ? fmtMoney(r['rate'] as number) : 'за категорією'), align: 'right' },
        { key: 'active', label: 'Стан', value: (r) => (r['active'] ? 1 : 0) },
        this.actions,
      ],
      fields: () => [
        { key: 'name', label: 'Назва', type: 'text', required: true, placeholder: 'Підйомник 4' },
        { key: 'branchId', label: 'Філія', type: 'select', required: true, options: this.branchOpts(), half: true },
        { key: 'kind', label: 'Тип', type: 'select', required: true, options: opts(KIND), half: true },
        { key: 'rate', label: 'Ставка нормо-години поста', type: 'mask', mask: 'money', suffix: '₴', hint: 'Порожньо — ставка категорії роботи' },
        { key: 'active', label: 'Пост активний (показується на табло)', type: 'switch' },
      ],
      defaults: () => ({ name: '', branchId: this.db.branches.items()[0]?.id ?? null, kind: 'lift', rate: null, active: true }),
      blocked: (r) => {
        const n = this.db.orders.items().filter((o) => o.postId === r.id && o.start && Date.parse(o.start) > Date.now() && o.status !== 'skasovano').length;
        return n ? `На пост є ${n} майбутніх записів. Перенесіть їх або вимкніть пост.` : null;
      },
    },
    {
      slug: 'spivrobitnyky',
      title: 'Співробітники',
      icon: I.users,
      entity: 'employees',
      noun: 'співробітника',
      rows: () => this.db.employees.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'name', label: 'Ім’я', value: this.cell('name'), required: true },
        { key: 'role', label: 'Роль', value: (r) => ROLE[r['role'] as Employee['role']] },
        { key: 'branch', label: 'Філія', value: (r) => this.db.branches.get(r['branchId'] as string)?.name ?? '' },
        { key: 'phone', label: 'Телефон', value: this.cell('phone'), format: (r) => fmtPhone(String(r['phone'])) },
        { key: 'pay', label: 'Оплата', value: (r) => r['payPercent'] as number, format: (r) => `${r['payPercent'] ? r['payPercent'] + '% + ' : ''}${fmtMoney(r['baseSalary'] as number)}`, align: 'right' },
        { key: 'active', label: 'Стан', value: (r) => (r['active'] ? 1 : 0) },
        this.actions,
      ],
      fields: () => [
        { key: 'name', label: 'Ім’я та прізвище', type: 'text', required: true },
        { key: 'role', label: 'Роль', type: 'select', required: true, options: opts(ROLE), half: true },
        { key: 'branchId', label: 'Філія', type: 'select', required: true, options: this.branchOpts(), half: true },
        { key: 'phone', label: 'Телефон', type: 'mask', mask: 'phone', validate: (v) => (v && !normPhone(String(v)) ? 'Номер неповний' : null) },
        { key: 'skills', label: 'Категорії робіт (для механіків)', type: 'multiselect', options: this.catOpts() },
        { key: 'payPercent', label: 'Відсоток від робіт', type: 'number', max: 60, suffix: '%', half: true },
        { key: 'baseSalary', label: 'Оклад на місяць', type: 'mask', mask: 'money', suffix: '₴', half: true },
        { key: 'active', label: 'Працює', type: 'switch' },
      ],
      defaults: () => ({ name: '', role: 'mechanic', branchId: this.db.branches.items()[0]?.id ?? null, phone: '', skills: [], payPercent: 30, baseSalary: 8000, active: true }),
      blocked: (r) => {
        const n = this.db.orders.items().filter((o) => o.mechanicId === r.id && !['vydano', 'skasovano'].includes(o.status)).length;
        return n ? `На співробітника призначено ${n} відкритих нарядів. Перепризначте їх або позначте «Не працює».` : null;
      },
    },
    {
      slug: 'normo-hodyny',
      title: 'Нормо-години',
      icon: I.timer,
      entity: 'works',
      noun: 'роботу',
      rows: () => this.db.works.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'code', label: 'Код', value: this.cell('code'), mono: true, required: true },
        { key: 'name', label: 'Робота', value: this.cell('name') },
        { key: 'cat', label: 'Категорія', value: (r) => this.categories().find((c) => c.id === r['categoryId'])?.name ?? '' },
        { key: 'hours', label: 'Норматив', value: (r) => r['hours'] as number, format: (r) => fmtHours(r['hours'] as number), align: 'right' },
        { key: 'price', label: 'Вартість', value: (r) => this.price(r), format: (r) => fmtMoney(this.price(r)), align: 'right' },
        { key: 'makes', label: 'Марки', value: (r) => (r['makes'] as string[]).join(', ') || 'усі', hidden: true },
        this.actions,
      ],
      fields: () => [
        { key: 'code', label: 'Код', type: 'text', required: true, half: true, placeholder: 'ТО-10', validate: (v, m) => (this.db.works.items().some((w) => w.code === String(v).trim() && w.id !== m['id']) ? 'Такий код уже є' : null) },
        { key: 'hours', label: 'Норматив, год', type: 'number', min: 0.1, max: 40, step: 0.1, decimals: 1, half: true },
        { key: 'name', label: 'Назва роботи', type: 'text', required: true },
        { key: 'categoryId', label: 'Категорія', type: 'select', required: true, options: this.catOpts() },
        { key: 'makes', label: 'Лише для марок', type: 'multiselect', options: KNOWN_MAKES.map((m) => ({ value: m, label: m })), hint: 'Порожньо — для всіх' },
      ],
      defaults: () => ({ code: '', name: '', categoryId: this.categories()[0]?.id ?? null, hours: 1, makes: [] }),
    },
    {
      slug: 'postachalnyky',
      title: 'Постачальники',
      icon: I.truck,
      entity: 'suppliers',
      noun: 'постачальника',
      rows: () => this.db.suppliers.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'name', label: 'Назва', value: this.cell('name'), required: true },
        { key: 'phone', label: 'Телефон', value: this.cell('phone'), format: (r) => fmtPhone(String(r['phone'])) },
        { key: 'email', label: 'Email', value: this.cell('email') },
        { key: 'delivery', label: 'Доставка', value: (r) => r['deliveryDays'] as number, format: (r) => `${r['deliveryDays']} дн.`, align: 'right' },
        { key: 'parts', label: 'Позицій', value: (r) => this.db.parts.items().filter((p) => p.supplierId === r.id).length, align: 'right' },
        this.actions,
      ],
      fields: () => [
        { key: 'name', label: 'Назва', type: 'text', required: true },
        { key: 'phone', label: 'Телефон', type: 'mask', mask: 'phone', half: true },
        { key: 'deliveryDays', label: 'Доставка, днів', type: 'number', min: 0, max: 30, half: true },
        { key: 'email', label: 'Email для замовлень', type: 'text', validate: (v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v)) ? 'Перевірте email' : null) },
        { key: 'notes', label: 'Примітки', type: 'textarea' },
      ],
      defaults: () => ({ name: '', phone: '', email: '', deliveryDays: 1, notes: '' }),
    },
    {
      slug: 'shablony',
      title: 'Шаблони',
      icon: I.message,
      entity: 'templates',
      noun: 'шаблон',
      rows: () => this.db.templates.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'name', label: 'Назва', value: this.cell('name'), required: true },
        { key: 'channel', label: 'Канал', value: (r) => (r['channel'] === 'sms' ? 'SMS' : 'Viber') },
        { key: 'text', label: 'Текст', value: this.cell('text'), sortable: false },
        this.actions,
      ],
      fields: () => [
        { key: 'name', label: 'Назва', type: 'text', required: true },
        { key: 'channel', label: 'Канал', type: 'radio', options: [{ value: 'viber', label: 'Viber' }, { value: 'sms', label: 'SMS' }] },
        { key: 'text', label: 'Текст', type: 'template', required: true, hint: 'Змінні підставляються для кожного клієнта' },
      ],
      defaults: () => ({ name: '', channel: 'viber', text: '' }),
      blocked: (r) => (this.db.rules.items().some((x) => x.templateId === r.id) ? 'Шаблон використовує правило ТО — спершу змініть правило.' : null),
    },
    {
      slug: 'pravyla-to',
      title: 'Правила ТО',
      icon: I.bellRing,
      entity: 'rules',
      noun: 'правило',
      rows: () => this.db.rules.items() as unknown as Row[],
      label: (r) => String(r['name']),
      columns: [
        { key: 'name', label: 'Правило', value: this.cell('name'), required: true },
        { key: 'cond', label: 'Умова', value: (r) => this.rem.ruleText(r as unknown as ReminderRule), sortable: false },
        { key: 'code', label: 'Робота', value: this.cell('workCode'), mono: true },
        { key: 'active', label: 'Стан', value: (r) => (r['active'] ? 1 : 0) },
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
      this.dialogs.open(RuleForm, { id: r?.id }, { drawer: true, label: 'Правило ТО' });
      return;
    }
    const repo = this.db.repo(s.entity);
    const data: EntityFormData = {
      title: r ? s.label(r) : `Додати ${s.noun}`,
      fields: s.fields(),
      value: r ? { ...r } : s.defaults(),
      submitLabel: r ? 'Зберегти' : 'Додати',
      save: async (v) => {
        const { id, ...rest } = v;
        const payload = Object.fromEntries(Object.entries(rest).filter(([k]) => k !== 'createdAt' && k !== 'updatedAt'));
        if (id) await repo.update(String(id), payload as never, { log: `${s.title}: змінено «${payload['name'] ?? payload['code']}»` });
        else await repo.create(payload as never, { log: `${s.title}: додано «${payload['name'] ?? payload['code']}»` });
      },
    };
    this.dialogs.open(EntityForm, data, { drawer: true, label: data.title });
  }

  protected async remove(r: Row): Promise<void> {
    const s = this.sec();
    const why = s.blocked?.(r);
    if (why) return void this.toast.error(why);
    const ok = await this.dialogs.confirm({ title: `Видалити «${s.label(r)}»?`, text: 'Запис зникне з довідника. Історичні наряди не зміняться.', confirm: 'Видалити', danger: true });
    if (!ok) return;
    const repo = this.db.repo(s.entity);
    const removed = await repo.remove(r.id, { log: `${s.title}: видалено «${s.label(r)}»` });
    if (s.entity === 'suppliers') await this.db.parts.updateMany(this.db.parts.items().filter((p) => p.supplierId === r.id).map((p) => p.id), () => ({ supplierId: null }));
    if (removed) this.toast.undo('Видалено', () => repo.restore(removed as never));
  }

  protected async setRate(c: WorkCategory, rate: number): Promise<void> {
    const st = this.db.settings();
    if (!st) return;
    await this.db.settingsRepo.update(st.id, { categories: st.categories.map((x) => (x.id === c.id ? { ...x, rate } : x)) }, { log: `Ставка «${c.name}»: ${rate} ₴` });
  }
}
