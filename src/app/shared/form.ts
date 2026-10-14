import { Directive, ElementRef, inject, signal } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { CanDeactivateFn } from '@angular/router';
import { Dialogs, Closable } from '../core/ui/dialogs.service';
import { ToastService } from '../core/ui/toast.service';

/**
 * База для форм у модалках/drawer:
 * — помилки показуються біля полів після першої спроби зберегти;
 * — повторне натискання «Зберегти» під час збереження ігнорується;
 * — Escape/клік по фону з незбереженими змінами питає підтвердження.
 */
@Directive()
export abstract class FormDialog<R = unknown> implements Closable {
  protected readonly dialogs = inject(Dialogs);
  protected readonly ref = inject<DialogRef<R>>(DialogRef);
  protected readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly saving = signal(false);
  readonly submitted = signal(false);
  private initial = '';

  /** Поточні значення форми (для перевірки «чи є зміни») */
  protected abstract snapshot(): unknown;
  /** Помилки полів: ключ → текст */
  protected abstract errors(): Record<string, string | null>;

  /** Викликати в кінці конструктора, коли поля заповнені */
  protected markPristine(): void {
    this.initial = JSON.stringify(this.snapshot());
  }

  dirty(): boolean {
    return JSON.stringify(this.snapshot()) !== this.initial;
  }

  /** Помилка поля — лише після спроби зберегти */
  err(key: string): string | null {
    return this.submitted() ? (this.errors()[key] ?? null) : null;
  }

  async requestClose(): Promise<void> {
    if (this.saving()) return;
    if (!this.dirty() || (await this.dialogs.discard())) this.ref.close();
  }

  protected async submit(save: () => Promise<R>): Promise<void> {
    if (this.saving()) return;
    this.submitted.set(true);
    if (Object.values(this.errors()).some(Boolean)) {
      // фокус на перше поле з помилкою
      queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    this.saving.set(true);
    try {
      const r = await save();
      this.markPristine();
      this.ref.close(r);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.saving.set(false);
    }
  }
}

/** Для сторінок із формами: компонент повідомляє, чи є незбережені зміни */
export interface HasUnsaved {
  hasUnsaved(): boolean;
}

/** Гард маршруту: попередження перед виходом зі сторінки з незбереженими змінами */
export const unsavedGuard: CanDeactivateFn<HasUnsaved> = (c) =>
  !c.hasUnsaved() || inject(Dialogs).discard();
