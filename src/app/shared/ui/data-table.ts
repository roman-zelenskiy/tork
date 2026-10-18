import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChild,
  contentChildren,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { CdkMenu, CdkMenuItem, CdkMenuItemCheckbox, CdkMenuTrigger } from '@angular/cdk/menu';
import { Icon } from './icon';
import { I } from '../icons';
import { Option, norm } from './option';
import { Select } from './select';
import { Checkbox } from './checkbox';
import { EmptyArt, EmptyState } from './states';
import { TextField } from './text-field';
import { Tooltip } from './tooltip';
import { DbService } from '../../core/data/db.service';
import { SavedView } from '../../core/data/models';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { PromptDialog, PromptData } from './prompt-dialog';
import { downloadFile } from '../download';
import { fmtNum, plural } from '../format';
import { L } from '../../core/i18n';

export interface Column<T> {
  key: string;
  label: string;
  /** Значення для сортування, пошуку й CSV */
  value: (row: T) => string | number | null | undefined;
  /** Текст клітинки за замовчуванням (якщо немає шаблону tkCell) */
  format?: (row: T) => string;
  csv?: (row: T) => string | number;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: string;
  /** Прихована за замовчуванням */
  hidden?: boolean;
  /** Не можна приховати */
  required?: boolean;
  mono?: boolean;
}

export interface FilterDef<T> {
  key: string;
  label: string;
  options: Option<string>[];
  match: (row: T, values: string[]) => boolean;
}

type ViewState = SavedView['state'];

/** Шаблон клітинки: <ng-template tkCell="key" let-row>…</ng-template> */
@Directive({ selector: '[tkCell]' })
export class CellDef {
  readonly tkCell = input.required<string>();
  readonly tpl = inject(TemplateRef);
}

/** Масові дії: <ng-template tkBulk let-rows>…</ng-template> */
@Directive({ selector: '[tkBulk]' })
export class BulkDef {
  readonly tpl = inject(TemplateRef);
}

/**
 * Таблиця UI-кіта: сортування, пошук, фільтри, збережені вигляди (tork:saved-views),
 * вибір колонок, масові дії й експорт CSV. Горизонтальна прокрутка лише всередині таблиці.
 */
@Component({
  selector: 'tk-data-table',
  imports: [
    NgTemplateOutlet,
    CdkMenu,
    CdkMenuItem,
    CdkMenuItemCheckbox,
    CdkMenuTrigger,
    Icon,
    Select,
    Checkbox,
    EmptyState,
    TextField,
    Tooltip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <!-- панель інструментів -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <tk-text-field
        class="w-full sm:w-64"
        size="sm"
        type="search"
        [icon]="I.search"
        [placeholder]="searchPlaceholder()"
        [ariaLabel]="searchPlaceholder()"
        [clearable]="true"
        [value]="query()"
        (valueChange)="query.set($event); page.set(0)"
      />
      @for (f of filters(); track f.key) {
        <tk-select
          class="w-[calc(50%-4px)] sm:w-auto sm:min-w-40"
          size="sm"
          [multiple]="true"
          [options]="f.options"
          [placeholder]="f.label"
          [ariaLabel]="f.label"
          [manyLabel]="manyLabelFor(f.label)"
          [values]="filterState()[f.key] ?? []"
          (valuesChange)="setFilter(f.key, $event)"
        />
      }
      @if (activeFilterCount()) {
        <button type="button" class="btn btn-ghost btn-sm" (click)="resetFilters()">
          <svg [lucideIcon]="I.x" aria-hidden="true"></svg>{{ L('Скинути', 'Reset') }}
        </button>
      }
      <div class="ml-auto flex items-center gap-1">
        <ng-content select="[toolbar]" />
        @if (tableId()) {
          <button type="button" class="btn btn-sm" [cdkMenuTriggerFor]="viewsMenu" [attr.aria-label]="L('Збережені вигляди', 'Saved views')">
            <svg [lucideIcon]="I.eye" aria-hidden="true"></svg>
            <span class="hidden truncate-1 max-w-32 md:inline">{{ currentView()?.name ?? L('Вигляди', 'Views') }}</span>
          </button>
        }
        <button type="button" class="btn btn-sm btn-icon" [cdkMenuTriggerFor]="colsMenu" [attr.aria-label]="L('Колонки', 'Columns')" [tkTip]="L('Колонки', 'Columns')">
          <svg [lucideIcon]="I.columns" aria-hidden="true"></svg>
        </button>
        <button type="button" class="btn btn-sm btn-icon" [attr.aria-label]="L('Експорт у CSV', 'Export to CSV')" [tkTip]="L('Експорт у CSV', 'Export to CSV')" [disabled]="!filtered().length" (click)="exportCsv()">
          <svg [lucideIcon]="I.download" aria-hidden="true"></svg>
        </button>
      </div>
    </div>

    <ng-template #viewsMenu>
      <div class="menu w-64" cdkMenu>
        <div class="menu-label">{{ L('Збережені вигляди', 'Saved views') }}</div>
        @for (v of views(); track v.id) {
          <div class="flex items-center">
            <button type="button" class="menu-item flex-1" cdkMenuItem [class.active]="currentView()?.id === v.id" (cdkMenuItemTriggered)="applyView(v)">
              <svg [lucideIcon]="currentView()?.id === v.id ? I.check : I.eye" aria-hidden="true"></svg>
              <span class="truncate-1">{{ v.name }}</span>
            </button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" cdkMenuItem [attr.aria-label]="L('Видалити вигляд ', 'Delete view ') + v.name" (cdkMenuItemTriggered)="deleteView(v)">
              <svg [lucideIcon]="I.trash" [size]="14" aria-hidden="true"></svg>
            </button>
          </div>
        } @empty {
          <div class="px-2 pb-2 text-xs text-ink-3">{{ L('Збережіть фільтри, сортування й колонки, щоб повертатися до них одним кліком.', 'Save filters, sorting and columns to come back to them in one click.') }}</div>
        }
        <div class="menu-sep"></div>
        <button type="button" class="menu-item" cdkMenuItem (cdkMenuItemTriggered)="saveView()">
          <svg [lucideIcon]="I.plus" aria-hidden="true"></svg>{{ L('Зберегти поточний вигляд', 'Save current view') }}
        </button>
        @if (currentView()) {
          <button type="button" class="menu-item" cdkMenuItem (cdkMenuItemTriggered)="clearView()">
            <svg [lucideIcon]="I.undo" aria-hidden="true"></svg>{{ L('Типовий вигляд', 'Default view') }}
          </button>
        }
      </div>
    </ng-template>

    <ng-template #colsMenu>
      <div class="menu w-56" cdkMenu>
        <div class="menu-label">{{ L('Показувати колонки', 'Show columns') }}</div>
        @for (c of columns(); track c.key) {
          <button
            type="button"
            class="menu-item"
            cdkMenuItemCheckbox
            [cdkMenuItemChecked]="visible().has(c.key)"
            [cdkMenuItemDisabled]="!!c.required"
            (cdkMenuItemTriggered)="toggleColumn(c.key)"
          >
            <span
              class="grid size-4 flex-none place-items-center rounded-[4px] border"
              [class]="visible().has(c.key) ? 'border-transparent bg-accent text-on-accent' : 'border-line-strong'"
              aria-hidden="true"
            >
              @if (visible().has(c.key)) {
                <svg [lucideIcon]="I.check" [size]="12" [strokeWidth]="3"></svg>
              }
            </span>
            {{ c.label }}
          </button>
        }
      </div>
    </ng-template>

    <!-- масові дії -->
    @if (selectable() && selected().size) {
      <div class="animate-fade mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-accent-soft px-3 py-1.5" role="region" [attr.aria-label]="L('Масові дії', 'Bulk actions')">
        <span class="text-[13px] font-medium text-accent-ink">{{ L('Обрано', 'Selected:') }} {{ selected().size }}</span>
        <div class="flex flex-wrap gap-1">
          @if (bulk(); as b) {
            <ng-container [ngTemplateOutlet]="b.tpl" [ngTemplateOutletContext]="{ $implicit: selectedRows() }" />
          }
          <button type="button" class="btn btn-sm" (click)="exportCsv(true)">
            <svg [lucideIcon]="I.download" aria-hidden="true"></svg>CSV
          </button>
        </div>
        <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="clearSelection()">{{ L('Зняти вибір', 'Clear selection') }}</button>
      </div>
    }

    <!-- таблиця -->
    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="tbl" [attr.aria-label]="ariaLabel()" [attr.aria-busy]="loading()">
          <thead>
            <tr>
              @if (selectable()) {
                <th class="w-10 pr-0!">
                  <tk-checkbox
                    [ariaLabel]="L('Обрати всі рядки', 'Select all rows')"
                    [checked]="allSelected()"
                    [indeterminate]="!allSelected() && selected().size > 0"
                    [disabled]="loading() || !filtered().length"
                    (changed)="toggleAll($event)"
                  />
                </th>
              }
              @for (c of shownColumns(); track c.key) {
                <th
                  [style.width]="c.width ?? null"
                  [class.text-right]="c.align === 'right'"
                  [class.text-center]="c.align === 'center'"
                  [attr.aria-sort]="sort()?.key === c.key ? (sort()!.dir === 'asc' ? 'ascending' : 'descending') : null"
                >
                  @if (c.sortable !== false) {
                    <button
                      type="button"
                      class="-mx-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 hover:bg-muted hover:text-ink"
                      [class.text-ink]="sort()?.key === c.key"
                      (click)="toggleSort(c.key)"
                    >
                      {{ c.label }}
                      <svg
                        [lucideIcon]="sort()?.key === c.key ? (sort()!.dir === 'asc' ? I.arrowUp : I.arrowDown) : I.sort"
                        [size]="13"
                        aria-hidden="true"
                        [class.opacity-40]="sort()?.key !== c.key"
                      ></svg>
                    </button>
                  } @else if (c.label) {
                    {{ c.label }}
                  } @else {
                    <span class="sr-only">{{ L('Дії', 'Actions') }}</span>
                  }
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              @for (r of skeletonRows; track r) {
                <tr aria-hidden="true">
                  @if (selectable()) {
                    <td><div class="skeleton size-4"></div></td>
                  }
                  @for (c of shownColumns(); track c.key; let ci = $index) {
                    <td><div class="skeleton h-3" [style.width.%]="ci === 0 ? 70 : 45" [style.opacity]="1 - r * 0.08"></div></td>
                  }
                </tr>
              }
            } @else {
              @for (row of pageRows(); track rowId()(row)) {
                <tr
                  [class.selected]="selected().has(rowId()(row))"
                  [class.flash]="flashIds().includes(rowId()(row))"
                  [class.clickable]="rowClickable()"
                  (click)="onRowClick(row, $event)"
                >
                  @if (selectable()) {
                    <td class="pr-0!" (click)="$event.stopPropagation()">
                      <tk-checkbox [ariaLabel]="L('Обрати рядок', 'Select row')" [checked]="selected().has(rowId()(row))" (changed)="toggleRow(row, $event)" />
                    </td>
                  }
                  @for (c of shownColumns(); track c.key) {
                    <td [class.text-right]="c.align === 'right'" [class.text-center]="c.align === 'center'" [class.mono]="c.mono" [class.num]="c.align === 'right'">
                      @if (cellTpl().get(c.key); as tpl) {
                        <ng-container [ngTemplateOutlet]="tpl" [ngTemplateOutletContext]="{ $implicit: row }" />
                      } @else {
                        <span class="block truncate-1 max-w-[28ch]" [tkTip]="text(c, row)" [tipTruncated]="true">{{ text(c, row) }}</span>
                      }
                    </td>
                  }
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      @if (!loading() && !filtered().length) {
        @if (rows().length) {
          <tk-empty art="search" [title]="L('Нічого не знайдено', 'Nothing found')" [text]="L('Змініть пошуковий запит або скиньте фільтри.', 'Change your search or reset the filters.')">
            <button type="button" class="btn btn-sm" (click)="resetFilters(); query.set('')">{{ L('Скинути фільтри', 'Reset filters') }}</button>
          </tk-empty>
        } @else {
          <tk-empty [art]="emptyArt()" [title]="emptyTitle()" [text]="emptyText()"><ng-content select="[empty]" /></tk-empty>
        }
      }

      @if (!loading() && filtered().length > pageSize()) {
        <div class="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[13px] text-ink-2">
          <span class="num">{{ rangeLabel() }}</span>
          <div class="flex gap-1">
            <button type="button" class="btn btn-sm btn-icon" [attr.aria-label]="L('Попередня сторінка', 'Previous page')" [disabled]="page() === 0" (click)="page.set(page() - 1)">
              <svg [lucideIcon]="I.chevronLeft" aria-hidden="true"></svg>
            </button>
            <button type="button" class="btn btn-sm btn-icon" [attr.aria-label]="L('Наступна сторінка', 'Next page')" [disabled]="page() >= pageCount() - 1" (click)="page.set(page() + 1)">
              <svg [lucideIcon]="I.chevronRight" aria-hidden="true"></svg>
            </button>
          </div>
        </div>
      }
    </div>
    <p class="sr-only" aria-live="polite">{{ loading() ? '' : liveSummary() }}</p>
  `,
})
export class DataTable<T> {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5, 6, 7];
  private readonly db = inject(DbService);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);

  readonly rows = input.required<T[]>();
  readonly columns = input.required<Column<T>[]>();
  readonly filters = input<FilterDef<T>[]>([]);
  readonly rowId = input.required<(row: T) => string>();
  /** Ключ таблиці для збережених виглядів і налаштувань колонок */
  readonly tableId = input<string | null>(null);
  readonly loading = input(false);
  readonly selectable = input(false);
  readonly pageSize = input(50);
  readonly searchPlaceholder = input(L('Пошук…', 'Search…'));
  /** Додатковий текст для пошуку поза колонками */
  readonly searchText = input<((row: T) => string) | null>(null);
  readonly defaultSort = input<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly emptyArt = input<EmptyArt>('inbox');
  readonly emptyTitle = input(L('Тут поки порожньо', 'Nothing here yet'));
  readonly emptyText = input<string | null>(null);
  readonly flashIds = input<string[]>([]);
  readonly csvName = input('export');
  readonly rowClickable = input(false);
  readonly rowClick = output<T>();
  /** Початковий пошуковий запит (наприклад, з командної палітри) */
  readonly initialQuery = input<string | null>(null);

  private readonly cells = contentChildren(CellDef);
  protected readonly bulk = contentChild(BulkDef);
  protected readonly cellTpl = computed(() => new Map(this.cells().map((c) => [c.tkCell(), c.tpl] as const)));

  protected readonly query = signal('');
  protected readonly sort = signal<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  protected readonly filterState = signal<Record<string, string[]>>({});
  protected readonly hiddenCols = signal<Set<string> | null>(null);
  protected readonly page = signal(0);
  protected readonly selected = signal(new Set<string>());
  protected readonly currentViewId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const d = this.defaultSort();
      untracked(() => {
        if (!this.sort()) this.sort.set(d);
      });
    });
    effect(() => {
      const q = this.initialQuery();
      if (q) untracked(() => this.query.set(q));
    });
    // після видалення рядків — прибираємо їх із вибору
    effect(() => {
      const ids = new Set(this.rows().map((r) => this.rowId()(r)));
      untracked(() => {
        const sel = this.selected();
        if ([...sel].some((id) => !ids.has(id))) this.selected.set(new Set([...sel].filter((id) => ids.has(id))));
      });
    });
  }

  protected readonly visible = computed(() => {
    const hidden = this.hiddenCols() ?? new Set(this.columns().filter((c) => c.hidden).map((c) => c.key));
    return new Set(this.columns().filter((c) => !hidden.has(c.key)).map((c) => c.key));
  });
  protected readonly shownColumns = computed(() => this.columns().filter((c) => this.visible().has(c.key)));

  protected readonly views = computed(() => this.db.views.items().filter((v) => v.table === this.tableId()));
  protected readonly currentView = computed(() => this.views().find((v) => v.id === this.currentViewId()) ?? null);
  protected readonly activeFilterCount = computed(() => Object.values(this.filterState()).filter((v) => v.length).length);

  readonly filtered = computed(() => {
    const q = norm(this.query().trim());
    const words = q ? q.split(/\s+/) : [];
    const fs = this.filterState();
    const defs = this.filters().filter((f) => fs[f.key]?.length);
    const cols = this.columns();
    const extra = this.searchText();
    let out = this.rows().filter((r) => defs.every((f) => f.match(r, fs[f.key])));
    if (words.length) {
      out = out.filter((r) => {
        const hay = norm(cols.map((c) => c.value(r) ?? '').join(' ') + ' ' + (extra?.(r) ?? ''));
        return words.every((w) => hay.includes(w));
      });
    }
    const s = this.sort();
    const col = s && cols.find((c) => c.key === s.key);
    if (s && col) {
      const dir = s.dir === 'asc' ? 1 : -1;
      const coll = new Intl.Collator('uk', { numeric: true });
      out = [...out].sort((a, b) => {
        const va = col.value(a);
        const vb = col.value(b);
        if (va == null || va === '') return 1;
        if (vb == null || vb === '') return -1;
        return (typeof va === 'number' && typeof vb === 'number' ? va - vb : coll.compare(String(va), String(vb))) * dir;
      });
    }
    return out;
  });

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  protected readonly pageRows = computed(() => {
    const p = Math.min(this.page(), this.pageCount() - 1);
    return this.filtered().slice(p * this.pageSize(), (p + 1) * this.pageSize());
  });
  protected readonly rangeLabel = computed(() => {
    const p = Math.min(this.page(), this.pageCount() - 1);
    const from = p * this.pageSize() + 1;
    const to = Math.min(this.filtered().length, from + this.pageSize() - 1);
    return `${from}–${to} ${L('з', 'of')} ${fmtNum(this.filtered().length)}`;
  });
  protected readonly liveSummary = computed(() => {
    const n = this.filtered().length;
    return `${n} ${plural(n, ['запис', 'записи', 'записів'], ['record', 'records'])}`;
  });

  protected readonly allSelected = computed(() => {
    const f = this.filtered();
    return f.length > 0 && f.every((r) => this.selected().has(this.rowId()(r)));
  });
  protected readonly selectedRows = computed(() => this.rows().filter((r) => this.selected().has(this.rowId()(r))));

  protected text(c: Column<T>, row: T): string {
    const v = c.format ? c.format(row) : c.value(row);
    return v == null || v === '' ? '—' : String(v);
  }

  protected manyLabelFor(label: string): (n: number) => string {
    return (n) => `${label}: ${n}`;
  }

  protected toggleSort(key: string): void {
    const s = this.sort();
    this.sort.set(!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null);
    this.page.set(0);
  }

  protected setFilter(key: string, values: string[]): void {
    this.filterState.update((s) => ({ ...s, [key]: values }));
    this.page.set(0);
  }

  protected resetFilters(): void {
    this.filterState.set({});
    this.page.set(0);
  }

  protected toggleColumn(key: string): void {
    const hidden = new Set(this.columns().filter((c) => !this.visible().has(c.key)).map((c) => c.key));
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    this.hiddenCols.set(hidden);
  }

  protected toggleRow(row: T, on: boolean): void {
    const id = this.rowId()(row);
    const next = new Set(this.selected());
    if (on) next.add(id);
    else next.delete(id);
    this.selected.set(next);
  }

  protected toggleAll(on: boolean): void {
    this.selected.set(on ? new Set(this.filtered().map((r) => this.rowId()(r))) : new Set());
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  protected onRowClick(row: T, e: MouseEvent): void {
    if (!this.rowClickable()) return;
    // клік по посиланню/кнопці всередині рядка обробляє сам елемент
    if ((e.target as HTMLElement).closest('a,button,[role=button],[role=checkbox]')) return;
    this.rowClick.emit(row);
  }

  // ——— збережені вигляди

  private state(): ViewState {
    return {
      sort: this.sort(),
      filters: this.filterState(),
      columns: [...this.visible()],
      query: this.query(),
    };
  }

  protected applyView(v: SavedView): void {
    this.currentViewId.set(v.id);
    this.sort.set(v.state.sort);
    this.filterState.set(v.state.filters ?? {});
    this.query.set(v.state.query ?? '');
    const vis = new Set(v.state.columns ?? []);
    this.hiddenCols.set(vis.size ? new Set(this.columns().filter((c) => !vis.has(c.key) && !c.required).map((c) => c.key)) : null);
    this.page.set(0);
  }

  protected clearView(): void {
    this.currentViewId.set(null);
    this.sort.set(this.defaultSort());
    this.filterState.set({});
    this.query.set('');
    this.hiddenCols.set(null);
  }

  protected async saveView(): Promise<void> {
    const ref = this.dialogs.open<PromptDialog, PromptData, string>(
      PromptDialog,
      L(
        { title: 'Зберегти вигляд', label: 'Назва', confirm: 'Зберегти', placeholder: 'Наприклад, «Боржники Позняки»' },
        { title: 'Save view', label: 'Name', confirm: 'Save', placeholder: 'For example, “Pozniaky debtors”' },
      ),
      { size: 'sm' },
    );
    const name = await firstValueFrom(ref.closed);
    if (!name || !this.tableId()) return;
    try {
      const v = await this.db.views.create({ table: this.tableId()!, name, state: this.state() }, { log: false });
      this.currentViewId.set(v.id);
      this.toast.success(L(`Вигляд «${name}» збережено`, `View “${name}” saved`));
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected async deleteView(v: SavedView): Promise<void> {
    const removed = await this.db.views.remove(v.id, { log: false });
    if (this.currentViewId() === v.id) this.currentViewId.set(null);
    if (removed) this.toast.undo(L(`Вигляд «${v.name}» видалено`, `View “${v.name}” deleted`), () => this.db.views.restore(removed, { log: false }));
  }

  // ——— CSV

  protected exportCsv(onlySelected = false): void {
    const rows = onlySelected ? this.selectedRows() : this.filtered();
    const cols = this.shownColumns();
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map((c) => esc(c.label)).join(';')];
    for (const r of rows) lines.push(cols.map((c) => esc(c.csv ? c.csv(r) : (c.format?.(r) ?? c.value(r)))).join(';'));
    // BOM + «;» — щоб Excel з українською локаллю відкрив кирилицю й колонки правильно
    downloadFile(`${this.csvName()}-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    this.toast.success(L('Експортовано', 'Exported') + ` ${rows.length} ${plural(rows.length, ['рядок', 'рядки', 'рядків'], ['row', 'rows'])}`);
  }
}
