import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { DbService } from '../../core/data/db.service';
import { Part } from '../../core/data/models';
import { StockService } from '../../core/domain/stock.service';
import { AppContext } from '../../core/ui/app-context.service';
import { FormDialog } from '../../shared/form';
import { I } from '../../shared/icons';
import { FormField } from '../../shared/ui/form-field';
import { TextField } from '../../shared/ui/text-field';
import { Select } from '../../shared/ui/select';
import { Stepper } from '../../shared/ui/stepper';
import { RadioGroup } from '../../shared/ui/checkbox';
import { Option } from '../../shared/ui/option';
import { L, unitLabel } from '../../core/i18n';

export type MoveKind = 'in' | 'writeoff' | 'transfer';
export const MOVE_LABEL: Record<MoveKind, string> = L(
  { in: 'Надходження', writeoff: 'Списання', transfer: 'Переміщення' },
  { in: 'Receipt', writeoff: 'Write-off', transfer: 'Transfer' },
);

/** Ручна операція складу: надходження, списання (брак, пересорт), переміщення між філіями */
@Component({
  selector: 'tk-move-dialog',
  imports: [FormField, TextField, Select, Stepper, RadioGroup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form novalidate (submit)="$event.preventDefault(); save()">
      <div class="dlg-head"><div><h2>{{ part.brand }} {{ part.sku }}</h2><p>{{ part.name }}</p></div></div>
      <div class="dlg-body flex flex-col gap-4">
        <tk-radio-group variant="segmented" [ariaLabel]="L('Операція', 'Operation')" [options]="kinds" [(value)]="kind" />
        <div class="grid grid-cols-2 gap-3">
          <tk-field forId="mv-br" [label]="kind() === 'transfer' ? L('Звідки', 'From') : L('Філія', 'Branch')">
            <tk-select inputId="mv-br" [options]="branches()" [(value)]="branchId" />
          </tk-field>
          @if (kind() === 'transfer') {
            <tk-field forId="mv-to" [label]="L('Куди', 'To')" [error]="err('to')">
              <tk-select inputId="mv-to" [options]="toBranches()" [(value)]="toId" [invalid]="!!err('to')" />
            </tk-field>
          }
          <tk-field forId="mv-qty" [label]="L('Кількість', 'Quantity')" [error]="err('qty')" [hint]="L('Доступно: ', 'Available: ') + available() + ' ' + unit">
            <tk-stepper inputId="mv-qty" [(value)]="qty" [min]="1" [max]="9999" [suffix]="unit" [invalid]="!!err('qty')" />
          </tk-field>
        </div>
        <tk-field forId="mv-note" [label]="kind() === 'writeoff' ? L('Причина списання', 'Write-off reason') : L('Коментар', 'Comment')" [required]="kind() === 'writeoff'" [error]="err('note')">
          <tk-text-field inputId="mv-note" [(value)]="note" [maxLength]="120" [placeholder]="kind() === 'in' ? L('Накладна № 2481 від Автодеталь-Схід', 'Invoice No. 2481 from Avtodetal-Skhid') : kind() === 'writeoff' ? L('Брак, пошкоджена упаковка', 'Defective, damaged packaging') : L('На запит Виноградаря', 'Requested by Vynohradar')" [invalid]="!!err('note')" />
        </tk-field>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">{{ L('Скасувати', 'Cancel') }}</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ label(kind() ?? 'in') }}: {{ qty() }} {{ unit }}</button>
      </div>
    </form>
  `,
})
export class MoveDialog extends FormDialog<boolean> {
  protected readonly L = L;
  protected readonly I = I;
  private readonly db = inject(DbService);
  private readonly stock = inject(StockService);
  private readonly ctx = inject(AppContext);
  private readonly data = inject<{ part: Part; kind?: MoveKind }>(DIALOG_DATA);
  protected readonly part = this.data.part;
  protected readonly unit = unitLabel(this.data.part.unit);
  protected readonly kinds: Option<MoveKind>[] = (['in', 'writeoff', 'transfer'] as MoveKind[]).map((k) => ({ value: k, label: MOVE_LABEL[k] }));
  protected readonly kind = signal<MoveKind | null>(this.data.kind ?? 'in');
  protected readonly branchId = signal<string | null>(this.ctx.branchId());
  protected readonly toId = signal<string | null>(null);
  protected readonly qty = signal(1);
  protected readonly note = signal('');
  protected readonly branches = computed<Option<string>[]>(() => this.db.branches.items().map((b) => ({ value: b.id, label: b.name })));
  protected readonly toBranches = computed(() => this.branches().filter((b) => b.value !== this.branchId()));
  protected readonly available = computed(() => this.stock.available(this.db.parts.get(this.part.id) ?? this.part, this.branchId() ?? ''));

  constructor() {
    super();
    this.markPristine();
  }
  protected label(k: MoveKind): string {
    return MOVE_LABEL[k];
  }
  protected snapshot() {
    return [this.kind(), this.branchId(), this.toId(), this.qty(), this.note()];
  }
  protected errors() {
    const out = this.kind() !== 'in';
    return {
      qty: out && this.qty() > this.available() ? L(`Доступно лише ${this.available()} ${this.part.unit}`, `Only ${this.available()} ${unitLabel(this.part.unit)} available`) : null,
      to: this.kind() === 'transfer' && !this.toId() ? L('Оберіть філію', 'Choose a branch') : null,
      note: this.kind() === 'writeoff' && !this.note().trim() ? L('Вкажіть причину', 'Enter a reason') : null,
    };
  }
  protected save(): Promise<void> {
    return this.submit(async () => {
      const k = this.kind() ?? 'in';
      await this.stock.move(this.part, k, this.qty(), this.branchId()!, this.note().trim() || MOVE_LABEL[k], k === 'transfer' ? this.toId() : null);
      this.toast.success(`${MOVE_LABEL[k]}: ${this.part.sku} × ${this.qty()}`);
      return true;
    });
  }
}
