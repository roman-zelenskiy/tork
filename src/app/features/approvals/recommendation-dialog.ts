import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { DbService } from '../../core/data/db.service';
import { Order, Priority } from '../../core/data/models';
import { ApprovalsService, PRIORITY_LABEL } from '../../core/domain/approvals.service';
import { OrdersService } from '../../core/domain/orders.service';
import { FormDialog } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { FormField } from '../../shared/ui/form-field';
import { TextField } from '../../shared/ui/text-field';
import { Combobox } from '../../shared/ui/combobox';
import { Stepper } from '../../shared/ui/stepper';
import { RadioGroup } from '../../shared/ui/checkbox';
import { PhotoUpload } from '../../shared/ui/photo-upload';
import { Option } from '../../shared/ui/option';
import { fmtHours, fmtMoney } from '../../shared/format';
import { L } from '../../core/i18n';

/** Рекомендація після діагностики: робота, пріоритет, пояснення й фото для клієнта */
@Component({
  selector: 'tk-recommendation-dialog',
  imports: [Icon, FormField, TextField, Combobox, Stepper, RadioGroup, PhotoUpload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="dlg-head items-center!">
      <div class="flex-1"><h2>{{ L('Рекомендація', 'Recommendation') }}</h2><p>{{ L('Клієнт побачить назву, пояснення, фото й ціну', 'The customer will see the name, explanation, photos and price') }}</p></div>
      <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="L('Закрити', 'Close')" (click)="requestClose()"><svg [lucideIcon]="I.x" aria-hidden="true"></svg></button>
    </div>
    <form class="flex min-h-0 flex-1 flex-col" novalidate (submit)="$event.preventDefault(); save()">
      <div class="dlg-body flex flex-col gap-4">
        <tk-field forId="rc-work" [label]="L('Робота', 'Job')" [required]="true" [error]="err('name')">
          <tk-combobox inputId="rc-work" [options]="workOptions()" [(value)]="workId" [icon]="I.wrench" [placeholder]="L('З довідника або своя назва', 'From the directory or a custom name')" [createLabel]="L('Своя робота', 'Custom job')" (create)="custom($event)" [invalid]="!!err('name')" />
        </tk-field>
        @if (customName()) {
          <p class="-mt-2 m-0 text-[13px]">{{ L('Своя робота', 'Custom job') }}: <b>{{ customName() }}</b></p>
        }
        <div class="grid grid-cols-2 gap-3">
          <tk-field forId="rc-h" [label]="L('Нормо-години', 'Standard hours')">
            <tk-stepper inputId="rc-h" [(value)]="hours" [min]="0.1" [max]="40" [step]="0.1" [decimals]="1" />
          </tk-field>
          <div class="field"><span class="label">{{ L('Вартість роботи', 'Labour cost') }}</span><span class="flex h-9 items-center font-semibold num">{{ money(price()) }}</span></div>
        </div>
        <div class="field">
          <span class="label" id="rc-p">{{ L('Пріоритет', 'Priority') }}</span>
          <tk-radio-group labelledBy="rc-p" [options]="priorities" [(value)]="priority" />
        </div>
        <tk-field forId="rc-d" [label]="L('Пояснення для клієнта', 'Explanation for the customer')" [error]="err('desc')" [hint]="L('Простими словами: що не так і чим загрожує', 'In plain words: what’s wrong and what could happen')">
          <tk-text-field inputId="rc-d" [multiline]="true" [rows]="3" [maxLength]="300" [(value)]="description" [placeholder]="L('Колодки стерті до 2 мм, гальмівний шлях збільшено', 'The pads are worn to 2 mm, braking distance has increased')" [invalid]="!!err('desc')" />
        </tk-field>
        <tk-field forId="rc-part" [label]="L('Запчастина (необов’язково)', 'Part (optional)')">
          <tk-combobox inputId="rc-part" [options]="partOptions()" [(value)]="partId" [icon]="I.package" [placeholder]="L('Артикул або назва', 'SKU or name')" />
        </tk-field>
        <div class="field"><span class="label">{{ L('Фото', 'Photos') }}</span><tk-photo-upload [(photos)]="photos" [max]="4" /></div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">{{ L('Скасувати', 'Cancel') }}</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ L('Додати рекомендацію', 'Add recommendation') }}</button>
      </div>
    </form>
  `,
})
export class RecommendationDialog extends FormDialog<boolean> {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly money = fmtMoney;
  private readonly db = inject(DbService);
  private readonly approvals = inject(ApprovalsService);
  private readonly ordersSvc = inject(OrdersService);
  private readonly order = inject<Order>(DIALOG_DATA);
  protected readonly priorities: Option<Priority>[] = (['must', 'recommended', 'later'] as Priority[]).map((p) => ({
    value: p,
    label: PRIORITY_LABEL[p],
    hint: p === 'must' ? L('Безпека або подальше пошкодження', 'Safety or further damage') : p === 'recommended' ? L('Варто зробити найближчим часом', 'Worth doing soon') : L('Можна запланувати на наступний візит', 'Can be planned for the next visit'),
  }));
  protected readonly workId = signal<string | null>(null);
  protected readonly customName = signal('');
  protected readonly hours = signal(1);
  protected readonly priority = signal<Priority | null>('recommended');
  protected readonly description = signal('');
  protected readonly partId = signal<string | null>(null);
  protected readonly photos = signal<string[]>([]);

  protected readonly workOptions = computed<Option<string>[]>(() =>
    this.db.works.items().map((w) => ({ value: w.id, label: w.name, hint: `${w.code} · ${fmtHours(w.hours)}`, keywords: w.code })),
  );
  protected readonly partOptions = computed<Option<string>[]>(() =>
    this.db.parts.items().map((p) => ({ value: p.id, label: `${p.brand} ${p.name}`, hint: `${p.sku} · ${fmtMoney(p.price)}`, keywords: p.sku })),
  );
  private readonly work = computed(() => this.db.works.get(this.workId()));
  protected readonly price = computed(() => Math.round(this.hours() * this.ordersSvc.rateFor(this.work() ?? null, this.order.postId)));

  constructor() {
    super();
    effect(() => {
      const w = this.work();
      if (w) untracked(() => (this.hours.set(w.hours), this.customName.set('')));
    });
    this.markPristine();
  }
  protected custom(name: string): void {
    this.customName.set(name);
    this.workId.set(null);
  }
  protected snapshot() {
    return [this.workId(), this.customName(), this.hours(), this.priority(), this.description(), this.partId(), this.photos().length];
  }
  protected errors() {
    return {
      name: this.work() || this.customName() ? null : L('Оберіть роботу або введіть свою', 'Choose a job or enter your own'),
      desc: this.description().trim().length < 10 ? L('Поясніть клієнту, навіщо ця робота (від 10 символів)', 'Explain to the customer why this job is needed (10+ characters)') : null,
    };
  }
  protected save(): Promise<void> {
    return this.submit(async () => {
      await this.approvals.addRecommendation(this.db.orders.get(this.order.id)!, {
        work: this.work() ?? null,
        name: this.work()?.name ?? this.customName(),
        hours: this.hours(),
        priority: this.priority() ?? 'recommended',
        description: this.description().trim(),
        photos: this.photos(),
        partId: this.partId(),
      });
      this.toast.success(L('Рекомендацію додано', 'Recommendation added'));
      return true;
    });
  }
}
