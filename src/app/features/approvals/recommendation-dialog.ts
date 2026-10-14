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

/** Рекомендація після діагностики: робота, пріоритет, пояснення й фото для клієнта */
@Component({
  selector: 'tk-recommendation-dialog',
  imports: [Icon, FormField, TextField, Combobox, Stepper, RadioGroup, PhotoUpload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="dlg-head items-center!">
      <div class="flex-1"><h2>Рекомендація</h2><p>Клієнт побачить назву, пояснення, фото й ціну</p></div>
      <button type="button" class="btn btn-ghost btn-icon" aria-label="Закрити" (click)="requestClose()"><svg [lucideIcon]="I.x" aria-hidden="true"></svg></button>
    </div>
    <form class="flex min-h-0 flex-1 flex-col" novalidate (submit)="$event.preventDefault(); save()">
      <div class="dlg-body flex flex-col gap-4">
        <tk-field forId="rc-work" label="Робота" [required]="true" [error]="err('name')">
          <tk-combobox inputId="rc-work" [options]="workOptions()" [(value)]="workId" [icon]="I.wrench" placeholder="З довідника або своя назва" createLabel="Своя робота" (create)="custom($event)" [invalid]="!!err('name')" />
        </tk-field>
        @if (customName()) {
          <p class="-mt-2 m-0 text-[13px]">Своя робота: <b>{{ customName() }}</b></p>
        }
        <div class="grid grid-cols-2 gap-3">
          <tk-field forId="rc-h" label="Нормо-години">
            <tk-stepper inputId="rc-h" [(value)]="hours" [min]="0.1" [max]="40" [step]="0.1" [decimals]="1" />
          </tk-field>
          <div class="field"><span class="label">Вартість роботи</span><span class="flex h-9 items-center font-semibold num">{{ money(price()) }}</span></div>
        </div>
        <div class="field">
          <span class="label" id="rc-p">Пріоритет</span>
          <tk-radio-group labelledBy="rc-p" [options]="priorities" [(value)]="priority" />
        </div>
        <tk-field forId="rc-d" label="Пояснення для клієнта" [error]="err('desc')" hint="Простими словами: що не так і чим загрожує">
          <tk-text-field inputId="rc-d" [multiline]="true" [rows]="3" [maxLength]="300" [(value)]="description" placeholder="Колодки стерті до 2 мм, гальмівний шлях збільшено" [invalid]="!!err('desc')" />
        </tk-field>
        <tk-field forId="rc-part" label="Запчастина (необов’язково)">
          <tk-combobox inputId="rc-part" [options]="partOptions()" [(value)]="partId" [icon]="I.package" placeholder="Артикул або назва" />
        </tk-field>
        <div class="field"><span class="label">Фото</span><tk-photo-upload [(photos)]="photos" [max]="4" /></div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">Скасувати</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Додати рекомендацію</button>
      </div>
    </form>
  `,
})
export class RecommendationDialog extends FormDialog<boolean> {
  protected readonly I = I;
  protected readonly money = fmtMoney;
  private readonly db = inject(DbService);
  private readonly approvals = inject(ApprovalsService);
  private readonly ordersSvc = inject(OrdersService);
  private readonly order = inject<Order>(DIALOG_DATA);
  protected readonly priorities: Option<Priority>[] = (['must', 'recommended', 'later'] as Priority[]).map((p) => ({
    value: p,
    label: PRIORITY_LABEL[p],
    hint: p === 'must' ? 'Безпека або подальше пошкодження' : p === 'recommended' ? 'Варто зробити найближчим часом' : 'Можна запланувати на наступний візит',
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
      name: this.work() || this.customName() ? null : 'Оберіть роботу або введіть свою',
      desc: this.description().trim().length < 10 ? 'Поясніть клієнту, навіщо ця робота (від 10 символів)' : null,
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
      this.toast.success('Рекомендацію додано');
      return true;
    });
  }
}
