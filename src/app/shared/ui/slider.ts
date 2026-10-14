import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, output, viewChild } from '@angular/core';

/**
 * Повзунок (role=slider) без нативного range: перетягування мишею/пальцем,
 * стрілки ±step, PageUp/PageDown ±10 кроків, Home/End.
 */
@Component({
  selector: 'tk-slider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      #track
      class="relative h-6 touch-none select-none"
      [class.cursor-pointer]="!disabled()"
      (pointerdown)="onDown($event)"
    >
      <div class="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
        <div class="h-full rounded-full" [style.width.%]="pct()" [style.background]="color() || 'var(--accent)'"></div>
      </div>
      @for (t of ticks(); track t) {
        <span class="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-line-strong" [style.left.%]="t" aria-hidden="true"></span>
      }
      <div
        role="slider"
        tabindex="0"
        class="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-surface bg-accent shadow transition-transform duration-100 hover:scale-110 active:cursor-grabbing"
        [style.left.%]="pct()"
        [style.background]="color() || null"
        [attr.aria-valuemin]="min()"
        [attr.aria-valuemax]="max()"
        [attr.aria-valuenow]="value()"
        [attr.aria-valuetext]="valueText()(value())"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-disabled]="disabled() || null"
        (keydown)="onKey($event)"
      ></div>
    </div>
  `,
})
export class Slider {
  readonly value = model(0);
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly disabled = input(false);
  readonly ariaLabel = input<string | null>(null);
  readonly valueText = input<(v: number) => string>((v) => String(v));
  /** Позначки на доріжці (у відсотках) */
  readonly ticks = input<number[]>([]);
  readonly color = input<string | null>(null);
  readonly changed = output<number>();
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  protected readonly pct = computed(() => ((this.value() - this.min()) / (this.max() - this.min() || 1)) * 100);

  private set(v: number): void {
    const s = this.step();
    const next = Math.min(this.max(), Math.max(this.min(), Math.round(v / s) * s));
    if (next !== this.value()) {
      this.value.set(next);
      this.changed.emit(next);
    }
  }

  protected onDown(e: PointerEvent): void {
    if (this.disabled()) return;
    const el = this.track().nativeElement;
    const rect = el.getBoundingClientRect();
    const at = (x: number) => this.min() + ((x - rect.left) / rect.width) * (this.max() - this.min());
    this.set(at(e.clientX));
    el.setPointerCapture(e.pointerId);
    (el.querySelector('[role=slider]') as HTMLElement | null)?.focus();
    const move = (ev: PointerEvent) => this.set(at(ev.clientX));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  protected onKey(e: KeyboardEvent): void {
    if (this.disabled()) return;
    const s = this.step();
    const map: Record<string, number> = {
      ArrowRight: s,
      ArrowUp: s,
      ArrowLeft: -s,
      ArrowDown: -s,
      PageUp: s * 10,
      PageDown: -s * 10,
    };
    if (e.key in map) this.set(this.value() + map[e.key]);
    else if (e.key === 'Home') this.set(this.min());
    else if (e.key === 'End') this.set(this.max());
    else return;
    e.preventDefault();
  }
}
