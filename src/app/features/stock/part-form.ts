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
import { L, unitLabel } from '../../core/i18n';

/** Картка запчастини: артикул, бренд, кроси, застосовність, ціни, мінімальний залишок */
@Component({
  selector: 'tk-part-form',
  imports: [Icon, FormField, TextField, Select, Stepper, TagInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="dlg-head items-center!">
      <h2 class="flex-1">{{ editId ? L('Запчастина', 'Part') : L('Нова запчастина', 'New part') }}</h2>
      <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="L('Закрити', 'Close')" (click)="requestClose()"><svg [lucideIcon]="I.x" aria-hidden="true"></svg></button>
    </div>
    <form class="flex min-h-0 flex-1 flex-col" novalidate (submit)="$event.preventDefault(); save()">
      <div class="dlg-body flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-3">
          <tk-field forId="pf-sku" [label]="L('Артикул', 'SKU')" [required]="true" [error]="err('sku')">
            <tk-text-field inputId="pf-sku" [mono]="true" [(value)]="sku" placeholder="W 712/95" [maxLength]="30" [invalid]="!!err('sku')" />
          </tk-field>
          <tk-field forId="pf-brand" [label]="L('Бренд', 'Brand')" [required]="true" [error]="err('brand')">
            <tk-text-field inputId="pf-brand" [(value)]="brand" placeholder="MANN-FILTER" [maxLength]="30" [invalid]="!!err('brand')" />
          </tk-field>
        </div>
        <tk-field forId="pf-name" [label]="L('Назва', 'Name')" [required]="true" [error]="err('name')">
          <tk-text-field inputId="pf-name" [(value)]="name" [placeholder]="L('Фільтр оливний', 'Oil filter')" [maxLength]="80" [invalid]="!!err('name')" />
        </tk-field>
        <div class="grid grid-cols-2 gap-3">
          <tk-field forId="pf-cost" [label]="L('Закупівля', 'Cost')" [error]="err('cost')">
            <tk-text-field inputId="pf-cost" mask="money" suffix="₴" [(value)]="cost" />
          </tk-field>
          <tk-field forId="pf-price" [label]="L('Роздріб', 'Retail')" [required]="true" [error]="err('price')" [hint]="margin()">
            <tk-text-field inputId="pf-price" mask="money" suffix="₴" [(value)]="price" [invalid]="!!err('price')" />
          </tk-field>
          <tk-field forId="pf-unit" [label]="L('Одиниця', 'Unit')">
            <tk-select inputId="pf-unit" [options]="units" [(value)]="unit" />
          </tk-field>
          <tk-field forId="pf-min" [label]="L('Мінімальний залишок', 'Minimum stock')" [hint]="L('Нижче — сповіщення й чернетка замовлення', 'Below it — a notification and a purchase order draft')">
            <tk-stepper inputId="pf-min" [(value)]="minStock" [min]="0" [max]="999" />
          </tk-field>
        </div>
        <tk-field forId="pf-sup" [label]="L('Постачальник', 'Supplier')">
          <tk-select inputId="pf-sup" [options]="suppliers()" [(value)]="supplierId" [placeholder]="L('Не вказано', 'Not set')" [clearable]="true" />
        </tk-field>
        <tk-field forId="pf-cross" [label]="L('Кросс-номери (аналоги)', 'Cross-references (equivalents)')">
          <tk-tag-input inputId="pf-cross" [(tags)]="cross" />
        </tk-field>
        <tk-field forId="pf-fits" [label]="L('Застосовність', 'Fits')" [hint]="L('Порожньо — універсальна', 'Empty — universal')">
          <tk-tag-input inputId="pf-fits" [(tags)]="fits" [suggestions]="models()" />
        </tk-field>
        @if (stockRows().length) {
          <div>
            <h3 class="m-0 mb-2 text-[13px] font-medium text-ink-2">{{ L('Залишки по філіях', 'Stock by branch') }}</h3>
            <dl class="m-0 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-[13px]">
              @for (r of stockRows(); track r.name) {
                <dt>{{ r.name }}</dt><dd class="m-0 text-right num">{{ r.stock }} {{ L('на складі', 'in stock') }}</dd><dd class="m-0 text-right text-ink-3 num">{{ r.reserved }} {{ L('в резерві', 'reserved') }}</dd>
              }
            </dl>
            <p class="mt-1.5 mb-0 text-xs text-ink-3">{{ L('Залишки змінюються лише операціями: надходження, списання, переміщення, видача в наряд.', 'Stock changes only through operations: receipt, write-off, transfer, issue to a work order.') }}</p>
          </div>
        }
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">{{ L('Скасувати', 'Cancel') }}</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ editId ? L('Зберегти', 'Save') : L('Додати запчастину', 'Add part') }}</button>
      </div>
    </form>
  `,
})
export class PartForm extends FormDialog<string> {
  protected readonly L = L;
  protected readonly I = I;
  private readonly db = inject(DbService);
  private readonly data = inject<{ id?: string }>(DIALOG_DATA) ?? {};
  protected readonly editId = this.data.id ?? null;
  protected readonly units: Option<Part['unit']>[] = (['шт', 'компл', 'л', 'м'] as const).map((u) => ({ value: u, label: unitLabel(u) }));
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
    return c && p ? `${L('Націнка', 'Markup')} ${fmtPct(((p - c) / c) * 100)}` : null;
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
      sku: !this.sku().trim() ? L('Введіть артикул', 'Enter the SKU') : dup ? L('Така запчастина вже є в каталозі', 'This part is already in the catalogue') : null,
      brand: this.brand().trim() ? null : L('Введіть бренд', 'Enter the brand'),
      name: this.name().trim() ? null : L('Введіть назву', 'Enter the name'),
      price: !Number(this.price() || 0) ? L('Вкажіть ціну', 'Enter the price') : Number(this.price()) < Number(this.cost() || 0) ? L('Роздрібна ціна нижча за закупівельну', 'The retail price is below cost') : null,
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
        await this.db.parts.update(this.editId, payload, { log: L(`Змінено ${payload.brand} ${payload.sku}`, `${payload.brand} ${payload.sku} changed`) });
        this.toast.success(L('Запчастину збережено', 'Part saved'));
        return this.editId;
      }
      const p = await this.db.parts.create({ ...payload, stock: {}, reserved: {} }, { log: L(`Нова запчастина ${payload.brand} ${payload.sku}`, `New part ${payload.brand} ${payload.sku}`) });
      this.toast.success(L(`${p.brand} ${p.sku} додано. Оформіть надходження, щоб з’явився залишок`, `${p.brand} ${p.sku} added. Record a receipt to get stock`));
      return p.id;
    });
  }
}
