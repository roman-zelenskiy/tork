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

type Row = Client & { s: { visits: number; revenue: number; debt: number; lastVisit: string | null; plates: string[] } };

@Component({
  selector: 'tk-clients-list',
  imports: [RouterLink, Icon, PageHeader, DataTable, CellDef, BulkDef, Avatar, Plate, Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-page-header title="Клієнти" [subtitle]="subtitle()">
      <button type="button" class="btn btn-primary" (click)="quick.newClient()">
        <svg [lucideIcon]="I.userPlus" aria-hidden="true"></svg>Новий клієнт
      </button>
    </tk-page-header>

    <tk-data-table
      tableId="clients"
      csvName="kliyenty"
      ariaLabel="Клієнти"
      searchPlaceholder="Ім’я, телефон, номер авто…"
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
      emptyTitle="Клієнтів ще немає"
      emptyText="Додайте першого клієнта — або він з’явиться автоматично при створенні наряду."
      (rowClick)="open($event)"
    >
      <ng-template tkCell="name" let-r>
        <span class="flex min-w-0 items-center gap-2.5">
          <tk-avatar [name]="r.name" />
          <a [routerLink]="['/kliyenty', r.id]" class="row-link truncate-1 max-w-[24ch]" [tkTip]="r.name" [tipTruncated]="true">{{ r.name }}</a>
          @if (r.kind === 'company') {
            <span class="badge badge-info">компанія</span>
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
          <svg [lucideIcon]="I.tag" aria-hidden="true"></svg>Додати тег
        </button>
        <button type="button" class="btn btn-sm btn-danger" (click)="remove(rows)">
          <svg [lucideIcon]="I.trash" aria-hidden="true"></svg>Видалити
        </button>
      </ng-template>
      <button empty type="button" class="btn btn-primary" (click)="quick.newClient()">
        <svg [lucideIcon]="I.userPlus" aria-hidden="true"></svg>Додати клієнта
      </button>
    </tk-data-table>
  `,
})
export class ClientsList {
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
    if (!this.db.ready()) return 'Завантаження…';
    const n = this.rows().length;
    const debtors = this.rows().filter((r) => r.s.debt > 0).length;
    return `${fmtNum(n)} ${plural(n, ['клієнт', 'клієнти', 'клієнтів'])}${debtors ? `, ${debtors} з боргом` : ''}`;
  });

  /** Підсвітка рядків, змінених в іншій вкладці */
  protected readonly flash = computed(() => {
    const ch = this.db.externalChange();
    if (!ch || ch.name !== 'clients' || Date.now() - ch.at > 3000) return [];
    return this.db.clients.items().filter((c) => Date.parse(c.updatedAt) > ch.at - 5000).map((c) => c.id);
  });

  protected readonly columns: Column<Row>[] = [
    { key: 'name', label: 'Клієнт', value: (r) => r.name, required: true },
    { key: 'phone', label: 'Телефон', value: (r) => r.phone, format: (r) => fmtPhone(r.phone), sortable: false },
    { key: 'cars', label: 'Авто', value: (r) => r.s.plates.length, csv: (r) => r.s.plates.join(', '), sortable: true },
    { key: 'visits', label: 'Візити', value: (r) => r.s.visits, align: 'right' },
    { key: 'revenue', label: 'Сума', value: (r) => r.s.revenue, format: (r) => fmtMoney(r.s.revenue), csv: (r) => r.s.revenue, align: 'right' },
    { key: 'debt', label: 'Борг', value: (r) => r.s.debt, csv: (r) => r.s.debt, align: 'right' },
    { key: 'last', label: 'Останній візит', value: (r) => r.s.lastVisit, format: (r) => fmtDate(r.s.lastVisit) },
    { key: 'tags', label: 'Теги', value: (r) => r.tags.join(', '), sortable: false },
    { key: 'email', label: 'Email', value: (r) => r.email, hidden: true },
    { key: 'created', label: 'Клієнт з', value: (r) => r.createdAt, format: (r) => fmtDate(r.createdAt), hidden: true },
  ];

  protected readonly filters = computed<FilterDef<Row>[]>(() => [
    {
      key: 'kind',
      label: 'Тип',
      options: [
        { value: 'person', label: 'Фізособи' },
        { value: 'company', label: 'Компанії' },
      ],
      match: (r, v) => v.includes(r.kind),
    },
    {
      key: 'tags',
      label: 'Теги',
      options: this.clientsSvc.allTags().map((t) => ({ value: t, label: t })),
      match: (r, v) => r.tags.some((t) => v.includes(t)),
    },
    {
      key: 'debt',
      label: 'Борг',
      options: [
        { value: 'yes', label: 'Є борг' },
        { value: 'no', label: 'Без боргу' },
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
      { title: `Тег для ${rows.length} ${plural(rows.length, ['клієнта', 'клієнтів', 'клієнтів'])}`, label: 'Тег', confirm: 'Додати', placeholder: 'постійний' },
      { size: 'sm' },
    );
    const tag = (await firstValueFrom(ref.closed))?.trim();
    if (!tag) return;
    try {
      await this.db.clients.updateMany(
        rows.map((r) => r.id),
        (c) => ({ tags: c.tags.includes(tag) ? c.tags : [...c.tags, tag] }),
        { log: `Тег «${tag}» додано ${rows.length} клієнтам` },
      );
      this.toast.success(`Тег «${tag}» додано`);
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected async remove(rows: Row[]): Promise<void> {
    const ids = rows.map((r) => r.id);
    const info = this.clientsSvc.cascadeInfo(ids);
    const ok = await this.dialogs.confirm({
      title: rows.length === 1 ? `Видалити клієнта ${rows[0].name}?` : `Видалити ${rows.length} ${plural(rows.length, ['клієнта', 'клієнтів', 'клієнтів'])}?`,
      text: this.clientsSvc.cascadeText(info),
      confirm: 'Видалити',
      danger: true,
    });
    if (!ok) return;
    try {
      const restore = await this.clientsSvc.deleteClients(ids);
      this.toast.undo(rows.length === 1 ? 'Клієнта видалено' : `Видалено клієнтів: ${rows.length}`, restore);
    } catch (e) {
      this.toast.error(e);
    }
  }
}
