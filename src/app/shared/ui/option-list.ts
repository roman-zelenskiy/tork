import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, model, output } from '@angular/core';
import { Icon } from './icon';
import { I } from '../icons';
import { Option } from './option';
import { L } from '../../core/i18n';

/** Список опцій усередині випадаючої панелі. Фокус лишається на полі/кнопці (aria-activedescendant) */
@Component({
  selector: 'tk-option-list',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      role="listbox"
      [id]="listId()"
      [attr.aria-multiselectable]="multiple() || null"
      [attr.aria-label]="label()"
      class="max-h-[min(300px,50vh)] overflow-auto"
    >
      @for (o of options(); track $index; let i = $index) {
        @if (o.group && o.group !== options()[i - 1]?.group) {
          <div class="menu-label" role="presentation">{{ o.group }}</div>
        }
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -- фокус у полі або кнопці-тригері, вибір з клавіатури через aria-activedescendant -->
        <div
          role="option"
          class="menu-item"
          [id]="listId() + '-' + i"
          [class.active]="i === active()"
          [attr.aria-selected]="isSelected()(o)"
          [attr.aria-disabled]="o.disabled || null"
          (pointerdown)="$event.preventDefault()"
          (click)="!o.disabled && picked.emit(o)"
          (mousemove)="active.set(i)"
        >
          @if (multiple()) {
            <span
              class="grid size-4 flex-none place-items-center rounded-[4px] border"
              [class]="isSelected()(o) ? 'border-transparent bg-accent text-on-accent' : 'border-line-strong bg-surface'"
              aria-hidden="true"
            >
              @if (isSelected()(o)) {
                <svg [lucideIcon]="I.check" [size]="12" [strokeWidth]="3"></svg>
              }
            </span>
          }
          @if (o.dot) {
            <span class="size-2 flex-none rounded-full" [style.background]="o.dot" aria-hidden="true"></span>
          }
          <span class="truncate-1 flex-1" [class.mono]="o.mono">{{ o.label }}</span>
          @if (o.hint) {
            <span class="ml-2 flex-none text-xs text-ink-3 num">{{ o.hint }}</span>
          }
          @if (!multiple() && isSelected()(o)) {
            <svg [lucideIcon]="I.check" class="text-accent-ink!" aria-hidden="true"></svg>
          }
        </div>
      } @empty {
        <div class="px-2 py-3 text-center text-[13px] text-ink-3">{{ emptyText() }}</div>
      }
    </div>
  `,
})
export class OptionList<T> {
  protected readonly I = I;
  readonly options = input.required<Option<T>[]>();
  readonly isSelected = input.required<(o: Option<T>) => boolean>();
  readonly multiple = input(false);
  readonly listId = input.required<string>();
  readonly label = input<string | null>(null);
  readonly emptyText = input(L('Нічого не знайдено', 'Nothing found'));
  readonly active = model(0);
  readonly picked = output<Option<T>>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // активний пункт завжди видно при навігації стрілками
    effect(() => {
      const i = this.active();
      const el = this.host.nativeElement.querySelector<HTMLElement>(`#${CSS.escape(this.listId())}-${i}`);
      el?.scrollIntoView({ block: 'nearest' });
    });
  }
}
