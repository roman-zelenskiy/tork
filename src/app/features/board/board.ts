import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DbService } from '../../core/data/db.service';
import { Order, Post } from '../../core/data/models';
import { formatPlate } from '../../core/data/plates';
import { STATUS_LABEL } from '../../core/domain/order-math';
import { Conflict, ScheduleService } from '../../core/domain/schedule.service';
import { AppContext } from '../../core/ui/app-context.service';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { HotkeysService } from '../../core/ui/hotkeys.service';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { PageHeader, EmptyState } from '../../shared/ui/states';
import { RadioGroup } from '../../shared/ui/checkbox';
import { DatePicker } from '../../shared/ui/date-picker';
import { Tooltip } from '../../shared/ui/tooltip';
import { Option } from '../../shared/ui/option';
import { statusBg, statusColor } from '../../shared/ui/status';
import { addDays, fmtDayLong, fmtDuration, fmtWeekday, minToHHMM, plural, sameDay, startOfDay, toMin, ymd } from '../../shared/format';
import { OrderCreateDialog } from '../orders/order-create';
import { BRAND, L } from '../../core/i18n';

/** Ширина 15-хвилинного слота й висота рядка поста, px */
const SLOT = 22;
const ROW = 68;
const STEP = 15;

interface Drag {
  id: string;
  mode: 'move' | 'resize';
  x0: number;
  y0: number;
  postIdx0: number;
  start0: number;
  dur0: number;
  postIdx: number;
  start: number;
  dur: number;
  moved: boolean;
}

interface UndoEntry {
  id: string;
  number: string;
  postId: string | null;
  start: string | null;
  durationMin: number;
}

@Component({
  selector: 'tk-board',
  imports: [Icon, PageHeader, EmptyState, RadioGroup, DatePicker, Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-page-header [title]="L('Табло постів', 'Bay board')" [subtitle]="subtitle()">
      <button type="button" class="btn" [disabled]="!undoStack().length" (click)="undo()" [tkTip]="L('Скасувати перенесення', 'Undo move') + ' (' + hk.label('mod+z') + ')'">
        <svg [lucideIcon]="I.undo" aria-hidden="true"></svg>{{ L('Скасувати', 'Undo') }}
        @if (undoStack().length) {
          <span class="text-ink-3 num">{{ undoStack().length }}</span>
        }
      </button>
      <button type="button" class="btn btn-primary" (click)="quickBook(null)"><svg [lucideIcon]="I.plus" aria-hidden="true"></svg>{{ L('Записати', 'Book') }}</button>
    </tk-page-header>

    <div class="mb-4 flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-1">
        <button type="button" class="btn btn-icon" [attr.aria-label]="view() === 'day' ? L('Попередній день', 'Previous day') : L('Попередній тиждень', 'Previous week')" (click)="shift(-1)"><svg [lucideIcon]="I.chevronLeft" aria-hidden="true"></svg></button>
        <button type="button" class="btn" (click)="goToday()" [disabled]="isToday() && view() === 'day'">{{ L('Сьогодні', 'Today') }}</button>
        <button type="button" class="btn btn-icon" [attr.aria-label]="view() === 'day' ? L('Наступний день', 'Next day') : L('Наступний тиждень', 'Next week')" (click)="shift(1)"><svg [lucideIcon]="I.chevronRight" aria-hidden="true"></svg></button>
      </div>
      <tk-date-picker class="w-52" [ariaLabel]="L('Дата табло', 'Board date')" [value]="dayKey()" (changed)="$event && setDay($event)" />
      <tk-radio-group variant="segmented" [ariaLabel]="L('Вигляд', 'View')" [options]="views" [value]="view()" (changed)="view.set($event)" />
      @if (branchOptions().length > 1) {
        <tk-radio-group class="ml-auto" variant="segmented" [ariaLabel]="L('Філія', 'Branch')" [options]="branchOptions()" [value]="ctx.branchId()" (changed)="ctx.setBranch($event)" />
      }
    </div>

    @if (!db.ready()) {
      <div class="card overflow-hidden" aria-hidden="true">
        @for (r of [1, 2, 3, 4, 5]; track r) {
          <div class="flex h-[68px] items-center gap-4 border-b border-line px-4"><div class="skeleton h-3 w-28"></div><div class="skeleton h-10 flex-1" [style.margin-left.px]="r * 40"></div></div>
        }
      </div>
    } @else if (!posts().length) {
      <div class="card"><tk-empty art="calendar" [title]="L('У філії немає постів', 'This branch has no bays')" [text]="L('Додайте пости в довіднику, щоб планувати записи.', 'Add bays in Directories to plan bookings.')" /></div>
    } @else if (view() === 'week') {
      <!-- тиждень: завантаження постів по днях -->
      <div class="card overflow-x-auto">
        <table class="tbl">
          <thead>
            <tr>
              <th class="w-44">{{ L('Пост', 'Bay') }}</th>
              @for (d of weekDays(); track d.key) {
                <th class="text-center" [class.text-accent-ink!]="d.today">{{ d.label }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (p of posts(); track p.id) {
              <tr>
                <td class="font-medium">{{ p.name }}</td>
                @for (d of weekDays(); track d.key) {
                  @let l = load(p.id, d.date);
                  <td class="p-1.5!">
                    <button
                      type="button"
                      class="block w-full rounded-md px-2 py-1.5 text-left transition-colors duration-100 hover:bg-subtle disabled:opacity-40"
                      [disabled]="!d.open"
                      [attr.aria-label]="p.name + ', ' + d.label + ': ' + (d.open ? L(l.count + ' записів, завантаження ' + l.pct + '%', l.count + ' bookings, ' + l.pct + '% utilised') : L('вихідний', 'closed'))"
                      (click)="openDay(d.date)"
                    >
                      @if (d.open) {
                        <span class="flex items-baseline justify-between text-xs"><span class="num">{{ l.count }}</span><span class="text-ink-3 num">{{ l.pct }}%</span></span>
                        <span class="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted"><span class="block h-full rounded-full" [style.width.%]="l.pct" [style.background]="l.pct > 85 ? 'var(--danger)' : 'var(--accent)'"></span></span>
                      } @else {
                        <span class="text-xs text-ink-3">{{ L('вихідний', 'closed') }}</span>
                      }
                    </button>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      @if (dayOff()) {
        <div class="mb-3 flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent-ink" role="status">
          <svg [lucideIcon]="I.info" aria-hidden="true"></svg>{{ ctx.branch()?.name }} {{ L('у цей день не працює. Записи можна переглядати, але не створювати.', 'is closed on this day. You can view bookings but not create them.') }}
        </div>
      }
      <p id="board-help" class="sr-only">
        {{
          L(
            'Записи на табло — кнопки. Стрілки вліво й вправо переносять запис на 15 хвилин, вгору й вниз — на інший пост, Shift зі стрілками змінює тривалість, Enter відкриває наряд. Ctrl+Z скасовує останнє перенесення.',
            'Bookings on the board are buttons. Left and right arrows move a booking by 15 minutes, up and down move it to another bay, Shift with the arrows changes its length, Enter opens the work order. Ctrl+Z undoes the last move.'
          )
        }}
      </p>
      <div class="card relative overflow-hidden">
        <div #scroller class="overflow-x-auto" (scroll)="null">
          <div class="relative" [style.width.px]="LABEL_W + gridWidth()">
            <!-- шкала часу -->
            <div class="sticky top-0 z-20 flex h-9 border-b border-line bg-subtle">
              <div class="sticky left-0 z-10 flex-none border-r border-line bg-subtle" [style.width.px]="LABEL_W"></div>
              <div class="relative flex-1">
                @for (h of hourMarks(); track h.min) {
                  <span class="absolute top-0 flex h-full items-center pl-1.5 text-[11px] text-ink-3 num" [style.left.px]="h.x">{{ h.label }}</span>
                }
              </div>
            </div>

            <!-- рядки постів -->
            <div class="relative" [style.height.px]="posts().length * ROW">
              @for (p of posts(); track p.id; let pi = $index) {
                <div class="absolute inset-x-0 flex border-b border-line" [style.top.px]="pi * ROW" [style.height.px]="ROW">
                  <div class="sticky left-0 z-10 flex flex-none flex-col justify-center gap-0.5 border-r border-line bg-surface px-3" [style.width.px]="LABEL_W">
                    <span class="truncate-1 text-[13px] font-medium">{{ p.name }}</span>
                    <span class="flex items-center gap-1.5 text-[11px] text-ink-3">
                      <span class="hidden sm:inline">{{ postKind(p) }}</span>
                      <span class="num">{{ postLoad(p.id) }}%</span>
                      <button type="button" class="ml-auto grid size-6 place-items-center rounded-md hover:bg-subtle hover:text-ink" [attr.aria-label]="L('Записати на ', 'Book on ') + p.name" [disabled]="dayOff()" (click)="quickBook(p, null)">
                        <svg [lucideIcon]="I.plus" [size]="14" aria-hidden="true"></svg>
                      </button>
                    </span>
                  </div>
                  <!-- клітинки 15 хв: клік — швидкий запис (з клавіатури — кнопка «+» біля назви поста) -->
                  <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -- миша; клавіатурна альтернатива — кнопка «Записати на пост» -->
                  <div class="relative flex-1 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_87px,var(--border)_87px,var(--border)_88px)]" (click)="slotClick($event, p)" (mousemove)="hover($event, p)" (mouseleave)="hoverSlot.set(null)">
                    <div class="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_21px,color-mix(in_srgb,var(--border)_45%,transparent)_21px,color-mix(in_srgb,var(--border)_45%,transparent)_22px)]" aria-hidden="true"></div>
                    @if (hoverSlot()?.post === p.id && !drag()) {
                      <div class="pointer-events-none absolute top-1.5 bottom-1.5 rounded-md border border-dashed border-accent bg-accent-soft/60" [style.left.px]="hoverSlot()!.x" [style.width.px]="SLOT * 4" aria-hidden="true">
                        <span class="flex h-full items-center justify-center text-[11px] text-accent-ink num">+ {{ hoverSlot()!.label }}</span>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- лінія поточного часу -->
              @if (nowX() !== null) {
                <div class="pointer-events-none absolute top-0 bottom-0 z-[15] w-0.5 bg-danger" [style.left.px]="LABEL_W + nowX()!" aria-hidden="true">
                  <span class="absolute -top-1 -left-[3px] size-2 rounded-full bg-danger"></span>
                </div>
              }

              <!-- записи -->
              @for (b of blocks(); track b.o.id) {
                <button
                  type="button"
                  class="board-block absolute z-[5] flex flex-col overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left shadow-sm transition-[box-shadow,opacity] duration-100 hover:z-[6] hover:shadow"
                  [class.draggable]="!b.locked"
                  [class.opacity-60]="b.locked"
                  [class.ring-2]="b.dragging"
                  [class.z-[16]]="b.dragging"
                  [class.ring-danger]="b.dragging && dragConflicts().length"
                  [class.ring-accent]="b.dragging && !dragConflicts().length"
                  [style.left.px]="LABEL_W + b.x + 1"
                  [style.width.px]="b.w - 2"
                  [style.top.px]="b.y + 5"
                  [style.height.px]="ROW - 10"
                  [style.background]="bg(b.o.status)"
                  [style.border-left-color]="fg(b.o.status)"
                  [attr.aria-label]="b.aria"
                  [tkTip]="b.w < 132 ? b.aria : null"
                  aria-describedby="board-help"
                  (pointerdown)="down($event, b.o, 'move')"
                  (keydown)="key($event, b.o)"
                  (mouseenter)="hoverSlot.set(null)"
                >
                  <span class="flex items-center gap-1.5 overflow-hidden text-[11px] leading-4 whitespace-nowrap num">
                    <span class="font-semibold mono" [style.color]="fg(b.o.status)">{{ b.o.number }}</span>
                    @if (b.w >= 132) {
                      <span class="text-ink-2">{{ b.time }}</span>
                    }
                  </span>
                  @if (b.w >= 64) {
                    <span class="truncate-1 text-[12px] leading-4 font-medium text-ink">{{ b.w >= 120 ? b.title : b.plate }}</span>
                    <span class="truncate-1 text-[11px] leading-4 text-ink-2">{{ b.w >= 120 ? b.sub : b.time }}</span>
                  }
                  @if (!b.locked) {
                    <span
                      class="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      aria-hidden="true"
                      (pointerdown)="down($event, b.o, 'resize')"
                    ></span>
                  }
                </button>
              }
            </div>
          </div>
        </div>
        @if (drag() && dragConflicts().length) {
          <div class="absolute right-3 bottom-3 z-30 max-w-sm rounded-lg bg-danger px-3 py-2 text-[12px] text-surface shadow-pop">{{ dragConflicts()[0].text }}</div>
        }
      </div>
      <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
        @for (s of legend; track s) {
          <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-sm" [style.background]="fg(s)"></span>{{ label(s) }}</span>
        }
        <span class="ml-auto hidden md:inline">{{ L('Перетягніть запис, щоб перенести; край праворуч — змінити тривалість. Клік по порожньому місцю — новий запис.', 'Drag a booking to move it; drag its right edge to change its length. Click an empty slot for a new booking.') }}</span>
      </div>
    }
    <p class="sr-only" aria-live="polite">{{ announce() }}</p>
  `,
})
export class Board {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly SLOT = SLOT;
  protected readonly ROW = ROW;
  /** Ширина колонки з назвами постів: вужча на телефоні */
  protected LABEL_W = 168;
  protected readonly db = inject(DbService);
  protected readonly ctx = inject(AppContext);
  protected readonly hk = inject(HotkeysService);
  private readonly schedule = inject(ScheduleService);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly views: Option<'day' | 'week'>[] = [
    { value: 'day', label: L('День', 'Day') },
    { value: 'week', label: L('Тиждень', 'Week') },
  ];
  protected readonly legend = ['zapys', 'pryiom', 'diagnostyka', 'pogodzhennia', 'v_roboti', 'kontrol', 'gotovo', 'vydano'] as const;
  protected readonly view = signal<'day' | 'week'>('day');
  protected readonly day = signal(startOfDay(new Date()));
  protected readonly drag = signal<Drag | null>(null);
  protected readonly hoverSlot = signal<{ post: string; x: number; label: string } | null>(null);
  protected readonly undoStack = signal<UndoEntry[]>([]);
  protected readonly announce = signal('');

  protected readonly dayKey = computed(() => ymd(this.day()));
  protected readonly isToday = computed(() => sameDay(this.day(), new Date(this.ctx.now())));
  protected readonly branchOptions = computed<Option<string>[]>(() => this.ctx.branches().map((b) => ({ value: b.id, label: b.name.replace(`${BRAND} `, '') })));
  protected readonly posts = computed(() => this.db.posts.items().filter((p) => p.branchId === this.ctx.branchId() && p.active));
  private readonly open = computed(() => toMin(this.ctx.branch()?.opensAt ?? '08:00'));
  private readonly close = computed(() => toMin(this.ctx.branch()?.closesAt ?? '20:00'));
  protected readonly gridWidth = computed(() => ((this.close() - this.open()) / STEP) * SLOT);
  protected readonly dayOff = computed(() => !!this.ctx.branch() && !this.ctx.branch()!.workDays.includes(this.day().getDay() || 7));

  protected readonly hourMarks = computed(() => {
    const out = [];
    for (let m = Math.ceil(this.open() / 60) * 60; m < this.close(); m += 60) out.push({ min: m, x: ((m - this.open()) / STEP) * SLOT, label: minToHHMM(m) });
    return out;
  });

  protected readonly nowX = computed(() => {
    if (!this.isToday()) return null;
    const d = new Date(this.ctx.now());
    const m = d.getHours() * 60 + d.getMinutes();
    return m < this.open() || m > this.close() ? null : ((m - this.open()) / STEP) * SLOT;
  });

  protected readonly subtitle = computed(() => {
    if (!this.db.ready()) return L('Завантаження…', 'Loading…');
    const n = this.dayOrders().length;
    return `${fmtDayLong(this.day())}: ${n} ${plural(n, ['запис', 'записи', 'записів'], ['booking', 'bookings'])}`;
  });

  private readonly dayOrders = computed(() => {
    const b = this.ctx.branchId();
    return b ? this.schedule.dayOrders(b, this.day()) : [];
  });

  protected readonly blocks = computed(() => {
    const posts = this.posts();
    const idx = new Map(posts.map((p, i) => [p.id, i]));
    const d = this.drag();
    return this.dayOrders()
      .filter((o) => idx.has(o.postId!))
      .map((o) => {
        const s = new Date(o.start!);
        let startMin = s.getHours() * 60 + s.getMinutes();
        let dur = o.durationMin;
        let pi = idx.get(o.postId!)!;
        const dragging = d?.id === o.id && d.moved;
        if (dragging) {
          startMin = d.start;
          dur = d.dur;
          pi = d.postIdx;
        }
        const car = this.db.cars.get(o.carId);
        const client = this.db.clients.get(o.clientId);
        const time = `${minToHHMM(startMin)}–${minToHHMM(startMin + dur)}`;
        const works = o.works.filter((w) => w.decision !== 'declined').map((w) => w.name);
        return {
          o,
          dragging,
          locked: o.status === 'vydano',
          x: ((startMin - this.open()) / STEP) * SLOT,
          w: Math.max(SLOT, (dur / STEP) * SLOT),
          y: pi * ROW,
          time,
          title: car ? `${formatPlate(car.plate)} ${car.make} ${car.model}` : (client?.name ?? ''),
          plate: car ? formatPlate(car.plate) : '',
          sub: works[0] ?? o.complaint ?? '',
          aria: `${o.number}, ${time}, ${posts[pi]?.name}, ${STATUS_LABEL[o.status]}, ${car ? `${car.make} ${car.model}` : ''}, ${client?.name ?? ''}`,
        };
      });
  });

  protected readonly dragConflicts = computed<Conflict[]>(() => {
    const d = this.drag();
    if (!d || !d.moved) return [];
    const o = this.db.orders.get(d.id);
    return this.schedule.conflicts({ postId: this.posts()[d.postIdx]?.id ?? null, start: this.iso(d.start), durationMin: d.dur, mechanicId: o?.mechanicId ?? null, orderId: d.id });
  });

  protected readonly weekDays = computed(() => {
    const d = this.day();
    const monday = addDays(d, -((d.getDay() + 6) % 7));
    const b = this.ctx.branch();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      return {
        date,
        key: ymd(date),
        label: `${fmtWeekday(date)} ${date.getDate()}`,
        today: sameDay(date, new Date()),
        open: !!b && b.workDays.includes(date.getDay() || 7),
      };
    });
  });

  constructor() {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) this.LABEL_W = 112;
    const off = this.hk.register({ combo: 'mod+z', description: L('Скасувати перенесення на табло', 'Undo a move on the bay board'), handler: () => void this.undo(), allowInInput: false });
    inject(DestroyRef).onDestroy(() => {
      off();
      document.body.classList.remove('is-dragging');
    });
    // прокрутка до поточного часу при відкритті сьогоднішнього дня
    let scrolledFor = '';
    effect(() => {
      const el = this.scroller()?.nativeElement;
      const x = this.nowX();
      const key = this.dayKey() + this.ctx.branchId();
      if (!el || scrolledFor === key) return;
      scrolledFor = key;
      el.scrollLeft = x !== null ? Math.max(0, x - el.clientWidth / 3) : 0;
    });
  }

  protected bg(s: Order['status']): string {
    return statusBg(s);
  }
  protected fg(s: Order['status']): string {
    return statusColor(s);
  }
  protected label(s: Order['status']): string {
    return STATUS_LABEL[s];
  }
  protected postKind(p: Post): string {
    return L(
      { lift: 'підйомник', diag: 'діагностика', tire: 'шиномонтаж', body: 'кузов', express: 'експрес' },
      { lift: 'lift', diag: 'diagnostics', tire: 'tyres', body: 'body', express: 'express' },
    )[p.kind];
  }
  protected postLoad(postId: string): number {
    return this.load(postId, this.day()).pct;
  }
  protected load(postId: string, date: Date): { count: number; pct: number } {
    const b = this.ctx.branchId();
    if (!b) return { count: 0, pct: 0 };
    const list = this.schedule.dayOrders(b, date).filter((o) => o.postId === postId);
    const busy = list.reduce((s, o) => s + o.durationMin, 0);
    return { count: list.length, pct: Math.min(100, Math.round((busy / Math.max(1, this.close() - this.open())) * 100)) };
  }

  private iso(min: number): string {
    const d = this.day();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(min / 60), min % 60).toISOString();
  }

  // ——— навігація
  protected shift(n: number): void {
    this.day.set(addDays(this.day(), this.view() === 'day' ? n : n * 7));
  }
  protected goToday(): void {
    this.day.set(startOfDay(new Date()));
    this.view.set('day');
  }
  protected setDay(key: string): void {
    this.day.set(new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)));
  }
  protected openDay(d: Date): void {
    this.day.set(d);
    this.view.set('day');
  }

  // ——— швидкий запис
  protected slotClick(e: MouseEvent, p: Post): void {
    if (this.drag() || this.dayOff()) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const min = this.open() + Math.floor((e.clientX - rect.left) / SLOT) * STEP;
    void this.quickBook(p, min);
  }

  protected hover(e: MouseEvent, p: Post): void {
    if (this.drag() || this.dayOff() || (e.target as HTMLElement).closest('.board-block')) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const slot = Math.min(Math.floor((e.clientX - rect.left) / SLOT), (this.close() - this.open()) / STEP - 4);
    const x = slot * SLOT;
    if (this.hoverSlot()?.post === p.id && this.hoverSlot()?.x === x) return;
    this.hoverSlot.set({ post: p.id, x, label: minToHHMM(this.open() + slot * STEP) });
  }

  protected async quickBook(p: Post | null, min: number | null = null): Promise<void> {
    let start: string | undefined;
    if (p && min !== null) start = this.iso(Math.min(min, this.close() - 60));
    else if (p) start = this.schedule.nextFree(p.id, 60, this.isToday() ? new Date() : this.day()) ?? undefined;
    const ref = this.dialogs.open(OrderCreateDialog, { postId: p?.id, start }, { size: 'lg', label: L('Новий запис', 'New booking') });
    const id = await firstValueFrom(ref.closed);
    if (typeof id === 'string') this.toast.info(L('Запис додано на табло', 'Booking added to the board'), { label: L('Відкрити наряд', 'Open work order'), run: () => void this.router.navigate(['/naryady', id]) });
  }

  // ——— перетягування (вказівник) і зміна тривалості
  protected down(e: PointerEvent, o: Order, mode: 'move' | 'resize'): void {
    if (e.button !== 0 || o.status === 'vydano') return;
    e.stopPropagation();
    const s = new Date(o.start!);
    const pi = this.posts().findIndex((p) => p.id === o.postId);
    const start = s.getHours() * 60 + s.getMinutes();
    this.drag.set({ id: o.id, mode, x0: e.clientX, y0: e.clientY, postIdx0: pi, start0: start, dur0: o.durationMin, postIdx: pi, start, dur: o.durationMin, moved: false });
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => this.onMove(ev);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-dragging');
      void this.onUp(o);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag();
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) document.body.classList.add('is-dragging');
    const slots = Math.round(dx / SLOT);
    if (d.mode === 'resize') {
      const dur = Math.max(STEP, Math.min(this.close() - d.start0, d.dur0 + slots * STEP));
      this.drag.set({ ...d, moved: true, dur });
    } else {
      const rows = Math.round(dy / ROW);
      const postIdx = Math.max(0, Math.min(this.posts().length - 1, d.postIdx0 + rows));
      const start = Math.max(this.open(), Math.min(this.close() - d.dur0, d.start0 + slots * STEP));
      this.drag.set({ ...d, moved: true, postIdx, start });
    }
  }

  private async onUp(o: Order): Promise<void> {
    const d = this.drag();
    if (!d) return;
    if (!d.moved) {
      this.drag.set(null);
      void this.router.navigate(['/naryady', o.id]);
      return;
    }
    const postId = this.posts()[d.postIdx].id;
    const conflicts = this.dragConflicts();
    if (d.postIdx === d.postIdx0 && d.start === d.start0 && d.dur === d.dur0) return this.drag.set(null);
    await this.commit(o, postId, d.start, d.dur, conflicts);
    this.drag.set(null);
  }

  private async commit(o: Order, postId: string, startMin: number, dur: number, conflicts: Conflict[]): Promise<boolean> {
    const hard = conflicts.find((c) => c.kind === 'overlap' || c.kind === 'dayoff');
    if (hard) {
      this.toast.error(`${L('Не перенесено', 'Not moved')}: ${hard.text.charAt(0).toLowerCase()}${hard.text.slice(1)}`);
      this.announce.set(`${L('Не перенесено', 'Not moved')}. ${hard.text}`);
      return false;
    }
    if (conflicts.length) {
      const ok = await this.dialogs.confirm({
        title: L(`Перенести ${o.number} попри конфлікт?`, `Move ${o.number} despite the conflict?`),
        text: conflicts.map((c) => c.text).join('. ') + '.',
        confirm: L('Все одно перенести', 'Move anyway'),
        cancel: L('Не переносити', 'Don’t move'),
      });
      if (!ok) return false;
    }
    const prev: UndoEntry = { id: o.id, number: o.number, postId: o.postId, start: o.start, durationMin: o.durationMin };
    try {
      const post = this.db.posts.get(postId);
      await this.db.orders.update(
        o.id,
        { postId, start: this.iso(startMin), durationMin: dur },
        { log: `${o.number}: ${post?.name}, ${minToHHMM(startMin)}–${minToHHMM(startMin + dur)}` },
      );
      this.undoStack.update((s) => [...s.slice(-19), prev]);
      const msg = `${o.number}: ${post?.name}, ${minToHHMM(startMin)}, ${fmtDuration(dur)}`;
      this.announce.set(`${L('Перенесено', 'Moved')}. ${msg}`);
      this.toast.success(msg, { label: L('Скасувати', 'Undo'), run: () => this.undo() });
      return true;
    } catch (e) {
      this.toast.error(e);
      return false;
    }
  }

  protected async undo(): Promise<void> {
    const last = this.undoStack().at(-1);
    if (!last) return;
    this.undoStack.update((s) => s.slice(0, -1));
    try {
      await this.db.orders.update(last.id, { postId: last.postId, start: last.start, durationMin: last.durationMin }, { log: L(`${last.number}: перенесення скасовано`, `${last.number}: move undone`) });
      this.announce.set(L(`${last.number} повернуто на місце`, `${last.number} moved back`));
      this.toast.info(L(`${last.number} повернуто на попереднє місце`, `${last.number} moved back to where it was`));
    } catch (e) {
      this.toast.error(e);
    }
  }

  // ——— клавіатура: альтернатива перетягуванню
  protected async key(e: KeyboardEvent, o: Order): Promise<void> {
    if (e.key === 'Enter') return void this.router.navigate(['/naryady', o.id]);
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = dirs[e.key];
    if (!dir || o.status === 'vydano') return;
    e.preventDefault();
    const s = new Date(o.start!);
    const start = s.getHours() * 60 + s.getMinutes();
    const pi = this.posts().findIndex((p) => p.id === o.postId);
    let ns = start;
    let nd = o.durationMin;
    let npi = pi;
    if (e.shiftKey && dir[0]) nd = Math.max(STEP, Math.min(this.close() - start, nd + dir[0] * STEP));
    else if (dir[0]) ns = Math.max(this.open(), Math.min(this.close() - nd, start + dir[0] * STEP));
    else npi = Math.max(0, Math.min(this.posts().length - 1, pi + dir[1]));
    if (ns === start && nd === o.durationMin && npi === pi) return;
    const postId = this.posts()[npi].id;
    const conflicts = this.schedule.conflicts({ postId, start: this.iso(ns), durationMin: nd, mechanicId: o.mechanicId, orderId: o.id });
    const btn = e.currentTarget as HTMLElement;
    if (await this.commit(o, postId, ns, nd, conflicts)) setTimeout(() => btn.isConnected && btn.focus(), 30);
  }
}
