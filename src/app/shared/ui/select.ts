import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Icon } from './icon';
import { I, IconNode } from '../icons';
import { OptionList } from './option-list';
import { DROPDOWN_POSITIONS, Option, filterOptions, navKey, nextId } from './option';

/**
 * Власний select (без нативного <select>): кнопка-тригер + список у CDK Overlay.
 * Пошук з’являється автоматично, якщо опцій більше 8. multiple — мультиселект із чекбоксами.
 */
@Component({
  selector: 'tk-select',
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, Icon, OptionList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block min-w-0' },
  template: `
    <button
      #trigger
      type="button"
      class="control"
      [class.control-sm]="size() === 'sm'"
      [class.invalid]="invalid()"
      [class.is-disabled]="disabled()"
      [class.pr-10]="showClear()"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      role="combobox"
      aria-haspopup="listbox"
      [id]="inputId()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? listId : null"
      [attr.aria-invalid]="invalid() || null"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-activedescendant]="open() && !showSearch() && filtered().length ? listId + '-' + active() : null"
      [disabled]="disabled()"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
    >
      @if (icon(); as ic) {
        <svg [lucideIcon]="ic" aria-hidden="true"></svg>
      }
      @if (selected()?.dot; as dot) {
        <span class="size-2 flex-none rounded-full" [style.background]="dot" aria-hidden="true"></span>
      }
      <span class="truncate-1 flex-1" [class.placeholder]="!display()" [class.mono]="selected()?.mono">
        {{ display() || placeholder() }}
      </span>
      @if (!showClear()) {
        <svg [lucideIcon]="I.chevronDown" aria-hidden="true" class="transition-transform duration-150" [class.rotate-180]="open()"></svg>
      }
    </button>
    @if (showClear()) {
      <button
        type="button"
        class="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:bg-subtle hover:text-ink"
        aria-label="Очистити вибір"
        (click)="clear($event)"
      >
        <svg [lucideIcon]="I.x" [size]="14" aria-hidden="true"></svg>
      </button>
    }

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayMinWidth]="minWidth()"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="tork-backdrop-clear"
      [cdkConnectedOverlayViewportMargin]="8"
      (backdropClick)="close()"
      (detach)="close(false)"
      (attach)="onAttach()"
    >
      <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -- перехоплення клавіш від поля пошуку всередині панелі -->
      <div class="menu max-w-[min(420px,calc(100vw-16px))]" (keydown)="onPanelKey($event)">
        @if (showSearch()) {
          <div class="control control-sm mb-1">
            <svg [lucideIcon]="I.search" aria-hidden="true"></svg>
            <input
              #search
              type="text"
              role="combobox"
              aria-autocomplete="list"
              [attr.aria-controls]="listId"
              aria-expanded="true"
              [attr.aria-activedescendant]="filtered().length ? listId + '-' + active() : null"
              aria-label="Пошук у списку"
              placeholder="Пошук…"
              autocomplete="off"
              [value]="query()"
              (input)="query.set(search.value); active.set(0)"
            />
          </div>
        }
        <tk-option-list
          [options]="filtered()"
          [isSelected]="isSelected"
          [multiple]="multiple()"
          [listId]="listId"
          [label]="ariaLabel()"
          [(active)]="active"
          (picked)="pick($event)"
        />
        @if (multiple() && hasValue()) {
          <div class="menu-sep"></div>
          <button type="button" class="menu-item text-ink-2" (click)="clear($event)">
            <svg [lucideIcon]="I.x" aria-hidden="true"></svg>Скинути вибір
          </button>
        }
      </div>
    </ng-template>
  `,
})
export class Select<T> {
  protected readonly I = I;
  protected readonly positions = DROPDOWN_POSITIONS;
  protected readonly listId = nextId('lb');

  readonly options = input.required<Option<T>[]>();
  readonly value = model<T | null>(null);
  /** Для мультиселекту */
  readonly values = model<T[]>([]);
  readonly multiple = input(false);
  readonly placeholder = input('Оберіть…');
  readonly searchable = input<boolean | null>(null);
  readonly clearable = input(false);
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly size = input<'sm' | 'md'>('md');
  readonly icon = input<IconNode | null>(null);
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly describedBy = input<string | null>(null);
  /** Підпис мультиселекту, коли обрано кілька: «3 філії» */
  readonly manyLabel = input<(n: number) => string>((n) => `Обрано: ${n}`);
  readonly changed = output<T | T[] | null>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly minWidth = signal(160);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly showSearch = computed(() => this.searchable() ?? this.options().length > 8);
  protected readonly filtered = computed(() => filterOptions(this.options(), this.query()));
  protected readonly selected = computed(() => {
    const v = this.value();
    return this.multiple() ? null : (this.options().find((o) => o.value === v) ?? null);
  });
  protected readonly showClear = computed(() => this.clearable() && this.hasValue() && !this.disabled());
  protected readonly hasValue = computed(() => (this.multiple() ? this.values().length > 0 : this.value() !== null));
  protected readonly display = computed(() => {
    if (!this.multiple()) return this.selected()?.label ?? '';
    const vs = this.values();
    if (!vs.length) return '';
    if (vs.length === 1) return this.options().find((o) => o.value === vs[0])?.label ?? '';
    return this.manyLabel()(vs.length);
  });

  protected readonly isSelected = (o: Option<T>) =>
    this.multiple() ? this.values().includes(o.value) : this.value() === o.value;

  toggle(): void {
    if (this.open()) this.close();
    else this.openPanel();
  }

  openPanel(): void {
    if (this.disabled()) return;
    this.minWidth.set(this.trigger().nativeElement.offsetWidth);
    this.query.set('');
    const idx = this.filtered().findIndex((o) => this.isSelected(o));
    this.active.set(Math.max(0, idx));
    this.open.set(true);
  }

  close(refocus = true): void {
    if (!this.open()) return;
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }

  protected onAttach(): void {
    queueMicrotask(() => this.search()?.nativeElement.focus());
  }

  protected pick(o: Option<T>): void {
    if (o.disabled) return;
    if (this.multiple()) {
      const cur = this.values();
      const next = cur.includes(o.value) ? cur.filter((v) => v !== o.value) : [...cur, o.value];
      this.values.set(next);
      this.changed.emit(next);
      return;
    }
    this.value.set(o.value);
    this.changed.emit(o.value);
    this.close();
  }

  protected clear(e: Event): void {
    e.stopPropagation();
    if (this.multiple()) {
      this.values.set([]);
      this.changed.emit([]);
    } else {
      this.value.set(null);
      this.changed.emit(null);
    }
  }

  protected onTriggerKey(e: KeyboardEvent): void {
    if (!this.open()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        this.openPanel();
      }
      return;
    }
    this.onPanelKey(e);
  }

  protected onPanelKey(e: KeyboardEvent): void {
    if (e.key === 'Tab') return this.close(false);
    if (e.key === ' ' && !this.showSearch()) {
      e.preventDefault();
      const o = this.filtered()[this.active()];
      if (o) this.pick(o);
      return;
    }
    const r = navKey(e, this.active(), this.filtered().length);
    if (r === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (r === 'close') this.close();
    else if (r === 'pick') {
      const o = this.filtered()[this.active()];
      if (o) this.pick(o);
    } else this.active.set(r);
  }
}
