import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TextField } from './text-field';
import { L } from '../../core/i18n';

export interface PromptData {
  title: string;
  label: string;
  value?: string;
  confirm: string;
  placeholder?: string;
}

/** Модалка з одним полем (назва вигляду, причина списання тощо) */
@Component({
  selector: 'tk-prompt-dialog',
  imports: [TextField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form (submit)="$event.preventDefault(); ok()" novalidate>
      <div class="dlg-head"><h2 id="pr-title">{{ data.title }}</h2></div>
      <div class="dlg-body">
        <div class="field">
          <label class="label" for="pr-input">{{ data.label }}</label>
          <tk-text-field inputId="pr-input" [(value)]="text" [placeholder]="data.placeholder ?? null" [invalid]="error()" [maxLength]="60" describedBy="pr-err" />
          @if (error()) {
            <span id="pr-err" class="error-text">{{ L('Введіть назву', 'Enter a name') }}</span>
          }
        </div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="ref.close()">{{ L('Скасувати', 'Cancel') }}</button>
        <button type="submit" class="btn btn-primary">{{ data.confirm }}</button>
      </div>
    </form>
  `,
})
export class PromptDialog {
  protected readonly L = L;
  protected readonly data = inject<PromptData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<string>>(DialogRef);
  protected readonly text = signal(this.data.value ?? '');
  protected readonly error = signal(false);

  protected ok(): void {
    const v = this.text().trim();
    if (!v) return this.error.set(true);
    this.ref.close(v);
  }
}
