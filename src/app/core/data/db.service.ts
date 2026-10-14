import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  ActivityEntry,
  AppNotification,
  ENTITY_KEYS,
  EntityKey,
  EntityMap,
  META_KEY,
  SCHEMA_VERSION,
} from './models';
import { StorageError, StorageService } from './storage.service';
import { delay, newId, nowIso } from './util';

type Draft<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
type Patch<T> = Partial<Omit<T, 'id' | 'createdAt'>>;

const PREFIX: Record<EntityKey, string> = {
  branches: 'br',
  posts: 'po',
  employees: 'em',
  clients: 'cl',
  cars: 'car',
  orders: 'or',
  works: 'wk',
  parts: 'pt',
  movements: 'mv',
  suppliers: 'sp',
  purchases: 'pu',
  approvals: 'ap',
  reminders: 'rm',
  rules: 'ru',
  templates: 'tp',
  mailings: 'ml',
  activity: 'ac',
  notifications: 'nt',
  views: 'vw',
  settings: 'settings',
};

/** Сутності, зміни яких не пишемо в журнал дій (службові) */
const SILENT: EntityKey[] = ['activity', 'notifications', 'views'];
const MAX_ACTIVITY = 800;

export interface WriteOptions {
  /** Текст для журналу дій; false — не писати */
  log?: string | false;
  /** Тип дії в журналі */
  action?: ActivityEntry['action'];
}

/**
 * Репозиторій сутності: кеш у сигналі + асинхронний CRUD з затримкою 100–300 мс (імітація API).
 * Кожен запис — у свій ключ localStorage; зміни розсилаються іншим вкладкам.
 */
export class Repository<K extends EntityKey> {
  readonly items = signal<EntityMap[K][]>([]);
  readonly byId = computed(() => new Map(this.items().map((x) => [x.id, x] as const)));
  readonly key: string;

  constructor(
    private readonly db: DbService,
    readonly name: K,
  ) {
    this.key = ENTITY_KEYS[name];
  }

  load(): void {
    const data = this.db.storage.read<EntityMap[K][]>(this.key, []);
    this.items.set(Array.isArray(data) ? data : []);
  }

  get(id: string | null | undefined): EntityMap[K] | undefined {
    return id ? this.byId().get(id) : undefined;
  }

  async list(): Promise<EntityMap[K][]> {
    await delay();
    return this.items();
  }

  async find(id: string): Promise<EntityMap[K] | null> {
    await delay(60, 160);
    return this.byId().get(id) ?? null;
  }

  async create(draft: Draft<EntityMap[K]>, opts: WriteOptions = {}): Promise<EntityMap[K]> {
    await delay();
    const now = nowIso();
    const record = { ...draft, id: draft.id ?? newId(PREFIX[this.name]), createdAt: now, updatedAt: now } as EntityMap[K];
    this.persist([...this.items(), record]);
    this.db.log(this.name, record.id, opts.action ?? 'create', opts.log);
    return record;
  }

  async update(
    id: string,
    patch: Patch<EntityMap[K]> | ((cur: EntityMap[K]) => Patch<EntityMap[K]>),
    opts: WriteOptions = {},
  ): Promise<EntityMap[K]> {
    await delay();
    const cur = this.byId().get(id);
    if (!cur) throw new Error('Запис не знайдено — можливо, його видалили в іншій вкладці');
    const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch), id, updatedAt: nowIso() } as EntityMap[K];
    this.persist(this.items().map((x) => (x.id === id ? next : x)));
    this.db.log(this.name, id, opts.action ?? 'update', opts.log);
    return next;
  }

  async remove(id: string, opts: WriteOptions = {}): Promise<EntityMap[K] | null> {
    await delay();
    const cur = this.byId().get(id) ?? null;
    if (!cur) return null;
    this.persist(this.items().filter((x) => x.id !== id));
    this.db.log(this.name, id, 'delete', opts.log);
    return cur;
  }

  /** Повертає видалений запис (кнопка «Скасувати» в toast) */
  async restore(record: EntityMap[K], opts: WriteOptions = {}): Promise<void> {
    await delay(60, 150);
    if (this.byId().has(record.id)) return;
    this.persist([...this.items(), record]);
    this.db.log(this.name, record.id, 'create', opts.log);
  }

  /** Пакетне видалення (каскад, масові дії); повертає видалені записи для «Скасувати» */
  async removeMany(ids: string[], opts: WriteOptions = {}): Promise<EntityMap[K][]> {
    await delay();
    const set = new Set(ids);
    const removed = this.items().filter((x) => set.has(x.id));
    if (!removed.length) return [];
    this.persist(this.items().filter((x) => !set.has(x.id)));
    if (opts.log) this.db.log(this.name, removed[0].id, 'delete', opts.log);
    return removed;
  }

  async restoreMany(records: EntityMap[K][], opts: WriteOptions = {}): Promise<void> {
    if (!records.length) return;
    const have = this.byId();
    this.persist([...this.items(), ...records.filter((r) => !have.has(r.id))]);
    if (opts.log) this.db.log(this.name, records[0].id, 'create', opts.log);
  }

  /** Пакетне оновлення одним записом у сховище */
  async updateMany(ids: string[], patch: (cur: EntityMap[K]) => Patch<EntityMap[K]>, opts: WriteOptions = {}): Promise<void> {
    await delay();
    const set = new Set(ids);
    const now = nowIso();
    this.persist(this.items().map((x) => (set.has(x.id) ? ({ ...x, ...patch(x), id: x.id, updatedAt: now } as EntityMap[K]) : x)));
    if (opts.log) this.db.log(this.name, ids[0] ?? '', opts.action ?? 'update', opts.log);
  }

  /** Масова заміна (імпорт, скидання) — без затримки й журналу */
  replaceAll(items: EntityMap[K][]): void {
    this.persist(items);
  }

  private persist(next: EntityMap[K][]): void {
    try {
      this.db.storage.write(this.key, next);
    } catch (e) {
      // сховище недоступне — працюємо в пам’яті вкладки; переповнене — повертаємо помилку в інтерфейс
      if (!(e instanceof StorageError) || e.reason === 'quota') throw e;
    }
    this.items.set(next);
    this.db.broadcast(this.name);
  }
}

@Injectable({ providedIn: 'root' })
export class DbService {
  readonly storage = inject(StorageService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private channel: BroadcastChannel | null = null;

  /** false до завантаження з localStorage: на сервері й під час гідратації — скелетони */
  readonly ready = signal(false);
  readonly loadError = signal<string | null>(null);
  /** Ключ, змінений в іншій вкладці (для підсвітки змін) */
  readonly externalChange = signal<{ name: EntityKey; at: number } | null>(null);

  readonly branches = new Repository(this, 'branches');
  readonly posts = new Repository(this, 'posts');
  readonly employees = new Repository(this, 'employees');
  readonly clients = new Repository(this, 'clients');
  readonly cars = new Repository(this, 'cars');
  readonly orders = new Repository(this, 'orders');
  readonly works = new Repository(this, 'works');
  readonly parts = new Repository(this, 'parts');
  readonly movements = new Repository(this, 'movements');
  readonly suppliers = new Repository(this, 'suppliers');
  readonly purchases = new Repository(this, 'purchases');
  readonly approvals = new Repository(this, 'approvals');
  readonly reminders = new Repository(this, 'reminders');
  readonly rules = new Repository(this, 'rules');
  readonly templates = new Repository(this, 'templates');
  readonly mailings = new Repository(this, 'mailings');
  readonly activity = new Repository(this, 'activity');
  readonly notifications = new Repository(this, 'notifications');
  readonly views = new Repository(this, 'views');
  readonly settingsRepo = new Repository(this, 'settings');

  readonly settings = computed<EntityMap["settings"] | undefined>(() => this.settingsRepo.items()[0]);

  private readonly repos = Object.fromEntries(
    (Object.keys(ENTITY_KEYS) as EntityKey[]).map((k) => [k, this.repo(k)]),
  ) as { [K in EntityKey]: Repository<K> };

  repo<K extends EntityKey>(name: K): Repository<K> {
    const map: { [N in EntityKey]: Repository<N> } = {
      branches: this.branches,
      posts: this.posts,
      employees: this.employees,
      clients: this.clients,
      cars: this.cars,
      orders: this.orders,
      works: this.works,
      parts: this.parts,
      movements: this.movements,
      suppliers: this.suppliers,
      purchases: this.purchases,
      approvals: this.approvals,
      reminders: this.reminders,
      rules: this.rules,
      templates: this.templates,
      mailings: this.mailings,
      activity: this.activity,
      notifications: this.notifications,
      views: this.views,
      settings: this.settingsRepo,
    };
    return map[name] as Repository<K>;
  }

  /** Запуск у браузері після гідратації: перший візит — демо-дані, далі — читання сховища */
  async init(): Promise<void> {
    if (!this.browser || this.ready()) return;
    try {
      const meta = this.storage.read<{ version?: number } | null>(META_KEY, null);
      if (!meta || meta.version !== SCHEMA_VERSION) await this.seedDemo();
      else this.loadAll();
      this.listen();
      await delay(80, 160);
      this.ready.set(true);
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : 'Не вдалося прочитати дані');
    }
  }

  loadAll(): void {
    for (const r of Object.values(this.repos)) r.load();
  }

  async seedDemo(): Promise<void> {
    const { buildDemo } = await import('./seed');
    this.importAll(buildDemo(new Date()), 'Демо-дані згенеровано');
  }

  /** Чиста база: лише налаштування, одна філія й базові довідники */
  async clean(): Promise<void> {
    const { buildEmpty } = await import('./seed');
    this.importAll(buildEmpty(new Date()), 'Почато з чистої бази');
  }

  /** Записує всі сутності разом (імпорт, скидання) */
  importAll(data: Partial<{ [K in EntityKey]: EntityMap[K][] }>, summary: string): void {
    for (const name of Object.keys(ENTITY_KEYS) as EntityKey[]) {
      this.repo(name).replaceAll((data[name] ?? []) as never);
    }
    try {
      this.storage.write(META_KEY, { version: SCHEMA_VERSION, seededAt: nowIso() });
    } catch (e) {
      // без доступу до сховища працюємо в памʼяті вкладки (банер уже показано)
      if (!(e instanceof StorageError) || e.reason === 'quota') throw e;
    }
    this.log('settings', 'settings', 'import', summary);
  }

  exportAll(): { [K in EntityKey]: EntityMap[K][] } & { meta: unknown } {
    const out = { meta: { version: SCHEMA_VERSION, exportedAt: nowIso(), app: 'Торк' } } as Record<string, unknown>;
    for (const name of Object.keys(ENTITY_KEYS) as EntityKey[]) out[name] = this.repo(name).items();
    return out as { [K in EntityKey]: EntityMap[K][] } & { meta: unknown };
  }

  /** Запис у журнал дій (кільцевий буфер останніх 800 подій) */
  log(entity: EntityKey, entityId: string, action: ActivityEntry['action'], summary?: string | false): void {
    if (summary === false || SILENT.includes(entity)) return;
    const now = nowIso();
    const entry: ActivityEntry = {
      id: newId('ac'),
      createdAt: now,
      updatedAt: now,
      entity,
      entityId,
      action,
      summary: summary ?? DEFAULT_SUMMARY[action],
    };
    const next = [entry, ...this.activity.items()].slice(0, MAX_ACTIVITY);
    try {
      this.storage.write(ENTITY_KEYS.activity, next);
    } catch {
      /* журнал не критичний — не заважаємо основній дії */
    }
    this.activity.items.set(next);
    this.broadcast('activity');
  }

  async notify(n: Pick<AppNotification, 'kind' | 'title' | 'text' | 'link'>): Promise<void> {
    await this.notifications.create({ ...n, read: false }, { log: false });
  }

  broadcast(name: EntityKey): void {
    try {
      this.channel?.postMessage({ name });
    } catch {
      /* інші вкладки отримають подію storage */
    }
  }

  private listen(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('tork');
      this.channel.onmessage = (e: MessageEvent<{ name: EntityKey }>) => this.reloadFromOutside(e.data.name);
    }
    // запасний шлях — подія storage (спрацьовує лише в інших вкладках)
    window.addEventListener('storage', (e) => {
      const name = (Object.keys(ENTITY_KEYS) as EntityKey[]).find((k) => ENTITY_KEYS[k] === e.key);
      if (name) this.reloadFromOutside(name);
      if (e.key === META_KEY) this.loadAll();
    });
  }

  private reloadFromOutside(name: EntityKey): void {
    if (!(name in ENTITY_KEYS)) return;
    this.repo(name).load();
    this.externalChange.set({ name, at: Date.now() });
  }
}

const DEFAULT_SUMMARY: Record<ActivityEntry['action'], string> = {
  create: 'Створено запис',
  update: 'Змінено запис',
  delete: 'Видалено запис',
  status: 'Змінено статус',
  stock: 'Рух складу',
  message: 'Надіслано повідомлення',
  import: 'Імпорт даних',
};
