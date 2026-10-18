import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { DbService } from '../../core/data/db.service';
import { Work } from '../../core/data/models';
import { formatPlate } from '../../core/data/plates';
import { OrdersService } from '../../core/domain/orders.service';
import { ScheduleService } from '../../core/domain/schedule.service';
import { AppContext } from '../../core/ui/app-context.service';
import { FormDialog } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { FormField } from '../../shared/ui/form-field';
import { TextField } from '../../shared/ui/text-field';
import { Combobox } from '../../shared/ui/combobox';
import { Select } from '../../shared/ui/select';
import { Stepper } from '../../shared/ui/stepper';
import { DatePicker } from '../../shared/ui/date-picker';
import { TimePicker } from '../../shared/ui/time-picker';
import { Option } from '../../shared/ui/option';
import { fmtDuration, fmtHours, fmtMoney, fmtPhone, minToHHMM, ymd } from '../../shared/format';
import { ClientForm } from '../clients/client-form';
import { CarForm } from '../clients/car-form';
import { L, locale } from '../../core/i18n';

export interface OrderPrefill {
  clientId?: string;
  carId?: string;
  postId?: string;
  start?: string;
}

/** Новий наряд (запис): клієнт і авто, скарга, роботи з довідника, пост і час з перевіркою конфліктів */
@Component({
  selector: 'tk-order-create',
  imports: [Icon, FormField, TextField, Combobox, Select, Stepper, DatePicker, TimePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    <div class="dlg-head items-center!">
      <h2 class="flex-1" id="oc-h">{{ L('Новий наряд', 'New work order') }}</h2>
      <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="L('Закрити', 'Close')" (click)="requestClose()"><svg [lucideIcon]="I.x" aria-hidden="true"></svg></button>
    </div>
    <form class="flex min-h-0 flex-1 flex-col" novalidate (submit)="$event.preventDefault(); save()" aria-labelledby="oc-h">
      <div class="dlg-body grid gap-x-5 gap-y-4 md:grid-cols-2">
        <div class="flex flex-col gap-4">
          <tk-field forId="oc-client" [label]="L('Клієнт', 'Customer')" [required]="true" [error]="err('client')">
            <tk-combobox
              inputId="oc-client"
              [options]="clientOptions()"
              [(value)]="clientId"
              [icon]="I.user"
              [placeholder]="L('Ім’я, телефон або номер авто', 'Name, phone or number plate')"
              [createLabel]="L('Новий клієнт', 'New customer')"
              [invalid]="!!err('client')"
              describedBy="oc-client-err"
              (create)="newClient($event)"
            />
          </tk-field>

          <tk-field forId="oc-car" [label]="L('Авто', 'Car')" [required]="true" [error]="err('car')">
            <div class="flex gap-2">
              <tk-select class="flex-1" inputId="oc-car" [options]="carOptions()" [(value)]="carId" [disabled]="!clientId()" [placeholder]="clientId() ? (carOptions().length ? L('Оберіть авто', 'Choose a car') : L('У клієнта немає авто', 'The customer has no cars')) : L('Спершу оберіть клієнта', 'Choose a customer first')" [invalid]="!!err('car')" describedBy="oc-car-err" />
              <button type="button" class="btn btn-icon h-9!" [attr.aria-label]="L('Додати авто клієнту', 'Add a car for the customer')" [disabled]="!clientId()" (click)="newCar()"><svg [lucideIcon]="I.plus" aria-hidden="true"></svg></button>
            </div>
          </tk-field>

          <tk-field forId="oc-complaint" [label]="L('Скарга або побажання', 'Complaint or request')">
            <tk-text-field inputId="oc-complaint" [multiline]="true" [rows]="2" [maxLength]="300" [(value)]="complaint" [placeholder]="L('Стукіт спереду на нерівностях', 'Knocking from the front over bumps')" />
          </tk-field>

          <tk-field forId="oc-work" [label]="L('Роботи', 'Jobs')" [hint]="works().length ? null : L('Можна додати пізніше в наряді', 'You can add them later in the work order')">
            <tk-combobox inputId="oc-work" [options]="workOptions()" [resetOnPick]="true" [icon]="I.wrench" [placeholder]="L('Код або назва: ТО-01, колодки…', 'Code or name: SV-01, pads…')" (selected)="addWork($event.value)" />
          </tk-field>
          @if (works().length) {
            <ul class="-mt-2 m-0 flex list-none flex-col gap-1 p-0" [attr.aria-label]="L('Обрані роботи', 'Selected jobs')">
              @for (w of works(); track w.id) {
                <li class="flex items-center gap-2 rounded-md bg-subtle py-1 pr-1 pl-2.5 text-[13px]">
                  <span class="text-xs text-ink-3 mono">{{ w.code }}</span>
                  <span class="truncate-1 flex-1">{{ w.name }}</span>
                  <span class="text-xs text-ink-2 num">{{ hours(w.hours) }}</span>
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="L('Прибрати ', 'Remove ') + w.name" (click)="removeWork(w.id)"><svg [lucideIcon]="I.x" [size]="14" aria-hidden="true"></svg></button>
                </li>
              }
              <li class="px-2.5 pt-1 text-xs text-ink-2">{{ L('Разом', 'Total') }} {{ hours(totalHours()) }}, {{ L('орієнтовно', 'about') }} {{ money(estimate()) }}</li>
            </ul>
          }
        </div>

        <div class="flex flex-col gap-4">
          <div class="grid grid-cols-2 gap-3">
            <tk-field forId="oc-branch" [label]="L('Філія', 'Branch')">
              <tk-select inputId="oc-branch" [options]="branchOptions()" [(value)]="branchId" />
            </tk-field>
            <tk-field forId="oc-post" [label]="L('Пост', 'Bay')" [error]="err('post')">
              <tk-select inputId="oc-post" [options]="postOptions()" [(value)]="postId" [placeholder]="L('Без поста', 'No bay')" [clearable]="true" />
            </tk-field>
            <tk-field forId="oc-date" [label]="L('Дата', 'Date')" [error]="err('date')">
              <tk-date-picker inputId="oc-date" [(value)]="date" [min]="today" [invalid]="!!err('date')" describedBy="oc-date-err" />
            </tk-field>
            <tk-field forId="oc-time" [label]="L('Час', 'Time')" [error]="err('time')">
              <tk-time-picker inputId="oc-time" [(value)]="time" [from]="hours0()" [to]="hours1()" [busy]="busySlots()" [invalid]="!!err('time')" describedBy="oc-time-err" />
            </tk-field>
            <tk-field forId="oc-dur" [label]="L('Тривалість', 'Duration')" [hint]="duration() >= 60 ? fmtDur(duration()) : null">
              <tk-stepper inputId="oc-dur" [(value)]="duration" [min]="15" [max]="600" [step]="15" [suffix]="L('хв', 'min')" />
            </tk-field>
            <tk-field forId="oc-mech" [label]="L('Механік', 'Mechanic')">
              <tk-select inputId="oc-mech" [options]="mechOptions()" [(value)]="mechanicId" [placeholder]="L('Не призначено', 'Not assigned')" [clearable]="true" />
            </tk-field>
          </div>

          @if (postId() && date() && time()) {
            @if (conflicts().length) {
              <div class="animate-fade rounded-lg border border-line bg-danger-soft p-3 text-[13px] text-danger" role="alert">
                @for (c of conflicts(); track $index) {
                  <div class="flex gap-2"><svg [lucideIcon]="I.alert" class="mt-0.5 flex-none" aria-hidden="true"></svg>{{ c.text }}</div>
                }
                @if (suggested(); as s) {
                  <button type="button" class="btn btn-sm mt-2" (click)="applySlot(s)">{{ L('Найближчий вільний:', 'Next free slot:') }} {{ slotLabel(s) }}</button>
                }
              </div>
            } @else {
              <div class="animate-fade flex gap-2 rounded-lg bg-success-soft p-3 text-[13px] text-success" role="status">
                <svg [lucideIcon]="I.circleCheck" class="mt-0.5 flex-none" aria-hidden="true"></svg>{{ L('Пост вільний, механік не зайнятий', 'The bay is free and the mechanic is available') }}
              </div>
            }
          }
        </div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">{{ L('Скасувати', 'Cancel') }}</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()" [attr.aria-busy]="saving()">
          @if (saving()) {
            <svg [lucideIcon]="I.loader" class="animate-spin" aria-hidden="true"></svg>
          }
          {{ L('Створити наряд', 'Create work order') }}
        </button>
      </div>
    </form>
  `,
})
export class OrderCreateDialog extends FormDialog<string> {
  protected readonly L = L;
  protected readonly I = I;
  private readonly db = inject(DbService);
  private readonly orders = inject(OrdersService);
  private readonly schedule = inject(ScheduleService);
  private readonly ctx = inject(AppContext);
  private readonly pre = inject<OrderPrefill>(DIALOG_DATA) ?? {};
  protected readonly today = ymd(new Date());
  protected readonly hours = fmtHours;
  protected readonly money = fmtMoney;
  protected readonly fmtDur = fmtDuration;

  protected readonly clientId = signal<string | null>(this.pre.clientId ?? this.db.cars.get(this.pre.carId)?.clientId ?? null);
  protected readonly carId = signal<string | null>(this.pre.carId ?? null);
  protected readonly complaint = signal('');
  protected readonly workIds = signal<string[]>([]);
  protected readonly branchId = signal<string | null>(this.db.posts.get(this.pre.postId)?.branchId ?? this.ctx.branchId());
  protected readonly postId = signal<string | null>(this.pre.postId ?? null);
  protected readonly date = signal<string | null>(this.pre.start ? ymd(new Date(this.pre.start)) : null);
  protected readonly time = signal<string | null>(this.pre.start ? minToHHMM(new Date(this.pre.start).getHours() * 60 + new Date(this.pre.start).getMinutes()) : null);
  protected readonly duration = signal(60);
  protected readonly mechanicId = signal<string | null>(null);
  private durationTouched = false;

  protected readonly clientOptions = computed<Option<string>[]>(() => {
    const plates = new Map<string, string[]>();
    for (const c of this.db.cars.items()) plates.set(c.clientId, [...(plates.get(c.clientId) ?? []), c.plate]);
    return this.db.clients.items().map((c) => ({ value: c.id, label: c.name, hint: fmtPhone(c.phone), keywords: `${c.phone} ${(plates.get(c.id) ?? []).join(' ')}` }));
  });
  protected readonly carOptions = computed<Option<string>[]>(() =>
    this.db.cars
      .items()
      .filter((c) => c.clientId === this.clientId())
      .map((c) => ({ value: c.id, label: `${c.make} ${c.model}`, hint: formatPlate(c.plate) })),
  );
  protected readonly workOptions = computed<Option<string>[]>(() => {
    const cats = new Map((this.db.settings()?.categories ?? []).map((c) => [c.id, c.name]));
    return this.db.works
      .items()
      .filter((w) => !this.workIds().includes(w.id))
      .map((w) => ({ value: w.id, label: w.name, hint: `${w.code} · ${fmtHours(w.hours)}`, keywords: w.code, group: cats.get(w.categoryId) }));
  });
  protected readonly works = computed(() => this.workIds().map((id) => this.db.works.get(id)).filter((w): w is Work => !!w));
  protected readonly totalHours = computed(() => this.works().reduce((s, w) => s + w.hours, 0));
  protected readonly estimate = computed(() => this.works().reduce((s, w) => s + w.hours * this.orders.rateFor(w, this.postId()), 0));

  protected readonly branchOptions = computed<Option<string>[]>(() => this.db.branches.items().map((b) => ({ value: b.id, label: b.name })));
  protected readonly postOptions = computed<Option<string>[]>(() =>
    this.db.posts
      .items()
      .filter((p) => p.branchId === this.branchId() && p.active)
      .map((p) => ({ value: p.id, label: p.name })),
  );
  protected readonly mechOptions = computed<Option<string>[]>(() =>
    this.db.employees
      .items()
      .filter((e) => e.role === 'mechanic' && e.active && e.branchId === this.branchId())
      .map((e) => ({ value: e.id, label: e.name })),
  );
  private readonly branch = computed(() => this.db.branches.get(this.branchId()));
  protected readonly hours0 = computed(() => this.branch()?.opensAt ?? '08:00');
  protected readonly hours1 = computed(() => this.branch()?.closesAt ?? '20:00');

  protected readonly startIso = computed(() => {
    const d = this.date();
    const t = this.time();
    if (!d || !t) return null;
    return new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)), Number(t.slice(0, 2)), Number(t.slice(3, 5))).toISOString();
  });
  protected readonly conflicts = computed(() =>
    this.schedule.conflicts({ postId: this.postId(), start: this.startIso(), durationMin: this.duration(), mechanicId: this.mechanicId() }),
  );
  protected readonly suggested = computed(() => {
    if (!this.postId() || !this.conflicts().length) return null;
    const d = this.date();
    const from = d && d > this.today ? new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) : new Date();
    return this.schedule.nextFree(this.postId()!, this.duration(), from);
  });
  /** Часові слоти, що перетинаються з іншими нарядами на посту */
  protected readonly busySlots = computed(() => {
    const p = this.postId();
    const d = this.date();
    if (!p || !d) return [];
    const out: string[] = [];
    for (const o of this.db.orders.items()) {
      if (o.postId !== p || !o.start || o.status === 'skasovano' || ymd(new Date(o.start)) !== d) continue;
      const s = new Date(o.start);
      for (let m = s.getHours() * 60 + s.getMinutes(); m < s.getHours() * 60 + s.getMinutes() + o.durationMin; m += 15) out.push(minToHHMM(m));
    }
    return out;
  });

  constructor() {
    super();
    // перше авто клієнта — за замовчуванням
    effect(() => {
      const opts = this.carOptions();
      untracked(() => {
        if (!opts.some((o) => o.value === this.carId())) this.carId.set(opts.length === 1 ? opts[0].value : null);
      });
    });
    // механік поста за замовчуванням — той, хто працював на ньому сьогодні; тривалість — за роботами
    effect(() => {
      const h = this.totalHours();
      if (!this.durationTouched && h) untracked(() => this.duration.set(Math.max(30, Math.ceil((h * 60) / 15) * 15)));
    });
    effect(() => {
      const p = this.postId();
      untracked(() => {
        if (!p || this.mechanicId()) return;
        const last = this.db.orders.items().find((o) => o.postId === p && o.mechanicId);
        if (last && this.mechOptions().some((m) => m.value === last.mechanicId)) this.mechanicId.set(last.mechanicId);
      });
    });
    effect(() => {
      this.branchId();
      untracked(() => {
        if (this.postId() && !this.postOptions().some((o) => o.value === this.postId())) this.postId.set(null);
      });
    });
    this.markPristine();
  }

  protected addWork(id: string): void {
    this.workIds.set([...this.workIds(), id]);
  }
  protected removeWork(id: string): void {
    this.workIds.set(this.workIds().filter((x) => x !== id));
  }

  protected slotLabel(iso: string): string {
    const d = new Date(iso);
    const day = ymd(d) === this.today ? L('сьогодні', 'today') : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    return `${day}, ${minToHHMM(d.getHours() * 60 + d.getMinutes())}`;
  }
  protected applySlot(iso: string): void {
    const d = new Date(iso);
    this.date.set(ymd(d));
    this.time.set(minToHHMM(d.getHours() * 60 + d.getMinutes()));
  }

  protected async newClient(name: string): Promise<void> {
    const ref = this.dialogs.open(ClientForm, { name }, { drawer: true, label: L('Новий клієнт', 'New customer') });
    const id = await firstValueFrom(ref.closed);
    if (typeof id === 'string') {
      this.clientId.set(id);
      this.newCar();
    }
  }

  protected async newCar(): Promise<void> {
    const ref = this.dialogs.open(CarForm, { clientId: this.clientId()! }, { drawer: true, label: L('Нове авто', 'New car') });
    const id = await firstValueFrom(ref.closed);
    if (typeof id === 'string') this.carId.set(id);
  }

  protected snapshot() {
    this.durationTouched = this.duration() !== Math.max(30, Math.ceil((this.totalHours() * 60) / 15) * 15) && this.totalHours() > 0;
    return [this.clientId(), this.carId(), this.complaint(), this.workIds(), this.postId(), this.date(), this.time(), this.mechanicId()];
  }

  protected errors() {
    const hard = this.conflicts().find((c) => c.kind === 'overlap' || c.kind === 'dayoff');
    return {
      client: this.clientId() ? null : L('Оберіть або створіть клієнта', 'Choose or create a customer'),
      car: this.carId() ? null : L('Оберіть авто', 'Choose a car'),
      date: this.postId() && !this.date() ? L('Оберіть дату', 'Choose a date') : null,
      time: this.postId() && this.date() && !this.time() ? L('Оберіть час', 'Choose a time') : hard ? hard.text : null,
    };
  }

  protected save(): Promise<void> {
    return this.submit(async () => {
      const o = await this.orders.create({
        branchId: this.branchId() ?? this.ctx.branchId()!,
        clientId: this.clientId()!,
        carId: this.carId()!,
        postId: this.postId(),
        start: this.postId() ? this.startIso() : null,
        durationMin: this.duration(),
        mechanicId: this.mechanicId(),
        complaint: this.complaint().trim(),
        workIds: this.workIds(),
      });
      this.toast.success(L(`Наряд ${o.number} створено`, `Work order ${o.number} created`));
      return o.id;
    });
  }
}
