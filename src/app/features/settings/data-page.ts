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

const NAMES: Record<EntityKey, string> = {
  branches: 'Філії',
  posts: 'Пости',
  employees: 'Співробітники',
  clients: 'Клієнти',
  cars: 'Авто',
  orders: 'Наряди',
  works: 'Нормо-години',
  parts: 'Запчастини',
  movements: 'Рух складу',
  suppliers: 'Постачальники',
  purchases: 'Закупівлі',
  approvals: 'Погодження',
  reminders: 'Нагадування',
  rules: 'Правила ТО',
  templates: 'Шаблони',
  mailings: 'Розсилки',
  activity: 'Журнал дій',
  notifications: 'Сповіщення',
  views: 'Збережені вигляди',
  settings: 'Налаштування',
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
          <h2 id="d-size" class="m-0 flex-1 text-[15px] font-semibold">Сховище браузера</h2>
          <span class="text-[13px] text-ink-2 num">{{ mb(total()) }} з ~{{ mb(quota) }}</span>
        </div>
        <div class="mb-1 h-2.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Заповненість сховища" [attr.aria-valuenow]="pct()" aria-valuemin="0" aria-valuemax="100">
          <div class="h-full rounded-full transition-[width] duration-300" [style.width.%]="pct()" [style.background]="pct() > 80 ? 'var(--danger)' : 'var(--viz-1)'"></div>
        </div>
        <p class="m-0 mb-4 text-xs text-ink-3">Усі дані CRM зберігаються лише в цьому браузері (localStorage, ключі з префіксом <span class="mono">tork:</span>). Фото стискаються перед збереженням.</p>
        @if (db.ready()) {
          <div class="overflow-x-auto">
            <table class="tbl">
              <thead><tr><th>Сутність</th><th>Ключ</th><th class="text-right">Записів</th><th class="text-right">Обсяг</th><th class="w-32"><span class="sr-only">Частка</span></th></tr></thead>
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
          <h2 id="d-io" class="m-0 text-[15px] font-semibold">Резервна копія</h2>
          <p class="m-0 text-[13px] text-ink-2">Один JSON-файл з усіма сутностями. Імпорт повністю замінює поточні дані.</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn" [disabled]="!db.ready()" (click)="exportJson()"><svg [lucideIcon]="I.download" aria-hidden="true"></svg>Експорт JSON</button>
            <button type="button" class="btn" [disabled]="!db.ready() || busy()" (click)="file.click()"><svg [lucideIcon]="I.upload" aria-hidden="true"></svg>Імпорт JSON</button>
            <input #file type="file" accept="application/json,.json" class="sr-only" tabindex="-1" aria-hidden="true" (change)="importJson(file)" />
          </div>
          @if (importError()) {
            <p class="m-0 text-[13px] text-danger" role="alert">{{ importError() }}</p>
          }
        </section>

        <section class="card flex flex-col gap-3 p-5" aria-labelledby="d-reset">
          <h2 id="d-reset" class="m-0 text-[15px] font-semibold">Почати заново</h2>
          <button type="button" class="btn justify-start" [disabled]="!db.ready() || busy()" (click)="resetDemo()">
            <svg [lucideIcon]="I.undo" aria-hidden="true"></svg>Скинути до демо-даних
          </button>
          <p class="-mt-1 m-0 text-xs text-ink-3">Згенерувати мережу з двох філій, клієнтів і нарядів відносно сьогоднішньої дати.</p>
          <button type="button" class="btn btn-danger justify-start" [disabled]="!db.ready() || busy()" (click)="clean()">
            <svg [lucideIcon]="I.trash" aria-hidden="true"></svg>Почати з чистої бази
          </button>
          <p class="-mt-1 m-0 text-xs text-ink-3">Лишаються одна філія, пости, нормо-години, шаблони й правила ТО.</p>
        </section>
      </div>

      <section class="card min-w-0 p-5 xl:col-span-2" aria-labelledby="d-log">
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <h2 id="d-log" class="m-0 flex-1 text-[15px] font-semibold">Журнал дій <span class="text-ink-3 num">{{ log().length }}</span></h2>
          <tk-text-field class="w-full sm:w-64" size="sm" type="search" [icon]="I.search" placeholder="Пошук у журналі" ariaLabel="Пошук у журналі" [clearable]="true" [(value)]="query" />
        </div>
        @if (db.ready() && log().length) {
          <cdk-virtual-scroll-viewport itemSize="44" class="h-80 rounded-lg border border-line" tabindex="0" aria-label="Записи журналу дій">
            <div *cdkVirtualFor="let a of log(); trackBy: trackId" class="flex h-11 items-center gap-3 border-b border-line px-3 text-[13px]">
              <span class="badge flex-none">{{ action(a) }}</span>
              <span class="min-w-0 flex-1 truncate-1">{{ a.summary }}</span>
              <span class="flex-none text-xs text-ink-3 num" [title]="dt(a.createdAt)">{{ ago(a.createdAt) }}</span>
            </div>
          </cdk-virtual-scroll-viewport>
        } @else {
          <p class="m-0 text-[13px] text-ink-3">{{ db.ready() ? 'Записів не знайдено' : 'Завантаження…' }}</p>
        }
      </section>
    </div>
  `,
})
export class DataPage {
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
    return b < 1024 ? `${b} Б` : `${fmtNum(Math.round(b / 1024))} КБ`;
  }
  protected mb(b: number): string {
    return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
  }
  protected ago(iso: string): string {
    return fmtAgo(iso);
  }
  protected action(a: ActivityEntry): string {
    return { create: 'створено', update: 'зміна', delete: 'видалено', status: 'статус', stock: 'склад', message: 'повідомлення', import: 'дані' }[a.action];
  }

  protected exportJson(): void {
    const data = this.db.exportAll();
    downloadFile(`tork-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1), 'application/json');
    this.toast.success('Резервну копію збережено');
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
      this.importError.set('Файл не є коректним JSON.');
      return;
    }
    const keys = Object.keys(ENTITY_KEYS) as EntityKey[];
    const bad = keys.filter((k) => data[k] !== undefined && !Array.isArray(data[k]));
    const known = keys.filter((k) => Array.isArray(data[k]));
    if (bad.length || !known.length || !Array.isArray(data['settings']) || !(data['settings'] as unknown[]).length) {
      this.importError.set('Це не схоже на експорт «Торка»: немає налаштувань або сутності мають неправильний формат.');
      return;
    }
    const broken = known.find((k) => (data[k] as unknown[]).some((x) => !x || typeof x !== 'object' || typeof (x as { id?: unknown }).id !== 'string'));
    if (broken) {
      this.importError.set(`У розділі «${NAMES[broken]}» є записи без id.`);
      return;
    }
    const n = (data['orders'] as unknown[] | undefined)?.length ?? 0;
    const ok = await this.dialogs.confirm({
      title: 'Замінити всі дані з файлу?',
      text: `${f.name}: ${n} нарядів, ${(data['clients'] as unknown[] | undefined)?.length ?? 0} клієнтів. Поточні дані буде втрачено — спершу зробіть експорт, якщо вони потрібні.`,
      confirm: 'Імпортувати',
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      this.db.importAll(data as never, `Імпорт з файлу ${f.name}`);
      this.toast.success('Дані імпортовано');
    });
  }

  protected async resetDemo(): Promise<void> {
    const ok = await this.dialogs.confirm({ title: 'Скинути до демо-даних?', text: 'Усі ваші зміни буде замінено свіжими демо-даними.', confirm: 'Скинути', danger: true });
    if (ok) await this.run(async () => (await this.db.seedDemo(), this.toast.success('Демо-дані згенеровано')));
  }

  protected async clean(): Promise<void> {
    const ok = await this.dialogs.confirm({ title: 'Почати з чистої бази?', text: 'Буде видалено клієнтів, авто, наряди, склад і журнали. Цю дію не можна скасувати.', confirm: 'Очистити', danger: true });
    if (ok) await this.run(async () => (await this.db.clean(), this.toast.success('Базу очищено')));
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
