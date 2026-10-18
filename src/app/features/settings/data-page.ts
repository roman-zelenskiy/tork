import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { DbService } from '../../core/data/db.service';
import { ActivityEntry, ENTITY_KEYS, EntityKey, META_KEY } from '../../core/data/models';
import { StorageService } from '../../core/data/storage.service';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { TextField } from '../../shared/ui/text-field';
import { norm } from '../../shared/ui/option';
import { downloadFile } from '../../shared/download';
import { fmtAgo, fmtDateTime, fmtNum } from '../../shared/format';
import { SettingsHeader } from './settings-header';
import { L, STORE_PREFIX } from '../../core/i18n';

const NAMES: Record<EntityKey, string> = {
  branches: L('Філії', 'Branches'),
  posts: L('Пости', 'Bays'),
  employees: L('Співробітники', 'Employees'),
  clients: L('Клієнти', 'Customers'),
  cars: L('Авто', 'Cars'),
  orders: L('Наряди', 'Work orders'),
  works: L('Нормо-години', 'Standard hours'),
  parts: L('Запчастини', 'Parts'),
  movements: L('Рух складу', 'Stock movements'),
  suppliers: L('Постачальники', 'Suppliers'),
  purchases: L('Закупівлі', 'Purchase orders'),
  approvals: L('Погодження', 'Approvals'),
  reminders: L('Нагадування', 'Reminders'),
  rules: L('Правила ТО', 'Service rules'),
  templates: L('Шаблони', 'Templates'),
  mailings: L('Розсилки', 'Mailings'),
  activity: L('Журнал дій', 'Activity log'),
  notifications: L('Сповіщення', 'Notifications'),
  views: L('Збережені вигляди', 'Saved views'),
  settings: L('Налаштування', 'Settings'),
};
/** Орієнтовний ліміт localStorage (Chromium, Firefox — ~5 млн символів) */
const QUOTA_BYTES = 10 * 1024 * 1024;

/** «Дані»: обсяг сховища по сутностях, експорт/імпорт JSON, скидання до демо, чиста база, журнал дій */
@Component({
  selector: 'tk-data-page',
  imports: [ScrollingModule, Icon, TextField, SettingsHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-settings-header />
    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section class="card min-w-0 p-5" aria-labelledby="d-size">
        <div class="mb-4 flex flex-wrap items-baseline gap-x-3">
          <h2 id="d-size" class="m-0 flex-1 text-[15px] font-semibold">{{ L('Сховище браузера', 'Browser storage') }}</h2>
          <span class="text-[13px] text-ink-2 num">{{ mb(total()) }} {{ L('з', 'of') }} ~{{ mb(quota) }}</span>
        </div>
        <div class="mb-1 h-2.5 overflow-hidden rounded-full bg-muted" role="meter" [attr.aria-label]="L('Заповненість сховища', 'Storage usage')" [attr.aria-valuenow]="pct()" aria-valuemin="0" aria-valuemax="100">
          <div class="h-full rounded-full transition-[width] duration-300" [style.width.%]="pct()" [style.background]="pct() > 80 ? 'var(--danger)' : 'var(--viz-1)'"></div>
        </div>
        <p class="m-0 mb-4 text-xs text-ink-3">{{ L('Усі дані CRM зберігаються лише в цьому браузері (localStorage, ключі з префіксом', 'All CRM data is stored only in this browser (localStorage, keys prefixed with') }} <span class="mono">{{ prefix }}</span>). {{ L('Фото стискаються перед збереженням.', 'Photos are compressed before saving.') }}</p>
        @if (db.ready()) {
          <div class="overflow-x-auto">
            <table class="tbl">
              <thead><tr><th>{{ L('Сутність', 'Entity') }}</th><th>{{ L('Ключ', 'Key') }}</th><th class="text-right">{{ L('Записів', 'Records') }}</th><th class="text-right">{{ L('Обсяг', 'Size') }}</th><th class="w-32"><span class="sr-only">{{ L('Частка', 'Share') }}</span></th></tr></thead>
              <tbody>
                @for (r of rows(); track r.key) {
                  <tr>
                    <td>{{ r.name }}</td>
                    <td class="text-xs text-ink-3 mono">{{ r.storageKey }}</td>
                    <td class="text-right num">{{ num(r.count) }}</td>
                    <td class="text-right num">{{ kb(r.bytes) }}</td>
                    <td><div class="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div class="h-full rounded-full" style="background: var(--viz-1)" [style.width.%]="(r.bytes / maxBytes()) * 100"></div></div></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="skeleton h-80"></div>
        }
      </section>

      <div class="flex min-w-0 flex-col gap-5">
        <section class="card flex flex-col gap-3 p-5" aria-labelledby="d-io">
          <h2 id="d-io" class="m-0 text-[15px] font-semibold">{{ L('Резервна копія', 'Backup') }}</h2>
          <p class="m-0 text-[13px] text-ink-2">{{ L('Один JSON-файл з усіма сутностями. Імпорт повністю замінює поточні дані.', 'One JSON file with every entity. Importing fully replaces the current data.') }}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn" [disabled]="!db.ready()" (click)="exportJson()"><svg [lucideIcon]="I.download" aria-hidden="true"></svg>{{ L('Експорт JSON', 'Export JSON') }}</button>
            <button type="button" class="btn" [disabled]="!db.ready() || busy()" (click)="file.click()"><svg [lucideIcon]="I.upload" aria-hidden="true"></svg>{{ L('Імпорт JSON', 'Import JSON') }}</button>
            <input #file type="file" accept="application/json,.json" class="sr-only" tabindex="-1" aria-hidden="true" (change)="importJson(file)" />
          </div>
          @if (importError()) {
            <p class="m-0 text-[13px] text-danger" role="alert">{{ importError() }}</p>
          }
        </section>

        <section class="card flex flex-col gap-3 p-5" aria-labelledby="d-reset">
          <h2 id="d-reset" class="m-0 text-[15px] font-semibold">{{ L('Почати заново', 'Start over') }}</h2>
          <button type="button" class="btn justify-start" [disabled]="!db.ready() || busy()" (click)="resetDemo()">
            <svg [lucideIcon]="I.undo" aria-hidden="true"></svg>{{ L('Скинути до демо-даних', 'Reset to demo data') }}
          </button>
          <p class="-mt-1 m-0 text-xs text-ink-3">{{ L('Згенерувати мережу з двох філій, клієнтів і нарядів відносно сьогоднішньої дати.', 'Generate a two-branch network with customers and work orders relative to today.') }}</p>
          <button type="button" class="btn btn-danger justify-start" [disabled]="!db.ready() || busy()" (click)="clean()">
            <svg [lucideIcon]="I.trash" aria-hidden="true"></svg>{{ L('Почати з чистої бази', 'Start with a clean database') }}
          </button>
          <p class="-mt-1 m-0 text-xs text-ink-3">{{ L('Лишаються одна філія, пости, нормо-години, шаблони й правила ТО.', 'Keeps one branch, its bays, standard hours, templates and service rules.') }}</p>
        </section>
      </div>

      <section class="card min-w-0 p-5 xl:col-span-2" aria-labelledby="d-log">
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <h2 id="d-log" class="m-0 flex-1 text-[15px] font-semibold">{{ L('Журнал дій', 'Activity log') }} <span class="text-ink-3 num">{{ log().length }}</span></h2>
          <tk-text-field class="w-full sm:w-64" size="sm" type="search" [icon]="I.search" [placeholder]="L('Пошук у журналі', 'Search the log')" [ariaLabel]="L('Пошук у журналі', 'Search the log')" [clearable]="true" [(value)]="query" />
        </div>
        @if (db.ready() && log().length) {
          <cdk-virtual-scroll-viewport itemSize="44" class="h-80 rounded-lg border border-line" tabindex="0" [attr.aria-label]="L('Записи журналу дій', 'Activity log entries')">
            <div *cdkVirtualFor="let a of log(); trackBy: trackId" class="flex h-11 items-center gap-3 border-b border-line px-3 text-[13px]">
              <span class="badge flex-none">{{ action(a) }}</span>
              <span class="min-w-0 flex-1 truncate-1">{{ a.summary }}</span>
              <span class="flex-none text-xs text-ink-3 num" [title]="dt(a.createdAt)">{{ ago(a.createdAt) }}</span>
            </div>
          </cdk-virtual-scroll-viewport>
        } @else {
          <p class="m-0 text-[13px] text-ink-3">{{ db.ready() ? L('Записів не знайдено', 'No records found') : L('Завантаження…', 'Loading…') }}</p>
        }
      </section>
    </div>
  `,
})
export class DataPage {
  protected readonly L = L;
  protected readonly prefix = STORE_PREFIX;
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly storage = inject(StorageService);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);
  protected readonly quota = QUOTA_BYTES;
  protected readonly busy = signal(false);
  protected readonly importError = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly num = fmtNum;
  protected readonly dt = fmtDateTime;
  protected readonly trackId = (_: number, a: ActivityEntry) => a.id;

  protected readonly rows = computed(() => {
    // перерахунок при будь-якій зміні даних
    for (const k of Object.keys(ENTITY_KEYS) as EntityKey[]) this.db.repo(k).items();
    return (Object.keys(ENTITY_KEYS) as EntityKey[])
      .map((k) => ({ key: k, name: NAMES[k], storageKey: ENTITY_KEYS[k], count: this.db.repo(k).items().length, bytes: this.storage.bytes(ENTITY_KEYS[k]) }))
      .sort((a, b) => b.bytes - a.bytes);
  });
  protected readonly total = computed(() => this.rows().reduce((s, r) => s + r.bytes, 0) + this.storage.bytes(META_KEY));
  protected readonly maxBytes = computed(() => Math.max(1, ...this.rows().map((r) => r.bytes)));
  protected readonly pct = computed(() => Math.min(100, Math.round((this.total() / QUOTA_BYTES) * 100)));
  protected readonly log = computed(() => {
    const q = norm(this.query().trim());
    const all = this.db.activity.items();
    return q ? all.filter((a) => norm(a.summary).includes(q)) : all;
  });

  protected kb(b: number): string {
    return b < 1024 ? `${b} ${L('Б', 'B')}` : `${fmtNum(Math.round(b / 1024))} ${L('КБ', 'KB')}`;
  }
  protected mb(b: number): string {
    return L(`${(b / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`, `${(b / 1024 / 1024).toFixed(1)} MB`);
  }
  protected ago(iso: string): string {
    return fmtAgo(iso);
  }
  protected action(a: ActivityEntry): string {
    return L(
      { create: 'створено', update: 'зміна', delete: 'видалено', status: 'статус', stock: 'склад', message: 'повідомлення', import: 'дані' },
      { create: 'created', update: 'changed', delete: 'deleted', status: 'status', stock: 'stock', message: 'message', import: 'data' },
    )[a.action];
  }

  protected exportJson(): void {
    const data = this.db.exportAll();
    downloadFile(`tork-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1), 'application/json');
    this.toast.success(L('Резервну копію збережено', 'Backup saved'));
  }

  protected async importJson(input: HTMLInputElement): Promise<void> {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.importError.set(null);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(await f.text());
    } catch {
      this.importError.set(L('Файл не є коректним JSON.', 'The file isn’t valid JSON.'));
      return;
    }
    const keys = Object.keys(ENTITY_KEYS) as EntityKey[];
    const bad = keys.filter((k) => data[k] !== undefined && !Array.isArray(data[k]));
    const known = keys.filter((k) => Array.isArray(data[k]));
    if (bad.length || !known.length || !Array.isArray(data['settings']) || !(data['settings'] as unknown[]).length) {
      this.importError.set(L('Це не схоже на експорт «Торка»: немає налаштувань або сутності мають неправильний формат.', 'This doesn’t look like a Tork export: settings are missing or entities have the wrong format.'));
      return;
    }
    const broken = known.find((k) => (data[k] as unknown[]).some((x) => !x || typeof x !== 'object' || typeof (x as { id?: unknown }).id !== 'string'));
    if (broken) {
      this.importError.set(L(`У розділі «${NAMES[broken]}» є записи без id.`, `“${NAMES[broken]}” has records without an id.`));
      return;
    }
    const n = (data['orders'] as unknown[] | undefined)?.length ?? 0;
    const ok = await this.dialogs.confirm({
      title: L('Замінити всі дані з файлу?', 'Replace all data from the file?'),
      text: L(
        `${f.name}: ${n} нарядів, ${(data['clients'] as unknown[] | undefined)?.length ?? 0} клієнтів. Поточні дані буде втрачено — спершу зробіть експорт, якщо вони потрібні.`,
        `${f.name}: ${n} work orders, ${(data['clients'] as unknown[] | undefined)?.length ?? 0} customers. Current data will be lost — export it first if you need it.`,
      ),
      confirm: L('Імпортувати', 'Import'),
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      this.db.importAll(data as never, L(`Імпорт з файлу ${f.name}`, `Import from ${f.name}`));
      this.toast.success(L('Дані імпортовано', 'Data imported'));
    });
  }

  protected async resetDemo(): Promise<void> {
    const ok = await this.dialogs.confirm({ title: L('Скинути до демо-даних?', 'Reset to demo data?'), text: L('Усі ваші зміни буде замінено свіжими демо-даними.', 'All your changes will be replaced with fresh demo data.'), confirm: L('Скинути', 'Reset'), danger: true });
    if (ok) await this.run(async () => (await this.db.seedDemo(), this.toast.success(L('Демо-дані згенеровано', 'Demo data generated'))));
  }

  protected async clean(): Promise<void> {
    const ok = await this.dialogs.confirm({ title: L('Почати з чистої бази?', 'Start with a clean database?'), text: L('Буде видалено клієнтів, авто, наряди, склад і журнали. Цю дію не можна скасувати.', 'Customers, cars, work orders, stock and logs will be deleted. This can’t be undone.'), confirm: L('Очистити', 'Clear'), danger: true });
    if (ok) await this.run(async () => (await this.db.clean(), this.toast.success(L('Базу очищено', 'Database cleared'))));
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
