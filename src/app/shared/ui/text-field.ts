import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, output, viewChild } from '@angular/core';
import { Icon } from './icon';
import { I, IconNode } from '../icons';
import { formatPlate, normalizePlate, PLATE_LETTERS } from '../../core/data/plates';
import { L, locale } from '../../core/i18n';

export type Mask = 'phone' | 'plate' | 'vin' | 'money' | null;

/** Телефон: зберігаємо «+380XXXXXXXXX», показуємо «+380 67 123 45 67» */
function phoneLocal(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('380')) d = d.slice(3);
  else if (d.startsWith('38')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 9);
}
function phoneDisplay(local: string): string {
  if (!local) return '';
  const p = [local.slice(0, 2), local.slice(2, 5), local.slice(5, 7), local.slice(7, 9)].filter(Boolean);
  return `+380 ${p.join(' ')}`;
}

const MASKS: Record<Exclude<Mask, null>, { toValue: (s: string) => string; toDisplay: (v: string) => string; inputmode: string; placeholder: string }> = {
  phone: {
    toValue: (s) => {
      const l = phoneLocal(s);
      return l ? `+380${l}` : '';
    },
    toDisplay: (v) => phoneDisplay(phoneLocal(v)),
    inputmode: 'tel',
    placeholder: '+380 67 123 45 67',
  },
  plate: {
    toValue: (s) => {
      let out = '';
      for (const c of normalizePlate(s)) {
        const i = out.length;
        if (i >= 8) break;
        if (i < 2 || i > 5 ? PLATE_LETTERS.includes(c) : /\d/.test(c)) out += c;
      }
      return out;
    },
    toDisplay: (v) => (v.length > 6 ? formatPlate(v) : v.length > 2 ? `${v.slice(0, 2)} ${v.slice(2)}` : v),
    inputmode: 'text',
    placeholder: L('КА 4821 ВІ', 'KA 4821 BI'),
  },
  vin: {
    toValue: (s) => s.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17),
    toDisplay: (v) => v,
    inputmode: 'text',
    placeholder: L('17 символів, без I, O, Q', '17 characters, no I, O or Q'),
  },
  money: {
    toValue: (s) => s.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 9),
    toDisplay: (v) => (v ? new Intl.NumberFormat(locale).format(Number(v)) : ''),
    inputmode: 'numeric',
    placeholder: '0',
  },
};

/**
 * Текстове поле UI-кіта з масками (телефон +380, держномер, VIN, сума),
 * іконкою, лічильником символів і очищенням. Значення в моделі — нормалізоване.
 */
@Component({
  selector: 'tk-text-field',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="control" [class.control-sm]="size() === 'sm'" [class.invalid]="invalid()" [class.is-disabled]="disabled()">
      @if (icon(); as ic) {
        <svg [lucideIcon]="ic" aria-hidden="true"></svg>
      }
      @if (multiline()) {
        <textarea
          #el
          [id]="inputId()"
          [attr.aria-label]="ariaLabel()"
          [attr.aria-invalid]="invalid() || null"
          [attr.aria-describedby]="describedBy()"
          [attr.maxlength]="maxLength()"
          [rows]="rows()"
          [placeholder]="placeholder()"
          [disabled]="disabled()"
          [value]="value()"
          (input)="onInput($any($event.target).value)"
          (blur)="blurred.emit()"
        ></textarea>
      } @else {
        <input
          #el
          [type]="type()"
          [id]="inputId()"
          [attr.aria-label]="ariaLabel()"
          [attr.aria-invalid]="invalid() || null"
          [attr.aria-describedby]="describedBy()"
          [attr.inputmode]="spec()?.inputmode ?? null"
          [attr.maxlength]="mask() ? null : maxLength()"
          [attr.autocomplete]="autocomplete()"
          [attr.spellcheck]="mask() ? false : null"
          [placeholder]="placeholder() ?? spec()?.placeholder ?? ''"
          [disabled]="disabled()"
          [class.mono]="mono() || mask() === 'plate' || mask() === 'vin'"
          [class.uppercase]="mask() === 'vin' || mask() === 'plate'"
          [value]="display()"
          (input)="onInput($any($event.target).value)"
          (blur)="blurred.emit()"
          (keydown.enter)="enter.emit()"
        />
      }
      @if (suffix()) {
        <span class="flex-none text-[13px] text-ink-3">{{ suffix() }}</span>
      }
      @if (mask() === 'vin') {
        <span class="flex-none text-xs text-ink-3 num" aria-hidden="true">{{ value().length }}/17</span>
      }
      @if (clearable() && value() && !disabled()) {
        <button type="button" class="-mr-1 grid size-6 place-items-center rounded-md text-ink-3 hover:bg-subtle hover:text-ink" [attr.aria-label]="L('Очистити поле', 'Clear field')" (click)="clear()">
          <svg [lucideIcon]="I.x" [size]="14" aria-hidden="true"></svg>
        </button>
      }
    </div>
  `,
})
export class TextField {
  protected readonly L = L;
  protected readonly I = I;
  readonly value = model('');
  readonly mask = input<Mask>(null);
  readonly type = input<'text' | 'email' | 'search' | 'url'>('text');
  readonly placeholder = input<string | null>(null);
  readonly icon = input<IconNode | null>(null);
  readonly suffix = input<string | null>(null);
  readonly multiline = input(false);
  readonly rows = input(3);
  readonly maxLength = input<number | null>(null);
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly clearable = input(false);
  readonly mono = input(false);
  readonly autocomplete = input<string | null>('off');
  readonly size = input<'sm' | 'md'>('md');
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly describedBy = input<string | null>(null);
  readonly blurred = output<void>();
  readonly enter = output<void>();
  private readonly el = viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('el');

  protected readonly spec = computed(() => {
    const m = this.mask();
    return m ? MASKS[m] : null;
  });
  protected readonly display = computed(() => {
    const s = this.spec();
    return s ? s.toDisplay(this.value()) : this.value();
  });

  protected onInput(raw: string): void {
    const s = this.spec();
    const next = s ? s.toValue(raw) : raw;
    this.value.set(next);
    // маска могла змінити текст — синхронізуємо поле й ставимо курсор у кінець
    const el = this.el()?.nativeElement;
    if (s && el && el.value !== this.display()) {
      el.value = this.display();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  protected clear(): void {
    this.value.set('');
    this.el()?.nativeElement.focus();
  }

  focus(): void {
    this.el()?.nativeElement.focus();
  }
}
