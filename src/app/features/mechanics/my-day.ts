import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, inject, signal, DestroyRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DbService } from '../../core/data/db.service';
import { Order, OrderWork } from '../../core/data/models';
import { MechanicsService } from '../../core/domain/mechanics.service';
import { ToastService } from '../../core/ui/toast.service';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { Select } from '../../shared/ui/select';
import { Plate } from '../../shared/ui/display';
import { StatusBadge } from '../../shared/ui/status';
import { EmptyState } from '../../shared/ui/states';
import { PhotoUpload } from '../../shared/ui/photo-upload';
import { Option } from '../../shared/ui/option';
import { fmtDuration, fmtHours, fmtTime } from '../../shared/format';
import { MechanicsHeader } from './mechanics-header';

const ME_KEY = 'tork-ui:my-mechanic';

/**
 * «Мій день механіка» — для телефона в боксі: великі кнопки, таймер, фото.
 * Обраний механік запам’ятовується в цьому браузері (зручність, не дані CRM).
 */
@Component({
  selector: 'tk-my-day',
  imports: [RouterLink, Icon, Select, Plate, StatusBadge, EmptyState, PhotoUpload, MechanicsHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-mechanics-header title="Мій день механіка" [subtitle]="null" />
    <div class="mb-5 flex flex-wrap items-end gap-3">
      <div class="field w-full sm:w-72">
        <label class="label" for="me-sel">Я —</label>
        <tk-select inputId="me-sel" [options]="mechOptions()" [value]="me()" placeholder="Оберіть себе" (valueChange)="setMe($event)" />
      </div>
      @if (me()) {
        <dl class="m-0 grid flex-1 grid-cols-3 gap-2 sm:max-w-md" aria-label="Підсумок дня">
          <div class="card p-3"><dt class="text-[11px] text-ink-3">Закрито норми</dt><dd class="m-0 text-lg font-semibold num">{{ hours(today().norm) }}</dd></div>
          <div class="card p-3"><dt class="text-[11px] text-ink-3">Фактично</dt><dd class="m-0 text-lg font-semibold num" [attr.aria-label]="dur(today().actual)">{{ hm(today().actual) }}</dd></div>
          <div class="card p-3"><dt class="text-[11px] text-ink-3">Ефективність</dt><dd class="m-0 text-lg font-semibold num" [class.text-success]="(today().eff ?? 0) >= 100">{{ today().eff !== null ? today().eff + '%' : '—' }}</dd></div>
        </dl>
      }
    </div>

    @if (!db.ready()) {
      @for (i of [1, 2]; track i) {
        <div class="skeleton mb-3 h-48"></div>
      }
    } @else if (!me()) {
      <div class="card"><tk-empty art="calendar" title="Оберіть себе у списку" text="Тут з’являться ваші наряди на сьогодні з кнопками «Почати», «Пауза», «Готово»." /></div>
    } @else if (!list().length) {
      <div class="card"><tk-empty art="done" title="Робіт немає" text="На вас зараз не призначено відкритих нарядів. Майстер-приймальник додасть їх на табло." /></div>
    } @else {
      <div class="grid gap-4 lg:grid-cols-2">
        @for (x of list(); track x.order.id) {
          @let car = db.cars.get(x.order.carId);
          <article class="card overflow-hidden" [class.ring-2]="hasRunning(x.works)" [class.ring-accent]="hasRunning(x.works)">
            <header class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              @if (car) {
                <tk-plate [value]="car.plate" /><span class="font-semibold">{{ car.make }} {{ car.model }}</span>
              }
              <tk-status class="ml-auto" [status]="x.order.status" />
              <div class="w-full text-[13px] text-ink-2">
                <a [routerLink]="['/naryady', x.order.id]" class="link mono">{{ x.order.number }}</a>
                {{ post(x.order) }}{{ x.order.start ? ', ' + time(x.order.start) : '' }}
                @if (x.order.complaint) {
                  <span class="block text-ink-3">«{{ x.order.complaint }}»</span>
                }
              </div>
            </header>
            <ul class="m-0 list-none p-0">
              @for (w of x.works; track w.id) {
                @let t = spent(w);
                <li class="border-b border-line px-4 py-3 last:border-0">
                  <div class="flex items-start gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="text-[14px] font-medium" [class.line-through]="w.state === 'done'" [class.text-ink-3]="w.state === 'done'">{{ w.name }}</div>
                      <div class="mt-0.5 text-[13px] text-ink-2 num">
                        <span [class.font-semibold]="!!w.runningSince" [class.text-accent-ink]="!!w.runningSince">{{ w.runningSince ? clock(t) : dur(t) }}</span> з норми {{ dur(w.hours * 60) }}
                      </div>
                    </div>
                    @if (w.state === 'done') {
                      <span class="badge badge-success"><svg [lucideIcon]="I.check" [size]="12" aria-hidden="true"></svg>Готово</span>
                    }
                  </div>
                  <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div class="h-full rounded-full transition-[width] duration-500" [style.width.%]="min(100, (t / (w.hours * 60)) * 100)" [style.background]="t > w.hours * 60 ? 'var(--danger)' : 'var(--accent)'"></div>
                  </div>
                  @if (w.state !== 'done') {
                    <div class="mt-3 grid grid-cols-2 gap-2">
                      @if (w.runningSince) {
                        <button type="button" class="btn btn-lg" [disabled]="busy()" (click)="pause(x.order, w)"><svg [lucideIcon]="I.pause" [size]="18" aria-hidden="true"></svg>Пауза</button>
                      } @else {
                        <button type="button" class="btn btn-lg btn-primary" [disabled]="busy()" (click)="start(x.order, w)"><svg [lucideIcon]="I.play" [size]="18" aria-hidden="true"></svg>{{ w.state === 'paused' ? 'Продовжити' : 'Почати' }}</button>
                      }
                      <button type="button" class="btn btn-lg" [disabled]="busy()" (click)="finish(x.order, w)"><svg [lucideIcon]="I.check" [size]="18" aria-hidden="true"></svg>Готово</button>
                    </div>
                  }
                  <details class="mt-2">
                    <summary class="w-fit rounded text-[13px] text-ink-2 hover:text-ink">Фото роботи ({{ w.photos.length }})</summary>
                    <tk-photo-upload class="mt-2" [photos]="w.photos" [max]="6" (photosChange)="photos(x.order, w, $event)" />
                  </details>
                </li>
              }
            </ul>
          </article>
        }
      </div>
    }
    <p class="sr-only" aria-live="polite">{{ announce() }}</p>
  `,
})
export class MyDay {
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly mech = inject(MechanicsService);
  private readonly toast = inject(ToastService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly hours = fmtHours;
  protected readonly dur = fmtDuration;
  protected readonly time = fmtTime;
  protected readonly min = Math.min;
  protected readonly me = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly announce = signal('');
  /** Секундний тік для таймера, лише коли щось виконується */
  private readonly tick = signal(Date.now());

  protected readonly mechOptions = computed<Option<string>[]>(() =>
    this.mech.mechanics().map((m) => ({ value: m.id, label: m.name, hint: this.db.branches.get(m.branchId)?.name.replace('Торк ', '') })),
  );
  protected readonly list = computed(() => (this.me() ? this.mech.myWorks(this.me()!) : []));
  protected readonly today = computed(() => {
    this.tick();
    const me = this.me();
    let norm = 0;
    let actual = 0;
    const start = new Date().setHours(0, 0, 0, 0);
    for (const o of this.db.orders.items()) {
      for (const w of o.works) {
        if ((w.mechanicId ?? o.mechanicId) !== me) continue;
        const touched = Date.parse(o.updatedAt) >= start;
        if (!touched) continue;
        if (w.state === 'done') norm += w.hours;
        if (w.state !== 'todo') actual += this.mech.elapsed(w);
      }
    }
    return { norm, actual, eff: actual > 1 ? Math.round(((norm * 60) / actual) * 100) : null };
  });

  constructor() {
    if (this.browser) {
      try {
        this.me.set(localStorage.getItem(ME_KEY));
      } catch {
        /* приватний режим — оберуть щоразу */
      }
      const t = setInterval(() => {
        if (this.list().some((x) => this.hasRunning(x.works))) this.tick.set(Date.now());
      }, 1000);
      inject(DestroyRef).onDestroy(() => clearInterval(t));
    }
    effect(() => {
      const me = this.me();
      const opts = this.mechOptions();
      if (me && opts.length && !opts.some((o) => o.value === me)) this.me.set(null);
    });
  }

  protected setMe(id: string | null): void {
    this.me.set(id);
    try {
      if (id) localStorage.setItem(ME_KEY, id);
    } catch {
      /* ignore */
    }
  }

  protected post(o: Order): string {
    return this.db.posts.get(o.postId)?.name ?? '';
  }
  protected hasRunning(ws: OrderWork[]): boolean {
    return ws.some((w) => !!w.runningSince);
  }
  protected spent(w: OrderWork): number {
    this.tick();
    return this.mech.elapsed(w);
  }
  protected hm(min: number): string {
    const m = Math.round(min);
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  }
  protected clock(min: number): string {
    const s = Math.floor(min * 60);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
  }

  private async run(fn: () => Promise<unknown>, msg: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await fn();
      this.announce.set(msg);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
  protected start(o: Order, w: OrderWork): void {
    void this.run(() => this.mech.start(o, w, this.me()!), `Почато: ${w.name}`);
  }
  protected pause(o: Order, w: OrderWork): void {
    void this.run(() => this.mech.pause(this.db.orders.get(o.id)!, w), `Пауза: ${w.name}`);
  }
  protected finish(o: Order, w: OrderWork): void {
    void this.run(async () => {
      const allDone = await this.mech.finish(this.db.orders.get(o.id)!, w);
      this.toast.success(allDone ? `${o.number}: усе виконано, передано на контроль якості` : `Виконано: ${w.name}`);
    }, `Виконано: ${w.name}`);
  }
  protected photos(o: Order, w: OrderWork, p: string[]): void {
    void this.run(() => this.mech.addPhotos(this.db.orders.get(o.id)!, w, p), 'Фото збережено');
  }
}
