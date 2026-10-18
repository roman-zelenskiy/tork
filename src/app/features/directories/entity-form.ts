import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { FormDialog } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { FormField } from '../../shared/ui/form-field';
import { TextField, Mask } from '../../shared/ui/text-field';
import { Select } from '../../shared/ui/select';
import { Stepper } from '../../shared/ui/stepper';
import { Switch, RadioGroup } from '../../shared/ui/checkbox';
import { TimePicker } from '../../shared/ui/time-picker';
import { Option } from '../../shared/ui/option';
import { TEMPLATE_VARS } from '../../core/domain/messages';
import { L } from '../../core/i18n';

export type FieldType = 'text' | 'textarea' | 'mask' | 'number' | 'select' | 'multiselect' | 'switch' | 'time' | 'radio' | 'template';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  mask?: Mask;
  options?: Option<unknown>[];
  required?: boolean;
  hint?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  suffix?: string;
  half?: boolean;
  /** Додаткова перевірка: текст помилки або null */
  validate?: (v: unknown, all: Record<string, unknown>) => string | null;
}

export interface EntityFormData {
  title: string;
  fields: FieldDef[];
  value: Record<string, unknown>;
  save: (v: Record<string, unknown>) => Promise<unknown>;
  submitLabel?: string;
}

/**
 * Універсальна форма довідника: поля описуються конфігурацією, решта —
 * та сама поведінка UI-кіта (помилки біля полів, незбережені зміни, захист від подвійного збереження).
 */
@Component({
  selector: 'tk-entity-form',
  imports: [Icon, FormField, TextField, Select, Stepper, Switch, RadioGroup, TimePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="dlg-head items-center!">
      <h2 class="flex-1">{{ data.title }}</h2>
      <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="L('Закрити', 'Close')" (click)="requestClose()"><svg [lucideIcon]="I.x" aria-hidden="true"></svg></button>
    </div>
    <form class="flex min-h-0 flex-1 flex-col" novalidate (submit)="$event.preventDefault(); save()">
      <div class="dlg-body grid grid-cols-2 gap-x-3 gap-y-4">
        @for (f of data.fields; track f.key) {
          @let id = 'ef-' + f.key;
          @if (f.type === 'switch') {
            <div class="col-span-2"><tk-switch [checked]="!!val(f.key)" (changed)="set(f.key, $event)">{{ f.label }}</tk-switch></div>
          } @else {
            <tk-field [class.col-span-2]="!f.half" [forId]="id" [label]="f.label" [required]="!!f.required" [error]="err(f.key)" [hint]="f.hint ?? null">
              @switch (f.type) {
                @case ('textarea') {
                  <tk-text-field [inputId]="id" [multiline]="true" [rows]="4" [maxLength]="500" [placeholder]="f.placeholder ?? null" [value]="str(f.key)" (valueChange)="set(f.key, $event)" [invalid]="!!err(f.key)" />
                }
                @case ('template') {
                  <tk-text-field [inputId]="id" [multiline]="true" [rows]="5" [maxLength]="480" [value]="str(f.key)" (valueChange)="set(f.key, $event)" [invalid]="!!err(f.key)" />
                  <div class="flex flex-wrap gap-1.5">
                    @for (v of vars; track v.key) {
                      <button type="button" class="chip clickable hover:bg-muted" [attr.aria-label]="L('Вставити ', 'Insert ') + v.hint" (click)="set(f.key, str(f.key) + (str(f.key).endsWith(' ') || !str(f.key) ? '' : ' ') + v.key)">{{ v.key }}</button>
                    }
                  </div>
                }
                @case ('mask') {
                  <tk-text-field [inputId]="id" [mask]="f.mask ?? null" [suffix]="f.suffix ?? null" [value]="str(f.key)" (valueChange)="set(f.key, f.mask === 'money' ? ($event === '' ? null : +$event) : $event)" [invalid]="!!err(f.key)" />
                }
                @case ('number') {
                  <tk-stepper [inputId]="id" [value]="num(f.key)" [min]="f.min ?? 0" [max]="f.max ?? 9999" [step]="f.step ?? 1" [decimals]="f.decimals ?? 0" [suffix]="f.suffix ?? null" (changed)="set(f.key, $event)" />
                }
                @case ('select') {
                  <tk-select [inputId]="id" [options]="f.options ?? []" [value]="val(f.key)" (valueChange)="set(f.key, $event)" [invalid]="!!err(f.key)" [placeholder]="f.placeholder ?? L('Оберіть…', 'Choose…')" />
                }
                @case ('multiselect') {
                  <tk-select [inputId]="id" [multiple]="true" [options]="f.options ?? []" [values]="arr(f.key)" (valuesChange)="set(f.key, $event)" [invalid]="!!err(f.key)" [placeholder]="f.placeholder ?? L('Оберіть…', 'Choose…')" />
                }
                @case ('radio') {
                  <tk-radio-group variant="segmented" [ariaLabel]="f.label" [options]="f.options ?? []" [value]="val(f.key)" (changed)="set(f.key, $event)" />
                }
                @case ('time') {
                  <tk-time-picker [inputId]="id" from="06:00" to="23:00" [step]="30" [value]="$any(val(f.key))" (valueChange)="set(f.key, $event)" [invalid]="!!err(f.key)" />
                }
                @default {
                  <tk-text-field [inputId]="id" [placeholder]="f.placeholder ?? null" [maxLength]="120" [value]="str(f.key)" (valueChange)="set(f.key, $event)" [invalid]="!!err(f.key)" />
                }
              }
            </tk-field>
          }
        }
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">{{ L('Скасувати', 'Cancel') }}</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()" [attr.aria-busy]="saving()">{{ data.submitLabel ?? L('Зберегти', 'Save') }}</button>
      </div>
    </form>
  `,
})
export class EntityForm extends FormDialog<boolean> {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly vars = TEMPLATE_VARS;
  protected readonly data = inject<EntityFormData>(DIALOG_DATA);
  protected readonly model = signal<Record<string, unknown>>({ ...this.data.value });

  constructor() {
    super();
    this.markPristine();
  }
  protected val(k: string): unknown {
    return this.model()[k] ?? null;
  }
  protected str(k: string): string {
    const v = this.model()[k];
    return v === null || v === undefined ? '' : String(v);
  }
  protected num(k: string): number {
    return Number(this.model()[k] ?? 0);
  }
  protected arr(k: string): unknown[] {
    return (this.model()[k] as unknown[]) ?? [];
  }
  protected set(k: string, v: unknown): void {
    this.model.update((m) => ({ ...m, [k]: v }));
  }
  protected snapshot() {
    return this.model();
  }
  protected errors() {
    const m = this.model();
    const out: Record<string, string | null> = {};
    for (const f of this.data.fields) {
      const v = m[f.key];
      const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
      out[f.key] = f.required && empty ? L('Обов’язкове поле', 'Required field') : (f.validate?.(v, m) ?? null);
    }
    return out;
  }
  protected save(): Promise<void> {
    return this.submit(async () => {
      const v = { ...this.model() };
      for (const f of this.data.fields) if (typeof v[f.key] === 'string') v[f.key] = (v[f.key] as string).trim();
      await this.data.save(v);
      this.toast.success(L('Збережено', 'Saved'));
      return true;
    });
  }
}
