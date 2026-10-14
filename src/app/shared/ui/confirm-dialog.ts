import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Icon } from './icon';
import { I } from '../icons';
import { ToastService } from '../../core/ui/toast.service';

export interface ConfirmData {
  title: string;
  text?: string;
  confirm: string;
  cancel?: string;
  danger?: boolean;
  /** Асинхронна дія: кнопка показує завантаження й не дає натиснути двічі */
  action?: () => Promise<unknown>;
}

@Component({
  selector: 'tk-confirm-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'alertdialog', '[attr.aria-labelledby]': '"cf-title"', '[attr.aria-describedby]': 'data.text ? "cf-text" : null' },
  template: `
    <div class="flex gap-3 px-5 pt-5 pb-4">
      @if (data.danger) {
        <span class="grid size-9 flex-none place-items-center rounded-full bg-danger-soft text-danger">
          <svg [lucideIcon]="I.alert" aria-hidden="true"></svg>
        </span>
      }
      <div class="min-w-0">
        <h2 id="cf-title" class="m-0 text-[15px] font-semibold">{{ data.title }}</h2>
        @if (data.text) {
          <p id="cf-text" class="mt-1 mb-0 text-[13px] text-ink-2">{{ data.text }}</p>
        }
      </div>
    </div>
    <div class="dlg-foot">
      <button type="button" class="btn" (click)="ref.close(false)">{{ data.cancel ?? 'Скасувати' }}</button>
      <button
        type="button"
        class="btn"
        [class.btn-danger-solid]="data.danger"
        [class.btn-primary]="!data.danger"
        [attr.aria-busy]="busy()"
        [disabled]="busy()"
        (click)="ok()"
      >
        @if (busy()) {
          <svg [lucideIcon]="I.loader" class="animate-spin" aria-hidden="true"></svg>
        }
        {{ data.confirm }}
      </button>
    </div>
  `,
})
export class ConfirmDialog {
  protected readonly I = I;
  protected readonly data = inject<ConfirmData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly busy = signal(false);
  private readonly toast = inject(ToastService);

  async ok(): Promise<void> {
    if (this.busy()) return;
    if (!this.data.action) return this.ref.close(true);
    this.busy.set(true);
    try {
      await this.data.action();
      this.ref.close(true);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
