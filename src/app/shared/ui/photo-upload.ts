import { ChangeDetectionStrategy, Component, inject, input, model, signal } from '@angular/core';
import { Icon } from './icon';
import { I } from '../icons';
import { compressImage } from './image';
import { ToastService } from '../../core/ui/toast.service';
import { Dialogs } from '../../core/ui/dialogs.service';
import { PhotoViewer } from './photo-viewer';

/**
 * Завантаження фото: кнопка або перетягування файлів. Фото стискаються в браузері
 * і зберігаються як data URL. На телефоні відкривається камера (capture).
 */
@Component({
  selector: 'tk-photo-upload',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-wrap gap-2 rounded-lg p-1 transition-colors duration-100"
      [class.bg-accent-soft]="over()"
      (dragover)="$event.preventDefault(); over.set(true)"
      (dragleave)="over.set(false)"
      (drop)="onDrop($event)"
    >
      @for (p of photos(); track $index; let i = $index) {
        <div class="group relative size-[72px] overflow-hidden rounded-lg border border-line bg-subtle">
          <button type="button" class="block size-full" [attr.aria-label]="'Переглянути фото ' + (i + 1)" (click)="view(i)">
            <img [src]="p" alt="" class="size-full object-cover" loading="lazy" />
          </button>
          @if (!readonly()) {
            <button
              type="button"
              class="absolute top-1 right-1 grid size-6 place-items-center rounded-md bg-[rgb(0_0_0/0.55)] text-white opacity-100 hover:bg-[rgb(0_0_0/0.75)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              [attr.aria-label]="'Видалити фото ' + (i + 1)"
              (click)="remove(i)"
            >
              <svg [lucideIcon]="I.x" [size]="14" aria-hidden="true"></svg>
            </button>
          }
        </div>
      }
      @if (!readonly() && photos().length < max()) {
        <button
          type="button"
          class="grid size-[72px] place-items-center rounded-lg border border-dashed border-line-strong text-ink-3 transition-colors duration-100 hover:border-accent hover:bg-accent-soft hover:text-accent-ink"
          [attr.aria-label]="label()"
          [disabled]="busy()"
          (click)="file.click()"
        >
          @if (busy()) {
            <svg [lucideIcon]="I.loader" class="animate-spin" aria-hidden="true"></svg>
          } @else {
            <span class="flex flex-col items-center gap-1 text-[11px]">
              <svg [lucideIcon]="I.camera" [size]="18" aria-hidden="true"></svg>
              Фото
            </span>
          }
        </button>
      }
      @if (readonly() && !photos().length) {
        <span class="text-[13px] text-ink-3">Фото немає</span>
      }
    </div>
    <input #file type="file" accept="image/*" capture="environment" multiple class="sr-only" tabindex="-1" aria-hidden="true" (change)="onPick(file)" />
    @if (!readonly()) {
      <p class="mt-1 mb-0 text-xs text-ink-3">До {{ max() }} фото, стискаються до ~100 КБ. Можна перетягнути файли сюди.</p>
    }
  `,
})
export class PhotoUpload {
  protected readonly I = I;
  readonly photos = model<string[]>([]);
  readonly max = input(6);
  readonly readonly = input(false);
  readonly label = input('Додати фото');
  protected readonly busy = signal(false);
  protected readonly over = signal(false);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(Dialogs);

  protected onPick(input: HTMLInputElement): void {
    void this.add([...(input.files ?? [])]);
    input.value = '';
  }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.over.set(false);
    void this.add([...(e.dataTransfer?.files ?? [])]);
  }

  private async add(files: File[]): Promise<void> {
    if (!files.length) return;
    const room = this.max() - this.photos().length;
    if (files.length > room) this.toast.info(`Додано лише ${room} з ${files.length} — максимум ${this.max()} фото`);
    this.busy.set(true);
    try {
      const out: string[] = [];
      for (const f of files.slice(0, room)) out.push(await compressImage(f));
      this.photos.set([...this.photos(), ...out]);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected remove(i: number): void {
    this.photos.set(this.photos().filter((_, j) => j !== i));
  }

  protected view(i: number): void {
    this.dialogs.open(PhotoViewer, { photos: this.photos(), index: i }, { size: 'xl', label: 'Перегляд фото' });
  }
}
