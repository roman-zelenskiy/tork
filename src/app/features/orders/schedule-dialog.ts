import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { DbService } from '../../core/data/db.service';
import { Order } from '../../core/data/models';
import { ScheduleService } from '../../core/domain/schedule.service';
import { FormDialog } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { FormField } from '../../shared/ui/form-field';
import { Select } from '../../shared/ui/select';
import { Stepper } from '../../shared/ui/stepper';
import { DatePicker } from '../../shared/ui/date-picker';
import { TimePicker } from '../../shared/ui/time-picker';
import { Option } from '../../shared/ui/option';
import { minToHHMM, ymd } from '../../shared/format';
import { L } from '../../core/i18n';

/** Зміна запису наряду: пост, дата, час, тривалість, механік — з перевіркою конфліктів */
@Component({
  selector: 'tk-schedule-dialog',
  imports: [Icon, FormField, Select, Stepper, DatePicker, TimePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form novalidate (submit)="$event.preventDefault(); save()">
      <div class="dlg-head"><div><h2>{{ L('Запис', 'Booking') }} {{ order.number }}</h2><p>{{ L('Пост, час і механік', 'Bay, time and mechanic') }}</p></div></div>
      <div class="dlg-body grid grid-cols-2 gap-3">
        <tk-field class="col-span-2" forId="sd-post" [label]="L('Пост', 'Bay')">
          <tk-select inputId="sd-post" [options]="postOptions()" [(value)]="postId" [placeholder]="L('Без поста', 'No bay')" [clearable]="true" />
        </tk-field>
        <tk-field forId="sd-date" [label]="L('Дата', 'Date')" [error]="err('date')">
          <tk-date-picker inputId="sd-date" [(value)]="date" [invalid]="!!err('date')" />
        </tk-field>
        <tk-field forId="sd-time" [label]="L('Час', 'Time')" [error]="err('time')">
          <tk-time-picker inputId="sd-time" [(value)]="time" [from]="branch()?.opensAt ?? '08:00'" [to]="branch()?.closesAt ?? '20:00'" [invalid]="!!err('time')" />
        </tk-field>
        <tk-field forId="sd-dur" [label]="L('Тривалість', 'Duration')">
          <tk-stepper inputId="sd-dur" [(value)]="duration" [min]="15" [max]="600" [step]="15" [suffix]="L('хв', 'min')" />
        </tk-field>
        <tk-field forId="sd-mech" [label]="L('Механік', 'Mechanic')">
          <tk-select inputId="sd-mech" [options]="mechOptions()" [(value)]="mechanicId" [placeholder]="L('Не призначено', 'Not assigned')" [clearable]="true" />
        </tk-field>
        @for (c of conflicts(); track $index) {
          <div class="col-span-2 flex gap-2 rounded-lg bg-danger-soft p-2.5 text-[13px] text-danger" role="alert">
            <svg [lucideIcon]="I.alert" class="mt-0.5 flex-none" aria-hidden="true"></svg>{{ c.text }}
          </div>
        }
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">{{ L('Скасувати', 'Cancel') }}</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ L('Зберегти', 'Save') }}</button>
      </div>
    </form>
  `,
})
export class ScheduleDialog extends FormDialog<boolean> {
  protected readonly L = L;
  protected readonly I = I;
  private readonly db = inject(DbService);
  private readonly schedule = inject(ScheduleService);
  protected readonly order = inject<Order>(DIALOG_DATA);
  protected readonly postId = signal<string | null>(this.order.postId);
  protected readonly date = signal<string | null>(this.order.start ? ymd(new Date(this.order.start)) : null);
  protected readonly time = signal<string | null>(
    this.order.start ? minToHHMM(new Date(this.order.start).getHours() * 60 + new Date(this.order.start).getMinutes()) : null,
  );
  protected readonly duration = signal(this.order.durationMin);
  protected readonly mechanicId = signal<string | null>(this.order.mechanicId);
  protected readonly branch = computed(() => this.db.branches.get(this.order.branchId));
  protected readonly postOptions = computed<Option<string>[]>(() =>
    this.db.posts.items().filter((p) => p.branchId === this.order.branchId && p.active).map((p) => ({ value: p.id, label: p.name })),
  );
  protected readonly mechOptions = computed<Option<string>[]>(() =>
    this.db.employees.items().filter((e) => e.role === 'mechanic' && e.active && e.branchId === this.order.branchId).map((e) => ({ value: e.id, label: e.name })),
  );
  private readonly startIso = computed(() => {
    const d = this.date();
    const t = this.time();
    return d && t ? new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +t.slice(0, 2), +t.slice(3, 5)).toISOString() : null;
  });
  protected readonly conflicts = computed(() =>
    this.schedule.conflicts({ postId: this.postId(), start: this.startIso(), durationMin: this.duration(), mechanicId: this.mechanicId(), orderId: this.order.id }),
  );

  constructor() {
    super();
    this.markPristine();
  }
  protected snapshot() {
    return [this.postId(), this.date(), this.time(), this.duration(), this.mechanicId()];
  }
  protected errors() {
    const hard = this.conflicts().find((c) => c.kind === 'overlap');
    return {
      date: this.postId() && !this.date() ? L('Оберіть дату', 'Choose a date') : null,
      time: this.postId() && !this.time() ? L('Оберіть час', 'Choose a time') : (hard?.text ?? null),
    };
  }
  protected save(): Promise<void> {
    return this.submit(async () => {
      await this.db.orders.update(
        this.order.id,
        { postId: this.postId(), start: this.postId() ? this.startIso() : null, durationMin: this.duration(), mechanicId: this.mechanicId() },
        { log: L(`${this.order.number}: змінено запис`, `${this.order.number}: booking changed`) },
      );
      this.toast.success(L('Запис оновлено', 'Booking updated'));
      return true;
    });
  }
}
