import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DbService } from '../../core/data/db.service';
import { Client } from '../../core/data/models';
import { StatsService } from '../../core/domain/stats.service';
import { ClientsService } from '../../core/domain/clients.service';
import { QuickActions } from '../../core/ui/quick-actions.service';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/states';
import { BulkDef, CellDef, Column, DataTable, FilterDef } from '../../shared/ui/data-table';
import { Avatar, Plate } from '../../shared/ui/display';
import { Tooltip } from '../../shared/ui/tooltip';
import { PromptDialog, PromptData } from '../../shared/ui/prompt-dialog';
import { fmtDate, fmtMoney, fmtNum, fmtPhone, plural } from '../../shared/format';
import { L } from '../../core/i18n';

type Row = Client & { s: { visits: number; revenue: number; debt: number; lastVisit: string | null; plates: string[] } };

@Component({
  selector: 'tk-clients-list',
  imports: [RouterLink, Icon, PageHeader, DataTable, CellDef, BulkDef, Avatar, Plate, Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-page-header [title]="L('Клієнти', 'Customers')" [subtitle]="subtitle()">
      <button type="button" class="btn btn-primary" (click)="quick.newClient()">
        <svg [lucideIcon]="I.userPlus" aria-hidden="true"></svg>{{ L('Новий клієнт', 'New customer') }}
      </button>
    </tk-page-header>

    <tk-data-table
      tableId="clients"
      csvName="kliyenty"
      [ariaLabel]="L('Клієнти', 'Customers')"
      [searchPlaceholder]="L('Ім’я, телефон, номер авто…', 'Name, phone, number plate…')"
      [rows]="rows()"
      [columns]="columns"
      [filters]="filters()"
      [rowId]="rowId"
      [loading]="!db.ready()"
      [selectable]="true"
      [rowClickable]="true"
      [defaultSort]="{ key: 'last', dir: 'desc' }"
      [searchText]="searchText"
      [flashIds]="flash()"
      emptyArt="clients"
      [emptyTitle]="L('Клієнтів ще немає', 'No customers yet')"
      [emptyText]="L('Додайте першого клієнта — або він з’явиться автоматично при створенні наряду.', 'Add your first customer — or one will appear automatically when you create a work order.')"
      (rowClick)="open($event)"
    >
      <ng-template tkCell="name" let-r>
        <span class="flex min-w-0 items-center gap-2.5">
          <tk-avatar [name]="r.name" />
          <a [routerLink]="['/kliyenty', r.id]" class="row-link truncate-1 max-w-[24ch]" [tkTip]="r.name" [tipTruncated]="true">{{ r.name }}</a>
          @if (r.kind === 'company') {
            <span class="badge badge-info">{{ L('компанія', 'company') }}</span>
          }
        </span>
      </ng-template>
      <ng-template tkCell="phone" let-r>
        <a [href]="'tel:' + r.phone" class="row-link num font-normal! whitespace-nowrap">{{ phone(r.phone) }}</a>
      </ng-template>
      <ng-template tkCell="cars" let-r>
        <span class="flex items-center gap-1">
          @for (p of r.s.plates.slice(0, 2); track p) {
            <tk-plate [value]="p" />
          }
          @if (r.s.plates.length > 2) {
            <span class="text-xs text-ink-3">+{{ r.s.plates.length - 2 }}</span>
          }
        </span>
      </ng-template>
      <ng-template tkCell="debt" let-r>
        @if (r.s.debt > 0) {
          <span class="font-medium text-danger">{{ money(r.s.debt) }}</span>
        } @else {
          <span class="text-ink-3">—</span>
        }
      </ng-template>
      <ng-template tkCell="tags" let-r>
        <span class="flex flex-wrap gap-1">
          @for (t of r.tags; track t) {
            <span class="chip">{{ t }}</span>
          }
        </span>
      </ng-template>
      <ng-template tkBulk let-rows>
        <button type="button" class="btn btn-sm" (click)="addTag(rows)">
          <svg [lucideIcon]="I.tag" aria-hidden="true"></svg>{{ L('Додати тег', 'Add tag') }}
        </button>
        <button type="button" class="btn btn-sm btn-danger" (click)="remove(rows)">
          <svg [lucideIcon]="I.trash" aria-hidden="true"></svg>{{ L('Видалити', 'Delete') }}
        </button>
      </ng-template>
      <button empty type="button" class="btn btn-primary" (click)="quick.newClient()">
        <svg [lucideIcon]="I.userPlus" aria-hidden="true"></svg>{{ L('Додати клієнта', 'Add customer') }}
      </button>
    </tk-data-table>
  `,
})
export class ClientsList {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly db = inject(DbService);
  protected readonly quick = inject(QuickActions);
  private readonly stats = inject(StatsService);
  private readonly clientsSvc = inject(ClientsService);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly rowId = (r: Row) => r.id;
  protected readonly phone = fmtPhone;
  protected readonly money = fmtMoney;
  protected readonly searchText = (r: Row) => `${r.phone} ${r.s.plates.join(' ')} ${r.email} ${r.tags.join(' ')}`;

  protected readonly rows = computed<Row[]>(() => {
    const st = this.stats.clientStats();
    const cars = this.stats.carsByClient();
    return this.db.clients.items().map((c) => {
      const s = st.get(c.id);
      return {
        ...c,
        s: {
          visits: s?.visits ?? 0,
          revenue: s?.revenue ?? 0,
          debt: s?.debt ?? 0,
          lastVisit: s?.lastVisit ?? null,
          plates: (cars.get(c.id) ?? []).map((x) => x.plate),
        },
      };
    });
  });

  protected readonly subtitle = computed(() => {
    if (!this.db.ready()) return L('Завантаження…', 'Loading…');
    const n = this.rows().length;
    const debtors = this.rows().filter((r) => r.s.debt > 0).length;
    return `${fmtNum(n)} ${plural(n, ['клієнт', 'клієнти', 'клієнтів'], ['customer', 'customers'])}${debtors ? L(`, ${debtors} з боргом`, `, ${debtors} with debt`) : ''}`;
  });

  /** Підсвітка рядків, змінених в іншій вкладці */
  protected readonly flash = computed(() => {
    const ch = this.db.externalChange();
    if (!ch || ch.name !== 'clients' || Date.now() - ch.at > 3000) return [];
    return this.db.clients.items().filter((c) => Date.parse(c.updatedAt) > ch.at - 5000).map((c) => c.id);
  });

  protected readonly columns: Column<Row>[] = [
    { key: 'name', label: L('Клієнт', 'Customer'), value: (r) => r.name, required: true },
    { key: 'phone', label: L('Телефон', 'Phone'), value: (r) => r.phone, format: (r) => fmtPhone(r.phone), sortable: false },
    { key: 'cars', label: L('Авто', 'Cars'), value: (r) => r.s.plates.length, csv: (r) => r.s.plates.join(', '), sortable: true },
    { key: 'visits', label: L('Візити', 'Visits'), value: (r) => r.s.visits, align: 'right' },
    { key: 'revenue', label: L('Сума', 'Total'), value: (r) => r.s.revenue, format: (r) => fmtMoney(r.s.revenue), csv: (r) => r.s.revenue, align: 'right' },
    { key: 'debt', label: L('Борг', 'Debt'), value: (r) => r.s.debt, csv: (r) => r.s.debt, align: 'right' },
    { key: 'last', label: L('Останній візит', 'Last visit'), value: (r) => r.s.lastVisit, format: (r) => fmtDate(r.s.lastVisit) },
    { key: 'tags', label: L('Теги', 'Tags'), value: (r) => r.tags.join(', '), sortable: false },
    { key: 'email', label: 'Email', value: (r) => r.email, hidden: true },
    { key: 'created', label: L('Клієнт з', 'Customer since'), value: (r) => r.createdAt, format: (r) => fmtDate(r.createdAt), hidden: true },
  ];

  protected readonly filters = computed<FilterDef<Row>[]>(() => [
    {
      key: 'kind',
      label: L('Тип', 'Type'),
      options: [
        { value: 'person', label: L('Фізособи', 'Individuals') },
        { value: 'company', label: L('Компанії', 'Companies') },
      ],
      match: (r, v) => v.includes(r.kind),
    },
    {
      key: 'tags',
      label: L('Теги', 'Tags'),
      options: this.clientsSvc.allTags().map((t) => ({ value: t, label: t })),
      match: (r, v) => r.tags.some((t) => v.includes(t)),
    },
    {
      key: 'debt',
      label: L('Борг', 'Debt'),
      options: [
        { value: 'yes', label: L('Є борг', 'Has debt') },
        { value: 'no', label: L('Без боргу', 'No debt') },
      ],
      match: (r, v) => v.includes(r.s.debt > 0 ? 'yes' : 'no'),
    },
  ]);

  protected open(r: Row): void {
    void this.router.navigate(['/kliyenty', r.id]);
  }

  protected async addTag(rows: Row[]): Promise<void> {
    const ref = this.dialogs.open<PromptDialog, PromptData, string>(
      PromptDialog,
      { title: `${L('Тег для', 'Tag for')} ${rows.length} ${plural(rows.length, ['клієнта', 'клієнтів', 'клієнтів'], ['customer', 'customers'])}`, label: L('Тег', 'Tag'), confirm: L('Додати', 'Add'), placeholder: L('постійний', 'regular') },
      { size: 'sm' },
    );
    const tag = (await firstValueFrom(ref.closed))?.trim();
    if (!tag) return;
    try {
      await this.db.clients.updateMany(
        rows.map((r) => r.id),
        (c) => ({ tags: c.tags.includes(tag) ? c.tags : [...c.tags, tag] }),
        { log: L(`Тег «${tag}» додано ${rows.length} клієнтам`, `Tag “${tag}” added to ${rows.length} customers`) },
      );
      this.toast.success(L(`Тег «${tag}» додано`, `Tag “${tag}” added`));
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected async remove(rows: Row[]): Promise<void> {
    const ids = rows.map((r) => r.id);
    const info = this.clientsSvc.cascadeInfo(ids);
    const ok = await this.dialogs.confirm({
      title:
        rows.length === 1
          ? L(`Видалити клієнта ${rows[0].name}?`, `Delete customer ${rows[0].name}?`)
          : `${L('Видалити', 'Delete')} ${rows.length} ${plural(rows.length, ['клієнта', 'клієнтів', 'клієнтів'], ['customer', 'customers'])}?`,
      text: this.clientsSvc.cascadeText(info),
      confirm: L('Видалити', 'Delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      const restore = await this.clientsSvc.deleteClients(ids);
      this.toast.undo(rows.length === 1 ? L('Клієнта видалено', 'Customer deleted') : L(`Видалено клієнтів: ${rows.length}`, `Customers deleted: ${rows.length}`), restore);
    } catch (e) {
      this.toast.error(e);
    }
  }
}
