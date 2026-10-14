import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { DbService } from '../../core/data/db.service';
import { Part } from '../../core/data/models';
import { FormDialog } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { FormField } from '../../shared/ui/form-field';
import { TextField } from '../../shared/ui/text-field';
import { Select } from '../../shared/ui/select';
import { Stepper } from '../../shared/ui/stepper';
import { TagInput } from '../../shared/ui/tag-input';
import { Option } from '../../shared/ui/option';
import { fmtPct } from '../../shared/format';

/** Картка запчастини: артикул, бренд, кроси, застосовність, ціни, мінімальний залишок */
@Component({
  selector: 'tk-part-form',
  imports: [Icon, FormField, TextField, Select, Stepper, TagInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="dlg-head items-center!">
      <h2 class="flex-1">{{ editId ? 'Запчастина' : 'Нова запчастина' }}</h2>
      <button type="button" class="btn btn-ghost btn-icon" aria-label="Закрити" (click)="requestClose()"><svg [lucideIcon]="I.x" aria-hidden="true"></svg></button>
    </div>
    <form class="flex min-h-0 flex-1 flex-col" novalidate (submit)="$event.preventDefault(); save()">
      <div class="dlg-body flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-3">
          <tk-field forId="pf-sku" label="Артикул" [required]="true" [error]="err('sku')">
            <tk-text-field inputId="pf-sku" [mono]="true" [(value)]="sku" placeholder="W 712/95" [maxLength]="30" [invalid]="!!err('sku')" />
          </tk-field>
          <tk-field forId="pf-brand" label="Бренд" [required]="true" [error]="err('brand')">
            <tk-text-field inputId="pf-brand" [(value)]="brand" placeholder="MANN-FILTER" [maxLength]="30" [invalid]="!!err('brand')" />
          </tk-field>
        </div>
        <tk-field forId="pf-name" label="Назва" [required]="true" [error]="err('name')">
          <tk-text-field inputId="pf-name" [(value)]="name" placeholder="Фільтр оливний" [maxLength]="80" [invalid]="!!err('name')" />
        </tk-field>
        <div class="grid grid-cols-2 gap-3">
          <tk-field forId="pf-cost" label="Закупівля" [error]="err('cost')">
            <tk-text-field inputId="pf-cost" mask="money" suffix="₴" [(value)]="cost" />
          </tk-field>
          <tk-field forId="pf-price" label="Роздріб" [required]="true" [error]="err('price')" [hint]="margin()">
            <tk-text-field inputId="pf-price" mask="money" suffix="₴" [(value)]="price" [invalid]="!!err('price')" />
          </tk-field>
          <tk-field forId="pf-unit" label="Одиниця">
            <tk-select inputId="pf-unit" [options]="units" [(value)]="unit" />
          </tk-field>
          <tk-field forId="pf-min" label="Мінімальний залишок" hint="Нижче — сповіщення й чернетка замовлення">
            <tk-stepper inputId="pf-min" [(value)]="minStock" [min]="0" [max]="999" />
          </tk-field>
        </div>
        <tk-field forId="pf-sup" label="Постачальник">
          <tk-select inputId="pf-sup" [options]="suppliers()" [(value)]="supplierId" placeholder="Не вказано" [clearable]="true" />
        </tk-field>
        <tk-field forId="pf-cross" label="Кросс-номери (аналоги)">
          <tk-tag-input inputId="pf-cross" [(tags)]="cross" />
        </tk-field>
        <tk-field forId="pf-fits" label="Застосовність" hint="Порожньо — універсальна">
          <tk-tag-input inputId="pf-fits" [(tags)]="fits" [suggestions]="models()" />
        </tk-field>
        @if (stockRows().length) {
          <div>
            <h3 class="m-0 mb-2 text-[13px] font-medium text-ink-2">Залишки по філіях</h3>
            <dl class="m-0 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-[13px]">
              @for (r of stockRows(); track r.name) {
                <dt>{{ r.name }}</dt><dd class="m-0 text-right num">{{ r.stock }} на складі</dd><dd class="m-0 text-right text-ink-3 num">{{ r.reserved }} в резерві</dd>
              }
            </dl>
            <p class="mt-1.5 mb-0 text-xs text-ink-3">Залишки змінюються лише операціями: надходження, списання, переміщення, видача в наряд.</p>
          </div>
        }
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">Скасувати</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ editId ? 'Зберегти' : 'Додати запчастину' }}</button>
      </div>
    </form>
  `,
})
export class PartForm extends FormDialog<string> {
  protected readonly I = I;
  private readonly db = inject(DbService);
  private readonly data = inject<{ id?: string }>(DIALOG_DATA) ?? {};
  protected readonly editId = this.data.id ?? null;
  protected readonly units: Option<Part['unit']>[] = (['шт', 'компл', 'л', 'м'] as const).map((u) => ({ value: u, label: u }));
  protected readonly suppliers = computed<Option<string>[]>(() => this.db.suppliers.items().map((s) => ({ value: s.id, label: s.name })));
  protected readonly models = computed(() => [...new Set(this.db.cars.items().map((c) => `${c.make} ${c.model.split(' ')[0]}`))].sort());

  protected readonly sku = signal('');
  protected readonly brand = signal('');
  protected readonly name = signal('');
  protected readonly cost = signal('');
  protected readonly price = signal('');
  protected readonly unit = signal<Part['unit'] | null>('шт');
  protected readonly minStock = signal(2);
  protected readonly supplierId = signal<string | null>(null);
  protected readonly cross = signal<string[]>([]);
  protected readonly fits = signal<string[]>([]);

  protected readonly margin = computed(() => {
    const c = Number(this.cost() || 0);
    const p = Number(this.price() || 0);
    return c && p ? `Націнка ${fmtPct(((p - c) / c) * 100)}` : null;
  });
  protected readonly stockRows = computed(() => {
    const p = this.db.parts.get(this.editId);
    return p ? this.db.branches.items().map((b) => ({ name: b.name, stock: p.stock[b.id] ?? 0, reserved: p.reserved[b.id] ?? 0 })) : [];
  });

  constructor() {
    super();
    const p = this.db.parts.get(this.editId);
    if (p) {
      this.sku.set(p.sku);
      this.brand.set(p.brand);
      this.name.set(p.name);
      this.cost.set(String(p.cost));
      this.price.set(String(p.price));
      this.unit.set(p.unit);
      this.minStock.set(p.minStock);
      this.supplierId.set(p.supplierId);
      this.cross.set(p.crossNumbers);
      this.fits.set(p.fits);
    }
    this.markPristine();
  }

  protected snapshot() {
    return [this.sku(), this.brand(), this.name(), this.cost(), this.price(), this.unit(), this.minStock(), this.supplierId(), this.cross(), this.fits()];
  }
  protected errors() {
    const dup = this.db.parts.items().find((p) => p.id !== this.editId && p.sku.toLowerCase() === this.sku().trim().toLowerCase() && p.brand.toLowerCase() === this.brand().trim().toLowerCase());
    return {
      sku: !this.sku().trim() ? 'Введіть артикул' : dup ? 'Така запчастина вже є в каталозі' : null,
      brand: this.brand().trim() ? null : 'Введіть бренд',
      name: this.name().trim() ? null : 'Введіть назву',
      price: !Number(this.price() || 0) ? 'Вкажіть ціну' : Number(this.price()) < Number(this.cost() || 0) ? 'Роздрібна ціна нижча за закупівельну' : null,
    };
  }
  protected save(): Promise<void> {
    return this.submit(async () => {
      const payload = {
        sku: this.sku().trim(),
        brand: this.brand().trim(),
        name: this.name().trim(),
        cost: Number(this.cost() || 0),
        price: Number(this.price()),
        unit: this.unit() ?? 'шт',
        minStock: this.minStock(),
        supplierId: this.supplierId(),
        crossNumbers: this.cross(),
        fits: this.fits(),
      };
      if (this.editId) {
        await this.db.parts.update(this.editId, payload, { log: `Змінено ${payload.brand} ${payload.sku}` });
        this.toast.success('Запчастину збережено');
        return this.editId;
      }
      const p = await this.db.parts.create({ ...payload, stock: {}, reserved: {} }, { log: `Нова запчастина ${payload.brand} ${payload.sku}` });
      this.toast.success(`${p.brand} ${p.sku} додано. Оформіть надходження, щоб з’явився залишок`);
      return p.id;
    });
  }
}
