import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, output, signal, viewChild } from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Icon } from './icon';
import { I } from '../icons';
import { addDays, fmtDate, startOfDay, ymd } from '../format';
import { Calendar } from './calendar';
import { DROPDOWN_POSITIONS } from './option';
import { L } from '../../core/i18n';

/** Вибір дати: кнопка-поле + календар у CDK Overlay. Значення — «YYYY-MM-DD» */
@Component({
  selector: 'tk-date-picker',
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, Icon, Calendar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <button
      #trigger
      type="button"
      class="control"
      [class.control-sm]="size() === 'sm'"
      [class.invalid]="invalid()"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      aria-haspopup="dialog"
      [id]="inputId()"
      [attr.aria-label]="ariaLabel() ? ariaLabel() + ': ' + (label() || L('не обрано', 'not selected')) : null"
      [attr.aria-expanded]="open()"
      [attr.aria-invalid]="invalid() || null"
      [attr.aria-describedby]="describedBy()"
      [disabled]="disabled()"
      (click)="toggle()"
      (keydown.arrowdown)="$event.preventDefault(); toggle()"
    >
      <svg [lucideIcon]="I.calendar" aria-hidden="true"></svg>
      <span class="truncate-1 flex-1 num" [class.placeholder]="!value()">{{ label() || placeholder() }}</span>
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="tork-backdrop-clear"
      [cdkConnectedOverlayViewportMargin]="8"
      (backdropClick)="close()"
      (detach)="close(false)"
      (attach)="cal()?.focusCurrent()"
    >
      <div class="popover p-3" role="dialog" [attr.aria-label]="L('Вибір дати', 'Choose a date')" (keydown.escape)="close()">
        <tk-calendar [value]="value()" [min]="min()" [max]="max()" (picked)="pick($event)" />
        @if (presets()) {
          <div class="mt-2 flex gap-1 border-t border-line pt-2">
            <button type="button" class="btn btn-ghost btn-sm" (click)="pick(today)">{{ L('Сьогодні', 'Today') }}</button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="pick(tomorrow)">{{ L('Завтра', 'Tomorrow') }}</button>
            @if (value() && clearable()) {
              <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="clear()">{{ L('Очистити', 'Clear') }}</button>
            }
          </div>
        }
      </div>
    </ng-template>
  `,
})
export class DatePicker {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly positions = DROPDOWN_POSITIONS;
  protected readonly today = ymd(new Date());
  protected readonly tomorrow = ymd(addDays(startOfDay(new Date()), 1));
  readonly value = model<string | null>(null);
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  readonly placeholder = input(L('Оберіть дату', 'Choose a date'));
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly clearable = input(false);
  readonly presets = input(true);
  readonly size = input<'sm' | 'md'>('md');
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly describedBy = input<string | null>(null);
  readonly changed = output<string | null>();

  protected readonly open = signal(false);
  protected readonly cal = viewChild(Calendar);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  protected readonly label = computed(() => (this.value() ? fmtDate(this.value()) : ''));

  protected toggle(): void {
    this.open.update((v) => !v);
  }
  protected close(refocus = true): void {
    if (!this.open()) return;
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }
  protected pick(v: string): void {
    this.value.set(v);
    this.changed.emit(v);
    this.close();
  }
  protected clear(): void {
    this.value.set(null);
    this.changed.emit(null);
    this.close();
  }
}

export interface DateRange {
  from: string;
  to: string;
}

/** Діапазон дат із пресетами (аналітика, журнали) */
@Component({
  selector: 'tk-date-range',
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, Icon, Calendar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <button
      #trigger
      type="button"
      class="control"
      [class.control-sm]="size() === 'sm'"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      aria-haspopup="dialog"
      [attr.aria-label]="L('Період: ', 'Period: ') + label()"
      [attr.aria-expanded]="open()"
      (click)="openPanel()"
    >
      <svg [lucideIcon]="I.calendar" aria-hidden="true"></svg>
      <span class="truncate-1 flex-1 num">{{ label() }}</span>
      <svg [lucideIcon]="I.chevronDown" aria-hidden="true"></svg>
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="tork-backdrop-clear"
      [cdkConnectedOverlayViewportMargin]="8"
      (backdropClick)="close()"
      (detach)="close(false)"
      (attach)="cal()?.focusCurrent()"
    >
      <div class="popover flex flex-col gap-3 p-3 sm:flex-row" role="dialog" [attr.aria-label]="L('Вибір періоду', 'Choose a period')" (keydown.escape)="close()">
        <div class="flex flex-row flex-wrap gap-1 sm:w-36 sm:flex-col">
          @for (p of presetList; track p.label) {
            <button type="button" class="menu-item w-auto! sm:w-full!" [class.active]="isPreset(p)" (click)="applyPreset(p)">{{ p.label }}</button>
          }
        </div>
        <div class="sm:border-l sm:border-line sm:pl-3">
          <tk-calendar [range]="true" [rangeStart]="start()" [rangeEnd]="end()" [max]="today" (picked)="pick($event)" />
          <p class="mt-2 mb-0 text-xs text-ink-3">{{ start() && !end() ? L('Оберіть кінцеву дату', 'Choose the end date') : L('Оберіть початкову дату', 'Choose the start date') }}</p>
        </div>
      </div>
    </ng-template>
  `,
})
export class DateRangePicker {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly positions = DROPDOWN_POSITIONS;
  protected readonly today = ymd(new Date());
  readonly value = model.required<DateRange>();
  readonly size = input<'sm' | 'md'>('md');
  protected readonly open = signal(false);
  protected readonly start = signal<string | null>(null);
  protected readonly end = signal<string | null>(null);
  protected readonly cal = viewChild(Calendar);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly presetList = PERIOD_PRESETS;
  protected readonly label = computed(() => {
    const v = this.value();
    const p = PERIOD_PRESETS.find((x) => this.same(x.range(), v));
    return p ? p.label : `${fmtDate(v.from)} – ${fmtDate(v.to)}`;
  });

  protected openPanel(): void {
    this.start.set(this.value().from);
    this.end.set(this.value().to);
    this.open.set(true);
  }
  protected close(refocus = true): void {
    if (!this.open()) return;
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }
  protected pick(d: string): void {
    const s = this.start();
    if (!s || this.end()) {
      this.start.set(d);
      this.end.set(null);
      return;
    }
    const [from, to] = d < s ? [d, s] : [s, d];
    this.value.set({ from, to });
    this.close();
  }
  protected applyPreset(p: (typeof PERIOD_PRESETS)[number]): void {
    this.value.set(p.range());
    this.close();
  }
  protected isPreset(p: (typeof PERIOD_PRESETS)[number]): boolean {
    return this.same(p.range(), this.value());
  }
  private same(a: DateRange, b: DateRange): boolean {
    return a.from === b.from && a.to === b.to;
  }
}

const back = (days: number): DateRange => {
  const t = startOfDay(new Date());
  return { from: ymd(addDays(t, -days + 1)), to: ymd(t) };
};
export const PERIOD_PRESETS: { label: string; range: () => DateRange }[] = [
  { label: L('Сьогодні', 'Today'), range: () => back(1) },
  { label: L('7 днів', '7 days'), range: () => back(7) },
  { label: L('30 днів', '30 days'), range: () => back(30) },
  {
    label: L('Цей місяць', 'This month'),
    range: () => {
      const t = new Date();
      return { from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t) };
    },
  },
  {
    label: L('Минулий місяць', 'Last month'),
    range: () => {
      const t = new Date();
      return { from: ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to: ymd(new Date(t.getFullYear(), t.getMonth(), 0)) };
    },
  },
  { label: L('90 днів', '90 days'), range: () => back(90) },
];
