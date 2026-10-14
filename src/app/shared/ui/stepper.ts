import { ChangeDetectionStrategy, Component, input, model, output, signal } from '@angular/core';
import { Icon } from './icon';
import { I } from '../icons';

/** Числове поле з кнопками −/+ (без нативного type=number). Стрілки ↑↓ змінюють на крок */
@Component({
  selector: 'tk-stepper',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="control px-1!" [class.control-sm]="size() === 'sm'" [class.invalid]="invalid()" [class.is-disabled]="disabled()">
      <button
        type="button"
        class="grid size-7 flex-none place-items-center rounded-md text-ink-2 hover:bg-subtle hover:text-ink active:scale-95 disabled:opacity-40"
        [attr.aria-label]="'Зменшити на ' + step()"
        tabindex="-1"
        [disabled]="disabled() || value() <= min()"
        (click)="bump(-1)"
      >
        <svg [lucideIcon]="I.minus" [size]="14" aria-hidden="true"></svg>
      </button>
      <input
        type="text"
        inputmode="decimal"
        role="spinbutton"
        class="text-center num"
        [id]="inputId()"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-valuenow]="value()"
        [attr.aria-valuemin]="min()"
        [attr.aria-valuemax]="max()"
        [attr.aria-invalid]="invalid() || null"
        [disabled]="disabled()"
        [value]="draft() ?? format(value())"
        (input)="draft.set($any($event.target).value)"
        (blur)="commit()"
        (keydown.enter)="commit()"
        (keydown.arrowup)="$event.preventDefault(); bump(1)"
        (keydown.arrowdown)="$event.preventDefault(); bump(-1)"
      />
      @if (suffix()) {
        <span class="flex-none pr-1 text-xs text-ink-3">{{ suffix() }}</span>
      }
      <button
        type="button"
        class="grid size-7 flex-none place-items-center rounded-md text-ink-2 hover:bg-subtle hover:text-ink active:scale-95 disabled:opacity-40"
        [attr.aria-label]="'Збільшити на ' + step()"
        tabindex="-1"
        [disabled]="disabled() || value() >= max()"
        (click)="bump(1)"
      >
        <svg [lucideIcon]="I.plus" [size]="14" aria-hidden="true"></svg>
      </button>
    </div>
  `,
})
export class Stepper {
  protected readonly I = I;
  readonly value = model(0);
  readonly min = input(0);
  readonly max = input(Number.MAX_SAFE_INTEGER);
  readonly step = input(1);
  readonly decimals = input(0);
  readonly suffix = input<string | null>(null);
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly size = input<'sm' | 'md'>('md');
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly changed = output<number>();
  protected readonly draft = signal<string | null>(null);

  protected format(v: number): string {
    return v.toFixed(this.decimals()).replace('.', ',');
  }

  private set(v: number): void {
    const f = 10 ** this.decimals();
    const next = Math.min(this.max(), Math.max(this.min(), Math.round(v * f) / f));
    this.value.set(next);
    this.changed.emit(next);
  }

  protected bump(dir: 1 | -1): void {
    this.draft.set(null);
    this.set(this.value() + dir * this.step());
  }

  protected commit(): void {
    const d = this.draft();
    if (d === null) return;
    const n = Number(d.replace(/\s/g, '').replace(',', '.'));
    this.draft.set(null);
    if (Number.isFinite(n)) this.set(n);
  }
}
