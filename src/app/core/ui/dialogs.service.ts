import { Injectable, inject } from '@angular/core';
import { Dialog, DialogConfig, DialogRef } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentType } from '@angular/cdk/portal';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialog, ConfirmData } from '../../shared/ui/confirm-dialog';

/** Компонент у модалці може відмовити в закритті (незбережені зміни) */
export interface Closable {
  requestClose?(): void | Promise<void>;
}

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';
const MAX_W: Record<DialogSize, string> = { sm: '420px', md: '560px', lg: '760px', xl: '1040px' };

/**
 * Модалки й бокові панелі на CDK Dialog: фокус-пастка, повернення фокусу, блокування прокрутки.
 * Escape і клік по фону проходять через requestClose() компонента, щоб попередити про незбережені зміни.
 */
@Injectable({ providedIn: 'root' })
export class Dialogs {
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);

  open<C, D = unknown, R = unknown>(
    component: ComponentType<C>,
    data?: D,
    opts: { size?: DialogSize; drawer?: boolean; label?: string; top?: boolean } = {},
  ): DialogRef<R, C> {
    const cfg: DialogConfig<D, DialogRef<R, C>> = {
      data,
      disableClose: true,
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      ariaLabel: opts.label,
      hasBackdrop: true,
      width: opts.drawer ? 'min(520px, 100vw)' : 'calc(100vw - 24px)',
      maxWidth: opts.drawer ? '100vw' : MAX_W[opts.size ?? 'md'],
      backdropClass: 'tork-backdrop',
      positionStrategy: opts.top ? this.overlay.position().global().centerHorizontally().top('10vh') : undefined,
      panelClass: opts.drawer ? ['tk-drawer'] : ['tk-dialog'],
    };
    const ref = this.dialog.open<R, D, C>(component, cfg);
    const tryClose = () => {
      const inst = ref.componentInstance as Closable | null;
      if (inst?.requestClose) void inst.requestClose();
      else ref.close();
    };
    ref.backdropClick.subscribe(tryClose);
    ref.keydownEvents.subscribe((e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        tryClose();
      }
    });
    return ref;
  }

  async confirm(data: ConfirmData): Promise<boolean> {
    const ref = this.open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, data, { size: 'sm' });
    return (await firstValueFrom(ref.closed)) === true;
  }

  /** Попередження про незбережені зміни */
  discard(): Promise<boolean> {
    return this.confirm({
      title: 'Закрити без збереження?',
      text: 'Зміни в цій формі буде втрачено.',
      confirm: 'Закрити без збереження',
      cancel: 'Повернутися до форми',
      danger: true,
    });
  }

  get openCount(): number {
    return this.dialog.openDialogs.length;
  }
}
