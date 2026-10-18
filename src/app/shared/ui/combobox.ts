import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Icon } from './icon';
import { I, IconNode } from '../icons';
import { OptionList } from './option-list';
import { DROPDOWN_POSITIONS, Option, filterOptions, navKey, nextId } from './option';
import { L } from '../../core/i18n';

/**
 * Combobox: поле з автодоповненням. Шукає в options або через асинхронний search(query).
 * createLabel — пункт «Створити …» внизу списку (наприклад, нового клієнта з введеного імені).
 */
@Component({
  selector: 'tk-combobox',
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, Icon, OptionList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -- клік по рамці фокусує поле введення, яке саме доступне з клавіатури -->
    <div
      class="control"
      [class.control-sm]="size() === 'sm'"
      [class.invalid]="invalid()"
      [class.is-disabled]="disabled()"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      (click)="input.focus()"
    >
      <svg [lucideIcon]="icon() ?? I.search" aria-hidden="true"></svg>
      <input
        #input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        autocomplete="off"
        [id]="inputId()"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? listId : null"
        [attr.aria-activedescendant]="open() && results().length ? listId + '-' + active() : null"
        [attr.aria-invalid]="invalid() || null"
        [attr.aria-describedby]="describedBy()"
        [disabled]="disabled()"
        [placeholder]="placeholder()"
        [value]="text()"
        [class.mono]="mono()"
        (input)="onInput(input.value)"
        (focus)="onFocus()"
        (blur)="onBlur()"
        (keydown)="onKey($event)"
      />
      @if (loading()) {
        <svg [lucideIcon]="I.loader" class="animate-spin" aria-hidden="true"></svg>
      } @else if (value() !== null && !disabled()) {
        <button type="button" class="-mr-1 grid size-6 place-items-center rounded-md text-ink-3 hover:bg-subtle hover:text-ink" [attr.aria-label]="L('Очистити', 'Clear')" (click)="clear()">
          <svg [lucideIcon]="I.x" [size]="14" aria-hidden="true"></svg>
        </button>
      }
    </div>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayMinWidth]="minWidth()"
      [cdkConnectedOverlayViewportMargin]="8"
      (overlayOutsideClick)="closeIfOutside($event)"
      (detach)="open.set(false)"
    >
      <div class="menu max-w-[min(480px,calc(100vw-16px))]" (pointerdown)="$event.preventDefault()">
        <tk-option-list
          [options]="results()"
          [isSelected]="isSelected"
          [listId]="listId"
          [label]="ariaLabel()"
          [emptyText]="query().trim() ? L('Нічого не знайдено', 'Nothing found') : emptyHint()"
          [(active)]="active"
          (picked)="pick($event)"
        />
        @if (createLabel() && query().trim()) {
          <div class="menu-sep"></div>
          <button type="button" class="menu-item text-accent-ink!" (click)="emitCreate()">
            <svg [lucideIcon]="I.plus" aria-hidden="true"></svg>{{ createLabel() }} «{{ query().trim() }}»
          </button>
        }
      </div>
    </ng-template>
  `,
})
export class Combobox<T> {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly positions = DROPDOWN_POSITIONS;
  protected readonly listId = nextId('cb');

  readonly options = input<Option<T>[]>([]);
  /** Асинхронний пошук (замість options) */
  readonly search = input<((q: string) => Promise<Option<T>[]> | Option<T>[]) | null>(null);
  readonly value = model<T | null>(null);
  /** Підпис обраного значення (якщо його немає в поточних results) */
  readonly valueLabel = input<string | null>(null);
  readonly placeholder = input(L('Почніть вводити…', 'Start typing…'));
  readonly emptyHint = input(L('Введіть кілька літер', 'Type a few letters'));
  readonly createLabel = input<string | null>(null);
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly mono = input(false);
  readonly size = input<'sm' | 'md'>('md');
  readonly icon = input<IconNode | null>(null);
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly describedBy = input<string | null>(null);
  /** Мінімум символів для асинхронного пошуку */
  readonly minChars = input(0);
  /** Після вибору очищати поле (додавання тегів, рядків наряду) */
  readonly resetOnPick = input(false);
  readonly selected = output<Option<T>>();
  readonly create = output<string>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly loading = signal(false);
  protected readonly minWidth = signal(200);
  protected readonly editing = signal(false);
  private readonly asyncResults = signal<Option<T>[]>([]);
  private readonly lastPicked = signal<Option<T> | null>(null);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private seq = 0;

  protected readonly results = computed(() =>
    this.search() ? this.asyncResults() : filterOptions(this.options(), this.query()).slice(0, 80),
  );
  private readonly currentLabel = computed(() => {
    const v = this.value();
    if (v === null) return '';
    return this.options().find((o) => o.value === v)?.label ?? (this.lastPicked()?.value === v ? this.lastPicked()!.label : (this.valueLabel() ?? ''));
  });
  protected readonly text = computed(() => (this.editing() ? this.query() : this.currentLabel()));

  protected readonly isSelected = (o: Option<T>) => o.value === this.value();

  constructor() {
    effect(() => {
      const fn = this.search();
      const q = this.query();
      if (!fn || !this.editing()) return;
      untracked(() => this.runSearch(fn, q));
    });
  }

  private async runSearch(fn: (q: string) => Promise<Option<T>[]> | Option<T>[], q: string): Promise<void> {
    if (q.trim().length < this.minChars()) {
      this.asyncResults.set([]);
      return;
    }
    const id = ++this.seq;
    this.loading.set(true);
    try {
      const r = await fn(q);
      if (id === this.seq) {
        this.asyncResults.set(r);
        this.active.set(0);
      }
    } finally {
      if (id === this.seq) this.loading.set(false);
    }
  }

  protected onFocus(): void {
    this.editing.set(true);
    this.query.set(this.currentLabel());
    queueMicrotask(() => this.input().nativeElement.select());
    this.openPanel();
  }

  protected onBlur(): void {
    // клік по пункту не забирає фокус (pointerdown.preventDefault), тож blur = справжній вихід
    this.editing.set(false);
    this.open.set(false);
  }

  protected onInput(v: string): void {
    this.query.set(v);
    this.active.set(0);
    this.openPanel();
  }

  private openPanel(): void {
    if (this.disabled()) return;
    const host = this.input().nativeElement.parentElement;
    if (host) this.minWidth.set(host.offsetWidth);
    this.open.set(true);
  }

  protected closeIfOutside(e: MouseEvent): void {
    const host = this.input().nativeElement.parentElement;
    if (host && host.contains(e.target as Node)) return;
    this.open.set(false);
  }

  protected pick(o: Option<T>): void {
    this.selected.emit(o);
    if (this.resetOnPick()) {
      this.query.set('');
      this.active.set(0);
      return;
    }
    this.lastPicked.set(o);
    this.value.set(o.value);
    this.query.set(o.label);
    this.open.set(false);
  }

  protected emitCreate(): void {
    this.create.emit(this.query().trim());
    if (this.resetOnPick()) this.query.set('');
    else this.open.set(false);
  }

  protected clear(): void {
    this.value.set(null);
    this.query.set('');
    this.input().nativeElement.focus();
  }

  protected onKey(e: KeyboardEvent): void {
    if (!this.open() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      this.openPanel();
      return;
    }
    if (!this.open()) return;
    const r = navKey(e, this.active(), this.results().length);
    if (r === null || ((e.key === 'Home' || e.key === 'End') && !e.ctrlKey)) return;
    e.preventDefault();
    e.stopPropagation();
    if (r === 'close') this.open.set(false);
    else if (r === 'pick') {
      const o = this.results()[this.active()];
      if (o) this.pick(o);
      else if (this.createLabel() && this.query().trim()) this.emitCreate();
    } else this.active.set(r);
  }
}
