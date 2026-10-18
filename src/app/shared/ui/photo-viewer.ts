import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Icon } from './icon';
import { I } from '../icons';
import { L } from '../../core/i18n';

/** Перегляд фото в модалці зі стрілками ← → */
@Component({
  selector: 'tk-photo-viewer',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.arrowleft)': 'go(-1)', '(keydown.arrowright)': 'go(1)', class: 'flex flex-col min-h-0' },
  template: `
    <div class="dlg-head items-center!">
      <h2 class="flex-1">{{ L('Фото', 'Photo') }} {{ index() + 1 }} {{ L('з', 'of') }} {{ data.photos.length }}</h2>
      <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="L('Закрити', 'Close')" (click)="ref.close()">
        <svg [lucideIcon]="I.x" aria-hidden="true"></svg>
      </button>
    </div>
    <div class="relative grid min-h-0 flex-1 place-items-center bg-subtle p-3">
      <img [src]="data.photos[index()]" [alt]="L('Фото', 'Photo')" class="max-h-[70dvh] max-w-full rounded-md object-contain" />
      @if (data.photos.length > 1) {
        <button type="button" class="btn btn-icon absolute top-1/2 left-3 -translate-y-1/2" [attr.aria-label]="L('Попереднє фото', 'Previous photo')" (click)="go(-1)">
          <svg [lucideIcon]="I.chevronLeft" aria-hidden="true"></svg>
        </button>
        <button type="button" class="btn btn-icon absolute top-1/2 right-3 -translate-y-1/2" [attr.aria-label]="L('Наступне фото', 'Next photo')" (click)="go(1)">
          <svg [lucideIcon]="I.chevronRight" aria-hidden="true"></svg>
        </button>
      }
    </div>
  `,
})
export class PhotoViewer {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly data = inject<{ photos: string[]; index: number }>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  protected readonly index = signal(this.data.index);

  protected go(d: number): void {
    const n = this.data.photos.length;
    this.index.set((this.index() + d + n) % n);
  }
}
