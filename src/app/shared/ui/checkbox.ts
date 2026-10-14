import { ChangeDetectionStrategy, Component, ElementRef, input, model, output, viewChildren } from '@angular/core';
import { Icon } from './icon';
import { I } from '../icons';
import { Option } from './option';

/** Чекбокс без нативного input: role=checkbox, Space перемикає, підтримує «частково» */
@Component({
  selector: 'tk-checkbox',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex min-w-0' },
  template: `
    <button
      type="button"
      role="checkbox"
      class="group inline-flex min-w-0 items-start gap-2 rounded-md text-left text-[13px] leading-5"
      [attr.aria-checked]="indeterminate() ? 'mixed' : checked()"
      [attr.aria-label]="ariaLabel()"
      [disabled]="disabled()"
      (click)="toggle($event)"
    >
      <span
        class="mt-0.5 grid size-4 flex-none place-items-center rounded-[4px] border transition-colors duration-100 group-hover:border-ink-3 group-active:scale-95"
        [class]="checked() || indeterminate() ? 'border-transparent! bg-accent text-on-accent' : 'border-line-strong bg-surface'"
        [class.opacity-50]="disabled()"
        aria-hidden="true"
      >
        @if (indeterminate()) {
          <svg [lucideIcon]="I.minus" [size]="12" [strokeWidth]="3"></svg>
        } @else if (checked()) {
          <svg [lucideIcon]="I.check" [size]="12" [strokeWidth]="3"></svg>
        }
      </span>
      <span class="min-w-0"><ng-content /></span>
    </button>
  `,
})
export class Checkbox {
  protected readonly I = I;
  readonly checked = model(false);
  readonly indeterminate = input(false);
  readonly disabled = input(false);
  readonly ariaLabel = input<string | null>(null);
  readonly changed = output<boolean>();

  protected toggle(e: Event): void {
    e.stopPropagation();
    const next = this.indeterminate() ? true : !this.checked();
    this.checked.set(next);
    this.changed.emit(next);
  }
}

/** Перемикач (вкл/викл) — role=switch */
@Component({
  selector: 'tk-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex min-w-0' },
  template: `
    <button
      type="button"
      role="switch"
      class="group inline-flex min-w-0 items-center gap-2.5 rounded-md text-left text-[13px]"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="ariaLabel()"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      <span
        class="relative h-5 w-[34px] flex-none rounded-full transition-colors duration-150"
        [class]="checked() ? 'bg-accent' : 'bg-muted group-hover:bg-line-strong'"
        [class.opacity-50]="disabled()"
        aria-hidden="true"
      >
        <span
          class="absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-sm transition-transform duration-150 ease-out"
          [class.translate-x-[14px]]="checked()"
        ></span>
      </span>
      <span class="min-w-0"><ng-content /></span>
    </button>
  `,
})
export class Switch {
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly ariaLabel = input<string | null>(null);
  readonly changed = output<boolean>();

  protected toggle(): void {
    this.checked.set(!this.checked());
    this.changed.emit(this.checked());
  }
}

/**
 * Група радіокнопок: role=radiogroup, стрілки переміщують вибір (roving tabindex).
 * variant='segmented' — сегментований перемикач (день/тиждень, тема).
 */
@Component({
  selector: 'tk-radio-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -- стрілки на групі, фокус — на радіокнопці (roving tabindex) -->
    <div
      role="radiogroup"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-labelledby]="labelledBy()"
      [class]="
        variant() === 'segmented'
          ? 'inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] border border-line bg-subtle p-0.5'
          : 'flex flex-col gap-2' + (inline() ? ' sm:flex-row sm:flex-wrap sm:gap-x-5' : '')
      "
      (keydown)="onKey($event)"
    >
      @for (o of options(); track $index; let i = $index) {
        @if (variant() === 'segmented') {
          <button
            #btn
            type="button"
            role="radio"
            class="inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-[13px] whitespace-nowrap transition-colors duration-100"
            [class]="o.value === value() ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink'"
            [attr.aria-checked]="o.value === value()"
            [attr.tabindex]="tabIndex(i)"
            [disabled]="o.disabled || disabled()"
            (click)="pick(o)"
          >
            @if (o.dot) {
              <span class="size-2 rounded-full" [style.background]="o.dot" aria-hidden="true"></span>
            }
            {{ o.label }}
          </button>
        } @else {
          <button
            #btn
            type="button"
            role="radio"
            class="group inline-flex items-start gap-2 text-left text-[13px] leading-5"
            [attr.aria-checked]="o.value === value()"
            [attr.tabindex]="tabIndex(i)"
            [disabled]="o.disabled || disabled()"
            (click)="pick(o)"
          >
            <span
              class="mt-0.5 grid size-4 flex-none place-items-center rounded-full border transition-colors duration-100 group-hover:border-ink-3"
              [class]="o.value === value() ? 'border-accent! bg-accent' : 'border-line-strong bg-surface'"
              aria-hidden="true"
            >
              @if (o.value === value()) {
                <span class="size-1.5 rounded-full bg-on-accent"></span>
              }
            </span>
            <span>
              {{ o.label }}
              @if (o.hint) {
                <span class="block text-xs text-ink-3">{{ o.hint }}</span>
              }
            </span>
          </button>
        }
      }
    </div>
  `,
})
export class RadioGroup<T> {
  readonly options = input.required<Option<T>[]>();
  readonly value = model<T | null>(null);
  readonly variant = input<'list' | 'segmented'>('list');
  readonly inline = input(false);
  readonly disabled = input(false);
  readonly ariaLabel = input<string | null>(null);
  readonly labelledBy = input<string | null>(null);
  readonly changed = output<T>();
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('btn');

  protected tabIndex(i: number): number {
    const idx = this.options().findIndex((o) => o.value === this.value());
    return (idx < 0 ? 0 : idx) === i ? 0 : -1;
  }

  protected pick(o: Option<T>): void {
    if (o.disabled) return;
    this.value.set(o.value);
    this.changed.emit(o.value);
  }

  protected onKey(e: KeyboardEvent): void {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const opts = this.options();
    let i = opts.findIndex((o) => o.value === this.value());
    opts.some(() => {
      i = (i + dir + opts.length) % opts.length;
      return !opts[i].disabled;
    });
    this.pick(opts[i]);
    this.buttons()[i]?.nativeElement.focus();
  }
}
