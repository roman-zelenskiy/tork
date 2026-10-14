import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import type { EChartsCoreOption } from 'echarts/core';
import { DbService } from '../../core/data/db.service';
import { Car } from '../../core/data/models';
import { decodeVin } from '../../core/data/vin';
import { formatPlate } from '../../core/data/plates';
import { StatsService } from '../../core/domain/stats.service';
import { ClientsService } from '../../core/domain/clients.service';
import { ZONE_LABEL, DAMAGE_LABEL } from '../../core/domain/body';
import { QuickActions } from '../../core/ui/quick-actions.service';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { TorkTitleStrategy } from '../../core/ui/title.strategy';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { EmptyState } from '../../shared/ui/states';
import { Plate, Skeleton } from '../../shared/ui/display';
import { StatusBadge } from '../../shared/ui/status';
import { MakeLogo } from '../../shared/ui/make-logo';
import { Combobox } from '../../shared/ui/combobox';
import { Option } from '../../shared/ui/option';
import { Tooltip } from '../../shared/ui/tooltip';
import { Chart, ChartPalette, baseOption } from '../../shared/chart/chart';
import { PhotoViewer } from '../../shared/ui/photo-viewer';
import { fmtDate, fmtDateShort, fmtKm, fmtMoney, fmtNum, fmtPhone } from '../../shared/format';
import { CarForm } from './car-form';

/** Передача авто іншому клієнту */
@Component({
  selector: 'tk-transfer-dialog',
  imports: [Combobox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dlg-head"><div><h2>Змінити власника</h2><p>Попередній власник лишиться в історії авто.</p></div></div>
    <div class="dlg-body">
      <label class="label mb-1.5 block" for="tr-client">Новий власник</label>
      <tk-combobox inputId="tr-client" [options]="options()" [(value)]="clientId" [icon]="I.user" placeholder="Ім’я або телефон" [invalid]="tried() && !clientId()" />
      @if (tried() && !clientId()) {
        <span class="error-text mt-1.5">Оберіть клієнта</span>
      }
    </div>
    <div class="dlg-foot">
      <button type="button" class="btn" (click)="ref.close()">Скасувати</button>
      <button type="button" class="btn btn-primary" (click)="ok()">Передати авто</button>
    </div>
  `,
})
export class TransferDialog {
  protected readonly I = I;
  private readonly db = inject(DbService);
  protected readonly ref = inject<DialogRef<string>>(DialogRef);
  private readonly car = inject<Car>(DIALOG_DATA);
  protected readonly clientId = signal<string | null>(null);
  protected readonly tried = signal(false);
  protected readonly options = computed<Option<string>[]>(() =>
    this.db.clients
      .items()
      .filter((c) => c.id !== this.car.clientId)
      .map((c) => ({ value: c.id, label: c.name, hint: fmtPhone(c.phone), keywords: c.phone })),
  );
  protected ok(): void {
    this.tried.set(true);
    if (this.clientId()) this.ref.close(this.clientId()!);
  }
}

@Component({
  selector: 'tk-car-page',
  imports: [RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger, Icon, EmptyState, Plate, Skeleton, StatusBadge, MakeLogo, Tooltip, Chart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!db.ready()) {
      <div class="skeleton mb-4 h-4 w-32"></div>
      <div class="mb-6 flex items-center gap-4" aria-hidden="true">
        <div class="skeleton size-12"></div>
        <div class="flex-1"><div class="skeleton mb-2 h-5 w-72"></div><div class="skeleton h-3 w-48"></div></div>
      </div>
      <div class="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div class="card p-4"><tk-skeleton [rows]="6" /></div>
        <div class="card p-4"><tk-skeleton [rows]="6" [cols]="2" /></div>
      </div>
    } @else if (!car()) {
      <tk-empty art="car" title="Авто не знайдено" text="Можливо, його видалили в іншій вкладці.">
        <a routerLink="/kliyenty" class="btn">До клієнтів</a>
      </tk-empty>
    } @else {
      @let c = car()!;
      @if (owner(); as o) {
        <a [routerLink]="['/kliyenty', o.id]" class="mb-3 inline-flex items-center gap-1 rounded-md text-[13px] text-ink-2 hover:text-ink">
          <svg [lucideIcon]="I.arrowLeft" [size]="14" aria-hidden="true"></svg>{{ o.name }}
        </a>
      }
      <header class="mb-6 flex flex-wrap items-start gap-4">
        <tk-make-logo [make]="c.make" [size]="52" />
        <div class="min-w-0 flex-1 basis-64">
          <h1 class="m-0 text-[22px] leading-tight font-semibold">{{ c.make }} {{ c.model }} <span class="font-normal text-ink-3 num">{{ c.year }}</span></h1>
          <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-2">
            <tk-plate [value]="c.plate" />
            <span class="inline-flex items-center gap-1 mono">
              {{ c.vin }}
              <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Скопіювати VIN" tkTip="Скопіювати VIN" (click)="copyVin(c.vin)">
                <svg [lucideIcon]="I.copy" [size]="14" aria-hidden="true"></svg>
              </button>
            </span>
            <span class="inline-flex items-center gap-1.5"><svg [lucideIcon]="I.gauge" [size]="14" aria-hidden="true"></svg><span class="num">{{ km(c.mileage) }}</span></span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-primary" (click)="quick.newOrder({ clientId: c.clientId, carId: c.id })">
            <svg [lucideIcon]="I.plus" aria-hidden="true"></svg>Новий наряд
          </button>
          <button type="button" class="btn" (click)="edit()"><svg [lucideIcon]="I.edit" aria-hidden="true"></svg>Редагувати</button>
          <button type="button" class="btn btn-icon" [cdkMenuTriggerFor]="more" aria-label="Інші дії"><svg [lucideIcon]="I.more" aria-hidden="true"></svg></button>
          <ng-template #more>
            <div class="menu" cdkMenu>
              <button type="button" class="menu-item" cdkMenuItem (cdkMenuItemTriggered)="transfer()"><svg [lucideIcon]="I.transfer" aria-hidden="true"></svg>Змінити власника</button>
              <div class="menu-sep"></div>
              <button type="button" class="menu-item danger" cdkMenuItem (cdkMenuItemTriggered)="remove()"><svg [lucideIcon]="I.trash" aria-hidden="true"></svg>Видалити авто</button>
            </div>
          </ng-template>
        </div>
      </header>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div class="flex min-w-0 flex-col gap-6">
          <section class="card p-4" aria-labelledby="km-h">
            <div class="mb-3 flex flex-wrap items-baseline gap-x-3">
              <h2 id="km-h" class="m-0 flex-1 text-[15px] font-semibold">Пробіг</h2>
              @if (perMonth()) {
                <span class="text-[13px] text-ink-2">≈ {{ num(perMonth()!) }} км на місяць</span>
              }
            </div>
            @if (mileagePoints().length > 1) {
              <tk-chart [build]="mileageChart" [height]="200" [label]="'Графік пробігу: від ' + km(mileagePoints()[0][1]) + ' до ' + km(c.mileage)" />
            } @else {
              <p class="m-0 py-6 text-center text-[13px] text-ink-3">Графік з’явиться після кількох візитів із записаним пробігом.</p>
            }
          </section>

          <section aria-labelledby="tl-h">
            <h2 id="tl-h" class="m-0 mb-3 text-[15px] font-semibold">Історія візитів</h2>
            @if (orders().length) {
              <ol class="relative m-0 list-none p-0 pl-5 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-line-strong">
                @for (o of orders(); track o.id) {
                  <li class="relative mb-3">
                    <span class="absolute top-4 -left-5 size-[11px] rounded-full border-2 border-bg" [style.background]="'var(--s-' + statusVar(o.status) + ')'" aria-hidden="true"></span>
                    <a [routerLink]="['/naryady', o.id]" class="card block p-3.5 transition-colors duration-150 hover:border-line-strong">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-semibold mono">{{ o.number }}</span>
                        <span class="text-[13px] text-ink-2 num">{{ date(o.start ?? o.createdAt) }}</span>
                        @if (o.mileage) {
                          <span class="text-[13px] text-ink-3 num">{{ km(o.mileage) }}</span>
                        }
                        <tk-status class="ml-auto" [status]="o.status" />
                      </div>
                      <div class="mt-1.5 text-[13px] text-ink-2">{{ workNames(o) }}</div>
                      <div class="mt-1 text-[13px] font-medium num">{{ money(totals(o.id).total) }}</div>
                    </a>
                  </li>
                }
              </ol>
            } @else {
              <div class="card"><tk-empty art="orders" title="Візитів ще не було" [compact]="true" /></div>
            }
          </section>
        </div>

        <aside class="flex min-w-0 flex-col gap-6">
          <section class="card p-4" aria-labelledby="spec-h">
            <h2 id="spec-h" class="m-0 mb-3 text-[15px] font-semibold">Характеристики</h2>
            <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt class="text-ink-2">Двигун</dt><dd class="m-0">{{ c.engine || '—' }}</dd>
              <dt class="text-ink-2">КПП</dt><dd class="m-0">{{ c.gearbox || '—' }}</dd>
              <dt class="text-ink-2">Колір</dt><dd class="m-0">{{ c.color || '—' }}</dd>
              <dt class="text-ink-2">Країна</dt><dd class="m-0">{{ decoded()?.country ?? '—' }}</dd>
              <dt class="text-ink-2">Рік</dt><dd class="m-0 num">{{ c.year }}</dd>
            </dl>
          </section>

          <section class="card p-4" aria-labelledby="done-h">
            <h2 id="done-h" class="m-0 mb-3 text-[15px] font-semibold">Виконані роботи</h2>
            @for (w of doneWorks().slice(0, doneLimit()); track $index) {
              <div class="flex gap-2 border-t border-line py-2 text-[13px] first:border-0 first:pt-0">
                <span class="min-w-0 flex-1">{{ w.name }}</span>
                <span class="flex-none text-xs text-ink-3 num">{{ short(w.at) }}</span>
              </div>
            } @empty {
              <p class="m-0 text-[13px] text-ink-3">Ще нічого не виконували</p>
            }
            @if (doneWorks().length > doneLimit()) {
              <button type="button" class="btn btn-ghost btn-sm mt-1 -ml-2" (click)="doneLimit.set(100)">Усі {{ doneWorks().length }}</button>
            }
          </section>

          <section class="card p-4" aria-labelledby="def-h">
            <h2 id="def-h" class="m-0 mb-3 text-[15px] font-semibold">Відкладені роботи</h2>
            @for (r of deferred(); track r.id) {
              <div class="flex gap-2 border-t border-line py-2 text-[13px] first:border-0 first:pt-0">
                <svg [lucideIcon]="I.clock" class="mt-0.5 flex-none text-accent-ink" aria-hidden="true"></svg>
                <span class="min-w-0 flex-1">{{ r.title }}</span>
                <span class="flex-none num text-ink-2">{{ money(r.amount) }}</span>
              </div>
            } @empty {
              <p class="m-0 text-[13px] text-ink-3">Немає</p>
            }
          </section>

          <section class="card p-4" aria-labelledby="dmg-h">
            <h2 id="dmg-h" class="m-0 mb-3 text-[15px] font-semibold">Пошкодження з актів прийому</h2>
            @for (d of damages(); track d.id) {
              <div class="flex items-start gap-2 border-t border-line py-2 text-[13px] first:border-0 first:pt-0">
                @if (d.photo) {
                  <button type="button" class="size-10 flex-none overflow-hidden rounded-md border border-line" [attr.aria-label]="'Фото: ' + zone(d.zone)" (click)="viewPhoto(d.photo)">
                    <img [src]="d.photo" alt="" class="size-full object-cover" />
                  </button>
                }
                <span class="min-w-0 flex-1">{{ dmg(d.kind) }}: {{ zone(d.zone) }}<span class="block text-xs text-ink-3">{{ short(d.at) }}{{ d.comment ? ', ' + d.comment : '' }}</span></span>
              </div>
            } @empty {
              <p class="m-0 text-[13px] text-ink-3">Не зафіксовано</p>
            }
          </section>

          <section class="card p-4" aria-labelledby="own-h">
            <h2 id="own-h" class="m-0 mb-3 text-[15px] font-semibold">Власники</h2>
            <ol class="m-0 flex list-none flex-col gap-2 p-0">
              @for (o of owners(); track $index) {
                <li class="text-[13px]">
                  @if (o.client) {
                    <a [routerLink]="['/kliyenty', o.client.id]" class="row-link">{{ o.client.name }}</a>
                  } @else {
                    <span class="text-ink-3">Видалений клієнт</span>
                  }
                  <span class="block text-xs text-ink-3">{{ date(o.from) }} — {{ o.to ? date(o.to) : 'тепер' }}</span>
                </li>
              }
            </ol>
          </section>
        </aside>
      </div>
    }
  `,
})
export class CarPage {
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
  protected readonly money = fmtMoney;
  protected readonly date = fmtDate;
  protected readonly short = fmtDateShort;
  protected readonly km = fmtKm;
  protected readonly num = fmtNum;
  protected readonly doneLimit = signal(8);
  protected readonly zone = (z: keyof typeof ZONE_LABEL) => ZONE_LABEL[z];
  protected readonly dmg = (k: keyof typeof DAMAGE_LABEL) => DAMAGE_LABEL[k];

  protected readonly car = computed(() => this.db.cars.get(this.id()));
  protected readonly owner = computed(() => this.db.clients.get(this.car()?.clientId));
  protected readonly decoded = computed(() => (this.car() ? decodeVin(this.car()!.vin) : null));
  protected readonly orders = computed(() =>
    [...(this.statsSvc.ordersByCar().get(this.id()) ?? [])].sort((a, b) => (b.start ?? b.createdAt).localeCompare(a.start ?? a.createdAt)),
  );
  protected readonly owners = computed(() => [...(this.car()?.owners ?? [])].reverse().map((o) => ({ ...o, client: this.db.clients.get(o.clientId) })));
  protected readonly deferred = computed(() => this.db.reminders.items().filter((r) => r.carId === this.id() && r.source === 'deferred' && r.status === 'pending'));
  protected readonly doneWorks = computed(() =>
    this.orders()
      .filter((o) => o.status === 'vydano')
      .flatMap((o) => o.works.filter((w) => w.decision !== 'declined').map((w) => ({ name: w.name, at: o.closedAt ?? o.start ?? o.createdAt }))),
  );
  protected readonly damages = computed(() =>
    this.orders().flatMap((o) => (o.intake?.damages ?? []).map((d) => ({ ...d, at: o.start ?? o.createdAt }))),
  );

  /** Точки пробігу: візити з записаним пробігом + поточний */
  protected readonly mileagePoints = computed<[number, number][]>(() => {
    const pts = this.orders()
      .filter((o) => o.mileage && o.status !== 'skasovano')
      .map((o) => [Date.parse(o.start ?? o.createdAt), o.mileage!] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    return pts;
  });
  protected readonly perMonth = computed(() => {
    const p = this.mileagePoints();
    if (p.length < 2) return null;
    const months = (p[p.length - 1][0] - p[0][0]) / (30.4 * 86400000);
    return months > 0.5 ? Math.round((p[p.length - 1][1] - p[0][1]) / months / 100) * 100 : null;
  });

  protected readonly mileageChart = (pal: ChartPalette): EChartsCoreOption => ({
    ...baseOption(pal),
    xAxis: {
      type: 'time',
      splitNumber: 4,
      axisLine: { lineStyle: { color: pal.line } },
      axisLabel: { color: pal.text3, hideOverlap: true, formatter: (v: number) => fmtDateShort(new Date(v)) },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: pal.text3, formatter: (v: number) => `${Math.round(v / 1000)} тис` },
      splitLine: { lineStyle: { color: pal.line, type: 'dashed' } },
    },
    tooltip: { ...(baseOption(pal)['tooltip'] as object), trigger: 'axis', valueFormatter: (v: number) => fmtKm(v) },
    series: [
      {
        type: 'line',
        data: this.mileagePoints(),
        smooth: 0.2,
        symbolSize: 7,
        lineStyle: { color: pal.accent, width: 2 },
        itemStyle: { color: pal.accent, borderColor: pal.surface, borderWidth: 2 },
        areaStyle: { color: pal.accentSoft, opacity: 0.6 },
      },
    ],
  });

  constructor() {
    effect(() => {
      const c = this.car();
      if (c) this.titles.set(`${formatPlate(c.plate)} ${c.make} ${c.model}`);
    });
  }

  protected totals(id: string) {
    return this.statsSvc.totals().get(id)!;
  }
  protected statusVar(s: string): string {
    return { zapys: 'zapys', pryiom: 'pryiom', diagnostyka: 'diag', pogodzhennia: 'pog', v_roboti: 'work', kontrol: 'qc', gotovo: 'ready', vydano: 'done', skasovano: 'cancel' }[s] ?? 'done';
  }
  protected workNames(o: { works: { name: string; decision: string | null }[] }): string {
    const w = o.works.filter((x) => x.decision !== 'declined').map((x) => x.name);
    return w.length ? (w.length > 3 ? `${w.slice(0, 3).join(', ')} і ще ${w.length - 3}` : w.join(', ')) : 'Роботи ще не додано';
  }

  protected async copyVin(vin: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(vin);
      this.toast.success('VIN скопійовано');
    } catch {
      this.toast.error('Не вдалося скопіювати — виділіть VIN вручну');
    }
  }

  protected viewPhoto(src: string): void {
    this.dialogs.open(PhotoViewer, { photos: [src], index: 0 }, { size: 'xl', label: 'Фото пошкодження' });
  }

  protected edit(): void {
    this.dialogs.open(CarForm, { id: this.id() }, { drawer: true, label: 'Редагувати авто' });
  }

  protected transfer(): void {
    const car = this.car();
    if (!car) return;
    const ref = this.dialogs.open<TransferDialog, Car, string>(TransferDialog, car, { size: 'sm', label: 'Змінити власника' });
    ref.closed.subscribe(async (clientId) => {
      const to = this.db.clients.get(clientId);
      if (!to) return;
      try {
        await this.clientsSvc.transferCar(car, to);
        this.toast.success(`Авто передано: ${to.name}`);
      } catch (e) {
        this.toast.error(e);
      }
    });
  }

  protected async remove(): Promise<void> {
    const car = this.car();
    if (!car) return;
    const n = this.orders().length;
    const ok = await this.dialogs.confirm({
      title: `Видалити ${formatPlate(car.plate)} ${car.make} ${car.model}?`,
      text: n ? `Разом з авто буде видалено ${n} нарядів і їхні погодження.` : 'Нарядів по цьому авто немає.',
      confirm: 'Видалити авто',
      danger: true,
    });
    if (!ok) return;
    const restore = await this.clientsSvc.deleteCar(car);
    await this.router.navigate(['/kliyenty', car.clientId]);
    this.toast.undo('Авто видалено', restore);
  }
}
