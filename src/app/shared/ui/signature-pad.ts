import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, effect, input, model, signal, viewChild } from '@angular/core';
import { Icon } from './icon';
import { I } from '../icons';

/**
 * Підпис на canvas (миша, палець, стилус). Для тих, хто не може малювати, —
 * альтернатива: ввести ім’я, яке рендериться як підпис. Значення — PNG data URL.
 */
@Component({
  selector: 'tk-signature-pad',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="relative overflow-hidden rounded-lg border border-line-strong bg-[#fffdf8]" [class.border-danger]="invalid()">
      <canvas
        #canvas
        class="block h-40 w-full touch-none"
        [class.cursor-crosshair]="!readonly()"
        role="img"
        [attr.aria-label]="value() ? 'Підпис клієнта поставлено' : 'Поле для підпису'"
        (pointerdown)="start($event)"
      ></canvas>
      @if (!value() && !drawing()) {
        <span class="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-[#6f695e]">Підпис клієнта</span>
      }
      <span class="pointer-events-none absolute right-6 bottom-8 left-6 border-b border-dashed border-line-strong" aria-hidden="true"></span>
    </div>
    @if (!readonly()) {
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" class="btn btn-sm" [disabled]="!value()" (click)="clear()"><svg [lucideIcon]="I.undo" aria-hidden="true"></svg>Очистити</button>
        @if (!typed()) {
          <button type="button" class="btn btn-ghost btn-sm" (click)="typed.set(true)">Ввести ім’я замість підпису</button>
        } @else {
          <div class="control control-sm max-w-64 flex-1">
            <input type="text" aria-label="Ім’я для підпису" placeholder="Ім’я та прізвище" [value]="typedName()" (input)="renderTyped($any($event.target).value)" />
          </div>
        }
      </div>
    }
  `,
})
export class SignaturePad {
  protected readonly I = I;
  readonly value = model<string | null>(null);
  readonly readonly = input(false);
  readonly invalid = input(false);
  protected readonly drawing = signal(false);
  protected readonly typed = signal(false);
  protected readonly typedName = signal('');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private ctx: CanvasRenderingContext2D | null = null;
  private ready = false;

  constructor() {
    afterNextRender(() => {
      this.setup();
      this.ready = true;
      this.paintValue();
    });
    effect(() => {
      this.value();
      if (this.ready && !this.drawing()) this.paintValue();
    });
  }

  private setup(): void {
    const c = this.canvas().nativeElement;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    this.ctx = c.getContext('2d');
    if (!this.ctx) return;
    this.ctx.scale(dpr, dpr);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = 2.2;
    this.ctx.strokeStyle = '#1d2a5b';
  }

  private lastPainted: string | null = null;
  private paintValue(): void {
    const v = this.value();
    if (v === this.lastPainted || !this.ctx) return;
    const c = this.canvas().nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.lastPainted = v;
    if (!v) return;
    const img = new Image();
    img.onload = () => this.ctx?.drawImage(img, 0, 0, c.clientWidth, c.clientHeight);
    img.src = v;
  }

  protected start(e: PointerEvent): void {
    if (this.readonly() || !this.ctx) return;
    const c = this.canvas().nativeElement;
    c.setPointerCapture(e.pointerId);
    const rect = c.getBoundingClientRect();
    const pt = (ev: PointerEvent) => [ev.clientX - rect.left, ev.clientY - rect.top] as const;
    const ctx = this.ctx;
    let [lx, ly] = pt(e);
    ctx.beginPath();
    ctx.arc(lx, ly, 1, 0, Math.PI * 2);
    ctx.fillStyle = '#1d2a5b';
    ctx.fill();
    this.drawing.set(true);
    const move = (ev: PointerEvent) => {
      const [x, y] = pt(ev);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(lx, ly, (lx + x) / 2, (ly + y) / 2);
      ctx.lineTo(x, y);
      ctx.stroke();
      [lx, ly] = [x, y];
    };
    const up = () => {
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      const url = c.toDataURL('image/png');
      this.lastPainted = url;
      this.value.set(url);
      this.drawing.set(false);
    };
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  protected renderTyped(name: string): void {
    this.typedName.set(name);
    if (!this.ctx) return;
    const c = this.canvas().nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);
    if (!name.trim()) {
      this.lastPainted = null;
      return this.value.set(null);
    }
    this.ctx.font = 'italic 34px "Segoe Script", "Brush Script MT", cursive';
    this.ctx.fillStyle = '#1d2a5b';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillText(name, 28, c.clientHeight - 40, c.clientWidth - 56);
    const url = c.toDataURL('image/png');
    this.lastPainted = url;
    this.value.set(url);
  }

  protected clear(): void {
    const c = this.canvas().nativeElement;
    this.ctx?.clearRect(0, 0, c.width, c.height);
    this.lastPainted = null;
    this.typedName.set('');
    this.value.set(null);
  }
}
