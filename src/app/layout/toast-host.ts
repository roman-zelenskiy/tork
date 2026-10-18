import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Icon } from '../shared/ui/icon';
import { I } from '../shared/icons';
import { Toast, ToastService } from '../core/ui/toast.service';
import { L } from '../core/i18n';

/** Стос тостів унизу праворуч. Успіх/інфо — aria-live polite, помилки — assertive */
@Component({
  selector: 'tk-toast-host',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none fixed right-4 bottom-4 left-4 z-[1100] flex flex-col items-end gap-2 sm:left-auto' },
  template: `
    <div class="sr-only" aria-live="polite" aria-atomic="true">{{ politeText() }}</div>
    <div class="sr-only" aria-live="assertive" aria-atomic="true">{{ errorText() }}</div>
    @for (t of toasts.items(); track t.id) {
      <div
        class="animate-pop pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border border-line-strong bg-surface py-2.5 pr-2 pl-3 shadow-pop"
        (mouseenter)="toasts.hold(t.id)"
        (mouseleave)="toasts.release(t.id)"
        (focusin)="toasts.hold(t.id)"
        (focusout)="toasts.release(t.id)"
      >
        <span class="mt-0.5 flex-none" [class]="tone(t)">
          <svg [lucideIcon]="t.kind === 'error' ? I.circleAlert : t.kind === 'info' ? I.info : I.circleCheck" aria-hidden="true"></svg>
        </span>
        <p class="m-0 flex-1 py-px text-[13px] leading-5">{{ t.text }}</p>
        @if (t.action; as a) {
          <button type="button" class="btn btn-sm btn-ghost text-accent-ink! font-semibold" (click)="run(t)">{{ a.label }}</button>
        }
        <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="L('Закрити сповіщення', 'Close notification')" (click)="toasts.dismiss(t.id)">
          <svg [lucideIcon]="I.x" [size]="14" aria-hidden="true"></svg>
        </button>
      </div>
    }
  `,
})
export class ToastHost {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly toasts = inject(ToastService);
  protected readonly politeText = computed(() => this.toasts.items().filter((t) => t.kind !== 'error').at(-1)?.text ?? '');
  protected readonly errorText = computed(() => this.toasts.items().filter((t) => t.kind === 'error').at(-1)?.text ?? '');

  protected tone(t: Toast): string {
    return t.kind === 'error' ? 'text-danger' : t.kind === 'info' ? 'text-info' : 'text-success';
  }

  protected async run(t: Toast): Promise<void> {
    this.toasts.dismiss(t.id);
    try {
      await t.action?.run();
    } catch (e) {
      this.toasts.error(e);
    }
  }
}
