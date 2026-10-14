import { Directive, ElementRef, OnDestroy, PLATFORM_ID, inject, input } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';

let seq = 0;

/**
 * Підказка через CDK Overlay (не обрізається контейнерами з overflow).
 * [tkTip]="текст" — завжди; [tkTip] + tipTruncated — лише якщо текст обрізано трикрапкою.
 * Показується при наведенні й фокусі з клавіатури, ховається по Escape.
 */
@Directive({
  selector: '[tkTip]',
  host: {
    '(mouseenter)': 'schedule()',
    '(mouseleave)': 'hide()',
    '(focusin)': 'schedule(true)',
    '(focusout)': 'hide()',
    '(keydown.escape)': 'hide()',
    '(pointerdown)': 'hide()',
  },
})
export class Tooltip implements OnDestroy {
  readonly tkTip = input<string | null | undefined>('');
  /** Показувати лише коли вміст не вміщається */
  readonly tipTruncated = input(false);
  readonly tipSide = input<'top' | 'bottom' | 'right'>('top');

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly overlay = inject(Overlay);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private ref: OverlayRef | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly id = `tip-${++seq}`;

  schedule(immediate = false): void {
    if (!this.browser || !this.tkTip()) return;
    if (this.tipTruncated()) {
      const e = this.el.nativeElement;
      if (e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1) return;
    }
    this.clear();
    this.timer = setTimeout(() => this.show(), immediate ? 150 : 450);
  }

  hide(): void {
    this.clear();
    this.ref?.dispose();
    this.ref = null;
    if (!this.tipTruncated()) this.el.nativeElement.removeAttribute('aria-describedby');
  }

  ngOnDestroy(): void {
    this.hide();
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private show(): void {
    if (this.ref) return;
    const side = this.tipSide();
    const positions =
      side === 'right'
        ? [
            { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 8 } as const,
            { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -8 } as const,
          ]
        : [
            { originX: 'center', originY: side === 'top' ? 'top' : 'bottom', overlayX: 'center', overlayY: side === 'top' ? 'bottom' : 'top', offsetY: side === 'top' ? -6 : 6 } as const,
            { originX: 'center', originY: side === 'top' ? 'bottom' : 'top', overlayX: 'center', overlayY: side === 'top' ? 'top' : 'bottom', offsetY: side === 'top' ? 6 : -6 } as const,
          ];
    this.ref = this.overlay.create({
      positionStrategy: this.overlay.position().flexibleConnectedTo(this.el).withPositions([...positions]).withViewportMargin(8),
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: 'tk-tooltip-pane',
    });
    const div = document.createElement('div');
    div.className = 'tk-tooltip';
    div.id = this.id;
    div.setAttribute('role', 'tooltip');
    div.textContent = this.tkTip() ?? '';
    this.ref.overlayElement.appendChild(div);
    this.ref.updatePosition();
    // для обрізаного тексту повний текст і так є в DOM — описувати двічі не треба
    if (!this.tipTruncated()) this.el.nativeElement.setAttribute('aria-describedby', this.id);
  }
}
