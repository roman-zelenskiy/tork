import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { DbService } from '../../core/data/db.service';
import { ClientsService } from '../../core/domain/clients.service';
import { VinDecoded, VIN_DB, checkVin, decodeVin } from '../../core/data/vin';
import { formatPlate, isValidPlate, PLATE_REGIONS } from '../../core/data/plates';
import { FormDialog } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { FormField } from '../../shared/ui/form-field';
import { TextField } from '../../shared/ui/text-field';
import { Combobox } from '../../shared/ui/combobox';
import { Select } from '../../shared/ui/select';
import { Stepper } from '../../shared/ui/stepper';
import { Option } from '../../shared/ui/option';
import { MakeLogo } from '../../shared/ui/make-logo';
import { fmtPhone } from '../../shared/format';
import { L } from '../../core/i18n';

const COLORS = L(
  ['Білий', 'Чорний', 'Сірий', 'Сріблястий', 'Синій', 'Червоний', 'Зелений', 'Бежевий', 'Коричневий', 'Інший'],
  ['White', 'Black', 'Grey', 'Silver', 'Blue', 'Red', 'Green', 'Beige', 'Brown', 'Other'],
);
/** Марка поза списком декодера */
const OTHER_MAKE = L('Інша', 'Other');
export const KNOWN_MAKES = [...new Set(VIN_DB.map((m) => m.make))].sort();

/** Додавання/редагування авто: VIN розбирається автоматично, номер і VIN перевіряються на унікальність */
@Component({
  selector: 'tk-car-form',
  imports: [Icon, FormField, TextField, Combobox, Select, Stepper, MakeLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="dlg-head items-center!">
      <h2 class="flex-1" id="car-h">{{ editId ? L('Редагувати авто', 'Edit car') : L('Нове авто', 'New car') }}</h2>
      <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="L('Закрити', 'Close')" (click)="requestClose()">
        <svg [lucideIcon]="I.x" aria-hidden="true"></svg>
      </button>
    </div>
    <form class="flex min-h-0 flex-1 flex-col" novalidate (submit)="$event.preventDefault(); save()" aria-labelledby="car-h">
      <div class="dlg-body flex flex-col gap-4">
        @if (!fixedClient) {
          <tk-field forId="car-client" [label]="L('Власник', 'Owner')" [required]="true" [error]="err('client')">
            <tk-combobox
              inputId="car-client"
              [options]="clientOptions()"
              [(value)]="clientId"
              [icon]="I.user"
              [placeholder]="L('Ім’я або телефон', 'Name or phone')"
              [invalid]="!!err('client')"
              describedBy="car-client-err"
            />
          </tk-field>
        }

        <tk-field forId="car-vin" label="VIN" [required]="true" [error]="err('vin') ?? vinLiveError()" [hint]="vinHint()">
          <tk-text-field inputId="car-vin" mask="vin" [(value)]="vin" [icon]="I.scan" [invalid]="!!(err('vin') ?? vinLiveError())" describedBy="car-vin-err" />
        </tk-field>

        @if (decoded(); as d) {
          <div class="animate-fade flex items-start gap-3 rounded-lg border border-line bg-subtle p-3" role="status">
            <tk-make-logo [make]="d.make" [size]="36" />
            <div class="min-w-0 flex-1 text-[13px]">
              <div class="font-semibold">{{ d.make }} {{ d.model || L('— модель не розпізнано', '— model not recognised') }} {{ d.year ?? '' }}</div>
              <div class="text-ink-2">{{ specLine(d) }}</div>
            </div>
            <button type="button" class="btn btn-sm" (click)="applyDecoded(d)">{{ L('Заповнити', 'Fill in') }}</button>
          </div>
        }

        <tk-field forId="car-plate" [label]="L('Держномер', 'Number plate')" [required]="true" [error]="err('plate')" [hint]="plateHint()">
          <tk-text-field inputId="car-plate" mask="plate" [(value)]="plate" [invalid]="!!err('plate')" describedBy="car-plate-err" />
        </tk-field>

        <div class="grid gap-4 sm:grid-cols-2">
          <tk-field forId="car-make" [label]="L('Марка', 'Make')" [required]="true" [error]="err('make')">
            <tk-select inputId="car-make" [options]="makeOptions" [(value)]="make" [invalid]="!!err('make')" describedBy="car-make-err" />
          </tk-field>
          <tk-field forId="car-model" [label]="L('Модель', 'Model')" [required]="true" [error]="err('model')">
            <tk-text-field inputId="car-model" [(value)]="model" placeholder="Octavia A7" [maxLength]="40" [invalid]="!!err('model')" describedBy="car-model-err" />
          </tk-field>
          <tk-field forId="car-year" [label]="L('Рік випуску', 'Year')" [error]="err('year')">
            <tk-stepper inputId="car-year" [(value)]="year" [min]="1980" [max]="maxYear" />
          </tk-field>
          <tk-field forId="car-mileage" [label]="L('Пробіг', 'Mileage')" [error]="err('mileage')">
            <tk-text-field inputId="car-mileage" mask="money" [suffix]="L('км', 'km')" [value]="mileageStr()" (valueChange)="mileageStr.set($event)" [invalid]="!!err('mileage')" describedBy="car-mileage-err" />
          </tk-field>
          <tk-field forId="car-engine" [label]="L('Двигун', 'Engine')">
            <tk-text-field inputId="car-engine" [(value)]="engine" [placeholder]="L('1.6 TDI, 110 к.с.', '1.6 TDI, 110 hp')" [maxLength]="40" />
          </tk-field>
          <tk-field forId="car-gearbox" [label]="L('КПП', 'Gearbox')">
            <tk-text-field inputId="car-gearbox" [(value)]="gearbox" [placeholder]="L('МКПП-5', 'MT-5')" [maxLength]="20" />
          </tk-field>
          <tk-field forId="car-color" [label]="L('Колір', 'Colour')">
            <tk-select inputId="car-color" [options]="colorOptions" [(value)]="color" [placeholder]="L('Оберіть колір', 'Choose a colour')" />
          </tk-field>
        </div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">{{ L('Скасувати', 'Cancel') }}</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()" [attr.aria-busy]="saving()">
          @if (saving()) {
            <svg [lucideIcon]="I.loader" class="animate-spin" aria-hidden="true"></svg>
          }
          {{ editId ? L('Зберегти зміни', 'Save changes') : L('Додати авто', 'Add car') }}
        </button>
      </div>
    </form>
  `,
})
export class CarForm extends FormDialog<string> {
  protected readonly L = L;
  protected readonly I = I;
  private readonly db = inject(DbService);
  private readonly clients = inject(ClientsService);
  private readonly data = inject<{ id?: string; clientId?: string }>(DIALOG_DATA) ?? {};
  protected readonly editId = this.data.id ?? null;
  protected readonly fixedClient = !!this.data.clientId || !!this.editId;
  protected readonly maxYear = new Date().getFullYear() + 1;

  protected readonly makeOptions: Option<string>[] = [...KNOWN_MAKES, OTHER_MAKE].map((m) => ({ value: m, label: m }));
  protected readonly colorOptions: Option<string>[] = COLORS.map((c) => ({ value: c, label: c }));
  protected readonly clientOptions = computed<Option<string>[]>(() =>
    this.db.clients.items().map((c) => ({ value: c.id, label: c.name, hint: fmtPhone(c.phone), keywords: c.phone })),
  );

  protected readonly clientId = signal<string | null>(this.data.clientId ?? null);
  protected readonly vin = signal('');
  protected readonly plate = signal('');
  protected readonly make = signal<string | null>(null);
  protected readonly model = signal('');
  protected readonly year = signal(new Date().getFullYear() - 6);
  protected readonly mileageStr = signal('');
  protected readonly engine = signal('');
  protected readonly gearbox = signal('');
  protected readonly color = signal<string | null>(null);

  protected readonly decoded = computed<VinDecoded | null>(() => (this.vin().length === 17 ? decodeVin(this.vin()) : null));
  private readonly dupVin = computed(() => this.clients.findByVin(this.vin(), this.editId ?? undefined));
  private readonly dupPlate = computed(() => this.clients.findByPlate(this.plate(), this.editId ?? undefined));

  protected readonly vinLiveError = computed(() => {
    const v = this.vin();
    if (v.length === 17) {
      const c = checkVin(v);
      if (!c.ok) return c.error;
      if (this.dupVin()) return L(`Цей VIN уже є: ${formatPlate(this.dupVin()!.plate)} ${this.dupVin()!.make}`, `This VIN is already on file: ${formatPlate(this.dupVin()!.plate)} ${this.dupVin()!.make}`);
    }
    return null;
  });
  protected readonly vinHint = computed(() =>
    this.vin().length === 17 && !this.decoded() && !this.vinLiveError()
      ? L('Виробника не знайдено в базі декодера — заповніть дані вручну', 'Manufacturer not found in the decoder database — fill in the details manually')
      : L('Латинські літери й цифри; I, O і Q у VIN не використовуються', 'Latin letters and digits; a VIN never uses I, O or Q'),
  );
  protected readonly plateHint = computed(() => {
    const p = this.plate();
    const region = PLATE_REGIONS[p.slice(0, 2)];
    return region && p.length >= 2 ? L(`Регіон: ${region}`, `Region: ${region}`) : L('Латиниця перетворюється на кирилицю автоматично', 'Ukrainian plate format, for example KA 4821 BI');
  });

  constructor() {
    super();
    const car = this.db.cars.get(this.editId);
    if (car) {
      this.clientId.set(car.clientId);
      this.vin.set(car.vin);
      this.plate.set(car.plate);
      this.make.set(car.make);
      this.model.set(car.model);
      this.year.set(car.year);
      this.mileageStr.set(String(car.mileage));
      this.engine.set(car.engine);
      this.gearbox.set(car.gearbox);
      this.color.set(car.color);
    }
    // новий VIN розпізнано — заповнюємо порожні поля
    effect(() => {
      const d = this.decoded();
      if (d && !this.editId) untracked(() => this.applyDecoded(d, true));
    });
    this.markPristine();
  }

  protected specLine(d: VinDecoded): string {
    return [d.engine, d.gearbox, d.country].filter(Boolean).join(', ');
  }

  protected applyDecoded(d: VinDecoded, onlyEmpty = false): void {
    if (!onlyEmpty || !this.make()) this.make.set(KNOWN_MAKES.includes(d.make) ? d.make : OTHER_MAKE);
    if (d.model && (!onlyEmpty || !this.model())) this.model.set(d.model);
    if (d.year && (!onlyEmpty || !this.editId)) this.year.set(d.year);
    if (d.engine && (!onlyEmpty || !this.engine())) this.engine.set(d.engine);
    if (d.gearbox && (!onlyEmpty || !this.gearbox())) this.gearbox.set(d.gearbox);
  }

  protected snapshot() {
    return [this.clientId(), this.vin(), this.plate(), this.make(), this.model(), this.year(), this.mileageStr(), this.engine(), this.gearbox(), this.color()];
  }

  protected errors() {
    const vinCheck = checkVin(this.vin());
    const km = Number(this.mileageStr() || 0);
    return {
      client: this.clientId() ? null : L('Оберіть власника', 'Choose an owner'),
      vin: !vinCheck.ok ? vinCheck.error : this.dupVin() ? L(`Цей VIN уже є: ${formatPlate(this.dupVin()!.plate)}`, `This VIN is already on file: ${formatPlate(this.dupVin()!.plate)}`) : null,
      plate: !this.plate()
        ? L('Введіть номер', 'Enter a number plate')
        : !isValidPlate(this.plate())
          ? L('Формат: КА 4821 ВІ — дві літери, чотири цифри, дві літери', 'Format: KA 4821 BI — two letters, four digits, two letters')
          : this.dupPlate()
            ? L(`Номер уже закріплено за ${this.dupPlate()!.make} ${this.dupPlate()!.model}`, `This plate already belongs to a ${this.dupPlate()!.make} ${this.dupPlate()!.model}`)
            : null,
      make: this.make() ? null : L('Оберіть марку', 'Choose a make'),
      model: this.model().trim() ? null : L('Введіть модель', 'Enter a model'),
      mileage: km > 2_000_000 ? L('Перевірте пробіг', 'Check the mileage') : null,
    };
  }

  protected save(): Promise<void> {
    return this.submit(async () => {
      const payload = {
        clientId: this.clientId()!,
        vin: this.vin(),
        plate: this.plate(),
        make: this.make()!,
        model: this.model().trim(),
        year: this.year(),
        engine: this.engine().trim(),
        gearbox: this.gearbox().trim(),
        color: this.color() ?? '',
        mileage: Number(this.mileageStr() || 0),
      };
      const label = `${formatPlate(payload.plate)} ${payload.make} ${payload.model}`;
      if (this.editId) {
        await this.db.cars.update(this.editId, payload, { log: L(`Змінено авто ${label}`, `Car ${label} changed`) });
        this.toast.success(L('Дані авто збережено', 'Car details saved'));
        return this.editId;
      }
      const car = await this.db.cars.create(
        { ...payload, owners: [{ clientId: payload.clientId, from: new Date().toISOString(), to: null }] },
        { log: L(`Додано авто ${label}`, `Car ${label} added`) },
      );
      this.toast.success(L(`Авто ${formatPlate(car.plate)} додано`, `Car ${formatPlate(car.plate)} added`));
      return car.id;
    });
  }
}
