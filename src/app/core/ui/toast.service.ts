import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  /** Друга кнопка: «Скасувати», «Відкрити» тощо */
  action?: { label: string; run: () => void | Promise<void> };
  timeout: number;
}

/** Короткі повідомлення внизу екрана; читаються скрінрідером через aria-live у ToastHost */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly items = signal<Toast[]>([]);
  private seq = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(text: string, kind: ToastKind = 'success', action?: Toast['action'], timeout?: number): number {
    const id = ++this.seq;
    const t: Toast = { id, kind, text, action, timeout: timeout ?? (action ? 6000 : kind === 'error' ? 7000 : 3500) };
    this.items.update((list) => [...list.slice(-3), t]);
    this.schedule(t);
    return id;
  }

  success(text: string, action?: Toast['action']) {
    return this.show(text, 'success', action);
  }
  error(text: string | unknown) {
    const msg = typeof text === 'string' ? text : text instanceof Error ? text.message : 'Щось пішло не так. Спробуйте ще раз.';
    return this.show(msg, 'error');
  }
  info(text: string, action?: Toast['action']) {
    return this.show(text, 'info', action);
  }

  /** Після видалення: «Клієнта видалено» + «Скасувати» */
  undo(text: string, restore: () => Promise<void>) {
    return this.show(text, 'success', { label: 'Скасувати', run: restore }, 6000);
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.items.update((list) => list.filter((t) => t.id !== id));
  }

  /** Пауза таймера, поки курсор або фокус на тості */
  hold(id: number): void {
    clearTimeout(this.timers.get(id));
  }
  release(id: number): void {
    const t = this.items().find((x) => x.id === id);
    if (t) this.schedule({ ...t, timeout: 2500 });
  }

  private schedule(t: Toast): void {
    clearTimeout(this.timers.get(t.id));
    this.timers.set(
      t.id,
      setTimeout(() => this.dismiss(t.id), t.timeout),
    );
  }
}
