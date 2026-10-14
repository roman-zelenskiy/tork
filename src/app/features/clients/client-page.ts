import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { DbService } from '../../core/data/db.service';
import { StatsService } from '../../core/domain/stats.service';
import { ClientsService } from '../../core/domain/clients.service';
import { QuickActions } from '../../core/ui/quick-actions.service';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { TorkTitleStrategy } from '../../core/ui/title.strategy';
import { HasUnsaved } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { EmptyState } from '../../shared/ui/states';
import { Avatar, Plate, Skeleton } from '../../shared/ui/display';
import { StatusBadge } from '../../shared/ui/status';
import { MakeLogo } from '../../shared/ui/make-logo';
import { TextField } from '../../shared/ui/text-field';
import { Tooltip } from '../../shared/ui/tooltip';
import { fmtAgo, fmtDate, fmtKm, fmtMoney, fmtPhone, plural } from '../../shared/format';
import { ClientForm } from './client-form';
import { CarForm } from './car-form';

@Component({
  selector: 'tk-client-page',
  imports: [RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger, Icon, EmptyState, Avatar, Plate, Skeleton, StatusBadge, MakeLogo, TextField, Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/kliyenty" class="mb-3 inline-flex items-center gap-1 rounded-md text-[13px] text-ink-2 hover:text-ink">
      <svg [lucideIcon]="I.arrowLeft" [size]="14" aria-hidden="true"></svg>Клієнти
    </a>

    @if (!db.ready()) {
      <div class="mb-6 flex items-center gap-4" aria-hidden="true">
        <div class="skeleton size-12 rounded-full!"></div>
        <div class="flex-1"><div class="skeleton mb-2 h-5 w-64"></div><div class="skeleton h-3 w-40"></div></div>
      </div>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="card h-[84px] p-4"><div class="skeleton mb-3 h-3 w-20"></div><div class="skeleton h-5 w-28"></div></div>
        }
      </div>
      <div class="card mt-6 p-4"><tk-skeleton [rows]="5" /></div>
    } @else if (!client()) {
      <tk-empty art="clients" title="Клієнта не знайдено" text="Можливо, його видалили в іншій вкладці.">
        <a routerLink="/kliyenty" class="btn">До списку клієнтів</a>
      </tk-empty>
    } @else {
      @let c = client()!;
      <header class="mb-6 flex flex-wrap items-start gap-4">
        <tk-avatar [name]="c.name" [size]="52" />
        <div class="min-w-0 flex-1 basis-64">
          <h1 class="m-0 flex flex-wrap items-center gap-2 text-[22px] leading-tight font-semibold">
            <span class="break-words">{{ c.name }}</span>
            @if (c.kind === 'company') {
              <span class="badge badge-info">компанія</span>
            }
          </h1>
          <div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
            <a [href]="'tel:' + c.phone" class="inline-flex items-center gap-1.5 hover:text-ink">
              <svg [lucideIcon]="I.phone" [size]="14" aria-hidden="true"></svg><span class="num">{{ phone(c.phone) }}</span>
            </a>
            @if (c.email) {
              <a [href]="'mailto:' + c.email" class="inline-flex items-center gap-1.5 hover:text-ink">
                <svg [lucideIcon]="I.message" [size]="14" aria-hidden="true"></svg>{{ c.email }}
              </a>
            }
            <span class="inline-flex items-center gap-1.5">
              <svg [lucideIcon]="c.allowMessages ? I.check : I.ban" [size]="14" aria-hidden="true"></svg>
              {{ c.allowMessages ? 'Погоджується на SMS/Viber' : 'Без розсилок' }}
            </span>
            <span>Клієнт з {{ date(c.createdAt) }}</span>
          </div>
          @if (c.tags.length) {
            <div class="mt-2 flex flex-wrap gap-1.5">
              @for (t of c.tags; track t) {
                <span class="chip"><svg [lucideIcon]="I.tag" [size]="12" aria-hidden="true"></svg>{{ t }}</span>
              }
            </div>
          }
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-primary" (click)="quick.newOrder({ clientId: c.id })">
            <svg [lucideIcon]="I.plus" aria-hidden="true"></svg>Новий наряд
          </button>
          <button type="button" class="btn" (click)="edit()"><svg [lucideIcon]="I.edit" aria-hidden="true"></svg>Редагувати</button>
          <button type="button" class="btn btn-icon" [cdkMenuTriggerFor]="more" aria-label="Інші дії"><svg [lucideIcon]="I.more" aria-hidden="true"></svg></button>
          <ng-template #more>
            <div class="menu" cdkMenu>
              <button type="button" class="menu-item" cdkMenuItem (cdkMenuItemTriggered)="addCar()"><svg [lucideIcon]="I.car" aria-hidden="true"></svg>Додати авто</button>
              <div class="menu-sep"></div>
              <button type="button" class="menu-item danger" cdkMenuItem (cdkMenuItemTriggered)="remove()"><svg [lucideIcon]="I.trash" aria-hidden="true"></svg>Видалити клієнта</button>
            </div>
          </ng-template>
        </div>
      </header>

      <section class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Показники клієнта">
        <div class="card p-4">
          <div class="text-xs text-ink-2">Візити</div>
          <div class="mt-1 text-xl font-semibold num">{{ stats().visits }}</div>
          <div class="text-xs text-ink-3">{{ stats().lastVisit ? 'останній ' + ago(stats().lastVisit!) : 'ще не було' }}</div>
        </div>
        <div class="card p-4">
          <div class="text-xs text-ink-2">Сума за весь час</div>
          <div class="mt-1 text-xl font-semibold num">{{ money(stats().revenue) }}</div>
          <div class="text-xs text-ink-3">виданих нарядів</div>
        </div>
        <div class="card p-4">
          <div class="text-xs text-ink-2">Середній чек</div>
          <div class="mt-1 text-xl font-semibold num">{{ stats().visits ? money(stats().revenue / stats().visits) : '—' }}</div>
          <div class="text-xs text-ink-3">{{ stats().openOrders ? stats().openOrders + ' у роботі' : 'немає відкритих' }}</div>
        </div>
        <div class="card p-4" [style.border-color]="stats().debt > 0 ? 'var(--danger)' : null">
          <div class="text-xs text-ink-2">Борг</div>
          <div class="mt-1 text-xl font-semibold num" [class.text-danger]="stats().debt > 0">{{ stats().debt ? money(stats().debt) : 'Немає' }}</div>
          <div class="text-xs text-ink-3">{{ debtOrders().length ? debtOrders().length + ' ' + plural(debtOrders().length, ['наряд', 'наряди', 'нарядів']) : 'усе сплачено' }}</div>
        </div>
      </section>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div class="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="cars-h">
            <div class="mb-3 flex items-center gap-2">
              <h2 id="cars-h" class="m-0 flex-1 text-[15px] font-semibold">Авто <span class="text-ink-3 num">{{ cars().length }}</span></h2>
              <button type="button" class="btn btn-sm" (click)="addCar()"><svg [lucideIcon]="I.plus" aria-hidden="true"></svg>Додати авто</button>
            </div>
            @if (cars().length) {
              <div class="grid gap-3 sm:grid-cols-2">
                @for (car of cars(); track car.id) {
                  <a [routerLink]="['/avto', car.id]" class="card group flex items-start gap-3 p-4 transition-colors duration-150 hover:border-line-strong">
                    <tk-make-logo [make]="car.make" [size]="40" />
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="truncate-1 font-semibold group-hover:text-accent-ink">{{ car.make }} {{ car.model }}</span>
                        <span class="text-[13px] text-ink-3 num">{{ car.year }}</span>
                      </div>
                      <div class="mt-1.5 flex flex-wrap items-center gap-2">
                        <tk-plate [value]="car.plate" />
                        <span class="text-xs text-ink-2 num">{{ km(car.mileage) }}</span>
                      </div>
                      <div class="mt-1.5 truncate-1 text-xs text-ink-3 mono" [tkTip]="'VIN ' + car.vin">{{ car.vin }}</div>
                    </div>
                    <svg [lucideIcon]="I.chevronRight" class="mt-1 text-ink-3" aria-hidden="true"></svg>
                  </a>
                }
              </div>
            } @else {
              <div class="card"><tk-empty art="car" title="Авто ще не додано" text="Додайте авто за VIN — марка, модель і рік підставляться самі." [compact]="true">
                <button type="button" class="btn btn-sm btn-primary" (click)="addCar()">Додати авто</button>
              </tk-empty></div>
            }
          </section>

          <section aria-labelledby="visits-h">
            <h2 id="visits-h" class="m-0 mb-3 text-[15px] font-semibold">Візити <span class="text-ink-3 num">{{ orders().length }}</span></h2>
            <div class="card overflow-hidden">
              @if (orders().length) {
                <div class="overflow-x-auto">
                  <table class="tbl">
                    <thead><tr><th>Наряд</th><th>Дата</th><th>Авто</th><th>Статус</th><th class="text-right">Сума</th><th class="text-right">Борг</th></tr></thead>
                    <tbody>
                      @for (o of orders().slice(0, visitLimit()); track o.id) {
                        <tr>
                          <td><a [routerLink]="['/naryady', o.id]" class="row-link mono">{{ o.number }}</a></td>
                          <td class="whitespace-nowrap num">{{ date(o.start ?? o.createdAt) }}</td>
                          <td>@if (db.cars.get(o.carId); as car) {<tk-plate [value]="car.plate" />}</td>
                          <td><tk-status [status]="o.status" /></td>
                          <td class="text-right num">{{ money(totals(o.id).total) }}</td>
                          <td class="text-right num" [class.text-danger]="totals(o.id).debt > 0 && o.status === 'vydano'">{{ o.status === 'vydano' && totals(o.id).debt ? money(totals(o.id).debt) : '—' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (orders().length > visitLimit()) {
                  <button type="button" class="btn btn-ghost btn-sm m-2" (click)="visitLimit.set(visitLimit() + 20)">Показати ще {{ orders().length - visitLimit() }}</button>
                }
              } @else {
                <tk-empty art="orders" title="Візитів ще не було" text="Створіть перший наряд для цього клієнта." [compact]="true" />
              }
            </div>
          </section>
        </div>

        <aside class="flex min-w-0 flex-col gap-6">
          <section class="card p-4" aria-labelledby="notes-h">
            <h2 id="notes-h" class="m-0 mb-2 text-[15px] font-semibold">Нотатки</h2>
            <tk-text-field [multiline]="true" [rows]="4" [maxLength]="500" ariaLabel="Нотатки про клієнта" placeholder="Побажання, домовленості…" [value]="notes()" (valueChange)="notes.set($event)" />
            @if (notesDirty()) {
              <div class="animate-fade mt-2 flex justify-end gap-2">
                <button type="button" class="btn btn-sm" (click)="notes.set(c.notes)">Скасувати</button>
                <button type="button" class="btn btn-sm btn-primary" [disabled]="savingNotes()" (click)="saveNotes()">Зберегти</button>
              </div>
            }
          </section>

          <section class="card p-4" aria-labelledby="def-h">
            <h2 id="def-h" class="m-0 mb-1 text-[15px] font-semibold">Відкладені роботи</h2>
            <p class="m-0 mb-3 text-xs text-ink-3">Рекомендації, від яких клієнт відмовився при погодженні</p>
            @for (r of deferred(); track r.id) {
              <div class="flex items-start gap-2 border-t border-line py-2 text-[13px] first-of-type:border-0">
                <svg [lucideIcon]="I.clock" class="mt-0.5 flex-none text-ink-3" aria-hidden="true"></svg>
                <div class="min-w-0 flex-1">
                  <div>{{ r.title }}</div>
                  <div class="text-xs text-ink-3">{{ r.dueDate ? 'нагадати ' + date(r.dueDate) : '' }}</div>
                </div>
                <span class="num text-ink-2">{{ money(r.amount) }}</span>
              </div>
            } @empty {
              <p class="m-0 text-[13px] text-ink-3">Немає — клієнт погоджував усе.</p>
            }
          </section>

          <section class="card p-4" aria-labelledby="act-h">
            <h2 id="act-h" class="m-0 mb-3 text-[15px] font-semibold">Історія змін</h2>
            <ol class="m-0 flex list-none flex-col gap-2.5 p-0">
              @for (a of activity(); track a.id) {
                <li class="flex gap-2 text-[13px]">
                  <span class="mt-1.5 size-1.5 flex-none rounded-full bg-line-strong" aria-hidden="true"></span>
                  <span class="min-w-0 flex-1">{{ a.summary }}<span class="block text-xs text-ink-3">{{ ago(a.createdAt) }}</span></span>
                </li>
              } @empty {
                <li class="text-[13px] text-ink-3">Змін ще не було</li>
              }
            </ol>
          </section>
        </aside>
      </div>
    }
  `,
})
export class ClientPage implements HasUnsaved {
  protected readonly I = I;
  protected readonly db = inject(DbService);
  protected readonly quick = inject(QuickActions);
  private readonly statsSvc = inject(StatsService);
  private readonly clientsSvc = inject(ClientsService);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly titles = inject(TorkTitleStrategy);

  readonly id = input.required<string>();
  protected readonly phone = fmtPhone;
  protected readonly money = fmtMoney;
  protected readonly date = fmtDate;
  protected readonly km = fmtKm;
  protected readonly plural = plural;
  protected readonly visitLimit = signal(20);
  protected readonly notes = signal('');
  protected readonly savingNotes = signal(false);

  protected readonly client = computed(() => this.db.clients.get(this.id()));
  protected readonly stats = computed(
    () => this.statsSvc.clientStats().get(this.id()) ?? { visits: 0, revenue: 0, debt: 0, lastVisit: null, openOrders: 0, cars: 0 },
  );
  protected readonly cars = computed(() => this.statsSvc.carsByClient().get(this.id()) ?? []);
  protected readonly orders = computed(() =>
    [...(this.statsSvc.ordersByClient().get(this.id()) ?? [])].sort((a, b) => (b.start ?? b.createdAt).localeCompare(a.start ?? a.createdAt)),
  );
  protected readonly debtOrders = computed(() => this.orders().filter((o) => o.status === 'vydano' && this.totals(o.id).debt > 0));
  protected readonly deferred = computed(() =>
    this.db.reminders.items().filter((r) => r.clientId === this.id() && r.source === 'deferred' && r.status === 'pending'),
  );
  protected readonly activity = computed(() => {
    const ids = new Set([this.id(), ...this.cars().map((c) => c.id), ...this.orders().map((o) => o.id)]);
    return this.db.activity.items().filter((a) => ids.has(a.entityId)).slice(0, 8);
  });
  protected readonly notesDirty = computed(() => this.notes() !== (this.client()?.notes ?? ''));

  constructor() {
    // нотатки підтягуються з запису (і після зміни в іншій вкладці, якщо тут не редагують)
    let lastId = '';
    effect(() => {
      const c = this.client();
      if (!c) return;
      if (c.id !== lastId || !this.notesDirty()) this.notes.set(c.notes);
      lastId = c.id;
      this.titles.set(c.name);
    });
  }

  hasUnsaved(): boolean {
    return this.notesDirty();
  }

  protected totals(id: string) {
    return this.statsSvc.totals().get(id)!;
  }
  protected ago(iso: string): string {
    return fmtAgo(iso);
  }

  protected edit(): void {
    this.dialogs.open(ClientForm, { id: this.id() }, { drawer: true, label: 'Редагувати клієнта' });
  }

  protected addCar(): void {
    this.dialogs.open(CarForm, { clientId: this.id() }, { drawer: true, label: 'Нове авто' });
  }

  protected async saveNotes(): Promise<void> {
    if (this.savingNotes()) return;
    this.savingNotes.set(true);
    try {
      await this.db.clients.update(this.id(), { notes: this.notes().trim() }, { log: 'Оновлено нотатки клієнта' });
      this.toast.success('Нотатки збережено');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.savingNotes.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const c = this.client();
    if (!c) return;
    const ok = await this.dialogs.confirm({
      title: `Видалити клієнта ${c.name}?`,
      text: this.clientsSvc.cascadeText(this.clientsSvc.cascadeInfo([c.id])),
      confirm: 'Видалити',
      danger: true,
    });
    if (!ok) return;
    const restore = await this.clientsSvc.deleteClients([c.id]);
    this.notes.set(c.notes);
    await this.router.navigate(['/kliyenty']);
    this.toast.undo(`Клієнта ${c.name} видалено`, restore);
  }
}
