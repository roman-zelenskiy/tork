import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { Order, PayMethod } from '../../core/data/models';
import { OrdersService } from '../../core/domain/orders.service';
import { orderTotals } from '../../core/domain/order-math';
import { FormDialog } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { FormField } from '../../shared/ui/form-field';
import { TextField } from '../../shared/ui/text-field';
import { RadioGroup } from '../../shared/ui/checkbox';
import { Option } from '../../shared/ui/option';
import { fmtMoney } from '../../shared/format';

export const PAY_LABEL: Record<PayMethod, string> = { cash: 'Готівка', card: 'Картка', transfer: 'Безготівка' };

/** Прийом оплати: спосіб і сума (за замовчуванням — увесь борг) */
@Component({
  selector: 'tk-payment-dialog',
  imports: [Icon, FormField, TextField, RadioGroup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form novalidate (submit)="$event.preventDefault(); save()">
      <div class="dlg-head"><div><h2>Прийняти оплату</h2><p>{{ order.number }}: до сплати {{ money(debt) }}</p></div></div>
      <div class="dlg-body flex flex-col gap-4">
        <tk-radio-group variant="segmented" ariaLabel="Спосіб оплати" [options]="methods" [(value)]="method" />
        <tk-field forId="pay-amount" label="Сума" [required]="true" [error]="err('amount')">
          <tk-text-field inputId="pay-amount" mask="money" suffix="₴" [(value)]="amount" [invalid]="!!err('amount')" describedBy="pay-amount-err" />
        </tk-field>
        <div class="flex flex-wrap gap-1.5">
          <button type="button" class="chip clickable hover:bg-muted" (click)="amount.set(String(debt))">Увесь борг</button>
          <button type="button" class="chip clickable hover:bg-muted" (click)="amount.set(String(Math.round(debt / 2)))">Половина</button>
        </div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">Скасувати</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()" [attr.aria-busy]="saving()">
          @if (saving()) {
            <svg [lucideIcon]="I.loader" class="animate-spin" aria-hidden="true"></svg>
          }
          Прийняти {{ amount() ? money(+amount()) : '' }}
        </button>
      </div>
    </form>
  `,
})
export class PaymentDialog extends FormDialog<boolean> {
  protected readonly I = I;
  protected readonly String = String;
  protected readonly Math = Math;
  protected readonly money = fmtMoney;
  private readonly orders = inject(OrdersService);
  protected readonly order = inject<Order>(DIALOG_DATA);
  protected readonly debt = orderTotals(this.order).debt;
  protected readonly methods: Option<PayMethod>[] = (['card', 'cash', 'transfer'] as PayMethod[]).map((m) => ({ value: m, label: PAY_LABEL[m] }));
  protected readonly method = signal<PayMethod | null>(this.order.payments.at(-1)?.method ?? 'card');
  protected readonly amount = signal(String(this.debt));

  constructor() {
    super();
    this.markPristine();
  }
  protected snapshot() {
    return [this.method(), this.amount()];
  }
  protected errors() {
    const a = Number(this.amount() || 0);
    return { amount: !a ? 'Введіть суму' : a > this.debt * 1.5 + 1 ? `Сума значно більша за борг (${fmtMoney(this.debt)})` : null };
  }
  protected save(): Promise<void> {
    return this.submit(async () => {
      await this.orders.addPayment(this.order, this.method() ?? 'card', Number(this.amount()));
      this.toast.success(`Оплату ${fmtMoney(Number(this.amount()))} прийнято`);
      return true;
    });
  }
}
