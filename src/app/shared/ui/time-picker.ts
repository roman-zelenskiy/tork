import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { Select } from './select';
import { Option } from './option';
import { minToHHMM, toMin } from '../format';
import { I } from '../icons';
import { L } from '../../core/i18n';

/** Вибір часу з кроком (за замовчуванням 15 хв) у межах робочого дня. Значення — «HH:MM» */
@Component({
  selector: 'tk-time-picker',
  imports: [Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <tk-select
      [options]="options()"
      [(value)]="value"
      [searchable]="true"
      [icon]="I.clock"
      [placeholder]="placeholder()"
      [invalid]="invalid()"
      [disabled]="disabled()"
      [size]="size()"
      [inputId]="inputId()"
      [ariaLabel]="ariaLabel()"
      [describedBy]="describedBy()"
      (changed)="changed.emit($any($event))"
    />
  `,
})
export class TimePicker {
  protected readonly I = I;
  readonly value = model<string | null>(null);
  readonly from = input('07:00');
  readonly to = input('21:00');
  readonly step = input(15);
  /** Зайняті слоти позначаються підказкою */
  readonly busy = input<string[]>([]);
  readonly placeholder = input(L('Час', 'Time'));
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly size = input<'sm' | 'md'>('md');
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly describedBy = input<string | null>(null);
  readonly changed = output<string | null>();

  protected readonly options = computed<Option<string>[]>(() => {
    const out: Option<string>[] = [];
    const busy = new Set(this.busy());
    for (let m = toMin(this.from()); m <= toMin(this.to()); m += this.step()) {
      const v = minToHHMM(m);
      out.push({ value: v, label: v, mono: true, hint: busy.has(v) ? L('зайнято', 'taken') : undefined });
    }
    return out;
  });
}
