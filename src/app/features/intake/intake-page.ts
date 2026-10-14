import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DbService } from '../../core/data/db.service';
import { BodyZone, Damage, DamageKind, IntakeAct } from '../../core/data/models';
import { newId, nowIso } from '../../core/data/util';
import { ZONE_LABEL, DAMAGE_LABEL, DAMAGE_COLOR } from '../../core/domain/body';
import { OrdersService } from '../../core/domain/orders.service';
import { ToastService } from '../../core/ui/toast.service';
import { TorkTitleStrategy } from '../../core/ui/title.strategy';
import { HasUnsaved } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { EmptyState } from '../../shared/ui/states';
import { Plate } from '../../shared/ui/display';
import { FormField } from '../../shared/ui/form-field';
import { TextField } from '../../shared/ui/text-field';
import { Slider } from '../../shared/ui/slider';
import { Checkbox, RadioGroup } from '../../shared/ui/checkbox';
import { Stepper } from '../../shared/ui/stepper';
import { Select } from '../../shared/ui/select';
import { PhotoUpload } from '../../shared/ui/photo-upload';
import { SignaturePad } from '../../shared/ui/signature-pad';
import { Option } from '../../shared/ui/option';
import { fmtDateTime, fmtKm } from '../../shared/format';
import { BodyDiagram } from './body-diagram';

type Kit = IntakeAct['kit'];
const KIT: { key: Exclude<keyof Kit, 'keys'>; label: string }[] = [
  { key: 'documents', label: 'Документи (техпаспорт)' },
  { key: 'spare', label: 'Запасне колесо' },
  { key: 'jack', label: 'Домкрат і ключ' },
  { key: 'firstAid', label: 'Аптечка' },
  { key: 'rugs', label: 'Килимки' },
];

/**
 * Акт прийому авто: схема кузова з пошкодженнями (вид, коментар, фото), пробіг, пальне,
 * комплектність, скарги, підпис клієнта. Збереження з незапису переводить наряд у «Прийом».
 */
@Component({
  selector: 'tk-intake-page',
  imports: [RouterLink, Icon, EmptyState, Plate, FormField, TextField, Slider, Checkbox, RadioGroup, Stepper, Select, PhotoUpload, SignaturePad, BodyDiagram],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!db.ready()) {
      <div class="skeleton mb-4 h-4 w-40"></div>
      <div class="skeleton mb-6 h-7 w-80"></div>
      <div class="grid gap-6 lg:grid-cols-[340px_1fr]"><div class="skeleton h-[520px]"></div><div class="skeleton h-[520px]"></div></div>
    } @else if (!order()) {
      <tk-empty art="orders" title="Наряд не знайдено"><a routerLink="/naryady" class="btn">До нарядів</a></tk-empty>
    } @else {
      @let o = order()!;
      <a [routerLink]="['/naryady', o.id]" class="mb-3 inline-flex items-center gap-1 rounded-md text-[13px] text-ink-2 hover:text-ink">
        <svg [lucideIcon]="I.arrowLeft" [size]="14" aria-hidden="true"></svg>Наряд {{ o.number }}
      </a>
      <header class="mb-5 flex flex-wrap items-end gap-3">
        <div class="min-w-0 flex-1 basis-72">
          <h1 class="m-0 text-[22px] leading-tight font-semibold">Акт прийому</h1>
          <p class="mt-1 mb-0 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            @if (car(); as c) {
              <tk-plate [value]="c.plate" />{{ c.make }} {{ c.model }}, {{ client()?.name }}
            }
            @if (o.intake?.signedAt) {
              <span class="badge badge-success">підписано {{ dt(o.intake!.signedAt!) }}</span>
            }
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a class="btn" [routerLink]="['/naryady', o.id, 'druk']" [queryParams]="{ forma: 'akt-pryiomu' }"><svg [lucideIcon]="I.printer" aria-hidden="true"></svg>Друк</a>
          <button type="button" class="btn btn-primary" [disabled]="saving()" [attr.aria-busy]="saving()" (click)="save()">
            @if (saving()) {
              <svg [lucideIcon]="I.loader" class="animate-spin" aria-hidden="true"></svg>
            }
            {{ o.status === 'zapys' ? 'Зберегти й прийняти авто' : 'Зберегти акт' }}
          </button>
        </div>
      </header>

      <div class="grid gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <!-- схема -->
        <section class="card p-4" aria-labelledby="dg-h">
          <h2 id="dg-h" class="m-0 mb-1 text-[15px] font-semibold">Стан кузова</h2>
          <p class="m-0 mb-3 text-xs text-ink-3">Натисніть деталь, щоб позначити пошкодження</p>
          <tk-body-diagram [damages]="damages()" [selected]="zone()" (pick)="selectZone($event)" />

          @if (zone(); as z) {
            <div class="animate-fade mt-4 rounded-lg border border-accent bg-accent-soft/40 p-3" role="region" [attr.aria-label]="'Пошкодження: ' + zoneLabel(z)">
              <div class="mb-2 flex items-center">
                <h3 class="m-0 flex-1 text-[13px] font-semibold">{{ zoneLabel(z) }}</h3>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Закрити" (click)="zone.set(null)"><svg [lucideIcon]="I.x" [size]="14" aria-hidden="true"></svg></button>
              </div>
              <tk-radio-group variant="segmented" ariaLabel="Вид пошкодження" [options]="kindOptions" [(value)]="kind" />
              <tk-text-field class="mt-2 block" size="sm" [(value)]="comment" placeholder="Коментар: 5 см, ліворуч від ручки" ariaLabel="Коментар до пошкодження" [maxLength]="120" (enter)="addDamage()" />
              <tk-photo-upload class="mt-2" [(photos)]="photo" [max]="1" label="Фото пошкодження" />
              <button type="button" class="btn btn-primary btn-sm mt-2 w-full" (click)="addDamage()"><svg [lucideIcon]="I.plus" aria-hidden="true"></svg>Додати: {{ kindLabel(kind() ?? 'scratch') }}</button>
            </div>
          }

          <h3 class="mt-5 mb-2 text-[13px] font-semibold">Зафіксовано <span class="text-ink-3 num">{{ damages().length }}</span></h3>
          <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
            @for (d of damages(); track d.id) {
              <li class="flex items-center gap-2 rounded-md bg-subtle px-2 py-1.5 text-[13px]">
                <span class="size-2.5 flex-none rounded-full" [style.background]="color(d.kind)" aria-hidden="true"></span>
                @if (d.photo) {
                  <img [src]="d.photo" alt="" class="size-7 rounded object-cover" />
                }
                <span class="min-w-0 flex-1">{{ kindLabel(d.kind) }}: {{ zoneLabel(d.zone).toLowerCase() }}@if (d.comment) {<span class="block truncate-1 text-xs text-ink-3">{{ d.comment }}</span>}</span>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Прибрати ' + kindLabel(d.kind) + ', ' + zoneLabel(d.zone)" (click)="removeDamage(d.id)"><svg [lucideIcon]="I.trash" [size]="14" aria-hidden="true"></svg></button>
              </li>
            } @empty {
              <li class="text-[13px] text-ink-3">Пошкоджень не виявлено</li>
            }
          </ul>
        </section>

        <div class="flex min-w-0 flex-col gap-5">
          <section class="card grid gap-4 p-4 sm:grid-cols-2" aria-labelledby="st-h">
            <h2 id="st-h" class="m-0 text-[15px] font-semibold sm:col-span-2">Пробіг і пальне</h2>
            <tk-field forId="in-km" label="Пробіг" [required]="true" [error]="kmError()" [hint]="lastKmHint()">
              <tk-text-field inputId="in-km" mask="money" suffix="км" [(value)]="km" [invalid]="!!kmError()" describedBy="in-km-err" />
            </tk-field>
            <div class="field">
              <span class="label" id="fuel-l">Пальне: <span class="num text-ink">{{ fuelText() }}</span></span>
              <div class="flex items-center gap-3 pt-1.5">
                <svg [lucideIcon]="I.fuel" class="flex-none text-ink-3" aria-hidden="true"></svg>
                <tk-slider class="flex-1" [(value)]="fuel" [step]="5" [ticks]="[25, 50, 75]" ariaLabel="Рівень пального" [valueText]="fuelValueText" [color]="fuel() <= 15 ? 'var(--danger)' : null" />
              </div>
              <div class="flex justify-between pl-7 text-[11px] text-ink-3" aria-hidden="true"><span>0</span><span>¼</span><span>½</span><span>¾</span><span>повний</span></div>
            </div>
          </section>

          <section class="card p-4" aria-labelledby="kit-h">
            <h2 id="kit-h" class="m-0 mb-3 text-[15px] font-semibold">Комплектність</h2>
            <div class="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
              @for (k of kitItems; track k.key) {
                <tk-checkbox [checked]="kit()[k.key]" (changed)="setKit(k.key, $event)">{{ k.label }}</tk-checkbox>
              }
              <div class="flex items-center gap-3">
                <span class="text-[13px]" id="keys-l">Ключів</span>
                <tk-stepper class="w-28" size="sm" [value]="kit().keys" [min]="0" [max]="5" ariaLabel="Кількість ключів" (changed)="setKeys($event)" />
              </div>
            </div>
          </section>

          <section class="card flex flex-col gap-4 p-4" aria-labelledby="cm-h">
            <h2 id="cm-h" class="m-0 text-[15px] font-semibold">Скарги й побажання клієнта</h2>
            <tk-text-field [multiline]="true" [rows]="3" [maxLength]="600" ariaLabel="Скарги клієнта" placeholder="Що турбує, коли проявляється, що вже робили" [(value)]="complaints" />
            <tk-field forId="in-recv" label="Прийняв">
              <tk-select inputId="in-recv" [options]="staffOptions()" [(value)]="receivedBy" />
            </tk-field>
          </section>

          <section class="card p-4" aria-labelledby="sg-h">
            <h2 id="sg-h" class="m-0 mb-1 text-[15px] font-semibold">Підпис клієнта</h2>
            <p class="m-0 mb-3 text-xs text-ink-2">Клієнт підтверджує стан авто, комплектність і згоду на діагностику.</p>
            <tk-signature-pad [(value)]="signature" />
          </section>
        </div>
      </div>
    }
    <p class="sr-only" aria-live="polite">{{ announce() }}</p>
  `,
})
export class IntakePage implements HasUnsaved {
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly orders = inject(OrdersService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly titles = inject(TorkTitleStrategy);
  readonly id = input.required<string>();
  protected readonly dt = fmtDateTime;
  protected readonly kitItems = KIT;
  protected readonly kindOptions: Option<DamageKind>[] = (['scratch', 'dent', 'chip', 'crack'] as DamageKind[]).map((k) => ({ value: k, label: DAMAGE_LABEL[k], dot: DAMAGE_COLOR[k] }));

  protected readonly order = computed(() => this.db.orders.get(this.id()));
  protected readonly car = computed(() => this.db.cars.get(this.order()?.carId));
  protected readonly client = computed(() => this.db.clients.get(this.order()?.clientId));
  protected readonly staffOptions = computed<Option<string>[]>(() =>
    this.db.employees
      .items()
      .filter((e) => e.branchId === this.order()?.branchId && e.role !== 'mechanic')
      .map((e) => ({ value: e.name, label: e.name })),
  );

  protected readonly damages = signal<Damage[]>([]);
  protected readonly km = signal('');
  protected readonly fuel = signal(50);
  protected readonly kit = signal<Kit>({ spare: true, jack: true, documents: true, keys: 1, rugs: true, firstAid: true });
  protected readonly complaints = signal('');
  protected readonly receivedBy = signal<string | null>(null);
  protected readonly signature = signal<string | null>(null);
  protected readonly zone = signal<BodyZone | null>(null);
  protected readonly kind = signal<DamageKind | null>('scratch');
  protected readonly comment = signal('');
  protected readonly photo = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly announce = signal('');
  private readonly tried = signal(false);
  private initial = '';

  protected readonly kmError = computed(() => {
    if (!this.tried()) return null;
    const v = Number(this.km() || 0);
    if (!v) return 'Вкажіть пробіг з одометра';
    const car = this.car();
    if (car && v < car.mileage - 5) return `Менше за попередній (${fmtKm(car.mileage)}) — перевірте`;
    return null;
  });
  protected readonly lastKmHint = computed(() => (this.car() ? `Попередній: ${fmtKm(this.car()!.mileage)}` : null));
  protected readonly fuelText = computed(() => this.fuelValueText(this.fuel()));
  protected readonly fuelValueText = (v: number) => (v === 0 ? 'порожній бак' : v === 100 ? 'повний бак' : `${v}%`);

  constructor() {
    let loaded = '';
    effect(() => {
      const o = this.order();
      if (!o || loaded === o.id) return;
      loaded = o.id;
      this.titles.set(`Акт прийому ${o.number}`);
      const a = o.intake;
      this.damages.set(a?.damages ?? []);
      this.km.set(a ? String(a.mileage) : o.mileage ? String(o.mileage) : '');
      this.fuel.set(a?.fuel ?? 50);
      if (a) this.kit.set(a.kit);
      this.complaints.set(a?.complaints || o.complaint);
      this.receivedBy.set(a?.receivedBy ?? this.staffOptions()[0]?.value ?? null);
      this.signature.set(a?.signature ?? null);
      this.initial = this.snap();
    });
  }

  private snap(): string {
    return JSON.stringify([this.damages(), this.km(), this.fuel(), this.kit(), this.complaints(), this.receivedBy(), this.signature()]);
  }
  hasUnsaved(): boolean {
    return !!this.order() && this.snap() !== this.initial;
  }

  protected zoneLabel(z: BodyZone): string {
    return ZONE_LABEL[z];
  }
  protected kindLabel(k: DamageKind): string {
    return DAMAGE_LABEL[k];
  }
  protected color(k: DamageKind): string {
    return DAMAGE_COLOR[k];
  }

  protected selectZone(z: BodyZone): void {
    this.zone.set(this.zone() === z ? null : z);
    this.comment.set('');
    this.photo.set([]);
  }
  protected addDamage(): void {
    const z = this.zone();
    if (!z) return;
    this.damages.update((d) => [...d, { id: newId('dm'), zone: z, kind: this.kind() ?? 'scratch', comment: this.comment().trim(), photo: this.photo()[0] ?? null }]);
    this.announce.set(`Додано: ${DAMAGE_LABEL[this.kind() ?? 'scratch']}, ${ZONE_LABEL[z].toLowerCase()}`);
    this.zone.set(null);
  }
  protected removeDamage(id: string): void {
    this.damages.update((d) => d.filter((x) => x.id !== id));
  }
  protected setKit(k: Exclude<keyof Kit, 'keys'>, v: boolean): void {
    this.kit.update((x) => ({ ...x, [k]: v }));
  }
  protected setKeys(v: number): void {
    this.kit.update((x) => ({ ...x, keys: v }));
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.tried.set(true);
    if (this.kmError()) {
      queueMicrotask(() => document.getElementById('in-km')?.focus());
      return;
    }
    const o = this.order()!;
    const mileage = Number(this.km());
    const act: IntakeAct = {
      mileage,
      fuel: this.fuel(),
      damages: this.damages(),
      kit: this.kit(),
      complaints: this.complaints().trim(),
      signature: this.signature(),
      signedAt: this.signature() ? (o.intake?.signature === this.signature() ? o.intake.signedAt : nowIso()) : null,
      receivedBy: this.receivedBy() ?? '',
    };
    this.saving.set(true);
    try {
      await this.db.orders.update(o.id, { intake: act, mileage }, { log: `${o.number}: акт прийому${act.signature ? ' підписано' : ' збережено'}` });
      if (o.status === 'zapys') await this.orders.setStatus(this.db.orders.get(o.id)!, 'pryiom');
      this.initial = this.snap();
      this.toast.success(o.status === 'zapys' ? `Авто прийнято, ${o.number} у статусі «Прийом»` : 'Акт прийому збережено', {
        label: 'До наряду',
        run: () => void this.router.navigate(['/naryady', o.id]),
      });
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.saving.set(false);
    }
  }
}
